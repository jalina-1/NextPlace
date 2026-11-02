import { chromium } from "playwright";
import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import path from "node:path";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (process.platform === "linux" ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:3000");
await page.getByRole("heading", { name: /The right posting/ }).waitFor();
await page.screenshot({
  path: path.join(tmpdir(),"transfer-compass-desktop.png"),
  fullPage: true,
});
await page.getByRole("button", { name: "Get started", exact: false }).click();
await page
  .getByLabel("Email address")
  .fill(`browser-${Date.now()}@example.test`);
await page
  .locator("input[name=password]")
  .fill("Browser testing password 123!");
await page.getByRole("button", { name: "Create account", exact: true }).click();
await page
  .getByRole("heading", { name: "A little clarity goes a long way." })
  .waitFor();
await page.getByLabel("Project name").fill("Browser demo");
await page.getByLabel("Use synthetic demo research").check();
await page.getByRole("button", { name: "Create project", exact: true }).click();
await page
  .getByLabel("Preferred posts, in priority order")
  .fill("Medical Officer, Paediatrics");
await page.getByRole("button", { name: "Save preferences" }).click();
await page.getByText("Preferences saved.", { exact: false }).waitFor();
await page.getByRole("button", { name: "Continue to import" }).click();
await page.getByLabel("Vacancy file").setInputFiles("fixtures/vacancies.csv");
await page.getByRole("button", { name: "Extract & preview" }).click();
await page.getByRole("button", { name: "Confirm 6 rows" }).click();
await page.getByRole("button", { name: "Start analysis" }).click();
await page
  .getByText("3 additional options — unlock full access.")
  .waitFor({ timeout: 20000 });
await page.screenshot({
  path: path.join(tmpdir(),"transfer-compass-results.png"),
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: path.join(tmpdir(),"transfer-compass-mobile.png"),
  fullPage: true,
});
assert.ok(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  "Mobile page should not overflow horizontally",
);
await page.getByRole("button", { name: "Toggle navigation" }).click();
await page.getByRole("button", { name: "My projects", exact: true }).click();
await page.getByRole("heading", { name: "Your projects" }).waitFor();
assert.deepEqual(errors, []);
console.log("Browser flow passed at desktop and mobile sizes; no JS errors.");
await browser.close();
