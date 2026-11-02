import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  preferencesSchema,
  score,
  rank,
  validOrder,
  addYear,
  safeCell,
} from "../server/domain.ts";
import { extract, mappedRows, pdfTables } from "../server/imports.ts";
test("weights must total 100 and remain in bounds", () => {
  assert.throws(() =>
    preferencesSchema.parse({
      ...defaults,
      weights: { post: 101, travel: 0, climate: 0, facilities: 0 },
    }),
  );
  assert.throws(() =>
    preferencesSchema.parse({
      ...defaults,
      weights: { post: 20, travel: 20, climate: 20, facilities: 20 },
    }),
  );
});
test("deterministic scoring, weighted missing data, and unscored options", () => {
  const p = { ...defaults, posts: ["MO", "Surgery"] };
  const o = {
    id: "a",
    post: "MO",
    institution: "A",
    district: "D",
    evidence: { minutes: { value: 180 } },
  };
  const s = score(o, p);
  assert.equal(s.scores.post, 100);
  assert.equal(s.scores.travel, 50);
  assert.equal(s.coverage, 80);
  assert.equal(s.score, 81.25);
  assert.equal(s.provisional, true);
  assert.equal(score({ ...o, evidence: {} }, defaults).score, null);
  assert.equal(rank([{ ...o, id: "b" }, o], p)[0].id, "a");
});
test("hard exclusions remain in results and permutations never lose rows", () => {
  const o = { id: "a", post: "MO", institution: "A", district: "D" };
  assert.equal(
    score(o, { ...defaults, excludedDistricts: ["D"] }).excluded,
    true,
  );
  assert.equal(validOrder(["a", "a"], [o, { id: "b" }]), false);
  assert.equal(validOrder(["b", "a"], [o, { id: "b" }]), true);
});
test("calendar-year expiry clamps month end in Colombo and preserves clock time", () => {
  assert.equal(
    addYear(new Date("2024-02-29T10:00:00Z")).toISOString(),
    "2025-02-28T10:00:00.000Z",
  );
  assert.equal(
    addYear(new Date("2025-01-31T10:00:00Z")).toISOString(),
    "2026-01-31T10:00:00.000Z",
  );
});
test("alternate headers, duplicate indexes, and vacancies preserve original data", async () => {
  const tables = await extract(
    Buffer.from(
      "ID,REGION,HOSPITAL,POSITION,VACANCIES\n001,Kandy,A,MO,3\n001,Kandy,A,Surgery,2\n",
    ),
    "list.csv",
  );
  const rows = mappedRows(tables[0], {
    index: "ID",
    district: "REGION",
    institution: "HOSPITAL",
    post: "POSITION",
    vacancies: "VACANCIES",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].index, "001");
  assert.equal(rows[0].original.ID, "001");
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[0].vacancies, "3");
});
test("repeated PDF headers removed and continuation text retained", () => {
  const rows = pdfTables(
    "INDEX  INSTITUTION  DESIGNATION\n1  A  Medical\nOfficer\nINDEX  INSTITUTION  DESIGNATION\n2  B  Surgery",
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[1][2], "Medical Officer");
});
test("spreadsheet formula injection is escaped", () => {
  assert.equal(safeCell("=1+1"), "'=1+1");
  assert.equal(safeCell("  @SUM(A1)"), "'  @SUM(A1)");
  assert.equal(safeCell(123), 123);
});

test("XLSX preserves original IDs and cached formula results with warnings", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Posts");
  sheet.addRow(["ID", "Hospital", "Position", "Count"]);
  sheet.addRow(["0007", "Demo A", "MO", { formula: "1+2", result: 3 }]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const tables = await extract(buffer, "posts.xlsx");
  assert.equal(tables[0].rows[1][0], "0007");
  assert.equal(tables[0].rows[1][3], 3);
  assert.equal(tables[0].warnings.length, 1);
});
test("duplicate headers cannot silently discard original column values", () => {
  assert.throws(
    () =>
      mappedRows(
        {
          name: "Source",
          rows: [
            ["Hospital", "Hospital", "Position"],
            ["A", "B", "MO"],
          ],
        },
        { institution: "Hospital", post: "Position" },
      ),
    /Duplicate column/,
  );
});
