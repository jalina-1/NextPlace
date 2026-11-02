import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, ne } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "./db";
import { env } from "./env-core";
import { sendEmail } from "./services/email";
import { audit } from "./services/audit";

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
    session: {
      create: {
        // One active session per account: a new login revokes all previous sessions server-side.
        async after(newSession) {
          const old = await db
            .select({ id: schema.session.id, token: schema.session.token })
            .from(schema.session)
            .where(and(eq(schema.session.userId, newSession.userId), ne(schema.session.id, newSession.id)));
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
