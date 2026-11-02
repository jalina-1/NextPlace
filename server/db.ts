import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
export const dataDir = path.resolve(process.env.DATA_DIR || ".data");
if (process.env.VERCEL && !process.env.DATABASE_URL)
  throw Error("Vercel requires DATABASE_URL; local databases are disabled.");
if (!process.env.DATABASE_URL)
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    })
  : null;
const lite = pool ? null : new PGlite(path.join(dataDir, "postgres"));
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  return (await (pool ? pool.query(sql, params) : lite!.query(sql, params)))
    .rows;
}
// Serialize transactions in local embedded PostgreSQL; production uses a dedicated connection.
let chain = Promise.resolve();
export async function transaction<T>(
  fn: (q: typeof query) => Promise<T>,
): Promise<T> {
  if (pool) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(async (s, p = []) => (await c.query(s, p)).rows);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  let release!: () => void;
  const previous = chain;
  chain = new Promise((r) => (release = r));
  await previous;
  try {
    return await lite!.transaction(async (tx) =>
      fn(async (s, p = []) => (await tx.query(s, p)).rows),
    );
  } finally {
    release();
  }
}
export async function init() {
  const sql = await fs.readFile(
    new URL("../migrations/001.sql", import.meta.url),
    "utf8",
  );
  if (pool)
    await transaction(async (q) => {
      await q("SELECT pg_advisory_xact_lock(741291)");
      await q(sql);
    });
  else await lite!.exec(sql);
}
