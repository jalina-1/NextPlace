import { eq } from "drizzle-orm";
import { userRoute, assertSameOrigin } from "@/server/route";
import { db, schema } from "@/server/db";
import { storage } from "@/server/storage";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";
/** Deletes the account, projects, uploaded files and receipts. Audit entries keep only IDs. */
export const DELETE = userRoute(async ({ req, user }) => {
  assertSameOrigin(req);
  const files = await db.select({ key: schema.sourceFile.storageKey }).from(schema.sourceFile).where(eq(schema.sourceFile.userId, user.id));
  const receipts = await db.select({ key: schema.payment.receiptKey }).from(schema.payment).where(eq(schema.payment.userId, user.id));
  await storage().remove([...files, ...receipts].map((f) => f.key));
  await audit(user.id, "account.delete", "user", user.id);
  await db.delete(schema.user).where(eq(schema.user.id, user.id));
  return { ok: true };
});
