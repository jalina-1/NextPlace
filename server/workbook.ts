import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
export async function readWorkbook(buffer: Buffer, name: string) {
  if (/\.csv$/i.test(name)) {
    const rows = parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: 1024 * 1024,
    }) as any[][];
    return [{ name: "CSV", rows, warnings: [] as string[] }];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb.worksheets.slice(0, 20).map((sheet) => {
    const rows: any[][] = [];
    const warnings: string[] = [];
    if (sheet.rowCount > 2000 || sheet.columnCount > 200)
      throw Error("Workbook exceeds 2,000 rows or 200 columns.");
    for (let i = 1; i <= sheet.rowCount; i++) {
      const cells: any[] = [];
      for (let j = 1; j <= sheet.columnCount; j++) {
        const c = sheet.getRow(i).getCell(j);
        const v = c.value;
        if (v && typeof v === "object" && "formula" in v) {
          if (!warnings.length)
            warnings.push(
              "Formula cells use cached values only; formulas and workbook formatting are not preserved.",
            );
          cells.push(v.result ?? "");
        } else if (v && typeof v === "object" && "richText" in v)
          cells.push(v.richText.map((t) => t.text).join(""));
        else if (v && typeof v === "object" && "text" in v) cells.push(v.text);
        else cells.push(v instanceof Date ? v.toISOString() : (v ?? ""));
      }
      rows.push(cells);
    }
    return { name: sheet.name, rows, warnings };
  });
}
export async function writeWorkbook(
  sheets: { name: string; rows: Record<string, any>[] }[],
) {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    const headers = Array.from(
      new Set(sheet.rows.flatMap((r) => Object.keys(r))),
    );
    ws.addRow(headers);
    for (const r of sheet.rows) ws.addRow(headers.map((h) => r[h] ?? ""));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.columns.forEach((c) => (c.width = 24));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
