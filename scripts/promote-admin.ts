/**
 * Safe admin bootstrap: promotes an EXISTING account (registered normally) to admin.
 * Requires direct database access (DATABASE_URL), so it cannot be triggered from the web app.
 *   npm run admin:promote -- someone@example.com
 *   npm run admin:promote -- someone@example.com --demote
 */
import { eq } from "drizzle-orm";
import { getDb, closeDb, schema } from "../src/server/db";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const demote = process.argv.includes("--demote");
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run admin:promote -- <email> [--demote]");
    process.exit(1);
  }
  const db = getDb();
  const res = await db.update(schema.user).set({ role: demote ? "user" : "admin", updatedAt: new Date() }).where(eq(schema.user.email, email)).returning({ id: schema.user.id });
  if (!res.length) {
    console.error(`No account found for ${email}. Register it in the app first.`);
    process.exitCode = 1;
  } else {
    await db.insert(schema.auditEvent).values({ id: crypto.randomUUID(), actorUserId: null, action: demote ? "admin.demote_cli" : "admin.promote_cli", targetType: "user", targetId: res[0].id });
    console.log(`${email} is now ${demote ? "a regular user" : "an admin"}.`);
  }
  await closeDb();
}
main();
