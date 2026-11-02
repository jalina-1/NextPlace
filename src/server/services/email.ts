import { db, schema } from "../db";
import { env } from "../env-core";
import { logger } from "../logger";

/**
 * Email adapter. With RESEND_API_KEY set, sends through Resend's HTTP API.
 * Otherwise messages are stored in the outbox table (visible to admins) so
 * development and demos work without an email provider.
 */
export async function sendEmail(msg: { to: string; subject: string; body: string }) {
  const provider = env.providers.email;
  let status = "stored";
  if (provider === "resend" && env.resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.emailFrom, to: [msg.to], subject: msg.subject, text: msg.body }),
      });
      status = res.ok ? "sent" : `failed:${res.status}`;
    } catch {
      status = "failed:network";
    }
  }
  await db.insert(schema.emailOutbox).values({
    id: crypto.randomUUID(),
    to: msg.to,
    subject: msg.subject,
    // Only keep the body when it was not delivered externally (dev outbox).
    body: status === "sent" ? "(delivered via provider)" : msg.body,
    provider,
    status,
  });
  logger.info("email.queued", { provider, status });
}
