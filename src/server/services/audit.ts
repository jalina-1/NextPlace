import { db, schema } from "../db";
import { logger } from "../logger";

export async function audit(actorUserId: string | null, action: string, targetType?: string, targetId?: string, data?: Record<string, unknown>) {
  try {
    await db.insert(schema.auditEvent).values({ id: crypto.randomUUID(), actorUserId, action, targetType, targetId, data: data ?? null });
  } catch (e) {
    logger.error("audit.write_failed", { action, error: e instanceof Error ? e.message : "unknown" });
  }
}
