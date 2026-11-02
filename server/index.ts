import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { hash, verify } from "@node-rs/argon2";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { writeWorkbook } from "./workbook.js";
import { z } from "zod";
import { query, transaction, init, dataDir } from "./db.js";
import {
  defaults,
  preferencesSchema,
  rank,
  validOrder,
  addYear,
  safeCell,
} from "./domain.js";
import { putPrivate, getPrivate, deletePrivate } from "./storage.js";
import { extract, mappedRows } from "./imports.js";
import { research, researchLocation, aiProposal } from "./providers.js";
import { advanceJob } from "./jobs.js";
await init();
export const app = express();
app.disable("x-powered-by");
if (process.env.VERCEL) app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== `${req.protocol}://${req.headers.host}`
  )
    return res.status(403).json({ error: "Cross-origin request rejected" });
  next();
});
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const wrap = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);
const auth = wrap(async (req: any, res: any) => {
  const token = req.headers.cookie
    ?.split(";")
    .map((x: string) => x.trim())
    .find((x: string) => x.startsWith("session="))
    ?.slice(8);
  const [user] = token
    ? await query(
        "SELECT * FROM users WHERE session_hash=$1 AND session_expires>now()",
        [digest(token)],
      )
    : [];
  if (!user)
    return res.status(401).json({
      error:
        "Your session expired or was replaced by another login. Please sign in again.",
    });
  req.user = user;
  req.nextAuth();
});
app.get(
  "/api/cron/jobs",
  wrap(async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET;
    if (
      !secret ||
      digest(String(req.headers.authorization || "")) !==
        digest("Bearer " + secret)
    )
      return res
        .status(401)
        .json({ error: "Scheduler authorization required" });
    res.json(await advanceJob());
  }),
);
app.use("/api", (req: any, res, next) => {
  if (
    ["/register", "/login", "/recover", "/reset", "/public"].includes(req.path)
  )
    return next();
  req.nextAuth = next;
  return auth(req, res, next);
});
const premium = (u: any) =>
  u.premium_until && new Date(u.premium_until) > new Date();
function requirePremium(u: any) {
  if (!premium(u))
    throw Object.assign(Error("Premium access required."), { status: 403 });
}
function admin(u: any) {
  if (u.role !== "admin")
    throw Object.assign(Error("Admin access required."), { status: 403 });
}
async function settings() {
  return (await query("SELECT data FROM settings WHERE id='app'"))[0].data;
}
async function project(req: any) {
  const [p] = await query("SELECT * FROM projects WHERE id=$1 AND user_id=$2", [
    req.params.id,
    req.user.id,
  ]);
  if (!p) throw Object.assign(Error("Project not found"), { status: 404 });
  return p;
}
async function save(p: any, data: any, revision = p.revision) {
  return transaction(async (q) => {
    const rows = await q(
      "UPDATE projects SET data=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING *",
      [JSON.stringify(data), p.id, revision],
    );
    if (!rows.length)
      throw Object.assign(
        Error("This project changed in another tab. Reload before saving."),
        { status: 409 },
      );
    await q(
      "INSERT INTO project_revisions(id,project_id,revision,data) VALUES($1,$2,$3,$4)",
      [
        randomUUID(),
        p.id,
        rows[0].revision,
        JSON.stringify({
          preferences: data.preferences,
          order: data.order,
          excluded: data.manualExcluded || [],
        }),
      ],
    );
    return rows[0];
  });
}
function accessible(p: any, u: any) {
  const all = rank(p.data.options || [], p.data.preferences);
  return premium(u)
    ? all
    : all.filter((o) => (p.data.preview || []).includes(o.id));
}
async function audit(actor: string, event: string, subject: string, q = query) {
  await q("INSERT INTO audit(id,actor,event,subject) VALUES($1,$2,$3,$4)", [
    randomUUID(),
    actor,
    event,
    subject,
  ]);
}
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(200),
});
async function session(res: any, user: any) {
  const token = randomBytes(32).toString("hex");
  await query(
    "UPDATE users SET session_hash=$1,session_expires=now()+interval '7 days' WHERE id=$2",
    [digest(token), user.id],
  );
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
    path: "/",
  });
  res.json({ ok: true });
}
app.post(
  "/api/register",
  rateLimit({ windowMs: 3600000, limit: 20 }),
  wrap(async (req: any, res: any) => {
    const c = credentials.parse(req.body);
    const password = await hash(c.password);
    const id = randomUUID();
    await query("INSERT INTO users(id,email,password) VALUES($1,$2,$3)", [
      id,
      c.email,
      password,
    ]);
    await session(res, { id });
  }),
);
app.post(
  "/api/login",
  rateLimit({ windowMs: 900000, limit: 30 }),
  wrap(async (req: any, res: any) => {
    const c = credentials.parse(req.body);
    const [u] = await query("SELECT * FROM users WHERE email=$1", [c.email]);
    if (!u || !(await verify(u.password, c.password)))
      return res.status(401).json({ error: "Incorrect email or password." });
    await session(res, u);
  }),
);
app.post(
  "/api/logout",
  wrap(async (req: any, res: any) => {
    await query("UPDATE users SET session_hash=NULL WHERE id=$1", [
      req.user.id,
    ]);
    res.clearCookie("session");
    res.json({ ok: true });
  }),
);
app.post(
  "/api/recover",
  wrap(async (req: any, res: any) => {
    if (!process.env.EMAIL_ENDPOINT && !process.env.RESEND_API_KEY)
      return res.status(503).json({
        error:
          "Password recovery email is not configured. Contact the administrator.",
      });
    const email = z.email().parse(req.body.email);
    const [u] = await query("SELECT id FROM users WHERE email=$1", [
      email.toLowerCase(),
    ]);
    if (u) {
      const token = randomBytes(32).toString("hex");
      await query(
        "INSERT INTO resets(hash,user_id,expires) VALUES($1,$2,now()+interval '30 minutes')",
        [digest(token), u.id],
      );
      const r = await fetch(
        process.env.EMAIL_ENDPOINT || "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.EMAIL_KEY || process.env.RESEND_API_KEY || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...(process.env.RESEND_API_KEY
              ? { from: process.env.EMAIL_FROM }
              : {}),
            to: email,
            subject: "Reset NextPlace password",
            text: `Reset token (expires in 30 minutes): ${token}`,
          }),
        },
      );
      if (!r.ok) throw Error("Email service failed");
    }
    res.json({
      message: "If your account exists, a reset token has been emailed.",
    });
  }),
);
app.post(
  "/api/reset",
  wrap(async (req: any, res: any) => {
    const password = z.string().min(10).max(200).parse(req.body.password);
    const encoded = await hash(password);
    await transaction(async (q) => {
      const [r] = await q(
        "DELETE FROM resets WHERE hash=$1 AND expires>now() RETURNING user_id",
        [digest(String(req.body.token))],
      );
      if (!r) throw Error("Invalid or expired reset token");
      await q("UPDATE users SET password=$1,session_hash=NULL WHERE id=$2", [
        encoded,
        r.user_id,
      ]);
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/public",
  wrap(async (_req: any, res: any) => {
    const s = await settings();
    res.json({ name: "NextPlace" });
  }),
);
app.get(
  "/api/pricing",
  wrap(async (req: any, res: any) => {
    const projects = await query("SELECT data FROM projects WHERE user_id=$1", [
      req.user.id,
    ]);
    if (!projects.some((p) => p.data.previewFrozen))
      return res
        .status(403)
        .json({
          error:
            "Complete your initial analysis and free preview before viewing payment details.",
        });
    const s = await settings();
    res.json({ price: s.price, bank: s.bank, period: "year" });
  }),
);
app.get(
  "/api/me",
  wrap(async (req: any, res: any) =>
    res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      premium: !!premium(req.user),
      premiumUntil: req.user.premium_until,
      providers: {
        maps: !!process.env.GOOGLE_MAPS_KEY,
        ai: !!process.env.OPENAI_API_KEY,
        ocr: !!(process.env.OCR_ENDPOINT || process.env.OCR_SPACE_KEY),
        email: !!(process.env.EMAIL_ENDPOINT || process.env.RESEND_API_KEY),
        storage: process.env.SUPABASE_URL
          ? "Supabase private bucket"
          : "Local private storage",
      },
    }),
  ),
);
app.get(
  "/api/projects",
  wrap(async (req: any, res: any) =>
    res.json(
      (
        await query(
          "SELECT * FROM projects WHERE user_id=$1 ORDER BY created_at DESC",
          [req.user.id],
        )
      ).map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.created_at,
        status: p.data.status,
        demo: p.data.demo,
        count: p.data.options.length,
      })),
    ),
  ),
);
app.post(
  "/api/projects",
  wrap(async (req: any, res: any) => {
    const s = await settings();
    if (req.user.projects_created >= s.projectLimit)
      throw Error(
        "Lifetime project quota reached. Deleting projects does not reset the quota.",
      );
    const name = z.string().min(1).max(120).parse(req.body.name);
    const id = randomUUID();
    await transaction(async (q) => {
      const quota = await q(
        "UPDATE users SET projects_created=projects_created+1 WHERE id=$1 AND projects_created<$2 RETURNING id",
        [req.user.id, s.projectLimit],
      );
      if (!quota.length) throw Error("Project quota reached");
      await q(
        "INSERT INTO projects(id,user_id,name,data) VALUES($1,$2,$3,$4)",
        [
          id,
          req.user.id,
          name,
          JSON.stringify({
            preferences: defaults,
            options: [],
            preview: [],
            previewFrozen: false,
            order: [],
            status: "draft",
            demo: req.body.demo === true,
            analysisRuns: 0,
          }),
        ],
      );
    });
    res.json({ id });
  }),
);
app.get(
  "/api/projects/:id",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    const { options, ...data } = p.data;
    res.json({
      id: p.id,
      name: p.name,
      revision: p.revision,
      ...data,
      source: options.map(({ evidence, ...o }: any) => o),
      results: accessible(p, req.user),
      total: options.length,
      jobs: await query(
        "SELECT * FROM jobs WHERE project_id=$1 ORDER BY updated_at DESC",
        [p.id],
      ),
    });
  }),
);
app.put(
  "/api/projects/:id/preferences",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    const preferences = preferencesSchema.parse(req.body.preferences);
    await save(p, { ...p.data, preferences }, req.body.revision);
    res.json({ ok: true });
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (process.env.VERCEL ? 4 : 10) * 1024 * 1024, files: 1 },
});
async function storeFile(req: any, projectId: string | null, receipt = false) {
  const f = req.file;
  if (!f) throw Error("Choose a file");
  const ext = path.extname(f.originalname).toLowerCase();
  const accepted = receipt
    ? [".pdf", ".png", ".jpg", ".jpeg"]
    : [".pdf", ".xlsx", ".csv"];
  if (!accepted.includes(ext)) throw Error("Unsupported file type");
  const b = f.buffer;
  const valid =
    ext === ".pdf"
      ? b.subarray(0, 5).toString() === "%PDF-"
      : ext === ".xlsx"
        ? b[0] === 80 && b[1] === 75
        : ext === ".png"
          ? b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : [".jpg", ".jpeg"].includes(ext)
            ? b[0] === 255 && b[1] === 216
            : !b.includes(0);
  if (!valid) throw Error("File contents do not match the selected type");
  const mime = (
    {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".csv": "text/csv",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    } as any
  )[ext];
  const id = randomUUID();
  const dest = await putPrivate(id, b, mime);
  await query(
    "INSERT INTO files(id,user_id,project_id,name,mime,path) VALUES($1,$2,$3,$4,$5,$6)",
    [id, req.user.id, projectId, f.originalname, mime, dest],
  );
  return id;
}
app.post(
  "/api/projects/:id/import",
  upload.single("file"),
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    if (p.data.previewFrozen)
      throw Error("Create a new project for a different source list.");
    const fileId = await storeFile(req, p.id);
    const tables = await extract(req.file.buffer, req.file.originalname);
    await save(p, { ...p.data, import: { fileId, tables }, status: "review" });
    res.json({ tables });
  }),
);
app.post(
  "/api/projects/:id/confirm",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    if (p.data.previewFrozen)
      throw Error("Source already confirmed and analyzed.");
    const table = p.data.import?.tables[req.body.table || 0];
    if (!table) throw Error("Select a source table");
    const options = mappedRows(table, req.body.mapping, req.body.edits);
    if (!options.length || options.some((o: any) => o.invalid))
      throw Error("Every row needs institution and post information.");
    if (options.length > (await settings()).optionLimit)
      throw Error("Option quota exceeded");
    await save(p, {
      ...p.data,
      options,
      mapping: req.body.mapping,
      order: options.map((o: any) => o.id),
      status: "confirmed",
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/projects/:id/analyze",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    if (!p.data.options.length) throw Error("Confirm your import first.");
    if (p.data.analysisRuns >= 2)
      throw Error(
        "Analysis quota reached; adjust weights using existing evidence.",
      );
    if (
      (
        await query(
          "SELECT id FROM jobs WHERE project_id=$1 AND status IN ('queued','running')",
          [p.id],
        )
      ).length
    )
      throw Error("Analysis already running");
    if (p.data.options.length > (await settings()).lookupLimit)
      throw Error("Research quota exceeded");
    await save(p, {
      ...p.data,
      status: "analyzing",
      analysisRuns: p.data.analysisRuns + 1,
    });
    await query("INSERT INTO jobs(id,project_id,status) VALUES($1,$2,$3)", [
      randomUUID(),
      p.id,
      "queued",
    ]);
    res.json({ ok: true });
  }),
);
app.post(
  "/api/projects/:id/advance",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    res.json(await advanceJob(p.id));
  }),
);
app.post(
  "/api/projects/:id/cancel",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    await query(
      "UPDATE jobs SET status='cancelled' WHERE project_id=$1 AND status IN ('queued','running')",
      [p.id],
    );
    await save(p, { ...p.data, status: "cancelled" });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/projects/:id/location",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    const input = z
      .object({
        optionId: z.string(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(req.body);
    const o = p.data.options.find((o: any) => o.id === input.optionId);
    if (!o) throw Error("Unknown option");
    const candidates = o.evidence?.match?.candidates || [];
    if (
      !candidates.some(
        (c: any) =>
          c.location.lat === input.lat && c.location.lng === input.lng,
      )
    )
      throw Error("Select a supplied match candidate");
    o.evidence = await researchLocation(
      { lat: input.lat, lng: input.lng },
      p.data.preferences,
    );
    await save(p, p.data);
    res.json({ ok: true });
  }),
);
app.post(
  "/api/payments",
  upload.single("file"),
  wrap(async (req: any, res: any) => {
    if (!(await settings()).bank)
      throw Error("Bank payment instructions have not been configured.");
    if (
      (
        await query(
          "SELECT id FROM payments WHERE user_id=$1 AND status='pending'",
          [req.user.id],
        )
      ).length
    )
      throw Error("A receipt is already pending review.");
    const fileId = await storeFile(req, null, true);
    await query("INSERT INTO payments(id,user_id,file_id) VALUES($1,$2,$3)", [
      randomUUID(),
      req.user.id,
      fileId,
    ]);
    res.json({ ok: true });
  }),
);
app.get(
  "/api/payments",
  wrap(async (req: any, res: any) =>
    res.json(
      await query(
        "SELECT id,status,notes,created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC",
        [req.user.id],
      ),
    ),
  ),
);
app.get(
  "/api/files/:fileId",
  wrap(async (req: any, res: any) => {
    const [f] = await query("SELECT * FROM files WHERE id=$1", [
      req.params.fileId,
    ]);
    if (!f || (f.user_id !== req.user.id && req.user.role !== "admin"))
      return res.sendStatus(404);
    res.setHeader("Content-Type", f.mime);
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="private-file' + path.extname(f.name) + '"',
    );
    res.send(await getPrivate(f.path));
  }),
);
app.post(
  "/api/projects/:id/compare",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    const ids = z.array(z.string()).max(500).parse(req.body.ids);
    const rows = accessible(p, req.user);
    if (ids.some((id) => !rows.some((o) => o.id === id)))
      return res
        .status(403)
        .json({ error: "One or more options are not accessible." });
    res.json(rows.filter((o) => ids.includes(o.id)));
  }),
);
app.put(
  "/api/projects/:id/order",
  wrap(async (req: any, res: any) => {
    requirePremium(req.user);
    const p = await project(req);
    if (p.data.finalizedId)
      throw Error("Reopen this finalized list before editing");
    const ids = z.array(z.string()).parse(req.body.order);
    if (!validOrder(ids, p.data.options))
      throw Error("Order must include every option exactly once.");
    const excluded = z.array(z.string()).parse(req.body.excluded || []);
    if (
      new Set(excluded).size !== excluded.length ||
      excluded.some((id) => !ids.includes(id))
    )
      throw Error("Invalid exclusions");
    const saved = await save(
      p,
      { ...p.data, order: ids, manualExcluded: excluded },
      req.body.revision,
    );
    res.json({ revision: saved.revision });
  }),
);
app.post(
  "/api/projects/:id/chat",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    const result = await aiProposal(
      z.string().min(1).max(2000).parse(req.body.message),
      accessible(p, req.user),
      p.revision,
    );
    if (result.weights) {
      preferencesSchema.parse({
        ...p.data.preferences,
        weights: result.weights,
      });
      if (!premium(req.user)) delete result.weights;
    }
    if (result.order) {
      if (!validOrder(result.order, accessible(p, req.user)))
        throw Error("AI returned an invalid proposal");
      if (!premium(req.user)) delete result.order;
    }
    res.json(result);
  }),
);
app.post(
  "/api/projects/:id/ai/apply",
  wrap(async (req: any, res: any) => {
    requirePremium(req.user);
    const p = await project(req);
    if (p.data.finalizedId) throw Error("Reopen before applying changes");
    const input = z
      .object({
        revision: z.number().int(),
        order: z.array(z.string()).optional(),
        weights: z
          .object({
            post: z.number(),
            travel: z.number(),
            climate: z.number(),
            facilities: z.number(),
          })
          .optional(),
      })
      .strict()
      .parse(req.body);
    if (input.order && !validOrder(input.order, p.data.options))
      throw Error("Invalid option IDs");
    const preferences = input.weights
      ? preferencesSchema.parse({
          ...p.data.preferences,
          weights: input.weights,
        })
      : p.data.preferences;
    await save(
      p,
      { ...p.data, order: input.order || p.data.order, preferences },
      input.revision,
    );
    res.json({ ok: true });
  }),
);
app.post(
  "/api/projects/:id/finalize",
  wrap(async (req: any, res: any) => {
    requirePremium(req.user);
    const p = await project(req);
    if (p.data.finalizedId) throw Error("Already finalized");
    if (!validOrder(p.data.order, p.data.options))
      throw Error("Invalid final order");
    const id = randomUUID();
    await transaction(async (q) => {
      const rows = await q(
        "UPDATE projects SET data=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING id",
        [
          JSON.stringify({ ...p.data, finalizedId: id }),
          p.id,
          req.body.revision,
        ],
      );
      if (!rows.length) throw Error("Revision changed");
      await q("INSERT INTO finalized(id,project_id,data) VALUES($1,$2,$3)", [
        id,
        p.id,
        JSON.stringify({
          ...p.data,
          results: rank(p.data.options, p.data.preferences),
        }),
      ]);
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/projects/:id/reopen",
  wrap(async (req: any, res: any) => {
    requirePremium(req.user);
    const p = await project(req);
    await save(p, { ...p.data, finalizedId: null }, req.body.revision);
    res.json({ ok: true });
  }),
);
app.get(
  "/api/projects/:id/export",
  wrap(async (req: any, res: any) => {
    requirePremium(req.user);
    const p = await project(req);
    const [f] = await query(
      "SELECT data FROM finalized WHERE id=$1 AND project_id=$2",
      [p.data.finalizedId || "", p.id],
    );
    if (!f) throw Error("Finalize your list before exporting");
    const d = f.data;
    const rows = d.order
      .filter((id: string) => !(d.manualExcluded || []).includes(id))
      .map((id: string, i: number) => {
        const o = d.options.find((o: any) => o.id === id);
        return {
          ...Object.fromEntries(
            Object.entries(o.original).map(([k, v]) => [k, safeCell(v)]),
          ),
          "Preference Rank": i + 1,
        };
      });
    const sheets = [{ name: "Preferences", rows }];
    if (req.query.analysis === "1")
      sheets.push({
        name: "Analysis",
        rows: d.results.map((o: any) => ({
          ID: o.id,
          Institution: safeCell(o.institution),
          Score: o.score,
          Coverage: o.coverage,
          Explanation: o.explanation,
          Sources: JSON.stringify(o.evidence),
        })),
      });
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="transfer-preferences.xlsx"',
    );
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(await writeWorkbook(sheets));
  }),
);
app.delete(
  "/api/projects/:id",
  wrap(async (req: any, res: any) => {
    const p = await project(req);
    const files = await query("SELECT path FROM files WHERE project_id=$1", [
      p.id,
    ]);
    await Promise.all(files.map((f) => deletePrivate(f.path)));
    await query("DELETE FROM projects WHERE id=$1", [p.id]);
    res.json({ ok: true });
  }),
);
app.get(
  "/api/admin",
  wrap(async (req: any, res: any) => {
    admin(req.user);
    res.json({
      settings: await settings(),
      payments: await query(
        "SELECT p.*,u.email,u.premium_until FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC",
      ),
      jobs: await query(
        "SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 100",
      ),
      audit: await query(
        "SELECT * FROM audit ORDER BY created_at DESC LIMIT 100",
      ),
      providers: {
        maps: !!process.env.GOOGLE_MAPS_KEY,
        ai: !!process.env.OPENAI_API_KEY,
        ocr: !!(process.env.OCR_ENDPOINT || process.env.OCR_SPACE_KEY),
        email: !!(process.env.EMAIL_ENDPOINT || process.env.RESEND_API_KEY),
        storage: process.env.SUPABASE_URL
          ? "Supabase private bucket"
          : "Local private storage",
      },
    });
  }),
);
app.put(
  "/api/admin/settings",
  wrap(async (req: any, res: any) => {
    admin(req.user);
    const s = z
      .object({
        price: z.number().positive(),
        bank: z.string().max(2000),
        projectLimit: z.number().int().min(1).max(100),
        optionLimit: z.number().int().min(1).max(2000),
        lookupLimit: z.number().int().min(1).max(5000),
      })
      .parse(req.body);
    await query("UPDATE settings SET data=$1 WHERE id='app'", [
      JSON.stringify(s),
    ]);
    await audit(req.user.id, "settings.updated", "app");
    res.json({ ok: true });
  }),
);
app.post(
  "/api/admin/payments/:paymentId",
  wrap(async (req: any, res: any) => {
    admin(req.user);
    const { status, notes } = z
      .object({
        status: z.enum(["approved", "rejected"]),
        notes: z.string().max(2000),
      })
      .parse(req.body);
    await transaction(async (q) => {
      const [p] = await q("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
        req.params.paymentId,
      ]);
      if (!p) throw Error("Payment not found");
      if (p.status !== "pending") return;
      if (status === "approved") {
        const [u] = await q("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          p.user_id,
        ]);
        const start =
          u.premium_until && new Date(u.premium_until) > new Date()
            ? new Date(u.premium_until)
            : new Date();
        const end = addYear(start);
        await q(
          "INSERT INTO access_grants(payment_id,user_id,starts_at,ends_at) VALUES($1,$2,$3,$4)",
          [p.id, u.id, start.toISOString(), end.toISOString()],
        );
        await q("UPDATE users SET premium_until=$1 WHERE id=$2", [
          end.toISOString(),
          u.id,
        ]);
      }
      await q("UPDATE payments SET status=$1,notes=$2 WHERE id=$3", [
        status,
        notes,
        p.id,
      ]);
      await audit(req.user.id, "payment." + status, p.id, q);
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/admin/jobs/:jobId/retry",
  wrap(async (req: any, res: any) => {
    admin(req.user);
    await query(
      "UPDATE jobs SET status='queued',attempts=0,error=NULL WHERE id=$1 AND status IN ('failed','cancelled')",
      [req.params.jobId],
    );
    await audit(req.user.id, "job.retry", req.params.jobId);
    res.json({ ok: true });
  }),
);
// Persistent Node servers poll the same leased queue. Vercel uses bounded requests.
let working = false;
if (!process.env.VERCEL && process.env.DISABLE_WORKER !== "1") {
  const worker = setInterval(async () => {
    if (working) return;
    working = true;
    try {
      await advanceJob();
    } catch {
      console.error(JSON.stringify({ event: "worker.failure" }));
    } finally {
      working = false;
    }
  }, 350);
  worker.unref();
}
if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else if (!process.env.VERCEL) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
}
app.use((err: any, _req: any, res: any, _next: any) => {
  const status = err.status || (err.code === "23505" ? 409 : 400);
  res.status(status).json({
    error:
      err.code === "23505"
        ? "This email is already registered."
        : err instanceof z.ZodError
          ? err.issues.map((i: any) => i.message).join("; ")
          : err.message || "Request failed",
  });
});
if (process.env.NO_LISTEN !== "1" && !process.env.VERCEL)
  app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
    console.log("NextPlace listening on port " + (process.env.PORT || 3000)),
  );
