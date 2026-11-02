import { describe, it, expect } from "vitest";
import { parseXlsx, parseCsv, parsePdf, detectKind } from "@/server/imports/parsers";
import { suggestMapping, extractRows, headerLabels } from "@/server/imports/table";
import { makeXlsx, makeCsv, makePdf, makeScannedPdf } from "./helpers/fixtures";

describe("XLSX import", () => {
  it("lists sheets, detects a header below a title row, and maps alternate header names", async () => {
    const out = await parseXlsx(await makeXlsx());
    expect(out.status).toBe("parsed");
    expect(out.tables.map((t) => t.key)).toEqual(["sheet:Notes", "sheet:Vacancies 2026"]);
    const t = out.tables[1];
    expect(t.headerRowIndex).toBe(1); // empty row is skipped by eachRow; title is row 0
    const m = suggestMapping(t.rows[t.headerRowIndex]);
    expect(m.mapping).toMatchObject({ index: 0, district: 1, institution: 2, designation: 3, vacancies: 4 });
    const ex = extractRows(t, t.headerRowIndex, m.mapping);
    expect(ex.rows).toHaveLength(7);
    // Original values preserved, including the extra Remarks column.
    expect(headerLabels(t.rows[t.headerRowIndex])).toContain("Remarks");
    expect(ex.rows[0].original[5]).toBe("=cmd|' /C calc'!A0");
    expect(ex.rows[0].fields.vacancies).toBe("3");
    // Formula cell → cached value, flagged.
    expect(ex.rows[6].fields.vacancies).toBe("2");
    expect(ex.rows[6].flags).toContain("formula_value_used");
    // INDEX is not assumed unique: two rows with index 5 both kept.
    expect(ex.rows.filter((r) => r.fields.index === "5")).toHaveLength(2);
    // Same institution, different posts are separate options.
    expect(ex.rows.filter((r) => r.fields.institution === "Teaching Hospital Kandy")).toHaveLength(2);
  });
});

describe("CSV import", () => {
  it("maps reordered, renamed columns", () => {
    const out = parseCsv(makeCsv());
    const t = out.tables[0];
    const m = suggestMapping(t.rows[t.headerRowIndex]);
    expect(m.mapping).toMatchObject({ institution: 0, district: 1, designation: 2, vacancies: 3, index: 4 });
    const ex = extractRows(t, t.headerRowIndex, m.mapping);
    expect(ex.rows).toHaveLength(6);
    expect(ex.rows[0].original).toEqual(["National Hospital of Sri Lanka", "Colombo", "Medical Officer - OPD", "3", "R-1"]);
  });

  it("flags duplicates without merging and flags incomplete rows", () => {
    const csv = "Institution,District,Designation\nA Hospital,Kandy,MO\nA Hospital,Kandy,MO\n,Kandy,MO";
    const t = parseCsv(csv).tables[0];
    const ex = extractRows(t, 0, suggestMapping(t.rows[0]).mapping);
    expect(ex.rows).toHaveLength(3);
    expect(ex.rows[0].flags).toContain("possible_duplicate");
    expect(ex.rows[1].flags).toContain("possible_duplicate");
    expect(ex.rows[2].flags).toContain("incomplete");
  });

  it("skips repeated header rows inside the data", () => {
    const csv = "Institution,Designation\nH1,MO\nInstitution,Designation\nH2,MO";
    const t = parseCsv(csv).tables[0];
    const ex = extractRows(t, 0, suggestMapping(t.rows[0]).mapping);
    expect(ex.rows.map((r) => r.fields.institution)).toEqual(["H1", "H2"]);
    expect(ex.skippedRepeatedHeaders).toBe(1);
  });
});

describe("PDF import", () => {
  it("rebuilds the table, removes repeated page headers and footers, and joins wrapped rows", async () => {
    const out = await parsePdf(await makePdf());
    expect(out.status).toBe("parsed");
    const t = out.tables[0];
    const m = suggestMapping(t.rows[0]);
    expect(m.mapping).toMatchObject({ index: 0, district: 1, institution: 2, designation: 3, vacancies: 4 });
    const ex = extractRows(t, 0, m.mapping);
    expect(ex.rows.map((r) => r.fields.index)).toEqual(["1", "2", "3", "4", "5"]);
    const wrapped = ex.rows[2];
    expect(wrapped.fields.institution).toBe("Teaching Hospital Anuradhapura");
    expect(wrapped.flags).toContain("wrapped_row_merged");
    expect(wrapped.confidence).toBeLessThan(1);
    expect(t.warnings.join(" ")).toMatch(/repeated page header/);
    expect(ex.rows.every((r) => !String(r.fields.institution).includes("Page"))).toBe(true);
  });

  it("reports scanned PDFs as needing OCR when OCR is unavailable", async () => {
    const out = await parsePdf(await makeScannedPdf());
    expect(out.status).toBe("needs_ocr");
    expect(out.warnings.join(" ")).toMatch(/Excel/);
  });
});

describe("file type detection", () => {
  it("accepts only matching magic bytes", () => {
    expect(detectKind("a.pdf", "application/pdf", Buffer.from("%PDF-1.7"))).toBe("pdf");
    expect(detectKind("a.xlsx", "", Buffer.from([0x50, 0x4b, 3, 4]))).toBe("xlsx");
    expect(detectKind("a.xlsm", "", Buffer.from([0x50, 0x4b, 3, 4]))).toBeNull();
    expect(detectKind("a.pdf", "application/pdf", Buffer.from("MZ...."))).toBeNull();
    expect(detectKind("a.csv", "text/csv", Buffer.from("a,b\n1,2"))).toBe("csv");
  });
});
