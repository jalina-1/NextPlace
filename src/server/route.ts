import { NextResponse } from "next/server";
import { handle, errors } from "./http";
import { requireAdmin, requireUser, type CurrentUser } from "./session";
import { rateLimit, clientIp } from "./services/limits";
import { getSettings } from "./services/settings";

type Ctx = { params: Promise<Record<string, string>> };

/** Authenticated route: validates the session against the database on every request. */
export function userRoute(fn: (args: { req: Request; user: CurrentUser; params: Record<string, string> }) => Promise<unknown>) {
  return handle(async (req: Request, ctx: Ctx) => {
    const user = await requireUser(req.headers);
    await rateLimit(`u:${user.id}`, 300, 60);
    // Optional gate (admin setting): only accounts an administrator has verified can use the app.
    if (!user.verified && user.role !== "admin" && (await getSettings()).requireVerifiedAccounts)
      throw errors.forbidden("Your account is waiting for approval by an administrator. Please try again later.");
    return fn({ req, user, params: await ctx.params });
  });
}

export function adminRoute(fn: (args: { req: Request; user: CurrentUser; params: Record<string, string> }) => Promise<unknown>) {
  return handle(async (req: Request, ctx: Ctx) => {
    const user = await requireAdmin(req.headers);
    await rateLimit(`a:${user.id}`, 240, 60);
    return fn({ req, user, params: await ctx.params });
  });
}

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 1_000_000) throw errors.bad("Request too large.");
  try {
    return await req.json();
  } catch {
    throw errors.bad("Invalid JSON body.");
  }
}

/** Mutating requests must come from our own origin (defence in depth on top of SameSite cookies). */
export function assertSameOrigin(req: Request, strict = false) {
  const origin = req.headers.get("origin");
  // Admin changes are strict: a browser always sends Origin on these requests.
  if (!origin) {
    if (strict) throw errors.forbidden("Cross-site request blocked.");
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && new URL(origin).host !== host) throw errors.forbidden("Cross-site request blocked.");
}

export function fileResponse(bytes: Buffer, mime: string, filename: string, inline = false) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export { rateLimit, clientIp };
