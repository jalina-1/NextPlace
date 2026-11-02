import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "../env-core";

export type DB = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __npPool?: Pool; __npDb?: DB };

function makePool() {
  const url = env.databaseUrl;
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ""),
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    idleTimeoutMillis: 10_000,
  });
}

export function getDb(): DB {
  if (!g.__npDb) {
    g.__npPool = makePool();
    g.__npDb = drizzle(g.__npPool, { schema });
  }
  return g.__npDb;
}

export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export async function closeDb() {
  await g.__npPool?.end();
  g.__npPool = undefined;
  g.__npDb = undefined;
}

export { schema };
