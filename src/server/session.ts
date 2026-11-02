import { headers as nextHeaders, cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth, hashToken } from "./auth";
import { db, schema } from "./db";
import { errors } from "./http";

export type CurrentUser = { id: string; email: string; name: string; role: "user" | "admin" };

export type SessionState =
  | { status: "active"; user: CurrentUser }
  | { status: "replaced" }
  | { status: "anonymous" };

const COOKIE_NAMES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

/** Validates the session against the database on every call (no client-side trust). */
export async function getSessionState(h?: Headers): Promise<SessionState> {
  const hdrs = h ?? (await nextHeaders());
  const s = await auth.api.getSession({ headers: hdrs });
  if (s?.user) {
    const role = (s.user as { role?: string }).role === "admin" ? "admin" : "user";
    return { status: "active", user: { id: s.user.id, email: s.user.email, name: s.user.name, role } };
  }
  const raw = await readSessionCookie(hdrs);
  if (raw) {
    const token = decodeURIComponent(raw).split(".")[0];
    const rev = await db.select().from(schema.sessionRevocation).where(eq(schema.sessionRevocation.tokenHash, hashToken(token))).limit(1);
    if (rev.length) return { status: "replaced" };
  }
  return { status: "anonymous" };
}

async function readSessionCookie(h: Headers): Promise<string | null> {
  const cookieHeader = h.get("cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(/;\s*/)) {
      const i = part.indexOf("=");
      if (i > 0 && COOKIE_NAMES.includes(part.slice(0, i))) return part.slice(i + 1);
    }
    return null;
  }
  try {
    const c = await cookies();
    for (const n of COOKIE_NAMES) {
      const v = c.get(n)?.value;
      if (v) return v;
    }
  } catch {
    /* not in a request scope */
  }
  return null;
}

export async function requireUser(h?: Headers): Promise<CurrentUser> {
  const s = await getSessionState(h);
  if (s.status === "active") return s.user;
  if (s.status === "replaced") throw errors.unauthorized("session_replaced", "You were signed out because your account signed in on another device or browser.");
  throw errors.unauthorized();
}

export async function requireAdmin(h?: Headers): Promise<CurrentUser> {
  const u = await requireUser(h);
  if (u.role !== "admin") throw errors.forbidden();
  return u;
}
