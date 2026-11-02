import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { storage } from "../storage";
import { detectKind, parseCsv, parsePdf, parseXlsx, type ParseOutput } from "../imports/parsers";
import { extractRows, FIELDS, headerLabels, institutionKey, markDuplicates, REQUIRED_FIELDS, suggestMapping, type ExtractedRow, type TableCandidate } from "../imports/table";
import { getOwnedProject, touchProject } from "./projects";
import { hasPremium } from "./access";
import { getSettings } from "./settings";
import { audit } from "./audit";
import { ocrAvailable, ocrPdf } from "../providers/ocr";
import { normalizeText } from "@/lib/scoring";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pdf: "application/pdf",
};

async function assertCanReplaceSource(projectId: string, user: CurrentUser) {
  const p = await getOwnedProject(projectId, user);
  if (p.previewFrozenAt && !(await hasPremium(user.id)))
    throw errors.premium("This project's free preview is already fixed. Start a new project or unlock full access to replace the list.");
  return p;
}

export async function uploadSource(projectId: string, user: CurrentUser, file: { name: string; type: string; bytes: Buffer }) {
  await assertCanReplaceSource(projectId, user);
  if (file.bytes.length === 0) throw errors.bad("The file is empty.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw errors.bad("Files must be 15 MB or smaller.");
  const kind = detectKind(file.name, file.type, file.bytes.subarray(0, 1024));
  if (!kind) throw errors.bad("Unsupported file. Upload an Excel workbook (.xlsx), a CSV file, or a PDF. Macro-enabled (.xlsm) and legacy .xls files are not accepted.");

  let parsed: ParseOutput;
  if (kind === "xlsx") parsed = await parseXlsx(file.bytes);
  else if (kind === "csv") parsed = parseCsv(file.bytes.toString("utf8"));
  else parsed = await parsePdf(file.bytes, ocrAvailable() ? ocrPdf : undefined);

  const id = crypto.randomUUID();
  const key = `projects/${projectId}/source/${id}.${kind}`;
  await storage().put(key, file.bytes, MIME[kind]);

  const old = await db.select().from(schema.sourceFile).where(eq(schema.sourceFile.projectId, projectId));
  await db.transaction(async (tx) => {
    // Replacing the source resets derived data; the previous file is deleted below.
    await tx.delete(schema.option).where(eq(schema.option.projectId, projectId));
    await tx.delete(schema.importMapping).where(eq(schema.importMapping.projectId, projectId));
    await tx.delete(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId));
    await tx.delete(schema.projectInstitution).where(eq(schema.projectInstitution.projectId, projectId));
    await tx.delete(schema.scoreRun).where(eq(schema.scoreRun.projectId, projectId));
    await tx.delete(schema.sourceFile).where(eq(schema.sourceFile.projectId, projectId));
    await tx.insert(schema.sourceFile).values({
      id,
      projectId,
      userId: user.id,
      storageKey: key,
      originalName: file.name.slice(0, 200),
      mimeType: MIME[kind],
      kind,
      sizeBytes: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      parseStatus: parsed.status,
      parseResult: parsed,
    });
  });
  await storage().remove(old.map((o) => o.storageKey));
  await touchProject(projectId, parsed.status === "parsed" ? "uploaded" : "draft");
  await audit(user.id, "import.upload", "project", projectId, { kind, size: file.bytes.length, status: parsed.status });
  return { sourceFileId: id, status: parsed.status, warnings: parsed.warnings, tables: parsed.tables.length };
}

async function getSource(projectId: string) {
  const rows = await db.select().from(schema.sourceFile).where(eq(schema.sourceFile.projectId, projectId)).limit(1);
  return rows[0] ?? null;
}

export async function getImportState(projectId: string, user: CurrentUser) {
  const project = await getOwnedProject(projectId, user);
  const src = await getSource(projectId);
  const mapping = (await db.select().from(schema.importMapping).where(eq(schema.importMapping.projectId, projectId)).limit(1))[0] ?? null;
  if (!src) return { project, source: null, mapping: null, tables: [] as unknown[] };
  const parsed = src.parseResult as ParseOutput;
  const tables = parsed.tables.map((t) => {
    const header = t.rows[t.headerRowIndex] ?? [];
    return {
      key: t.key,
      label: t.label,
      rowCount: t.rows.length,
      headerRowIndex: t.headerRowIndex,
      headers: headerLabels(header),
      suggestion: suggestMapping(header),
      warnings: t.warnings,
      previewRows: t.rows.slice(0, 60).map((r, i) => ({ ref: t.rowRefs[i], cells: r, confidence: t.rowConfidence[i], flags: t.rowFlags[i] ?? [] })),
    };
  });
  return {
    project,
    source: { id: src.id, name: src.originalName, kind: src.kind, sizeBytes: src.sizeBytes, status: src.parseStatus, warnings: parsed.warnings, createdAt: src.createdAt },
    mapping,
    tables,
    ocrAvailable: ocrAvailable(),
  };
}

export const mappingInput = z.object({
  tableKey: z.string().max(200),
  headerRowIndex: z.number().int().min(0).max(10000),
  mapping: z.record(z.enum(FIELDS), z.number().int().min(0).max(200).nullable()),
});

/** Builds rows with a mapping without saving (used for the preview step). */
export async function previewMapping(projectId: string, user: CurrentUser, input: z.infer<typeof mappingInput>) {
  await getOwnedProject(projectId, user);
  const { table, rows, issues } = await buildRows(projectId, input);
  return {
    headers: headerLabels(table.rows[input.headerRowIndex] ?? []),
    issues,
    total: rows.length,
    incomplete: rows.filter((r) => r.flags.includes("incomplete")).length,
    duplicates: rows.filter((r) => r.flags.includes("possible_duplicate")).length,
    rows: rows.slice(0, 100),
  };
}

async function buildRows(projectId: string, input: z.infer<typeof mappingInput>) {
  const src = await getSource(projectId);
  if (!src) throw errors.bad("Upload a file first.");
  const parsed = src.parseResult as ParseOutput;
  const table = parsed.tables.find((t) => t.key === input.tableKey) as TableCandidate | undefined;
  if (!table) throw errors.bad("Unknown table.");
  if (input.headerRowIndex >= table.rows.length) throw errors.bad("Header row is outside the table.");
  const width = (table.rows[input.headerRowIndex] ?? []).length;
  const issues: string[] = [];
  for (const f of REQUIRED_FIELDS) if (input.mapping[f] == null) issues.push(`Map a column to “${f}” (required).`);
  const used = new Map<number, string>();
  for (const f of FIELDS) {
    const c = input.mapping[f];
    if (c == null) continue;
    if (c >= width) issues.push(`Column for “${f}” is outside the table.`);
    if (used.has(c)) issues.push(`“${f}” and “${used.get(c)}” use the same column.`);
    used.set(c, f);
  }
  const settings = await getSettings();
  const ex = extractRows(structuredClone(table), input.headerRowIndex, input.mapping, settings.quotas.maxOptionsPerProject);
  issues.push(...ex.warnings);
  return { src, table, rows: ex.rows, issues };
}

/** Confirms the mapping and creates one option per data row (never merged, never multiplied by vacancies). */
export async function confirmMapping(projectId: string, user: CurrentUser, input: z.infer<typeof mappingInput>) {
  await assertCanReplaceSource(projectId, user);
  const { src, table, rows, issues } = await buildRows(projectId, input);
  const blocking = issues.filter((i) => /required|outside the table|same column/.test(i));
  if (blocking.length) throw errors.bad(blocking.join(" "), { issues: blocking });
  if (rows.length === 0) throw errors.bad("No data rows found below the header row.");
  const headers = headerLabels(table.rows[input.headerRowIndex] ?? []);
  const groups = new Map<string, string>();
  const values = rows.map((r: ExtractedRow) => {
    const dupKey = [r.fields.institution, r.fields.district, r.fields.designation].map((x) => normalizeText(x)).join("|");
    if (r.flags.includes("possible_duplicate") && !groups.has(dupKey)) groups.set(dupKey, crypto.randomUUID());
    return {
      id: crypto.randomUUID(),
      projectId,
      sourceFileId: src.id,
      seq: r.seq,
      sourceRef: r.sourceRef,
      original: r.original,
      originalIndex: r.fields.index,
      district: r.fields.district,
      institution: r.fields.institution,
      designation: r.fields.designation,
      vacancies: r.fields.vacancies,
      extractionConfidence: r.confidence,
      flags: r.flags,
      duplicateGroup: r.flags.includes("possible_duplicate") ? groups.get(dupKey)! : null,
      institutionKey: institutionKey(r.fields.institution, r.fields.district),
    };
  });
  await db.transaction(async (tx) => {
    await tx.delete(schema.option).where(eq(schema.option.projectId, projectId));
    await tx.delete(schema.importMapping).where(eq(schema.importMapping.projectId, projectId));
    await tx.delete(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId));
    await tx.delete(schema.scoreRun).where(eq(schema.scoreRun.projectId, projectId));
    await tx.insert(schema.importMapping).values({
      id: crypto.randomUUID(),
      projectId,
      sourceFileId: src.id,
      tableKey: input.tableKey,
      headerRowIndex: input.headerRowIndex,
      originalHeaders: headers,
      mapping: input.mapping,
      confirmedAt: new Date(),
    });
    for (let i = 0; i < values.length; i += 500) await tx.insert(schema.option).values(values.slice(i, i + 500));
  });
  await touchProject(projectId, "mapped");
  await audit(user.id, "import.confirm_mapping", "project", projectId, { rows: values.length });
  return { created: values.length };
}

export async function listSourceRows(projectId: string, user: CurrentUser, opts: { filter?: string; q?: string; offset?: number; limit?: number }) {
  await getOwnedProject(projectId, user);
  const all = await db.select().from(schema.option).where(eq(schema.option.projectId, projectId)).orderBy(asc(schema.option.seq));
  const q = normalizeText(opts.q);
  let list = all;
  if (opts.filter === "flagged") list = list.filter((o) => o.flags.length > 0 || o.extractionConfidence < 0.9);
  if (opts.filter === "incomplete") list = list.filter((o) => o.flags.includes("incomplete"));
  if (opts.filter === "duplicates") list = list.filter((o) => o.duplicateGroup);
  if (opts.filter === "not_considered") list = list.filter((o) => o.decision === "not_considered");
  if (q) list = list.filter((o) => normalizeText([o.institution, o.district, o.designation, o.originalIndex].join(" ")).includes(q));
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const mapping = (await db.select().from(schema.importMapping).where(eq(schema.importMapping.projectId, projectId)).limit(1))[0];
  return {
    headers: mapping?.originalHeaders ?? [],
    total: all.length,
    filtered: list.length,
    counts: {
      flagged: all.filter((o) => o.flags.length > 0 || o.extractionConfidence < 0.9).length,
      incomplete: all.filter((o) => o.flags.includes("incomplete")).length,
      duplicates: all.filter((o) => o.duplicateGroup).length,
      notConsidered: all.filter((o) => o.decision === "not_considered").length,
    },
    rows: list.slice(offset, offset + limit).map((o) => ({
      id: o.id,
      seq: o.seq,
      sourceRef: o.sourceRef,
      original: o.original,
      index: o.originalIndex,
      district: o.district,
      institution: o.institution,
      designation: o.designation,
      vacancies: o.vacancies,
      corrections: o.corrections,
      confidence: o.extractionConfidence,
      flags: o.flags,
      duplicateGroup: o.duplicateGroup,
      decision: o.decision,
    })),
  };
}

export const correctionInput = z.object({
  optionId: z.string().max(64),
  fields: z.object({
    index: z.string().max(60).optional(),
    district: z.string().max(80).optional(),
    institution: z.string().max(200).optional(),
    designation: z.string().max(200).optional(),
    vacancies: z.string().max(20).optional(),
  }),
});

/** Manual correction of mapped values. Original cell values are never modified. */
export async function correctOption(projectId: string, user: CurrentUser, input: z.infer<typeof correctionInput>) {
  await getOwnedProject(projectId, user);
  const [o] = await db.select().from(schema.option).where(and(eq(schema.option.id, input.optionId), eq(schema.option.projectId, projectId))).limit(1);
  if (!o) throw errors.notFound("Row not found.");
  const corrections = { ...o.corrections };
  const set: Partial<typeof schema.option.$inferInsert> = {};
  for (const [k, raw] of Object.entries(input.fields)) {
    if (raw === undefined) continue;
    const v = raw.trim();
    corrections[k] = v;
    const val = v === "" ? null : v;
    if (k === "index") set.originalIndex = val;
    else (set as Record<string, unknown>)[k] = val;
  }
  const merged = { ...o, ...set };
  const flags = o.flags.filter((f) => f !== "incomplete" && !f.startsWith("possibly_truncated"));
  if (!merged.institution || !merged.designation) flags.push("incomplete");
  flags.push("manually_corrected");
  await db
    .update(schema.option)
    .set({ ...set, corrections, flags: Array.from(new Set(flags)), extractionConfidence: 1, institutionKey: institutionKey(merged.institution, merged.district) })
    .where(eq(schema.option.id, o.id));
  await refreshDuplicates(projectId);
  await audit(user.id, "import.correct_row", "option", o.id);
}

async function refreshDuplicates(projectId: string) {
  const all = await db.select().from(schema.option).where(eq(schema.option.projectId, projectId)).orderBy(asc(schema.option.seq));
  const rows = all.map((o) => ({ seq: o.seq, sourceRef: "", original: [], confidence: 1, fields: { index: o.originalIndex, district: o.district, institution: o.institution, designation: o.designation, vacancies: o.vacancies }, flags: o.flags.filter((f) => f !== "possible_duplicate") }));
  const groups = markDuplicates(rows);
  const groupId = new Map<number, string>();
  for (const idx of groups.values()) if (idx.length > 1) {
    const gid = all[idx[0]].duplicateGroup ?? crypto.randomUUID();
    for (const i of idx) groupId.set(i, gid);
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < all.length; i++) {
      const g = groupId.get(i) ?? null;
      if (g !== all[i].duplicateGroup || rows[i].flags.length !== all[i].flags.length || rows[i].flags.some((f, k) => f !== all[i].flags[k]))
        await tx.update(schema.option).set({ duplicateGroup: g, flags: rows[i].flags }).where(eq(schema.option.id, all[i].id));
    }
  });
}

export const decisionInput = z.object({ optionIds: z.array(z.string().max(64)).min(1).max(5000), decision: z.enum(["consider", "not_considered"]) });

export async function setDecision(projectId: string, user: CurrentUser, input: z.infer<typeof decisionInput>) {
  await getOwnedProject(projectId, user);
  const res = await db
    .update(schema.option)
    .set({ decision: input.decision })
    .where(and(eq(schema.option.projectId, projectId), inArray(schema.option.id, input.optionIds)))
    .returning({ id: schema.option.id });
  return { updated: res.length };
}

/** Authorized download of the user's own uploaded source file. */
export async function downloadSource(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  const src = await getSource(projectId);
  if (!src) throw errors.notFound();
  return { name: src.originalName, mime: src.mimeType, bytes: await storage().get(src.storageKey) };
}

export async function optionCount(projectId: string) {
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(schema.option).where(eq(schema.option.projectId, projectId));
  return r[0].n;
}

/** Distinct posts (designations) found in the user's own imported list, with how many rows and vacancies each has. */
export async function listDesignations(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  const rows = await db
    .select({ designation: schema.option.designation, vacancies: schema.option.vacancies, institution: schema.option.institution, district: schema.option.district })
    .from(schema.option)
    .where(eq(schema.option.projectId, projectId));
  const map = new Map<string, { name: string; rows: number; vacancies: number }>();
  for (const r of rows) {
    if (!r.designation) continue;
    const key = normalizeText(r.designation);
    const cur = map.get(key) ?? { name: r.designation, rows: 0, vacancies: 0 };
    cur.rows++;
    const v = Number(r.vacancies);
    cur.vacancies += Number.isFinite(v) && v > 0 ? v : 0;
    map.set(key, cur);
  }
  const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "en"));
  return {
    imported: rows.length > 0,
    designations: [...map.values()].sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name, "en")),
    institutions: uniq(rows.map((r) => r.institution)),
    districts: uniq(rows.map((r) => r.district)),
  };
}
