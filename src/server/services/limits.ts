import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { errors } from "../http";

/** Atomically increments a counter and returns the new value. */
export async function bump(key: string, window: string, by = 1): Promise<number> {
  const res = await db
    .insert(schema.usageCounter)
    .values({ key, window, count: by })
    .onConflictDoUpdate({
      target: [schema.usageCounter.key, schema.usageCounter.window],
      set: { count: sql`${schema.usageCounter.count} + ${by}`, updatedAt: new Date() },
    })
    .returning({ count: schema.usageCounter.count });
  return res[0].count;
}

export async function peek(key: string, window: string): Promise<number> {
  const r = await db.execute(sql`select count from usage_counter where key = ${key} and "window" = ${window}`);
  return Number((r.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

/** Fixed-window rate limit. Throws 429 when exceeded. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const n = await bump(`rl:${key}`, `${windowSeconds}:${bucket}`);
  if (n > max) throw errors.limit("Too many requests. Please wait a moment and try again.");
}

export function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}
