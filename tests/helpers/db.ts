import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "@/server/db";

let migrated = false;
export async function resetDb() {
  const db = getDb();
  if (!migrated) {
    await db.execute(sql`drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;`);
    await migrate(db, { migrationsFolder: "./drizzle" });
    migrated = true;
  }
  const r = await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = (r.rows as { tablename: string }[]).map((x) => `"${x.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} cascade`));
}
