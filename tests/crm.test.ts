import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "./helpers/db";
import { signUp, signIn, makeAdmin } from "./helpers/users";
import { db, schema } from "@/server/db";
import { auth } from "@/server/auth";
import { hasPremium, getAccess } from "@/server/services/access";
import { listUsers, userAction, userDetail, dashboardStats, exportUsersCsv } from "@/server/services/crm";
import type { CurrentUser } from "@/server/session";

const PW = "correct-horse-battery";
let admin: CurrentUser;
let alice: CurrentUser;
let aliceCookie: string;

beforeAll(async () => {
  await resetDb();
  const a = await signUp("boss@example.com");
  await makeAdmin(a.user.id);
  admin = { ...a.user, role: "admin" };
  const u = await signUp("alice@example.com");
  alice = u.user;
  aliceCookie = u.cookie;
});

const fails = async (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re);

describe("admin CRM", () => {
  it("lists, filters and exports users", async () => {
    expect((await listUsers("", "all")).total).toBe(2);
    expect((await listUsers("ALICE", "all")).users).toHaveLength(1);
    expect((await listUsers("", "admins")).users).toHaveLength(1);
    expect((await listUsers("", "paid")).users).toHaveLength(0);
    expect((await listUsers("100%_x", "all")).total).toBe(0);
    const csv = await exportUsersCsv();
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).not.toMatch(/password|token/i);
  });

  it("grants access manually, extends it, and revokes it", async () => {
    const at = new Date();
    expect(await hasPremium(alice.id)).toBe(false);
    const g1 = (await userAction(admin, alice.id, { action: "grant", months: 1 }, at)) as { grant: { endsAt: Date } };
    expect(await hasPremium(alice.id)).toBe(true);
    const g2 = (await userAction(admin, alice.id, { action: "grant", months: 2 }, at)) as { grant: { startsAt: Date; endsAt: Date } };
    expect(g2.grant.startsAt.getTime()).toBe(g1.grant.endsAt.getTime());
    expect((await listUsers("", "paid")).users).toHaveLength(1);
    await fails(userAction(admin, alice.id, { action: "revoke_all", reason: " " }), /reason/i);
    await userAction(admin, alice.id, { action: "revoke_all", reason: "refund" });
    expect(await hasPremium(alice.id)).toBe(false);
    expect((await getAccess(alice.id)).premium).toBe(false);
    await fails(userAction(admin, alice.id, { action: "revoke_all", reason: "again" }), /no active access/i);
    // A new grant after a revoke starts now, not after the revoked period.
    const g3 = (await userAction(admin, alice.id, { action: "grant", months: 1 }, at)) as { grant: { startsAt: Date } };
    expect(g3.grant.startsAt.getTime()).toBe(at.getTime());
    await fails(userAction(admin, alice.id, { action: "grant", months: 99 }), /between 1 and 36/);
  });

  it("verifies accounts and keeps private notes", async () => {
    await userAction(admin, alice.id, { action: "verify" });
    await userAction(admin, alice.id, { action: "note", body: "Called, paid by ATM." });
    const d = await userDetail(alice.id);
    expect(d.user.emailVerified).toBe(true);
    expect(d.notes[0]).toMatchObject({ body: "Called, paid by ATM.", author: "boss@example.com" });
    expect(d.events.some((e) => e.action === "access.revoke")).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/"password"|"token"/);
  });

  it("suspending signs the user out and blocks sign-in until lifted", async () => {
    expect((await auth.api.getSession({ headers: new Headers({ cookie: aliceCookie }) }))?.user.id).toBe(alice.id);
    await fails(userAction(admin, admin.id, { action: "suspend", reason: "x" }), /your own/i);
    await userAction(admin, alice.id, { action: "suspend", reason: "chargeback" });
    expect(await auth.api.getSession({ headers: new Headers({ cookie: aliceCookie }) })).toBeNull();
    await expect(signIn("alice@example.com")).rejects.toThrow();
    expect((await db.select().from(schema.session).where(eq(schema.session.userId, alice.id))).length).toBe(0);
    expect((await dashboardStats()) as { suspended: number }).toMatchObject({ suspended: 1 });
    await userAction(admin, alice.id, { action: "unsuspend" });
    expect(await signIn("alice@example.com")).toContain("session_token");
  });

  it("role changes and deletion need the admin's own password and never apply to self", async () => {
    await fails(userAction(admin, alice.id, { action: "set_role", role: "admin", password: "wrong-password" }), /password is not correct/i);
    expect((await userDetail(alice.id)).user.role).toBe("user");
    await fails(userAction(admin, admin.id, { action: "set_role", role: "user", password: PW }), /your own role/i);
    await userAction(admin, alice.id, { action: "set_role", role: "admin", password: PW });
    expect((await userDetail(alice.id)).user.role).toBe("admin");
    await fails(userAction(admin, alice.id, { action: "suspend", reason: "x" }), /administrator role/i);
    await fails(userAction(admin, alice.id, { action: "delete", confirmEmail: alice.email, password: PW }), /administrator role/i);
    await userAction(admin, alice.id, { action: "set_role", role: "user", password: PW });
    await fails(userAction(admin, alice.id, { action: "delete", confirmEmail: "other@example.com", password: PW }), /does not match/i);
    await fails(userAction(admin, alice.id, { action: "delete", confirmEmail: alice.email, password: "nope" }), /password is not correct/i);
    await userAction(admin, alice.id, { action: "delete", confirmEmail: alice.email, password: PW });
    await fails(userDetail(alice.id), /not found/i);
    const events = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.actorUserId, admin.id));
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["access.grant_manual", "access.revoke", "user.suspend", "admin.promote", "admin.stepup_failed", "user.delete_by_admin"]));
  });
});
