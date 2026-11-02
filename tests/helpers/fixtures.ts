import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const SAMPLE = [
  ["1", "Colombo", "National Hospital of Sri Lanka", "Medical Officer - OPD", "3"],
  ["2", "Kandy", "Teaching Hospital Kandy", "Medical Officer - ETU", "1"],
  ["3", "Kandy", "Teaching Hospital Kandy", "Medical Officer - OPD", "2"],
  ["4", "Galle", "Teaching Hospital Karapitiya", "Medical Officer - Psychiatry", "1"],
  ["5", "Nuwara Eliya", "District General Hospital Nuwara Eliya", "Medical Officer - OPD", "2"],
  ["5", "Jaffna", "Teaching Hospital Jaffna", "Medical Officer - Paediatrics", "1"],
];

/** XLSX with a title row, alternate header names, an extra column, and a formula cell. */
export async function makeXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const notes = wb.addWorksheet("Notes");
  notes.addRow(["This sheet is not the list"]);
  const ws = wb.addWorksheet("Vacancies 2026");
  ws.addRow(["Annual transfers 2026 — Medical Officers"]);
  ws.addRow([]);
  ws.addRow(["S/No", "RDHS", "Work Station", "Post", "No. of Vacancies", "Remarks"]);
  SAMPLE.forEach((r, i) => ws.addRow([Number(r[0]), r[1], r[2], r[3], Number(r[4]), i === 0 ? "=cmd|' /C calc'!A0" : null]));
  ws.getCell("E10").value = { formula: "1+1", result: 2 } as ExcelJS.CellFormulaValue;
  ws.getCell("A10").value = 7;
  ws.getCell("B10").value = "Matara";
  ws.getCell("C10").value = "DGH Matara";
  ws.getCell("D10").value = "Medical Officer - OPD";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function makeCsv(): string {
  const header = "Institution,District,Designation,Vacancy,Ref";
  const rows = SAMPLE.map((r) => `"${r[2]}",${r[1]},"${r[3]}",${r[4]},R-${r[0]}`);
  return [header, ...rows].join("\n");
}

/**
 * Text PDF over two pages with the header repeated on page 2, a running footer,
 * and a wrapped institution name continuing on the next line.
 */
export async function makePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cols = [40, 90, 180, 380, 520];
  const header = ["INDEX", "DISTRICT", "INSTITUTION", "DESIGNATION", "VACANCIES"];
  const drawRow = (page: ReturnType<typeof doc.addPage>, y: number, cells: (string | null)[]) =>
    cells.forEach((c, i) => c && page.drawText(c, { x: cols[i], y, size: 9, font }));
  const p1 = doc.addPage([600, 800]);
  p1.drawText("Ministry of Health - Transfer vacancy list", { x: 40, y: 770, size: 12, font });
  drawRow(p1, 740, header);
  drawRow(p1, 720, ["1", "Colombo", "National Hospital of Sri Lanka", "Medical Officer - OPD", "3"]);
  drawRow(p1, 700, ["2", "Kandy", "Teaching Hospital Kandy", "Medical Officer - ETU", "1"]);
  drawRow(p1, 680, ["3", "Anuradhapura", "Teaching Hospital", "Medical Officer - OPD", "2"]);
  drawRow(p1, 668, [null, null, "Anuradhapura", null, null]);
  p1.drawText("Page 1 of 2", { x: 270, y: 30, size: 8, font });
  const p2 = doc.addPage([600, 800]);
  drawRow(p2, 740, header);
  drawRow(p2, 720, ["4", "Galle", "Teaching Hospital Karapitiya", "Medical Officer - Psychiatry", "1"]);
  drawRow(p2, 700, ["5", "Jaffna", "Teaching Hospital Jaffna", "Medical Officer - Paediatrics", "1"]);
  p2.drawText("Page 2 of 2", { x: 270, y: 30, size: 8, font });
  return Buffer.from(await doc.save());
}

export async function makeScannedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const p = doc.addPage([600, 800]);
  p.drawRectangle({ x: 50, y: 50, width: 200, height: 100 });
  return Buffer.from(await doc.save());
}
