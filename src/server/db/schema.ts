/**
 * Database schema (Drizzle ORM, PostgreSQL).
 *
 * The first four tables follow the shape required by better-auth.
 * Everything else is application data. Timestamps are stored as
 * `timestamptz` (UTC instants); user-facing formatting uses Asia/Colombo.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  real,
  primaryKey,
  uniqueIndex,
  index,

} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const now = (name: string) => ts(name).notNull().defaultNow();

/* ----------------------------- Authentication ---------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** "user" | "admin". Never settable through sign-up or profile APIs. */
  role: text("role").notNull().default("user"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

/** Records sessions revoked because the account signed in elsewhere. Only a hash of the token is kept. */
export const sessionRevocation = pgTable("session_revocation", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  reason: text("reason").notNull(),
  revokedAt: now("revoked_at"),
});

/* ------------------------------ Configuration ---------------------------- */

export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: now("updated_at"),
  updatedBy: text("updated_by"),
});

/* -------------------------------- Projects ------------------------------- */

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** draft → uploaded → mapped → analyzing → analyzed */
    status: text("status").notNull().default("draft"),
    isDemo: boolean("is_demo").notNull().default(false),
    /** Frozen free-preview option IDs (max 3) once the first analysis is confirmed. */
    previewOptionIds: jsonb("preview_option_ids").$type<string[] | null>(),
    previewFrozenAt: ts("preview_frozen_at"),
    /** Describes what the preview was selected from (counts, analysis level). */
    previewBasis: jsonb("preview_basis").$type<Record<string, unknown> | null>(),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("project_user_idx").on(t.userId)],
);

export const preference = pgTable("preference", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => project.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: now("updated_at"),
});

export const sourceFile = pgTable("source_file", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  kind: text("kind").notNull(), // xlsx | csv | pdf
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  /** parsed | needs_ocr | failed */
  parseStatus: text("parse_status").notNull(),
  /** Table candidates with raw rows (bounded), warnings, extraction details. */
  parseResult: jsonb("parse_result"),
  createdAt: now("created_at"),
});

export const importMapping = pgTable("import_mapping", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  sourceFileId: text("source_file_id")
    .notNull()
    .references(() => sourceFile.id, { onDelete: "cascade" }),
  tableKey: text("table_key").notNull(),
  headerRowIndex: integer("header_row_index").notNull(),
  originalHeaders: jsonb("original_headers").$type<string[]>().notNull(),
  /** field name → column index */
  mapping: jsonb("mapping").$type<Record<string, number | null>>().notNull(),
  confirmedAt: ts("confirmed_at"),
  createdAt: now("created_at"),
});

export const option = pgTable(
  "option",
  {
    /** Internal unique ID. The source INDEX is never assumed unique. */
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    sourceFileId: text("source_file_id").notNull(),
    /** Order in the imported table (0-based); stable tie-breaker. */
    seq: integer("seq").notNull(),
    /** Human-readable provenance, e.g. "Sheet1 row 14" or "page 3, line 12". */
    sourceRef: text("source_ref").notNull(),
    /** Original cell values aligned with import_mapping.original_headers. */
    original: jsonb("original").$type<(string | number | null)[]>().notNull(),
    /** User corrections of mapped fields. Original values stay untouched. */
    corrections: jsonb("corrections").$type<Record<string, string>>().notNull().default({}),
    originalIndex: text("original_index"),
    district: text("district"),
    institution: text("institution"),
    designation: text("designation"),
    vacancies: text("vacancies"),
    extractionConfidence: real("extraction_confidence").notNull().default(1),
    /** Warnings such as wrapped_row, truncated, possible_duplicate, incomplete. */
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    duplicateGroup: text("duplicate_group"),
    /** consider | not_considered — chosen by the user; never inferred from job title. */
    decision: text("decision").notNull().default("consider"),
    institutionKey: text("institution_key"),
    /** Monthly rent the user found and typed in themselves (LKR). Never fetched or estimated. */
    userRentLkr: integer("user_rent_lkr"),
    createdAt: now("created_at"),
  },
  (t) => [index("option_project_idx").on(t.projectId, t.seq)],
);

/* ------------------------- Institutions & evidence ----------------------- */

/** Shared geocoding result for an institution name + district (reused across users). */
export const institution = pgTable("institution", {
  key: text("key").primaryKey(), // normalized "name|district"
  name: text("name").notNull(),
  district: text("district"),
  /** resolved | ambiguous | not_found | error */
  status: text("status").notNull(),
  candidates: jsonb("candidates").$type<LocationCandidate[]>().notNull().default([]),
  provider: text("provider").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  retrievedAt: now("retrieved_at"),
  expiresAt: ts("expires_at"),
});

export type LocationCandidate = {
  label: string;
  lat: number;
  lng: number;
  placeRef?: string;
  confidence: number;
  sourceUrl?: string;
};

/** The location used for an institution within a specific project (user confirmation lives here). */
export const projectInstitution = pgTable(
  "project_institution",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    institutionKey: text("institution_key").notNull(),
    /** pending | auto | needs_confirmation | confirmed | not_found | rejected */
    status: text("status").notNull().default("pending"),
    chosen: jsonb("chosen").$type<LocationCandidate | null>(),
    updatedAt: now("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.institutionKey] })],
);

export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    /** location (shared across users) | route (user/project-specific) */
    scope: text("scope").notNull(),
    subjectKey: text("subject_key").notNull(),
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    /** climate | facilities | route_drive | route_transit */
    kind: text("kind").notNull(),
    status: text("status").notNull(), // ok | unavailable | error
    value: jsonb("value"),
    units: jsonb("units"),
    provider: text("provider").notNull(),
    sourceRef: text("source_ref"),
    sourceUrl: text("source_url"),
    attribution: text("attribution"),
    queryContext: jsonb("query_context"),
    confidence: real("confidence"),
    isDemo: boolean("is_demo").notNull().default(false),
    retrievedAt: now("retrieved_at"),
    expiresAt: ts("expires_at"),
  },
  (t) => [uniqueIndex("evidence_subject_kind_idx").on(t.subjectKey, t.kind)],
);

/* ------------------------------ Background jobs -------------------------- */

export const analysisRun = pgTable("analysis_run", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  /** queued | running | completed | partial | cancelled | failed */
  status: text("status").notNull(),
  level: text("level").notNull(), // preview | full
  optionCount: integer("option_count").notNull(),
  evaluatedOptionCount: integer("evaluated_option_count").notNull(),
  /** Options whose institutions were researched in this run (preview runs may be limited). */
  evaluatedOptionIds: jsonb("evaluated_option_ids").$type<string[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  totalTasks: integer("total_tasks").notNull().default(0),
  doneTasks: integer("done_tasks").notNull().default(0),
  failedTasks: integer("failed_tasks").notNull().default(0),
  error: text("error"),
  createdAt: now("created_at"),
  finishedAt: ts("finished_at"),
});

export const job = pgTable(
  "job",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    analysisRunId: text("analysis_run_id"),
    payload: jsonb("payload").notNull(),
    /** queued | running | succeeded | failed | cancelled */
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: now("run_after"),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("job_claim_idx").on(t.status, t.runAfter),
    index("job_run_idx").on(t.analysisRunId),
    uniqueIndex("job_dedupe_idx").on(t.dedupeKey),
  ],
);

/* --------------------------------- Scores -------------------------------- */

export const scoreRun = pgTable("score_run", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  preferenceRevision: integer("preference_revision").notNull(),
  weights: jsonb("weights").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: now("created_at"),
});

export const optionScore = pgTable(
  "option_score",
  {
    scoreRunId: text("score_run_id")
      .notNull()
      .references(() => scoreRun.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => option.id, { onDelete: "cascade" }),
    systemRank: integer("system_rank"),
    finalScore: real("final_score"),
    coverage: real("coverage").notNull(),
    /** complete | provisional | low_coverage | unscored | excluded | not_considered | incomplete */
    status: text("status").notNull(),
    breakdown: jsonb("breakdown").notNull(),
    explanation: text("explanation").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scoreRunId, t.optionId] })],
);

/* ------------------------------ Final ordering --------------------------- */

export const finalOrder = pgTable("final_order", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => project.id, { onDelete: "cascade" }),
  /** Increments on every saved change (optimistic concurrency). */
  revision: integer("revision").notNull().default(1),
  items: jsonb("items").$type<string[]>().notNull(),
  excluded: jsonb("excluded").$type<string[]>().notNull().default([]),
  /** editing | finalized */
  status: text("status").notNull().default("editing"),
  finalizedRevisionId: text("finalized_revision_id"),
  updatedAt: now("updated_at"),
});

/** Immutable snapshots created by "Finalize". */
export const finalOrderRevision = pgTable("final_order_revision", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  items: jsonb("items").$type<string[]>().notNull(),
  excluded: jsonb("excluded").$type<string[]>().notNull(),
  scoreRunId: text("score_run_id"),
  createdAt: now("created_at"),
  createdBy: text("created_by").notNull(),
});

/* ------------------------------- AI assistant ---------------------------- */

export const aiMessage = pgTable("ai_message", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  /** live | demo | unavailable */
  mode: text("mode").notNull(),
  proposalId: text("proposal_id"),
  createdAt: now("created_at"),
});

export const aiProposal = pgTable("ai_proposal", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  baseRevision: integer("base_revision").notNull(),
  basePreferenceRevision: integer("base_preference_revision").notNull(),
  action: jsonb("action").notNull(),
  preview: jsonb("preview").notNull(),
  /** pending | applied | discarded | stale */
  status: text("status").notNull().default("pending"),
  createdAt: now("created_at"),
});

/* ------------------------------ Payments/access -------------------------- */

export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    method: text("method").notNull(), // bank_transfer | atm_deposit
    amountLkr: integer("amount_lkr").notNull(),
    reference: text("reference"),
    paidOn: text("paid_on"), // YYYY-MM-DD as stated by the user (Asia/Colombo)
    receiptKey: text("receipt_key").notNull(),
    receiptMime: text("receipt_mime").notNull(),
    receiptName: text("receipt_name").notNull(),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    userNote: text("user_note"),
    adminNote: text("admin_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    createdAt: now("created_at"),
  },
  (t) => [index("payment_status_idx").on(t.status, t.createdAt)],
);

export const accessGrant = pgTable(
  "access_grant",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** One grant per payment: guarantees idempotent approval. */
    paymentId: text("payment_id").unique(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    months: integer("months").notNull(),
    createdBy: text("created_by").notNull(),
    note: text("note"),
    createdAt: now("created_at"),
  },
  (t) => [index("access_grant_user_idx").on(t.userId, t.endsAt)],
);

/* ------------------------------ Audit & limits --------------------------- */

export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    data: jsonb("data"),
    createdAt: now("created_at"),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const usageCounter = pgTable(
  "usage_counter",
  {
    key: text("key").notNull(), // e.g. "ai:<userId>" | "lookups:<userId>" | "rl:login:<ip>"
    window: text("window").notNull(), // e.g. "2026-11-02" or a minute bucket
    count: integer("count").notNull().default(0),
    updatedAt: now("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.key, t.window] })],
);

/** Development / fallback outbox when no email provider is configured. */
export const emailOutbox = pgTable("email_outbox", {
  id: text("id").primaryKey(),
  to: text("to_address").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  createdAt: now("created_at"),
});

