/**
 * Format-independent table utilities: header detection, column mapping
 * suggestions, repeated-header removal, and row → option conversion.
 * Uploaded content is treated purely as data.
 */
import { normalizeText } from "@/lib/scoring";

export type Cell = string | number | null;

export type TableCandidate = {
  key: string;
  label: string;
  /** All rows including header and any title rows. */
  rows: Cell[][];
  /** Provenance per row, e.g. "Sheet1 row 12" or "page 2, line 7". */
  rowRefs: string[];
  /** 0..1 extraction confidence per row. */
  rowConfidence: number[];
  rowFlags: string[][];
  headerRowIndex: number;
  warnings: string[];
  truncated?: boolean;
};

export const FIELDS = ["index", "district", "institution", "designation", "vacancies"] as const;
export type Field = (typeof FIELDS)[number];
export const REQUIRED_FIELDS: Field[] = ["institution", "designation"];

const SYNONYMS: Record<Field, string[]> = {
  index: ["index", "index no", "no", "s no", "sl no", "serial", "serial no", "ref", "ref no", "reference", "code", "vacancy no", "item", "number", "nos"],
  district: ["district", "dist", "rdhs", "rdhs area", "district name", "area"],
  institution: [
    "institution",
    "institute",
    "hospital",
    "station",
    "work station",
    "workstation",
    "name of institution",
    "name of the institution",
    "health institution",
    "place of work",
    "name of hospital",
    "workplace",
  ],
  designation: ["designation", "post", "position", "grade", "speciality", "specialty", "category", "post name", "designation post", "title", "unit"],
  vacancies: ["vacancies", "vacancy", "no of vacancies", "number of vacancies", "vac", "vacant", "posts available", "no of posts", "count"],
};

function headerFieldScore(cell: Cell): { field: Field; score: number } | null {
  const t = normalizeText(cell == null ? "" : String(cell));
  if (!t || t.length > 60) return null;
  let best: { field: Field; score: number } | null = null;
  for (const f of FIELDS) {
    for (const syn of SYNONYMS[f]) {
      let s = 0;
      if (t === syn) s = 1;
      else if (` ${t} `.includes(` ${syn} `) && syn.length >= 4) s = 0.75;
      if (s > 0 && (!best || s > best.score)) best = { field: f, score: s };
    }
  }
  return best;
}

/** Picks the header row among the first 40 rows: most cells matching known header names. */
export function detectHeaderRow(rows: Cell[][]): { index: number; confidence: number } {
  let bestIdx = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const fields = new Set<Field>();
    let s = 0;
    for (const c of rows[i]) {
      const m = headerFieldScore(c);
      if (m && !fields.has(m.field)) {
        fields.add(m.field);
        s += m.score;
      }
    }
    if (fields.size >= 2 && s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) return { index: bestIdx, confidence: Math.min(1, bestScore / 3) };
  const firstNonEmpty = rows.findIndex((r) => r.some((c) => c != null && String(c).trim() !== ""));
  return { index: Math.max(0, firstNonEmpty), confidence: 0.2 };
}

export type MappingSuggestion = {
  mapping: Record<Field, number | null>;
  confidence: Record<Field, number>;
  ambiguous: Field[];
};

export function suggestMapping(headers: Cell[]): MappingSuggestion {
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null])) as Record<Field, number | null>;
  const confidence = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
  const ambiguous: Field[] = [];
  const candidates: { field: Field; col: number; score: number }[] = [];
  headers.forEach((h, col) => {
    const m = headerFieldScore(h);
    if (m) candidates.push({ field: m.field, col, score: m.score });
  });
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);
  const used = new Set<number>();
  for (const c of candidates) {
    if (used.has(c.col)) continue;
    if (mapping[c.field] == null) {
      mapping[c.field] = c.col;
      confidence[c.field] = c.score;
      used.add(c.col);
    } else if (!ambiguous.includes(c.field)) ambiguous.push(c.field);
  }
  return { mapping, confidence, ambiguous };
}

export function headerLabels(headers: Cell[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    let label = h == null || String(h).trim() === "" ? `Column ${i + 1}` : String(h).replace(/\s+/g, " ").trim();
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    if (n > 0) label = `${label} (${n + 1})`;
    return label;
  });
}

function rowKey(r: Cell[]) {
  return r.map((c) => normalizeText(c == null ? "" : String(c))).join("|");
}

export type ExtractedRow = {
  seq: number;
  sourceRef: string;
  original: Cell[];
  fields: Record<Field, string | null>;
  confidence: number;
  flags: string[];
};

export type ExtractResult = {
  rows: ExtractedRow[];
  skippedRepeatedHeaders: number;
  skippedEmpty: number;
  warnings: string[];
};

function cellText(c: Cell | undefined): string | null {
  if (c == null) return null;
  const s = String(c).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/**
 * Converts table rows after the header into option rows. Repeated header rows
 * (e.g. on each PDF page) are skipped; nothing is merged or deduplicated destructively.
 */
export function extractRows(t: TableCandidate, headerRowIndex: number, mapping: Record<string, number | null>, maxRows = 5000): ExtractResult {
  const header = t.rows[headerRowIndex] ?? [];
  const width = header.length;
  const hk = rowKey(header);
  const out: ExtractedRow[] = [];
  let skippedRepeatedHeaders = 0;
  let skippedEmpty = 0;
  const warnings: string[] = [];
  for (let i = headerRowIndex + 1; i < t.rows.length; i++) {
    const r = t.rows[i];
    if (!r.some((c) => cellText(c) != null)) {
      skippedEmpty++;
      continue;
    }
    if (rowKey(r.slice(0, width)) === hk) {
      skippedRepeatedHeaders++;
      continue;
    }
    if (out.length >= maxRows) {
      warnings.push(`Only the first ${maxRows} rows were imported.`);
      break;
    }
    const original = Array.from({ length: width }, (_, k) => (r[k] === undefined ? null : r[k]));
    if (r.length > width && r.slice(width).some((c) => cellText(c) != null)) {
      (t.rowFlags[i] ??= []).push("extra_cells_outside_header");
    }
    const fields = Object.fromEntries(
      FIELDS.map((f) => [f, mapping[f] == null ? null : cellText(r[mapping[f] as number])]),
    ) as Record<Field, string | null>;
    const flags = [...(t.rowFlags[i] ?? [])];
    if (!fields.institution || !fields.designation) flags.push("incomplete");
    for (const f of FIELDS) {
      const v = fields[f];
      if (v && /(\.\.\.|…|-)$/.test(v)) flags.push(`possibly_truncated:${f}`);
    }
    out.push({
      seq: out.length,
      sourceRef: t.rowRefs[i] ?? `row ${i + 1}`,
      original,
      fields,
      confidence: t.rowConfidence[i] ?? 1,
      flags: Array.from(new Set(flags)),
    });
  }
  if (skippedRepeatedHeaders) warnings.push(`${skippedRepeatedHeaders} repeated header row(s) were skipped.`);
  markDuplicates(out);
  return { rows: out, skippedRepeatedHeaders, skippedEmpty, warnings };
}

/** Flags rows with the same institution + district + designation. Never merges them. */
export function markDuplicates(rows: ExtractedRow[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (!r.fields.institution || !r.fields.designation) return;
    const k = [r.fields.institution, r.fields.district, r.fields.designation].map((x) => normalizeText(x)).join("|");
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  for (const [, idx] of groups) {
    if (idx.length > 1) for (const i of idx) if (!rows[i].flags.includes("possible_duplicate")) rows[i].flags.push("possible_duplicate");
  }
  return groups;
}

export function institutionKey(institution: string | null, district: string | null): string | null {
  if (!institution) return null;
  return `${normalizeText(institution)}|${normalizeText(district)}`;
}

/** Splits plain text lines (from OCR or text fallback) into cells on tabs or 2+ spaces. */
export function linesToTable(lines: string[], key: string, label: string, refPrefix = "line"): TableCandidate {
  const rows = lines.map((l) => l.split(/\t| {2,}/).map((c) => c.trim()).filter((c, i, a) => c !== "" || i < a.length - 1) as Cell[]);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const h = detectHeaderRow(rows);
  return {
    key,
    label,
    rows: rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill(null)]),
    rowRefs: lines.map((_, i) => `${refPrefix} ${i + 1}`),
    rowConfidence: rows.map((r) => (r.length === width ? 0.6 : 0.4)),
    rowFlags: rows.map((r) => (r.length === width ? [] : ["column_count_mismatch"])),
    headerRowIndex: h.index,
    warnings: ["Columns were inferred from spacing. Check every row carefully."],
  };
}
