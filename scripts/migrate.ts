/** Applies SQL migrations in ./drizzle. Safe to run repeatedly. */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closeDb } from "../src/server/db";

async function main() {
  if (process.env.SKIP_MIGRATIONS === "1") {
    console.log("[migrate] skipped (SKIP_MIGRATIONS=1)");
    return;
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (process.env.VERCEL && !url) {
    console.log("[migrate] no database URL in this build environment; skipping");
    return;
  }
  if (!process.env.DATABASE_URL && process.env.POSTGRES_URL_NON_POOLING) {
    // Migrations need a session-mode connection; prefer the non-pooling URL when available.
    process.env.DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING;
  }
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("[migrate] migrations applied");
  await closeDb();
}

main().catch(async (e) => {
  console.error("[migrate] failed:", e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
