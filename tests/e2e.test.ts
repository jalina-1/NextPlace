import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
process.env.DATA_DIR = await fs.mkdtemp(path.join(tmpdir(), "compass-test-"));
process.env.NO_LISTEN = "1";
process.env.DISABLE_WORKER = "1";
process.env.NODE_ENV = "production";
const { app } = await import("../server/index.ts");
const { query } = await import("../server/db.ts");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.on("listening", r));
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}/api`;
let cookie = "",
  adminCookie = "";
async function request(
  path: string,
  method = "GET",
  data?: any,
  session = cookie,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(data instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      Cookie: session,
    },
    body:
      data instanceof FormData
        ? data
        : data === undefined
          ? undefined
          : JSON.stringify(data),
  });
  const body = await r.json();
  return { r, body };
}
async function register(email: string) {
  const { r } = await request("/register", "POST", {
    email,
    password: "A secure test password 123!",
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
test("full user-to-admin-to-finalized Excel workflow and access boundaries", async () => {
  try {
    cookie = await register("doctor@example.test");
    assert.equal((await request("/pricing")).r.status, 403);
    assert.equal((await request("/public")).body.price, undefined);
    const old = cookie;
    const login = await request("/login", "POST", {
      email: "doctor@example.test",
      password: "A secure test password 123!",
    });
    cookie = login.r.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await request("/me", "GET", undefined, old)).r.status, 401);
    const made = await request("/projects", "POST", {
      name: "Annual transfer demo",
      demo: true,
    });
    assert.equal(made.r.status, 200);
    const id = made.body.id;
    let p = (await request("/projects/" + id)).body;
    assert.equal(
      (
        await request(`/projects/${id}/preferences`, "PUT", {
          preferences: {
            ...p.preferences,
            posts: ["Medical Officer", "Paediatrics"],
          },
          revision: p.revision,
        })
      ).r.status,
      200,
    );
    const f = new FormData();
    f.set(
      "file",
      new Blob([await fs.readFile("fixtures/vacancies.csv")]),
      "vacancies.csv",
    );
    assert.equal(
      (await request(`/projects/${id}/import`, "POST", f)).r.status,
      200,
    );
    assert.equal(
      (
        await request(`/projects/${id}/confirm`, "POST", {
          table: 0,
          mapping: {
            index: "INDEX",
            district: "REGION",
            institution: "HOSPITAL",
            post: "POSITION",
            vacancies: "VACANCIES",
          },
        })
      ).r.status,
      200,
    );
    assert.equal(
      (await request(`/projects/${id}/analyze`, "POST")).r.status,
      200,
    );
    for (let i = 0; i < 40; i++) {
      await request(`/projects/${id}/advance`, "POST");
      p = (await request("/projects/" + id)).body;
      if (p.status === "complete") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(p.status, "complete");
    assert.equal(p.results.length, 3);
    assert.equal((await request("/pricing")).body.price, 5000);
    assert.equal(p.total, 6);
    const preview = p.results.map((r: any) => r.id).sort();
    const hidden = p.source.find((r: any) => !preview.includes(r.id)).id;
    assert.equal(
      (await request(`/projects/${id}/compare`, "POST", { ids: [hidden] })).r
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(base + `/projects/${id}/export`, {
          headers: { Cookie: cookie },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(`/projects/${id}/order`, "PUT", {
          order: p.order,
          revision: p.revision,
        })
      ).r.status,
      403,
    );
    const chat = await request(`/projects/${id}/chat`, "POST", {
      message: "Explain results",
    });
    assert.equal(chat.body.available, false);
    assert.equal(chat.body.order, undefined);
    await request(`/projects/${id}/preferences`, "PUT", {
      preferences: {
        ...p.preferences,
        weights: { post: 0, travel: 100, climate: 0, facilities: 0 },
      },
      revision: p.revision,
    });
    p = (await request("/projects/" + id)).body;
    assert.deepEqual(p.results.map((r: any) => r.id).sort(), preview);
    const other = await register("other@example.test");
    assert.equal(
      (await request(`/projects/${id}/advance`, "POST", undefined, other)).r
        .status,
      404,
    );
    assert.equal((await request("/cron/jobs")).r.status, 401);
    assert.equal(
      (await request("/projects/" + id, "GET", undefined, other)).r.status,
      404,
    );
    assert.equal(
      (await request("/admin", "GET", undefined, other)).r.status,
      403,
    );
    adminCookie = await register("admin@example.test");
    await query(
      "UPDATE users SET role='admin' WHERE email='admin@example.test'",
    );
    await request(
      "/admin/settings",
      "PUT",
      {
        price: 5000,
        bank: "TEST ONLY — do not pay. Demo bank instructions.",
        projectLimit: 3,
        optionLimit: 500,
        lookupLimit: 1000,
      },
      adminCookie,
    );
    const receipt = new FormData();
    receipt.set(
      "file",
      new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])]),
      "receipt.png",
    );
    assert.equal((await request("/payments", "POST", receipt)).r.status, 200);
    const payment = (await request("/payments")).body[0];
    assert.equal((await request("/me")).body.premium, false);
    const admin = (await request("/admin", "GET", undefined, adminCookie)).body;
    const fileId = admin.payments[0].file_id;
    assert.equal(
      (await fetch(base + "/files/" + fileId, { headers: { Cookie: other } }))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          "/admin/payments/" + payment.id,
          "POST",
          { status: "approved", notes: "Verified synthetic receipt" },
          adminCookie,
        )
      ).r.status,
      200,
    );
    const expiry = (await request("/me")).body.premiumUntil;
    await request(
      "/admin/payments/" + payment.id,
      "POST",
      { status: "approved", notes: "Repeated click" },
      adminCookie,
    );
    assert.equal((await request("/me")).body.premiumUntil, expiry);
    assert.equal((await query("SELECT * FROM access_grants")).length, 1);
    p = (await request("/projects/" + id)).body;
    assert.equal(p.results.length, 6);
    assert.equal(
      (
        await request(`/projects/${id}/compare`, "POST", {
          ids: p.results.map((o: any) => o.id),
        })
      ).body.length,
      6,
    );
    const order = [...p.order].reverse();
    assert.equal(
      (
        await request(`/projects/${id}/order`, "PUT", {
          order,
          revision: p.revision,
          excluded: [],
        })
      ).r.status,
      200,
    );
    assert.equal(
      (
        await request(`/projects/${id}/order`, "PUT", {
          order,
          revision: p.revision,
          excluded: [],
        })
      ).r.status,
      409,
    );
    p = (await request("/projects/" + id)).body;
    assert.equal(
      (
        await request(`/projects/${id}/finalize`, "POST", {
          revision: p.revision,
        })
      ).r.status,
      200,
    );
    const response = await fetch(base + `/projects/${id}/export?analysis=1`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
    const sheet = wb.getWorksheet("Preferences")!;
    assert.equal(sheet.rowCount, 7);
    assert.equal(sheet.getRow(2).getCell(1).value, "006");
    assert.equal(sheet.getRow(2).getCell(6).value, 1);
    assert.equal(wb.worksheets.length, 2);
    const receipt2 = new FormData();
    receipt2.set(
      "file",
      new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])]),
      "renewal.png",
    );
    await request("/payments", "POST", receipt2);
    const renewal = (await request("/payments")).body.find(
      (x: any) => x.status === "pending",
    );
    await request(
      "/admin/payments/" + renewal.id,
      "POST",
      { status: "approved", notes: "renewal" },
      adminCookie,
    );
    assert.ok(
      new Date((await request("/me")).body.premiumUntil) > new Date(expiry),
    );
    await query(
      "UPDATE users SET premium_until=now()-interval '1 day' WHERE email='doctor@example.test'",
    );
    assert.equal(
      (
        await fetch(base + `/projects/${id}/export`, {
          headers: { Cookie: cookie },
        })
      ).status,
      403,
    );
    p = (await request("/projects/" + id)).body;
    assert.equal(p.results.length, 3);
    assert.deepEqual(p.order, order);
  } finally {
    server.close();
  }
});
