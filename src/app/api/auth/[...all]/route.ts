import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { rateLimit, clientIp } from "@/server/services/limits";

const h = toNextJsHandler(auth);
const SENSITIVE = /\/(sign-in|sign-up|request-password-reset|forget-password|reset-password)/;

export const GET = h.GET;
export async function POST(req: Request) {
  try {
    const path = new URL(req.url).pathname;
    if (SENSITIVE.test(path)) {
      const ip = clientIp(req.headers);
      await rateLimit(`auth:${ip}`, 20, 600);
      // Also limit guesses against one account, whatever address they come from.
      if (/\/sign-in/.test(path)) {
        const body = (await req.clone().json().catch(() => null)) as { email?: unknown } | null;
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 320) : "";
        if (email) await rateLimit(`auth-email:${email}`, 10, 600);
      }
    }
  } catch (e) {
    return errorResponse(e);
  }
  return h.POST(req);
}
