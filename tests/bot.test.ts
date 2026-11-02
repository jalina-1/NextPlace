import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "./helpers/db";
import { signUp } from "./helpers/users";
import { db, schema } from "@/server/db";
import { runBot, type BotContext } from "@/server/agent/bot";

type RunnableTool = { name: string; run?: (input: unknown) => Promise<string> };
type Params = { tools: (RunnableTool | { type: string; name: string })[]; system: string; model: string; messages: unknown[] };

/** Fake client: plays a fixed sequence of tool calls, then returns a final text reply. */
function fakeClient(script: { tool: string; input: unknown }[], reply: string, sink: { results: string[]; params?: Params }) {
  return {
    beta: {
      messages: {
        toolRunner: async (params: Params) => {
          sink.params = params;
          for (const step of script) {
            const t = params.tools.find((x) => x.name === step.tool) as RunnableTool;
            sink.results.push(await t.run!(step.input));
          }
          return { stop_reason: "end_turn", content: [{ type: "text", text: reply }] };
        },
      },
    },
  } as never;
}

let projectId: string;
let optionId: string;

beforeAll(async () => {
  await resetDb();
  const { user } = await signUp("bot@example.com");
  projectId = crypto.randomUUID();
  await db.insert(schema.project).values({ id: projectId, userId: user.id, name: "p" });
  await db.insert(schema.sourceFile).values({ id: "sf", projectId, userId: user.id, storageKey: "k", originalName: "a.csv", mimeType: "text/csv", kind: "csv", sizeBytes: 1, sha256: "x", parseStatus: "parsed" });
  optionId = crypto.randomUUID();
  await db.insert(schema.option).values({ id: optionId, projectId, sourceFileId: "sf", seq: 0, sourceRef: "r1", original: [], institution: "Base Hospital A", designation: "MO" });
});

const ctx = (): BotContext => ({
  premium: false,
  hiddenCount: 40,
  prefs: { home: { label: "Kandy" }, travelMode: "driving", travelFrequency: "daily", travel: { maxMinutes: 120 }, posts: ["MO"], preferredDistricts: [], preferredInstitutions: [], excludedDistricts: [], excludedInstitutions: [], climate: {}, facilities: {}, rental: { looking: true }, criteria: {} },
  refs: new Map([["#1", optionId]]),
  orderIds: [optionId],
  order: null,
  describe: (id) => ({ ref: "#1", institution: "Base Hospital A", id }),
});

describe("research assistant bot", () => {
  it("uses web search, saves findings only with a source, and only proposes validated changes", async () => {
    const sink: { results: string[]; params?: Params } = { results: [] };
    let previewCalls = 0;
    const out = await runBot(
      projectId,
      ctx(),
      [],
      "Are there schools near #1? Move it to the top.",
      {
        preview: (a) => {
          previewCalls++;
          if (a.kind === "move") throw new Error("Changing the final order requires full access.");
          return {};
        },
        client: fakeClient(
          [
            { tool: "list_options", input: {} },
            { tool: "save_finding", input: { ref: "#1", topic: "Schools", summary: "Two schools within 2 km", source_url: "not a link" } },
            { tool: "save_finding", input: { ref: "#1", topic: "Schools", summary: "Two schools within 2 km", source_url: "https://example.org/schools" } },
            { tool: "save_finding", input: { ref: "#99", topic: "x", summary: "y", source_url: "https://example.org" } },
            { tool: "propose_change", input: { kind: "move", option_refs: ["#1"], to_position: 1 } },
            { tool: "propose_change", input: { kind: "set_weights", weights: { post: 60, travel: 40 } } },
          ],
          "Here is what I found.",
          sink,
        ),
      },
    );
    // Web search is offered as a server tool; the system prompt forbids invented facts and guarantees.
    expect(sink.params!.tools.some((t) => "type" in t && t.type === "web_search_20260209")).toBe(true);
    expect(sink.params!.system).toMatch(/Never invent facts/);
    expect(sink.params!.system).toMatch(/Never guarantee/);
    // Only accessible options are listed, and the free-preview limit is stated.
    const listed = JSON.parse(sink.results[0]);
    expect(listed.options).toHaveLength(1);
    expect(listed.hiddenOptionsNotShown).toBe(40);
    // Findings: no source → refused; unknown ref → refused; valid → saved.
    expect(sink.results[1]).toMatch(/Not saved/);
    expect(sink.results[2]).toBe("Saved.");
    expect(sink.results[3]).toMatch(/unknown ref/);
    const saved = await db.select().from(schema.botFinding).where(eq(schema.botFinding.projectId, projectId));
    expect(saved).toHaveLength(1);
    expect(saved[0].sourceUrl).toBe("https://example.org/schools");
    // A change the server rejects is reported back to the model; the valid one becomes the proposal.
    expect(sink.results[4]).toMatch(/Not possible: Changing the final order requires full access/);
    expect(previewCalls).toBe(2);
    expect(out.action).toMatchObject({ kind: "set_weights" });
    expect(out.findings).toBe(1);
    expect(out.reply).toBe("Here is what I found.");
  });
});
