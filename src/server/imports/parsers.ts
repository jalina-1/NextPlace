/**
 * File parsers. All uploaded content is untrusted data:
 * - XLSX: values only (cached formula results); macros, scripts and external links are never executed.
 * - CSV:  parsed with delimiter detection.
 * - PDF:  text layer with positions → table reconstruction (repeated headers, wrapped rows).
 *         Scanned PDFs (no text layer) are reported as needing OCR.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { detectHeaderRow, linesToTable, type Cell, type TableCandidate } from "./table";
import { normalizeText } from "@/lib/scoring";

export const LIMITS = {
  maxRowsPerTable: 5000,
  maxColumns: 60,
  maxSheets: 20,
  maxPdfPages: 200,
};

export type ParseOutput = {
  status: "parsed" | "needs_ocr" | "failed";
  tables: TableCandidate[];
  warnings: string[];
  details?: Record<string, unknown>;
};

function cellValue(v: ExcelJS.CellValue, flags: Set<string>): Cell {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) {
      flags.add("formula_value_used");
      const r = (v as { result?: unknown }).result;
      if (r == null) return null;
      if (typeof r === "object" && r && "error" in r) return String((r as { error: unknown }).error);
      return r instanceof Date ? r.toISOString().slice(0, 10) : (r as Cell);
    }
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((p) => p.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("error" in v) return String((v as { error: unknown }).error);
  }
  return String(v);
}

export async function parseXlsx(buf: Buffer): Promise<ParseOutput> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { status: "failed", tables: [], warnings: ["The workbook could not be read. Save it as .xlsx (Excel Workbook) or CSV and try again."] };
  }
  const tables: TableCandidate[] = [];
  const warnings: string[] = [];
  let sheetCount = 0;
  wb.eachSheet((ws) => {
    sheetCount++;
    if (sheetCount > LIMITS.maxSheets) return;
    if (ws.state && ws.state !== "visible") warnings.push(`Hidden sheet “${ws.name}” is listed but may not be the vacancy list.`);
    const rows: Cell[][] = [];
    const refs: string[] = [];
    const rowFlags: string[][] = [];
    let width = 0;
    let truncated = false;
    let formulaUsed = false;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rows.length >= LIMITS.maxRowsPerTable + 50) {
        truncated = true;
        return;
      }
      const flags = new Set<string>();
      const cells: Cell[] = [];
      const max = Math.min(row.cellCount, LIMITS.maxColumns);
      for (let c = 1; c <= max; c++) cells.push(cellValue(row.getCell(c).value, flags));
      if (flags.has("formula_value_used")) formulaUsed = true;
      width = Math.max(width, cells.length);
      rows.push(cells);
      refs.push(`${ws.name} row ${rowNumber}`);
      rowFlags.push([...flags]);
    });
    if (rows.length === 0) return;
    const padded = rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill(null)]);
    const h = detectHeaderRow(padded);
    const w: string[] = [];
    if (truncated) w.push(`Sheet has more than ${LIMITS.maxRowsPerTable} rows; extra rows were not read.`);
    if (formulaUsed) w.push("Some cells contain formulas; their last calculated values were imported (formulas are not evaluated or exported).");
    if (ws.hasMerges) w.push("This sheet contains merged cells; merged values appear only in the first cell of each merge.");
    tables.push({
      key: `sheet:${ws.name}`,
      label: `Sheet “${ws.name}” (${rows.length} rows)`,
      rows: padded,
      rowRefs: refs,
      rowConfidence: padded.map(() => 1),
      rowFlags,
      headerRowIndex: h.index,
      warnings: w,
      truncated,
    });
  });
  if (sheetCount > LIMITS.maxSheets) warnings.push(`Only the first ${LIMITS.maxSheets} sheets were read.`);
  if (tables.length === 0) return { status: "failed", tables, warnings: [...warnings, "No data found in any sheet."] };
  return { status: "parsed", tables, warnings };
}

export function parseCsv(text: string): ParseOutput {
  const clean = text.replace(/^﻿/, "");
  const res = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const rows = (res.data as string[][]).slice(0, LIMITS.maxRowsPerTable + 50).map((r) => r.slice(0, LIMITS.maxColumns) as Cell[]);
  if (rows.length === 0) return { status: "failed", tables: [], warnings: ["The CSV file is empty."] };
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array(width - r.length).fill(null)]);
  const h = detectHeaderRow(padded);
  const warnings = res.errors.slice(0, 5).map((e) => `CSV row ${(e.row ?? 0) + 1}: ${e.message}`);
  return {
    status: "parsed",
    tables: [
      {
        key: "csv",
        label: `CSV (${rows.length} rows)`,
        rows: padded,
        rowRefs: padded.map((_, i) => `CSV line ${i + 1}`),
        rowConfidence: padded.map((r) => (r.length === width ? 1 : 0.8)),
        rowFlags: rows.map((r) => (r.length < width ? ["short_row"] : [])),
        headerRowIndex: h.index,
        warnings,
      },
    ],
    warnings: [],
  };
}

/* ---------------------------------- PDF ---------------------------------- */

export type PdfItem = { str: string; x: number; y: number; w: number; page: number };
type Line = { page: number; y: number; items: PdfItem[] };
type Seg = { text: string; x0: number; x1: number };

async function extractPdfItems(buf: Buffer): Promise<{ items: PdfItem[]; pages: number }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf), { isEvalSupported: false } as never);
  const pages = Math.min(pdf.numPages, LIMITS.maxPdfPages);
  const items: PdfItem[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str || !it.transform || it.str.trim() === "") continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? it.str.length * 5, page: p });
    }
  }
  return { items, pages: pdf.numPages };
}

function groupLines(items: PdfItem[]): Line[] {
  const byPage = new Map<number, PdfItem[]>();
  for (const it of items) byPage.set(it.page, [...(byPage.get(it.page) ?? []), it]);
  const lines: Line[] = [];
  for (const [page, its] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: Line | null = null;
    for (const it of its) {
      if (cur && Math.abs(cur.y - it.y) <= 2.5) cur.items.push(it);
      else {
        cur = { page, y: it.y, items: [it] };
        lines.push(cur);
      }
    }
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** Merges adjacent text items separated by small gaps into segments (cells). */
function segments(line: Line): Seg[] {
  const segs: Seg[] = [];
  for (const it of line.items) {
    const last = segs[segs.length - 1];
    const charW = it.w / Math.max(1, it.str.length);
    if (last && it.x - last.x1 < Math.max(4, charW * 1.6)) {
      last.text += (it.x - last.x1 > charW * 0.25 ? " " : "") + it.str;
      last.x1 = it.x + it.w;
    } else segs.push({ text: it.str, x0: it.x, x1: it.x + it.w });
  }
  return segs.map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }));
}

function lineText(l: Line) {
  return segments(l).map((s) => s.text).join(" ");
}

/**
 * Builds a table from positioned PDF text:
 * 1. Detect the header line (known column names) and derive column x-ranges.
 * 2. Skip the header when it repeats on later pages, and running headers/footers.
 * 3. A line with no value in the anchor (index/first) column continues the previous row (wrapped row).
 */
export function pdfItemsToTable(items: PdfItem[], pageCount: number): { table: TableCandidate | null; warnings: string[] } {
  const lines = groupLines(items);
  const warnings: string[] = [];
  const segLines = lines.map((l) => ({ line: l, segs: segments(l) }));
  const asRows = segLines.map((s) => s.segs.map((g) => g.text) as Cell[]);
  const h = detectHeaderRow(asRows.slice(0, 80));
  if (h.confidence < 0.5) return { table: null, warnings: ["No recognizable table header was found in the PDF text."] };

  const headerSegs = segLines[h.index].segs;
  const headerNorm = normalizeText(lineText(segLines[h.index].line));
  const starts = headerSegs.map((s) => s.x0);
  const colCount = headerSegs.length;
  // Column boundaries: midpoint between end of previous header and start of next header.
  const bounds = headerSegs.map((s, i) => {
    const left = i === 0 ? -Infinity : (headerSegs[i - 1].x1 + s.x0) / 2;
    const right = i === colCount - 1 ? Infinity : (s.x1 + headerSegs[i + 1].x0) / 2;
    return [left, right] as const;
  });

  // Running headers/footers: identical text lines appearing on ≥ 50% of pages (min 2 pages).
  const textPages = new Map<string, Set<number>>();
  for (const { line } of segLines) {
    const t = normalizeText(lineText(line)).replace(/\d+/g, "#");
    textPages.set(t, (textPages.get(t) ?? new Set()).add(line.page));
  }
  const running = new Set([...textPages.entries()].filter(([t, p]) => p.size >= 2 && p.size >= pageCount * 0.5 && t !== headerNorm).map(([t]) => t));

  const anchorCol = (() => {
    const idx = headerSegs.findIndex((s) => /^(index|no|s ?no|serial|#|ref)/i.test(normalizeText(s.text)));
    return idx >= 0 ? idx : 0;
  })();

  const rows: Cell[][] = [headerSegs.map((s) => s.text)];
  const refs: string[] = [`page ${segLines[h.index].line.page}, header`];
  const conf: number[] = [1];
  const flags: string[][] = [[]];
  let repeatedHeaders = 0;
  let runningSkipped = 0;
  let wrapped = 0;
  let misaligned = 0;

  for (let i = h.index + 1; i < segLines.length; i++) {
    const { line, segs } = segLines[i];
    const norm = normalizeText(lineText(line));
    if (norm === headerNorm) {
      repeatedHeaders++;
      continue;
    }
    if (running.has(norm.replace(/\d+/g, "#")) || /^page \d+( of \d+)?$/.test(norm)) {
      runningSkipped++;
      continue;
    }
    const cells: (string | null)[] = Array(colCount).fill(null);
    let rowMisaligned = false;
    for (const s of segs) {
      const mid = (s.x0 + s.x1) / 2;
      let col = bounds.findIndex(([l, r]) => mid >= l && mid < r);
      if (col < 0) {
        col = starts.reduce((best, x, k) => (Math.abs(x - s.x0) < Math.abs(starts[best] - s.x0) ? k : best), 0);
        rowMisaligned = true;
      }
      cells[col] = cells[col] ? `${cells[col]} ${s.text}` : s.text;
    }
    const filled = cells.filter((c) => c != null).length;
    const prev = rows.length > 1 ? rows[rows.length - 1] : null;
    const isContinuation = prev && cells[anchorCol] == null && filled > 0 && filled < colCount;
    if (isContinuation) {
      for (let c = 0; c < colCount; c++) if (cells[c]) prev[c] = prev[c] ? `${prev[c]} ${cells[c]}` : cells[c];
      const k = rows.length - 1;
      if (!flags[k].includes("wrapped_row_merged")) flags[k].push("wrapped_row_merged");
      conf[k] = Math.min(conf[k], anchorCol === 0 && !/^(index|no)/i.test(normalizeText(headerSegs[0].text)) ? 0.6 : 0.85);
      wrapped++;
      continue;
    }
    if (rowMisaligned) misaligned++;
    rows.push(cells);
    refs.push(`page ${line.page}, line y=${Math.round(line.y)}`);
    conf.push(rowMisaligned ? 0.6 : filled === colCount ? 0.95 : 0.8);
    flags.push(rowMisaligned ? ["text_outside_columns"] : filled < colCount ? ["missing_cells"] : []);
  }

  if (repeatedHeaders) warnings.push(`${repeatedHeaders} repeated page header(s) were removed.`);
  if (runningSkipped) warnings.push(`${runningSkipped} running header/footer line(s) were removed.`);
  if (wrapped) warnings.push(`${wrapped} wrapped line(s) were joined to the row above. Please verify them (marked “wrapped”).`);
  if (misaligned) warnings.push(`${misaligned} row(s) had text outside the detected columns.`);
  if (pageCount > LIMITS.maxPdfPages) warnings.push(`Only the first ${LIMITS.maxPdfPages} pages were read.`);

  return {
    table: {
      key: "pdf",
      label: `PDF table (${rows.length - 1} rows, ${pageCount} pages)`,
      rows,
      rowRefs: refs,
      rowConfidence: conf,
      rowFlags: flags,
      headerRowIndex: 0,
      warnings,
    },
    warnings,
  };
}

export async function parsePdf(buf: Buffer, ocr?: (buf: Buffer) => Promise<string[] | null>): Promise<ParseOutput> {
  let extracted: { items: PdfItem[]; pages: number };
  try {
    extracted = await extractPdfItems(buf);
  } catch {
    return { status: "failed", tables: [], warnings: ["The PDF could not be opened. It may be encrypted or damaged."] };
  }
  const chars = extracted.items.reduce((s, i) => s + i.str.length, 0);
  if (chars < 30 * Math.max(1, Math.min(extracted.pages, 3))) {
    if (!ocr) {
      return {
        status: "needs_ocr",
        tables: [],
        warnings: [
          "This PDF has no readable text layer (it looks scanned). OCR is not configured on this server.",
          "Please upload the list as Excel (.xlsx) or CSV, or a text-based PDF exported from the original document.",
        ],
        details: { pages: extracted.pages },
      };
    }
    const lines = await ocr(buf);
    if (!lines || lines.length === 0)
      return { status: "failed", tables: [], warnings: ["OCR did not return any text. Please upload an Excel or CSV version."] };
    const t = linesToTable(lines, "ocr", `OCR text (${lines.length} lines)`, "OCR line");
    t.rowConfidence = t.rowConfidence.map((c) => Math.min(c, 0.5));
    t.warnings.push("Extracted by OCR. Low confidence: review every row before analysis.");
    return { status: "parsed", tables: [t], warnings: [] };
  }
  const { table, warnings } = pdfItemsToTable(extracted.items, extracted.pages);
  if (table) return { status: "parsed", tables: [table], warnings: [] };
  // Fallback: plain lines split on wide spacing.
  const lines = groupLines(extracted.items).map((l) => {
    let out = "";
    let lastEnd = -Infinity;
    for (const it of l.items) {
      out += (it.x - lastEnd > 8 ? "  " : it.x - lastEnd > 1 ? " " : "") + it.str;
      lastEnd = it.x + it.w;
    }
    return out.trim();
  });
  const t = linesToTable(lines, "pdf-text", `PDF text lines (${lines.length})`, "PDF line");
  return { status: "parsed", tables: [t], warnings: [...warnings, "Columns could not be detected reliably; they were inferred from spacing."] };
}

export function detectKind(name: string, mime: string, head: Buffer): "xlsx" | "csv" | "pdf" | null {
  const lower = name.toLowerCase();
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isPdf = head.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf && (lower.endsWith(".pdf") || mime === "application/pdf")) return "pdf";
  if (isZip && lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".csv") && !isZip && !isPdf) {
    // Reject binary content masquerading as CSV.
    const sample = head.subarray(0, 512);
    if (sample.includes(0)) return null;
    return "csv";
  }
  return null;
}
