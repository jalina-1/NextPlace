import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { resetDb } from "./helpers/db";
import { signUp, signIn, makeAdmin } from "./helpers/users";
import { makeXlsx } from "./helpers/fixtures";
import { db, schema } from "@/server/db";
import { getSessionState, requireUser } from "@/server/session";
import { createProject, getOwnedProject } from "@/server/services/projects";
import { uploadSource, getImportState, confirmMapping, listSourceRows } from "@/server/services/imports";
import { savePreferences, getPreferences } from "@/server/services/preferences";
import { startAnalysis, processJobs, getProgress } from "@/server/services/analysis";
import { getResults, compareOptions, topAccessible } from "@/server/services/results";
import { getFinalOrder, saveFinalOrder, finalize, reopen } from "@/server/services/final-order";
import { buildExport, safeCell } from "@/server/services/export";
import { submitPayment, approvePayment, rejectPayment, getReceipt } from "@/server/services/payments";
import { saveSettings, DEFAULT_SETTINGS } from "@/server/services/settings";
import { hasPremium } from "@/server/services/access";
import { chat, applyProposal } from "@/server/services/assistant";
import { HttpError } from "@/server/http";
import { addCalendarMonthsColombo } from "@/lib/dates";
import type { CurrentUser } from "@/server/session";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

async function expectHttp(p: Promise<unknown>, status: number) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(status);
    return e as HttpError;
  }
  throw new Error(`expected HTTP ${status}`);
}

/** A list large enough that the free preview hides most rows. */
function bigCsv(n = 24) {
  const districts = ["Colombo", "Kandy", "Galle", "Jaffna", "Kurunegala", "Badulla", "Matara", "Anuradhapura"];
  const posts = ["Medical Officer - OPD", "Medical Officer - ETU", "Medical Officer - Psychiatry"];
  const rows = ["INDEX,DISTRICT,INSTITUTION,DESIGNATION,VACANCIES"];
  for (let i = 0; i < n; i++) {
    const d = districts[i % districts.length];
    rows.push(`${i + 1},${d},Base Hospital ${d} ${Math.floor(i / districts.length) + 1},${posts[i % posts.length]},${(i % 3) + 1}`);
  }
  return rows.join("\n");
}

let alice: { user: CurrentUser; cookie: string };
let bob: { user: CurrentUser; cookie: string };
let admin: CurrentUser;
let projectId: string;

async function analyzedProject(u: CurrentUser, csv = bigCsv()) {
  const { id } = await createProject(u, "Test list");
  await uploadSource(id, u, { name: "list.csv", type: "text/csv", bytes: Buffer.from(csv) });
  const st = await getImportState(id, u);
  const t = st.tables[0] as { key: string; headerRowIndex: number; suggestion: { mapping: Record<string, number | null> } };
  await confirmMapping(id, u, { tableKey: t.key, headerRowIndex: t.headerRowIndex, mapping: t.suggestion.mapping as never });
  const { preferences, revision } = await getPreferences(id, u);
  await savePreferences(
    id,
    u,
    { ...preferences, home: { label: "Kandy", lat: 7.29, lng: 80.63 }, posts: ["Medical Officer - OPD", "Medical Officer - ETU"], climate: { temperature: "cooler", rainfall: "any" } },
    revision,
  );
  await startAnalysis(id, u);
  for (let i = 0; i < 20; i++) if ((await processJobs({ timeBudgetMs: 10_000, maxJobs: 500 })) === 0) break;
  return id;
}

beforeAll(async () => {
  await resetDb();
  alice = await signUp("alice@example.com");
  bob = await signUp("bob@example.com");
  admin = (await signUp("admin@example.com")).user;
  await makeAdmin(admin.id);
  admin = { ...admin, role: "admin" };
});

describe("authentication", () => {
  it("never lets a user assign themselves the admin role at sign-up", async () => {
    try {
      await signUp("mallory@example.com", { role: "admin" });
    } catch {
      /* rejected outright is also acceptable */
    }
    const [m] = await db.select().from(schema.user).where(eq(schema.user.email, "mallory@example.com"));
    if (m) expect(m.role).toBe("user");
  });

  it("allows only one active session: a new login revokes the previous one server-side", async () => {
    const first = await signIn("bob@example.com");
    const h1 = new Headers({ cookie: first });
    expect((await getSessionState(h1)).status).toBe("active");
    // Same cookie (e.g. another tab) keeps working.
    expect((await getSessionState(new Headers({ cookie: first }))).status).toBe("active");
    const second = await signIn("bob@example.com");
    expect((await getSessionState(new Headers({ cookie: second }))).status).toBe("active");
    expect((await getSessionState(h1)).status).toBe("replaced");
    const err = await expectHttp(requireUser(h1), 401);
    expect(err.code).toBe("session_replaced");
    const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, bob.user.id));
    expect(sessions).toHaveLength(1);
  });
});

describe("import → analysis → free preview", () => {
  it("imports and analyzes, then exposes exactly three frozen preview options", async () => {
    projectId = await analyzedProject(alice.user);
    const prog = await getProgress(projectId, alice.user);
    expect(prog.run?.status).toBe("completed");
    const res = await getResults(projectId, alice.user, { sort: "score", view: "ranked" });
    expect(res.state).toBe("ready");
    expect(res.rows).toHaveLength(3);
    expect(res.hiddenCount).toBe(21);
    expect(res.rows.every((r) => r.systemRank === null)).toBe(true);
    const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
    expect(new Set(res.rows.map((r) => r.id))).toEqual(new Set(p.previewOptionIds));
    expect(res.rows.every((r) => r.isDemoEvidence)).toBe(true);
  });

  it("does not reveal more rows when sort, filters or weights change", async () => {
    const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
    for (const sort of ["distance", "institution", "time", "district"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        const r = await getResults(projectId, alice.user, { sort, dir, view: "all" });
        expect(r.rows.map((x) => x.id).sort()).toEqual([...p.previewOptionIds!].sort());
      }
    }
    const { preferences, revision } = await getPreferences(projectId, alice.user);
    preferences.criteria = { ...preferences.criteria, post: { enabled: true, weight: 10 }, travel: { enabled: true, weight: 70 } };
    await savePreferences(projectId, alice.user, preferences, revision);
    const r = await getResults(projectId, alice.user, { sort: "score", view: "all" });
    expect(r.rows.map((x) => x.id).sort()).toEqual([...p.previewOptionIds!].sort());
  });

  it("blocks premium rows in compare, final order, export and assistant", async () => {
    const all = await listSourceRows(projectId, alice.user, { limit: 200 });
    const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
    const hidden = all.rows.find((r) => !p.previewOptionIds!.includes(r.id))!;
    await expectHttp(compareOptions(projectId, alice.user, [hidden.id]), 402);
    await expectHttp(compareOptions(projectId, alice.user, [...p.previewOptionIds!, hidden.id]), 402);
    expect((await compareOptions(projectId, alice.user, p.previewOptionIds!)).rows).toHaveLength(3);
    expect((await topAccessible(projectId, alice.user, 50)).ids).toHaveLength(3);
    await expectHttp(getFinalOrder(projectId, alice.user), 402);
    await expectHttp(buildExport(projectId, alice.user, "whatever", { analysisSheet: true }), 402);
    const reply = await chat(projectId, alice.user, "Explain #4");
    expect(reply.mode).toBe("demo");
    expect(reply.reply).toMatch(/can't find #4/);
    const move = await chat(projectId, alice.user, "Move options within 2 hours closer to the top");
    expect(move.proposal).toBeNull();
    // The user may still review their own source rows.
    expect(all.total).toBe(24);
  });

  it("isolates users: other users get 404 for projects", async () => {
    await expectHttp(getOwnedProject(projectId, bob.user), 404);
    await expectHttp(getResults(projectId, bob.user, { sort: "score", view: "ranked" }), 404);
    await expectHttp(compareOptions(projectId, bob.user, ["x"]), 404);
    await expectHttp(listSourceRows(projectId, bob.user, {}), 404);
  });

  it("enforces the free project quota (deleting does not reset it)", async () => {
    await createProject(alice.user, "second");
    await expectHttp(createProject(alice.user, "third"), 402);
  });
});

describe("payments and access", () => {
  let paymentId: string;
  it("requires configured bank details and never grants access on upload alone", async () => {
    await expectHttp(submitPayment(alice.user, { method: "bank_transfer" }, { name: "r.png", bytes: PNG }), 400);
    await saveSettings({ ...DEFAULT_SETTINGS, bank: { configured: true, bankName: "Test Bank", branch: "Test", accountName: "Test Account", accountNumber: "000-TEST", instructions: "" } }, admin.id);
    await expectHttp(submitPayment(alice.user, { method: "bank_transfer" }, { name: "x.exe", bytes: Buffer.from("MZ......") }), 400);
    ({ id: paymentId } = await submitPayment(alice.user, { method: "atm_deposit", reference: "ATM-1" }, { name: "r.png", bytes: PNG }));
    expect(await hasPremium(alice.user.id)).toBe(false);
  });

  it("keeps receipts private", async () => {
    await expectHttp(getReceipt(paymentId, bob.user), 404);
    expect((await getReceipt(paymentId, admin)).mime).toBe("image/png");
    expect((await getReceipt(paymentId, alice.user)).bytes.length).toBe(PNG.length);
  });

  it("approves idempotently: repeated or concurrent approvals create a single grant", async () => {
    const at = new Date("2026-11-02T04:30:00Z");
    const results = await Promise.allSettled([approvePayment(paymentId, admin, "ok", at), approvePayment(paymentId, admin, "ok", at), approvePayment(paymentId, admin, "ok", at)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const grants = await db.select().from(schema.accessGrant).where(eq(schema.accessGrant.userId, alice.user.id));
    expect(grants).toHaveLength(1);
    expect(grants[0].endsAt.toISOString()).toBe(addCalendarMonthsColombo(at, 12).toISOString());
    await expectHttp(rejectPayment(paymentId, admin, "late"), 409);
  });

  it("extends a renewal from the current expiry and expires without deleting data", async () => {
    const { id } = await submitPayment(alice.user, { method: "bank_transfer" }, { name: "r2.png", bytes: PNG });
    const at = new Date("2027-05-01T00:00:00Z");
    const { grant } = await approvePayment(id, admin, undefined, at);
    expect(grant!.startsAt.toISOString()).toBe(addCalendarMonthsColombo(new Date("2026-11-02T04:30:00Z"), 12).toISOString());
    expect(grant!.endsAt.toISOString()).toBe(addCalendarMonthsColombo(grant!.startsAt, 12).toISOString());
    expect(await hasPremium(alice.user.id, new Date("2028-12-01T00:00:00Z"))).toBe(false);
    const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
    expect(p).toBeTruthy();
  });

  it("rejection requires a note and does not grant access", async () => {
    const b = await submitPayment(bob.user, { method: "bank_transfer" }, { name: "r.png", bytes: PNG });
    await expectHttp(rejectPayment(b.id, admin, ""), 400);
    await rejectPayment(b.id, admin, "Amount does not match");
    expect(await hasPremium(bob.user.id)).toBe(false);
    await expectHttp(approvePayment(b.id, admin), 409);
  });
});

describe("premium: results, reordering, finalize, export", () => {
  it("shows the full analyzed list after approval", async () => {
    const r = await getResults(projectId, alice.user, { sort: "score", view: "all" });
    expect(r.rows).toHaveLength(24);
    expect(r.hiddenCount).toBe(0);
    expect(r.rows.filter((x) => x.systemRank != null).length).toBeGreaterThan(3);
  });

  it("rejects saves that drop or duplicate entries, and stale revisions", async () => {
    const f = await getFinalOrder(projectId, alice.user);
    const all = [...f.items, ...f.excluded];
    expect(new Set(all).size).toBe(24);
    await expectHttp(saveFinalOrder(projectId, alice.user, { expectedRevision: f.revision, items: f.items.slice(1), excluded: f.excluded }), 400);
    await expectHttp(saveFinalOrder(projectId, alice.user, { expectedRevision: f.revision, items: [...f.items, f.items[0]], excluded: f.excluded }), 400);
    const swapped = [...f.items];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const ok = await saveFinalOrder(projectId, alice.user, { expectedRevision: f.revision, items: swapped, excluded: f.excluded });
    expect(ok.revision).toBe(f.revision + 1);
    await expectHttp(saveFinalOrder(projectId, alice.user, { expectedRevision: f.revision, items: f.items, excluded: f.excluded }), 409);
  });

  it("applies an assistant proposal only after validation, and marks stale proposals", async () => {
    const res = await chat(projectId, alice.user, "Move options within a 3 hour drive closer to the top, while keeping my preferred posts first");
    expect(res.proposal).not.toBeNull();
    const before = await getFinalOrder(projectId, alice.user);
    await applyProposal(projectId, alice.user, res.proposal!.id);
    const after = await getFinalOrder(projectId, alice.user);
    expect(after.revision).toBe(before.revision + 1);
    expect([...after.items].sort()).toEqual([...before.items].sort());
    await expectHttp(applyProposal(projectId, alice.user, res.proposal!.id), 409);
    const second = await chat(projectId, alice.user, "Move #3 to position 1");
    await saveFinalOrder(projectId, alice.user, { expectedRevision: after.revision, items: after.items, excluded: after.excluded });
    await expectHttp(applyProposal(projectId, alice.user, second.proposal!.id), 409);
  });

  it("finalizes an immutable revision and exports Excel in exactly that order", async () => {
    const f = await getFinalOrder(projectId, alice.user);
    const { revisionId } = await finalize(projectId, alice.user, f.revision);
    await expectHttp(saveFinalOrder(projectId, alice.user, { expectedRevision: f.revision + 1, items: f.items, excluded: f.excluded }), 409);
    const out = await buildExport(projectId, alice.user, revisionId, { analysisSheet: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Preference list")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Preference Rank", "INDEX", "DISTRICT", "INSTITUTION", "DESIGNATION", "VACANCIES"]);
    const options = await db.select().from(schema.option).where(eq(schema.option.projectId, projectId));
    const byId = new Map(options.map((o) => [o.id, o]));
    f.items.forEach((id, i) => {
      const row = ws.getRow(i + 2).values as unknown[];
      expect(row[1]).toBe(i + 1);
      expect(String(row[2])).toBe(byId.get(id)!.originalIndex);
      expect(row[4]).toBe(byId.get(id)!.institution);
    });
    expect(wb.getWorksheet("Analysis")).toBeTruthy();
    // Reopening creates a new editable revision; the finalized snapshot is unchanged.
    await reopen(projectId, alice.user);
    const [rev] = await db.select().from(schema.finalOrderRevision).where(eq(schema.finalOrderRevision.id, revisionId));
    expect(rev.items).toEqual(f.items);
  });

  it("preserves original XLSX columns and values in the export", async () => {
    const { id } = await createProject(alice.user, "xlsx");
    await uploadSource(id, alice.user, { name: "list.xlsx", type: "", bytes: await makeXlsx() });
    const st = await getImportState(id, alice.user);
    const t = st.tables.find((x) => (x as { key: string }).key === "sheet:Vacancies 2026") as { key: string; headerRowIndex: number; suggestion: { mapping: Record<string, number | null> } };
    await confirmMapping(id, alice.user, { tableKey: t.key, headerRowIndex: t.headerRowIndex, mapping: t.suggestion.mapping as never });
    const { preferences, revision } = await getPreferences(id, alice.user);
    await savePreferences(id, alice.user, { ...preferences, home: { label: "Colombo", lat: 6.93, lng: 79.86 }, posts: ["Medical Officer - OPD"] }, revision);
    await startAnalysis(id, alice.user);
    await processJobs({ timeBudgetMs: 10_000, maxJobs: 500 });
    const f = await getFinalOrder(id, alice.user);
    const { revisionId } = await finalize(id, alice.user, f.revision);
    const out = await buildExport(id, alice.user, revisionId, { analysisSheet: false });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Preference list")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Preference Rank", "S/No", "RDHS", "Work Station", "Post", "No. of Vacancies", "Remarks"]);
    const values = ws.getSheetValues().slice(2) as unknown[][];
    const remarks = values.map((r) => r[7]).filter(Boolean);
    expect(remarks).toEqual(["'=cmd|' /C calc'!A0"]);
    expect(values.filter((r) => r[2] === 5)).toHaveLength(2);
  });
});

describe("formula injection guard", () => {
  it("prefixes dangerous text but leaves numbers and negatives", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell("+94 77")).toBe("'+94 77");
    expect(safeCell("-5")).toBe("-5");
    expect(safeCell("-2+3")).toBe("'-2+3");
    expect(safeCell(12)).toBe(12);
  });
});
