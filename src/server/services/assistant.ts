/**
 * AI assistant.
 *
 * - The model never computes scores and never mutates data directly. It returns a reply
 *   and at most one structured action; the server turns that action into a deterministic
 *   preview which the user must explicitly apply.
 * - Context contains ONLY options the user may access (free users: their 3 preview options).
 * - Uploaded data and evidence are passed as quoted data, never as instructions.
 * - Without an API key a rule-based demo assistant is used and labeled as such.
 */
import { runBot, type BotContext } from "../agent/bot";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { env } from "../env-core";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { accessContext, isAccessible } from "./results";
import { computeScores } from "./scores";
import { getSettings } from "./settings";
import { bump } from "./limits";
import { colomboDateKey } from "@/lib/dates";
import { CRITERIA, normalizeWeights, validateWeights, parsePreferences, type Preferences } from "@/lib/preferences";
import { isLockedToBottom, legMinutes, lockTail, type OptionScoreResult } from "@/lib/scoring";
import { saveFinalOrder, validatePartition } from "./final-order";
import { savePreferences } from "./preferences";
import { logger } from "../logger";
import { audit } from "./audit";

export type AssistantAction =
  | { kind: "none" }
  | { kind: "prioritize"; maxTravelMinutes: number | null; keepPreferredPostsFirst: boolean }
  | { kind: "move"; optionRef: string; toPosition: number }
  | { kind: "exclude" | "include"; optionRefs: string[] }
  | { kind: "set_weights"; weights: Partial<Record<(typeof CRITERIA)[number], number>> };

type Ctx = Awaited<ReturnType<typeof buildContext>>;

export function assistantMode(): "live" | "demo" | "unavailable" {
  const p = env.providers.ai;
  if (p === "anthropic" && env.anthropicKey) return "live";
  if (p === "openai" && env.openaiKey) return "live";
  if (p === "off") return "unavailable";
  return "demo";
}

async function buildContext(projectId: string, user: CurrentUser) {
  const ac = await accessContext(projectId, user);
  const { prefs, options, bundles, results } = await computeScores(projectId);
  const [order] = ac.premium ? await db.select().from(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId)).limit(1) : [];
  const [pref] = await db.select().from(schema.preference).where(eq(schema.preference.projectId, projectId)).limit(1);
  const byId = new Map(options.map((o) => [o.id, o]));
  const accessible = results.filter((r) => isAccessible(ac, r.optionId));
  // Stable short references (#1, #2, …) follow the final order when it exists, else the ranking.
  const orderIds = order ? order.items.filter((id) => isAccessible(ac, id)) : accessible.filter((r) => r.systemRank != null || !ac.premium).map((r) => r.optionId);
  const refs = new Map<string, string>();
  orderIds.forEach((id, i) => refs.set(`#${i + 1}`, id));
  const rById = new Map(results.map((r) => [r.optionId, r]));
  const describe = (id: string) => {
    const o = byId.get(id)!;
    const r = rById.get(id)!;
    const b = bundles.get(id);
    const prim = b?.evidence.travel?.primary;
    return {
      ref: [...refs.entries()].find(([, v]) => v === id)?.[0] ?? null,
      institution: o.institution,
      district: o.district,
      designation: o.designation,
      vacancies: o.vacancies,
      status: r.status,
      score: r.finalScore,
      coverage: r.coverage,
      travelMinutes: legMinutes(prim, prefs.travelMode),
      roadKm: prim?.driveKm ?? null,
      straightKm: b?.straightKm ?? null,
      climate: b?.evidence.climate ?? null,
      facilities: b?.evidence.facilities?.counts ?? null,
      criteria: Object.fromEntries(r.breakdown.map((c) => [c.criterion, c.score])),
      demoData: !!(b?.location?.isDemo || b?.refs.some((x) => x.isDemo)),
    };
  };
  return {
    premium: ac.premium,
    prefs,
    prefRevision: pref?.revision ?? 1,
    order: order ?? null,
    refs,
    orderIds,
    accessible,
    hiddenCount: options.length - accessible.length,
    describe,
    byId,
    rById,
  };
}

/* ------------------------------ proposal engine ----------------------------- */

function resolveRef(ctx: Ctx, ref: string) {
  const id = ctx.refs.get(ref.trim().startsWith("#") ? ref.trim() : `#${ref.trim()}`);
  if (!id) throw errors.bad(`Unknown option reference ${ref}.`);
  return id;
}

function postMatched(r: OptionScoreResult | undefined) {
  return /Matches preferred post/.test(r?.breakdown.find((b) => b.criterion === "post")?.detail ?? "");
}

/** Deterministically computes the effect of an action. Throws if invalid or not permitted. */
export function buildPreview(ctx: Ctx, action: AssistantAction) {
  if (action.kind === "none") return null;
  if (action.kind === "set_weights") {
    const criteria = structuredClone(ctx.prefs.criteria);
    for (const c of CRITERIA) {
      const w = action.weights[c];
      if (w == null) continue;
      if (!Number.isFinite(w) || w < 0 || w > 100) throw errors.bad("Invalid weight.");
      criteria[c] = { enabled: w > 0, weight: w };
    }
    const normalized = normalizeWeights(criteria);
    const issues = validateWeights(normalized);
    if (issues.length) throw errors.bad(issues.map((i) => i.message).join(" "));
    return { type: "weights" as const, before: ctx.prefs.criteria, after: normalized };
  }
  if (!ctx.premium || !ctx.order) throw errors.premium("Changing the final order requires full access.");
  if (ctx.order.status === "finalized") throw errors.conflict("Your list is finalized. Reopen it before changing the order.");
  let items = [...ctx.order.items];
  let excluded = [...ctx.order.excluded];
  if (action.kind === "move") {
    const id = resolveRef(ctx, action.optionRef);
    if (!items.includes(id)) throw errors.bad("That option is not in the included list.");
    const to = Math.max(1, Math.min(items.length, Math.round(action.toPosition)));
    items = items.filter((x) => x !== id);
    items.splice(to - 1, 0, id);
  } else if (action.kind === "exclude" || action.kind === "include") {
    const ids = action.optionRefs.map((r) => resolveRef(ctx, r));
    if (action.kind === "exclude") {
      items = items.filter((x) => !ids.includes(x));
      excluded = [...excluded, ...ids.filter((x) => !excluded.includes(x))];
    } else {
      excluded = excluded.filter((x) => !ids.includes(x));
      items = [...items, ...ids.filter((x) => !items.includes(x))];
    }
  } else if (action.kind === "prioritize") {
    const pos = new Map(items.map((id, i) => [id, i]));
    const meets = (id: string) => {
      if (action.maxTravelMinutes == null) return true;
      const r = ctx.describe(id);
      return r.travelMinutes != null && r.travelMinutes <= action.maxTravelMinutes;
    };
    items = [...items].sort((a, b) => {
      if (action.keepPreferredPostsFirst) {
        const pa = postMatched(ctx.rById.get(a)) ? 0 : 1;
        const pb = postMatched(ctx.rById.get(b)) ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      const ma = meets(a) ? 0 : 1;
      const mb = meets(b) ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return pos.get(a)! - pos.get(b)!;
    });
  }
  // "Never" options stay at the bottom and can't be left out, whatever the action.
  const locked = new Set(ctx.accessible.filter((r) => isLockedToBottom(r.status)).map((r) => r.optionId));
  excluded = excluded.filter((id) => !locked.has(id) || (items.push(id), false));
  items = lockTail(Array.from(new Set(items)), locked);
  const all = [...ctx.order.items, ...ctx.order.excluded];
  const problems = validatePartition(all, items, excluded);
  if (problems.length) throw errors.bad("Proposal would lose or duplicate entries; rejected.");
  const before = ctx.order.items;
  const moved = items.map((id, i) => ({ id, from: before.indexOf(id) + 1, to: i + 1 })).filter((m) => m.from !== m.to);
  return {
    type: "order" as const,
    items,
    excluded,
    summary: {
      moved: moved.length,
      newlyExcluded: excluded.filter((x) => !ctx.order!.excluded.includes(x)).length,
      newlyIncluded: items.filter((x) => !before.includes(x)).length,
      top: items.slice(0, 10).map((id, i) => {
        const o = ctx.byId.get(id)!;
        return { position: i + 1, previous: before.indexOf(id) + 1 || null, institution: o.institution, designation: o.designation };
      }),
    },
  };
}

/* --------------------------------- demo mode -------------------------------- */

function demoRespond(ctx: Ctx, message: string): { reply: string; action: AssistantAction } {
  const m = message.toLowerCase();
  const hours = m.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const mins = m.match(/(\d+)\s*(?:minutes?|mins?)\b/);
  const moveMatch = m.match(/move\s*#?(\d+)\s*(?:to|into)\s*(?:position|place|rank)?\s*#?(\d+)/);
  const explainMatch = m.match(/(?:explain|why)\D*#?(\d+)/);
  if (moveMatch) return { reply: `Proposed: move #${moveMatch[1]} to position ${moveMatch[2]}. Review the preview and apply it if it looks right.`, action: { kind: "move", optionRef: `#${moveMatch[1]}`, toPosition: Number(moveMatch[2]) } };
  if ((hours || mins) && /(closer|top|first|priorit|move|up)/.test(m)) {
    const limit = hours ? Math.round(Number(hours[1]) * 60) : Number(mins![1]);
    const keep = /prefer|post|keep/.test(m);
    return {
      reply: `Proposed: options with a known estimated travel time of ${limit} minutes or less move up${keep ? ", while options matching your preferred posts stay ahead of the rest" : ""}. Options with unknown travel time are treated as not meeting the limit. Relative order is otherwise kept.`,
      action: { kind: "prioritize", maxTravelMinutes: limit, keepPreferredPostsFirst: keep },
    };
  }
  if (explainMatch) {
    const id = ctx.refs.get(`#${explainMatch[1]}`);
    if (!id) return { reply: `I can't find #${explainMatch[1]} among the options you can access.`, action: { kind: "none" } };
    const d = ctx.describe(id);
    const r = ctx.rById.get(id)!;
    return { reply: `#${explainMatch[1]} ${d.institution} — ${d.designation}. ${r.explanation}${d.demoData ? " (Evidence is DEMO synthetic data.)" : ""}`, action: { kind: "none" } };
  }
  if (/missing|unknown|coverage/.test(m)) {
    const low = ctx.orderIds.map((id) => ctx.describe(id)).filter((d) => d.coverage < 100).slice(0, 5);
    return {
      reply: low.length
        ? `Options with incomplete evidence: ${low.map((d) => `${d.ref} ${d.institution} (${d.coverage}% coverage)`).join("; ")}. Unknown criteria are left out of the provisional score instead of counted as zero.`
        : "All accessible options have complete evidence for your enabled criteria.",
      action: { kind: "none" },
    };
  }
  return {
    reply:
      "Demo assistant (rule-based). Try: “Move options within a 3 hour drive closer to the top, keeping my preferred posts first”, “Move #5 to position 2”, “Explain #1”, or “Which options have missing data?”.",
    action: { kind: "none" },
  };
}

/* --------------------------------- live mode -------------------------------- */

/* ---------------------------------- API ---------------------------------- */

export const chatInput = z.object({ message: z.string().trim().min(1).max(1000) });

export async function chat(projectId: string, user: CurrentUser, message: string) {
  const mode = assistantMode();
  if (mode === "unavailable") throw errors.bad("The assistant is not available on this server.");
  const settings = await getSettings();
  const used = await bump(`ai:${user.id}`, colomboDateKey());
  if (used > settings.quotas.aiMessagesPerUserPerDay) throw errors.limit("Daily assistant message limit reached.");
  const ctx = await buildContext(projectId, user);
  const history = (
    await db.select().from(schema.aiMessage).where(and(eq(schema.aiMessage.projectId, projectId), eq(schema.aiMessage.userId, user.id))).orderBy(desc(schema.aiMessage.createdAt)).limit(8)
  )
    .reverse()
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));

  let out: { reply: string; action: AssistantAction };
  try {
    if (mode === "live") {
      const r = await runBot(projectId, ctx as unknown as BotContext, history, message, { preview: (a) => buildPreview(ctx, a as AssistantAction) });
      out = { reply: r.reply, action: (r.action as AssistantAction | null) ?? { kind: "none" } };
    } else out = demoRespond(ctx, message);
  } catch (e) {
    logger.error("assistant.failed", { error: e instanceof Error ? e.message : String(e) });
    throw errors.bad("The assistant is temporarily unavailable. Please try again later.");
  }

  let proposal: { id: string; preview: unknown } | null = null;
  let note = "";
  if (out.action.kind !== "none") {
    try {
      const preview = buildPreview(ctx, out.action);
      if (preview) {
        const id = crypto.randomUUID();
        await db.insert(schema.aiProposal).values({
          id,
          projectId,
          userId: user.id,
          baseRevision: ctx.order?.revision ?? 0,
          basePreferenceRevision: ctx.prefRevision,
          action: out.action,
          preview,
        });
        proposal = { id, preview };
      }
    } catch (e) {
      note = ` (No change proposed: ${e instanceof Error ? e.message : "not permitted"})`;
    }
  }
  const reply = out.reply + note;
  await db.insert(schema.aiMessage).values([
    { id: crypto.randomUUID(), projectId, userId: user.id, role: "user", content: message, mode },
    { id: crypto.randomUUID(), projectId, userId: user.id, role: "assistant", content: reply, mode, proposalId: proposal?.id ?? null },
  ]);
  return { mode, reply, proposal };
}

export async function history(projectId: string, user: CurrentUser) {
  await accessContext(projectId, user);
  const msgs = await db
    .select()
    .from(schema.aiMessage)
    .where(and(eq(schema.aiMessage.projectId, projectId), eq(schema.aiMessage.userId, user.id)))
    .orderBy(asc(schema.aiMessage.createdAt))
    .limit(100);
  const proposals = await db.select().from(schema.aiProposal).where(eq(schema.aiProposal.projectId, projectId));
  const pById = new Map(proposals.map((p) => [p.id, p]));
  return {
    mode: assistantMode(),
    messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, mode: m.mode, createdAt: m.createdAt, proposal: m.proposalId ? { id: m.proposalId, status: pById.get(m.proposalId)?.status, preview: pById.get(m.proposalId)?.preview } : null })),
  };
}

/** Applies a proposal after re-validating ownership, access, revision and option IDs. */
export async function applyProposal(projectId: string, user: CurrentUser, proposalId: string) {
  const ctx = await buildContext(projectId, user);
  const [p] = await db.select().from(schema.aiProposal).where(and(eq(schema.aiProposal.id, proposalId), eq(schema.aiProposal.projectId, projectId), eq(schema.aiProposal.userId, user.id))).limit(1);
  if (!p) throw errors.notFound("Proposal not found.");
  if (p.status !== "pending") throw errors.conflict(`This proposal was already ${p.status}.`);
  const action = p.action as AssistantAction;
  const markStale = async () => {
    await db.update(schema.aiProposal).set({ status: "stale" }).where(eq(schema.aiProposal.id, p.id));
    throw errors.conflict("Your list or weights changed after this suggestion was made. Ask again for an updated proposal.");
  };
  if (action.kind === "set_weights") {
    if (ctx.prefRevision !== p.basePreferenceRevision) await markStale();
    const preview = buildPreview(ctx, action) as { type: "weights"; after: Preferences["criteria"] };
    const prefs = parsePreferences({ ...ctx.prefs, criteria: preview.after });
    await savePreferences(projectId, user, prefs, ctx.prefRevision);
  } else {
    if (!ctx.premium) throw errors.premium("Changing the final order requires full access.");
    if (!ctx.order || ctx.order.revision !== p.baseRevision) await markStale();
    const preview = buildPreview(ctx, action) as { type: "order"; items: string[]; excluded: string[] };
    await saveFinalOrder(projectId, user, { expectedRevision: ctx.order!.revision, items: preview.items, excluded: preview.excluded });
  }
  await db.update(schema.aiProposal).set({ status: "applied" }).where(eq(schema.aiProposal.id, p.id));
  await audit(user.id, "assistant.apply", "project", projectId, { proposalId });
  return { ok: true };
}

export async function discardProposal(projectId: string, user: CurrentUser, proposalId: string) {
  await accessContext(projectId, user);
  await db
    .update(schema.aiProposal)
    .set({ status: "discarded" })
    .where(and(eq(schema.aiProposal.id, proposalId), eq(schema.aiProposal.projectId, projectId), eq(schema.aiProposal.userId, user.id), eq(schema.aiProposal.status, "pending")));
  return { ok: true };
}
