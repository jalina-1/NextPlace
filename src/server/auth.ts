import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, ne } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "./db";
import { env } from "./env-core";
import { sendEmail } from "./services/email";
import { audit } from "./services/audit";

/** "phone" for phones and tablets, "pc" for everything else. */
export function deviceKind(userAgent: string | null | undefined): "phone" | "pc" {
  return /Mobi|Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|Windows Phone/i.test(userAgent ?? "") ? "phone" : "pc";
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const auth = betterAuth({
  appName: "NextPlace",
  baseURL: env.appUrl,
  secret: env.authSecret,
  trustedOrigins: [env.appUrl, ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []), ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : [])],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Reset your NextPlace password",
        body: `Someone asked to reset the password for this NextPlace account.\n\nOpen this link within 30 minutes to choose a new password:\n${url}\n\nIf you did not ask for this, you can ignore this email.`,
      });
    },
  },
  user: {
    additionalFields: {
      // input:false → cannot be supplied at sign-up or via profile updates.
      role: { type: "string", required: false, defaultValue: "user", input: false },
      status: { type: "string", required: false, defaultValue: "active", input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Cookie cache is disabled so that every protected request re-validates the session in the database.
    cookieCache: { enabled: false },
  },
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    useSecureCookies: env.appUrl.startsWith("https://"),
  },
  databaseHooks: {
    user: {
      create: {
        async after(u) {
          try {
            await sendEmail({
              to: u.email,
              subject: "Welcome to NextPlace — keep your account private",
              body: `Hello ${u.name},\n\nYour NextPlace account was created with this email address (${u.email}).\n\nPlease keep this account to yourself:\n- Do not share your password or sign-in details with anyone. Your account holds your personal information, your vacancy lists and your payment receipts, and anyone who signs in can see them.\n- One account can be signed in on one phone and one computer at a time. Signing in on another phone or computer signs out the earlier one.\n- NextPlace staff will never ask for your password.\n\nIf you did not create this account, reply to this email.\n\nNextPlace`,
            });
          } catch {
            /* a failed welcome email must never block registration */
          }
        },
      },
    },
    session: {
      create: {
        // A suspended account cannot sign in.
        async before(newSession) {
          const [u] = await db.select({ status: schema.user.status }).from(schema.user).where(eq(schema.user.id, newSession.userId)).limit(1);
          if (u?.status === "suspended") throw new APIError("FORBIDDEN", { message: "This account has been suspended. Please contact support." });
        },
        // One phone and one computer per account: a new login replaces the previous session
        // of the same kind of device, so at most two devices are signed in at once.
        async after(newSession) {
          const others = await db
            .select({ id: schema.session.id, token: schema.session.token, userAgent: schema.session.userAgent, createdAt: schema.session.createdAt })
            .from(schema.session)
            .where(and(eq(schema.session.userId, newSession.userId), ne(schema.session.id, newSession.id)));
          const kind = deviceKind(newSession.userAgent);
          const keep = others.filter((o) => deviceKind(o.userAgent) !== kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          // Same kind of device → replaced. Anything beyond one other device → replaced too.
          const old = [...others.filter((o) => deviceKind(o.userAgent) === kind), ...keep.slice(1)];
          if (old.length === 0) return;
          await db.transaction(async (tx) => {
            for (const s of old) {
              await tx
                .insert(schema.sessionRevocation)
                .values({ tokenHash: hashToken(s.token), userId: newSession.userId, reason: "replaced" })
                .onConflictDoNothing();
              await tx.delete(schema.session).where(eq(schema.session.id, s.id));
            }
          });
          await audit(newSession.userId, "session.replaced_previous", "user", newSession.userId, { revoked: old.length });
        },
      },
    },
  },
  plugins: [],
});

export type AuthSession = typeof auth.$Infer.Session;
