/**
 * Excel export of a finalized (immutable) revision.
 * - Original column names and values are preserved; rows follow the final preference order.
 * - "Preference Rank" is added as a new first column; the original INDEX is untouched.
 * - Text that could be interpreted as a formula is prefixed with an apostrophe.
 * - The workbook's visual formatting, formulas, macros and other features are NOT reproduced.
 */
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { getOwnedProject } from "./projects";
import { requirePremium } from "./final-order";
import { computeScores } from "./scores";
import { formatColombo } from "@/lib/dates";
import { audit } from "./audit";

/** Neutralizes spreadsheet formula injection in untrusted text. Plain numbers like "-5" are left as-is. */
export function safeCell(v: string | number | null): string | number | null {
  if (v == null || typeof v === "number") return v;
  if (/^[=+@\t\r]/.test(v) || (/^-/.test(v) && !/^-\d+(\.\d+)?$/.test(v))) return `'${v}`;
  return v;
}

export async function buildExport(projectId: string, user: CurrentUser, revisionId: string, opts: { analysisSheet: boolean }) {
  const project = await getOwnedProject(projectId, user);
  await requirePremium(user);
  const [rev] = await db
    .select()
    .from(schema.finalOrderRevision)
    .where(and(eq(schema.finalOrderRevision.id, revisionId), eq(schema.finalOrderRevision.projectId, projectId)))
    .limit(1);
  if (!rev) throw errors.notFound("Finalized revision not found.");
  const [mapping] = await db.select().from(schema.importMapping).where(eq(schema.importMapping.projectId, projectId)).limit(1);
  const [src] = await db.select().from(schema.sourceFile).where(eq(schema.sourceFile.projectId, projectId)).limit(1);
  const options = await db.select().from(schema.option).where(eq(schema.option.projectId, projectId));
  const byId = new Map(options.map((o) => [o.id, o]));
  const headers = mapping?.originalHeaders ?? [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "NextPlace";
  wb.created = new Date();
  const ws = wb.addWorksheet("Preference list");
  const anyCorrections = rev.items.some((id) => Object.keys(byId.get(id)?.corrections ?? {}).length > 0);
  ws.addRow(["Preference Rank", ...headers, ...(anyCorrections ? ["NextPlace corrections"] : [])]);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  rev.items.forEach((id, i) => {
    const o = byId.get(id);
    if (!o) throw new Error("finalized revision references a missing option");
    const corr = Object.entries(o.corrections ?? {}).map(([k, v]) => `${k}: ${v}`).join("; ");
    ws.addRow([i + 1, ...headers.map((_, k) => safeCell(o.original[k] ?? null)), ...(anyCorrections ? [safeCell(corr || null)] : [])]);
  });
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 16 : Math.min(48, Math.max(10, String(headers[i - 1] ?? "").length + 4))));

  const info = wb.addWorksheet("About this export");
  const rows: [string, string][] = [
    ["Project", project.name],
    ["Finalized revision", `#${rev.number} — ${formatColombo(rev.createdAt)} (Asia/Colombo)`],
    ["Source file", src ? `${src.originalName} (${src.kind.toUpperCase()})` : "—"],
    ["Entries in list", String(rev.items.length)],
    ["Entries left out", String(rev.excluded.length)],
    [
      "Notes",
      src?.kind === "xlsx"
        ? "Rows reordered from your uploaded workbook. Original column names and values are preserved; formatting, formulas, macros and other workbook features are not reproduced (formula cells contain their last calculated value)."
        : "Generated from the data you confirmed during import.",
    ],
    ["Disclaimer", "NextPlace does not submit applications, determine eligibility, or predict official transfer allocations."],
  ];
  rows.forEach((r) => info.addRow(r.map((x) => safeCell(x))));
  info.getColumn(1).width = 22;
  info.getColumn(2).width = 100;

  if (rev.excluded.length) {
    const ex = wb.addWorksheet("Left out");
    ex.addRow(headers);
    ex.getRow(1).font = { bold: true };
    for (const id of rev.excluded) {
      const o = byId.get(id);
      if (o) ex.addRow(headers.map((_, k) => safeCell(o.original[k] ?? null)));
    }
  }

  if (opts.analysisSheet) {
    const { results, bundles } = await computeScores(projectId);
    const rById = new Map(results.map((r) => [r.optionId, r]));
    const an = wb.addWorksheet("Analysis");
    an.addRow(["Preference Rank", "System rank", "Index", "Institution", "District", "Designation", "Status", "Score", "Evidence coverage %", "Post", "Travel", "Climate", "Facilities", "Preferred location", "Road km", "Straight-line km", "Explanation", "Sources", "Demo data"]);
    an.getRow(1).font = { bold: true };
    rev.items.forEach((id, i) => {
      const o = byId.get(id)!;
      const r = rById.get(id);
      const b = bundles.get(id);
      const c = (k: string) => r?.breakdown.find((x) => x.criterion === k)?.score ?? "unknown";
      const sources = (b?.refs ?? []).map((s) => `${s.kind}: ${s.provider} @ ${s.retrievedAt.slice(0, 10)}${s.sourceUrl ? ` ${s.sourceUrl}` : ""}`).join(" | ");
      an.addRow(
        [i + 1, r?.systemRank ?? "", o.originalIndex, o.institution, o.district, o.designation, r?.status ?? "", r?.finalScore ?? "Unscored", r?.coverage ?? 0, c("post"), c("travel"), c("climate"), c("facilities"), c("location"), b?.evidence.travel?.primary?.driveKm ?? "unknown", b?.straightKm ?? "unknown", r?.explanation ?? "", sources, b?.refs.some((s) => s.isDemo) || b?.location?.isDemo ? "DEMO (synthetic)" : ""].map((v) => safeCell(v as string | number | null)),
      );
    });
  }

  await audit(user.id, "final.export", "project", projectId, { revisionId });
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const safeName = project.name.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-") || "preferences";
  return { filename: `${safeName}-final-r${rev.number}.xlsx`, bytes: buf };
}
