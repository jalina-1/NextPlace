/**
 * End-to-end scenario in a real browser against a production build:
 * Register → preferences → upload → confirm mapping → analyze → three results → receipt →
 * admin approves → full results → compare → reorder → finalize → download and verify Excel.
 *
 * Usage: npm run build && npm run test:e2e   (needs a PostgreSQL DATABASE_URL; it is reset)
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { chromium, type Browser, type Page } from "playwright";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve("e2e/output");
const DB = process.env.E2E_DATABASE_URL ?? "postgresql://np:np@localhost:5432/nextplace_e2e";
mkdirSync(OUT, { recursive: true });

const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: DB,
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
  APP_URL: BASE,
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: ".data/e2e-storage",
  MAPS_PROVIDER: "demo",
  CLIMATE_PROVIDER: "demo",
  FACILITIES_PROVIDER: "demo",
  AI_PROVIDER: "demo",
  OCR_PROVIDER: "off",
  EMAIL_PROVIDER: "outbox",
  LOG_LEVEL: "silent",
} as NodeJS.ProcessEnv;

function step(msg: string) {
  console.log(`\n▶ ${msg}`);
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  }
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms: number, label: string): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v as T;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function register(page: Page, name: string, email: string) {
  await page.goto(`${BASE}/register`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard/);
}

async function main() {
  step("Reset e2e database and run migrations");
  const dbName = new URL(DB).pathname.slice(1);
  const admin = DB.replace(/\/[^/]+$/, "/postgres");
  execSync(`psql "${admin}" -qc "drop database if exists ${dbName}" -c "create database ${dbName}"`, { stdio: "inherit" });
  execSync("npx tsx scripts/migrate.ts", { env: { ...env, NODE_ENV: "development" } as NodeJS.ProcessEnv, stdio: "inherit" });

  step("Start production server");
  if (!existsSync(".next/BUILD_ID")) throw new Error("Run `npm run build` first");
  const server: ChildProcess = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stderr?.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  await waitFor(async () => (await fetch(`${BASE}/api/health`)).ok, 60_000, "server");

  const browser = await launch();
  let current: Page | null = null;
  try {
    // ---------------------------------------------------------------- admin
    step("Bootstrap an admin account and configure bank details");
    const adminCtx = await browser.newContext();
    const ap = await adminCtx.newPage();
    await register(ap, "Admin", "admin@e2e.test");
    execSync("npx tsx scripts/promote-admin.ts admin@e2e.test", { env: { ...env, NODE_ENV: "development" } as NodeJS.ProcessEnv, stdio: "inherit" });
    await ap.goto(`${BASE}/admin`);
    await ap.getByRole("tab", { name: "Settings" }).click();
    await ap.getByLabel("Bank Name").fill("Example Test Bank (E2E)");
    await ap.getByLabel("Account Name").fill("E2E Test Account");
    await ap.getByLabel("Account Number").fill("0000-E2E-TEST");
    await ap.getByRole("button", { name: "Save settings" }).click();
    await ap.getByText("Settings saved.").waitFor();
    assert(true, "admin settings saved");

    // ---------------------------------------------------------------- user
    step("Register a doctor");
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    current = page;
    page.on("pageerror", (err) => console.log("  [browser error]", err.message));
    await page.goto(BASE);
    assert(!(await page.content()).includes("5,000"), "landing page does not show the price");
    await shot(page, "01-landing-desktop");
    await register(page, "Dr Test", "doctor@e2e.test");

    step("Create a project and set preferences");
    await page.getByLabel("Project name").fill("E2E transfers");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/preferences$/);
    const projectId = page.url().split("/projects/")[1].split("/")[0];
    await page.getByLabel("Approximate home location").selectOption("Kandy");
    await page.getByRole("button", { name: "2. Posts" }).click();
    for (const p of ["Medical Officer - OPD", "Medical Officer - ETU"]) {
      await page.getByLabel(/Preferred posts/).fill(p);
      await page.getByRole("button", { name: "Add", exact: true }).click();
    }
    await page.getByRole("button", { name: "4. Climate & facilities" }).click();
    await page.getByLabel("Temperature preference").selectOption("cooler");
    await page.getByRole("button", { name: "6. Weights" }).click();
    await shot(page, "02-weights");
    await page.getByRole("button", { name: "Save and continue to import" }).click();
    await page.waitForURL(/\/import$/);
    assert(true, "preferences saved");

    step("Upload a CSV and confirm the column mapping");
    await page.setInputFiles("#file", path.resolve("public/demo/demo-vacancies.csv"));
    await page.getByRole("button", { name: "Upload and read" }).click();
    await page.getByRole("button", { name: "Preview rows" }).click();
    await page.getByText(/81 rows/).waitFor();
    await shot(page, "03-mapping-preview");
    await page.getByRole("button", { name: "Confirm mapping and import rows" }).click();
    await page.getByText("3. Review imported rows").waitFor();
    await page.getByRole("tab", { name: /Incomplete \(1\)/ }).waitFor();
    assert(true, "81 rows imported, 1 incomplete row flagged");

    step("Run analysis (background jobs advance via request-triggered worker ticks)");
    await page.getByRole("link", { name: "Continue to analysis" }).click();
    await page.getByRole("button", { name: "Start analysis" }).click();
    await page.getByRole("link", { name: "View results" }).waitFor({ timeout: 120_000 });
    await shot(page, "04-analysis-done");
    await page.getByRole("link", { name: "View results" }).click();

    step("Free preview shows exactly three options and a premium placeholder");
    await page.getByText(/additional options — unlock full access/).waitFor();
    const freeCards = await page.locator("main ul.space-y-3 > li").count();
    assert(freeCards === 3, `free preview shows 3 options (got ${freeCards})`);
    const apiFree = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/results?view=all&sort=institution&dir=desc`)).json(), projectId);
    assert(apiFree.rows.length === 3 && apiFree.hiddenCount === 78, "API never returns hidden rows to a free user");
    const finalFree = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/final`)).status, projectId);
    assert(finalFree === 402, "final-list API is premium-only");
    await shot(page, "05-free-results");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "05b-free-results-mobile");
    await page.setViewportSize({ width: 1280, height: 900 });

    step("Payment step shows price and accepts a receipt");
    await page.getByRole("link", { name: "See how to unlock" }).click();
    await page.getByText("LKR 5,000").waitFor();
    assert(await page.getByText("one year").count(), "price shows LKR 5,000 for one year");
    await page.getByLabel("Payment method").selectOption("atm_deposit");
    await page.getByLabel(/Reference/).fill("ATM-E2E-1");
    await page.setInputFiles("#rcpt", { name: "receipt.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex") });
    await page.getByRole("button", { name: "Submit receipt for review" }).click();
    await page.getByText(/Receipt received/).waitFor();
    assert((await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/final`)).status, projectId)) === 402, "receipt alone grants no access");
    await shot(page, "06-payment-pending");

    step("Admin reviews the receipt and approves (twice — idempotent)");
    await ap.goto(`${BASE}/admin`);
    await ap.getByText("doctor@e2e.test").waitFor();
    await ap.getByRole("button", { name: "View receipt" }).click();
    ap.on("dialog", (d) => d.accept());
    await ap.getByRole("button", { name: "Approve" }).click();
    await ap.getByText("Done: approve.").waitFor();
    const paymentsAfter = await ap.evaluate(async () => (await fetch("/api/admin/payments?status=all")).json());
    const pid = paymentsAfter.payments[0].id;
    const again = await ap.evaluate(async (id) => (await fetch(`/api/admin/payments/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) })).json(), pid);
    assert(again.alreadyApproved === true, "second approval is a no-op");
    assert(paymentsAfter.grants.length === 1, "exactly one access grant");
    const forbidden = await page.evaluate(async () => (await fetch("/api/admin/payments")).status);
    assert(forbidden === 403, "ordinary users cannot call admin APIs");
    await shot(ap, "07-admin-approved");

    step("Full results after approval");
    await page.goto(`${BASE}/projects/${projectId}/results`);
    await page.getByRole("link", { name: "Edit final list" }).waitFor();
    const apiFull = await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/results?view=all`)).json(), projectId);
    assert(apiFull.rows.length === 81 && apiFull.premium, "premium user sees all 81 options");

    step("Compare top 5");
    await page.goto(`${BASE}/projects/${projectId}/compare`);
    await page.getByLabel("Top N accessible options").fill("5");
    await page.getByRole("button", { name: /Use top/ }).click();
    await page.waitForFunction(() => document.querySelectorAll("thead th").length === 6);
    assert(true, "comparison table shows 5 options");
    await shot(page, "08-compare");

    step("Reorder: move-to-position, move down, and an applied assistant proposal");
    await page.goto(`${BASE}/projects/${projectId}/final`);
    await page.getByText("All changes saved").first().waitFor();
    const before = (await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/final`)).json(), projectId)) as { items: string[]; excluded: string[]; revision: number };
    const listPanel = page.locator("main");
    const moveInput = listPanel.getByLabel("Move to position").nth(4);
    await moveInput.fill("1");
    await moveInput.press("Enter");
    await page.getByText("All changes saved").first().waitFor();
    await listPanel.getByRole("button", { name: "Move down" }).first().click();
    await page.waitForTimeout(1500);
    await page.getByText("All changes saved").first().waitFor();
    const afterMove = (await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/final`)).json(), projectId)) as typeof before;
    assert(afterMove.items[1] === before.items[4] && afterMove.items[0] === before.items[0], "moved #5 to #1, then moved it down to #2");
    assert(afterMove.items.length + afterMove.excluded.length === 81 && new Set([...afterMove.items, ...afterMove.excluded]).size === 81, "no entries dropped or duplicated");
    await page.locator("main").getByLabel("Ask the assistant").fill("Move options within a 3 hour drive closer to the top, while keeping my preferred posts first");
    await page.locator("main").getByRole("button", { name: "Send" }).click();
    await page.getByText("Proposed change — preview").waitFor();
    await page.locator("main").getByRole("button", { name: "Apply" }).click();
    await page.getByText("applied").waitFor();
    await page.getByText("All changes saved").first().waitFor();
    await shot(page, "09-final-editor");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "09b-final-editor-mobile");
    await page.setViewportSize({ width: 1280, height: 900 });

    step("Finalize and download Excel");
    await page.goto(`${BASE}/projects/${projectId}/export`);
    await page.getByRole("button", { name: "Finalize this order" }).click();
    await page.getByRole("link", { name: "Download .xlsx" }).waitFor();
    const final = (await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/final`)).json(), projectId)) as typeof before & { status: string };
    assert(final.status === "finalized", "list finalized");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download .xlsx" }).click()]);
    const file = path.join(OUT, "final.xlsx");
    await download.saveAs(file);
    await shot(page, "10-export");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Preference list")!;
    const header = (ws.getRow(1).values as unknown[]).slice(1);
    assert(JSON.stringify(header) === JSON.stringify(["Preference Rank", "INDEX", "DISTRICT", "INSTITUTION", "DESIGNATION", "VACANCIES", "REMARKS"]), "original headers preserved with Preference Rank added");
    const rowsApi = (await page.evaluate(async (id) => (await fetch(`/api/projects/${id}/results?view=all`)).json(), projectId)).rows as { id: string; index: string; institution: string }[];
    const byId = new Map(rowsApi.map((r) => [r.id, r]));
    let ok = true;
    final.items.forEach((id, i) => {
      const v = ws.getRow(i + 2).values as unknown[];
      if (v[1] !== i + 1 || String(v[2]) !== byId.get(id)!.index || v[4] !== byId.get(id)!.institution) ok = false;
    });
    assert(ok && ws.rowCount === final.items.length + 1, `Excel rows match the finalized order (${final.items.length} rows)`);
    assert(!!wb.getWorksheet("Analysis"), "analysis sheet included");

    step("Single session: signing in elsewhere signs this browser out");
    const other = await browser.newContext();
    const op = await other.newPage();
    await op.goto(`${BASE}/login`);
    await op.getByLabel("Email").fill("doctor@e2e.test");
    await op.getByLabel("Password").fill("e2e-password-123");
    await op.getByRole("button", { name: "Sign in" }).click();
    await op.waitForURL(/\/dashboard/);
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/login\?reason=replaced/);
    await page.getByText(/signed in on another device/).waitFor();
    await shot(page, "11-session-replaced");
    assert(true, "old session shows the replaced-session message");

    console.log("\n✅ End-to-end scenario passed. Screenshots and the Excel file are in e2e/output/");
  } catch (e) {
    if (current) await shot(current, "failure").catch(() => {});
    throw e;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\n❌ E2E failed:", e);
  process.exit(1);
});
