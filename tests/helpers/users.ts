import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db, schema } from "@/server/db";
import type { CurrentUser } from "@/server/session";

export async function signUp(email: string, extra: Record<string, unknown> = {}) {
  const res = await auth.api.signUpEmail({ body: { email, password: "correct-horse-battery", name: email.split("@")[0], ...extra } as never, asResponse: true });
  if (!res.ok) throw new Error(`signup failed ${res.status} ${await res.text()}`);
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  return { user: { id: u.id, email: u.email, name: u.name, role: u.role as "user" | "admin" } satisfies CurrentUser, cookie: cookieFrom(res) };
}

export async function signIn(email: string) {
  const res = await auth.api.signInEmail({ body: { email, password: "correct-horse-battery" }, asResponse: true });
  if (!res.ok) throw new Error(`signin failed ${res.status}`);
  return cookieFrom(res);
}

export function cookieFrom(res: Response): string {
  const set = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return set.map((c) => c.split(";")[0]).filter((c) => c.includes("session_token")).join("; ");
}

export async function makeAdmin(userId: string) {
  await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, userId));
}
