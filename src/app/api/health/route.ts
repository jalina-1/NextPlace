import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/server/env-core";
import { storage } from "@/server/storage";
import { rateLimit, clientIp } from "@/server/services/limits";

export const dynamic = "force-dynamic";

/**
 * Public liveness check. `?deep=1` also runs a storage round-trip and reports
 * booleans plus coarse status codes only — never hostnames, keys or error text.
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  if (!deep) return NextResponse.json({ ok: database }, { status: database ? 200 : 503 });
  try {
    await rateLimit(`health:${clientIp(req.headers)}`, 10, 60);
  } catch {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let storageStatus: "ok" | "not_configured" | "error" = "error";
  try {
    storageStatus = (await storage().check()).ok ? "ok" : "error";
  } catch (e) {
    storageStatus = e instanceof Error && (e.name === "StorageNotConfiguredError" || /not configured|aren’t switched on/.test(e.message)) ? "not_configured" : "error";
  }
  let migrations: number | null = null;
  try {
    const r = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    migrations = (r.rows[0] as { n: number }).n;
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: database && storageStatus === "ok", database, migrations, storage: storageStatus, storageDriver: env.storageDriver });
}
