# NextPlace

A full-stack web app that helps doctors in Sri Lanka organize and rank transfer-vacancy options. Doctors set preferences, import the vacancy list they received (Excel, CSV or PDF), research institutions with external data providers, and rank options with explainable weighted scores. They see three options for free, unlock full access by manual bank transfer or ATM deposit, reorder their list with help from an assistant, and download the final list as Excel.

> NextPlace does not submit transfer applications, determine eligibility, predict official allocations, or guarantee that a transfer will be awarded.

## Stack

| Layer | Choice |
| --- | --- |
| Web app | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Auth | [better-auth](https://www.better-auth.com) — email + password (scrypt hashing), database sessions, password reset |
| Database | PostgreSQL (Supabase in production), Drizzle ORM, SQL migrations in `drizzle/` |
| Files | Private storage adapter: local filesystem (dev) or a **private** Supabase Storage bucket |
| Background jobs | A durable queue in a PostgreSQL table (`job`) using `FOR UPDATE SKIP LOCKED`, with retries, backoff, stale-lock recovery and cancellation |
| Excel | ExcelJS (values only; macros/formulas are never executed) |
| PDF | unpdf/pdf.js text layer → table reconstruction; optional OCR adapters |
| AI | Anthropic Messages API (structured output) or a labeled rule-based demo assistant |

## Quick start (local, no paid credentials)

Requirements: Node 20+ and PostgreSQL 14+.

```bash
npm install
```

```bash
cp .env.example .env.local   # defaults use demo providers and local storage
```

```bash
createdb nextplace && npm run db:migrate
```

```bash
npm run dev          # http://localhost:3000
```

```bash
npm run worker       # optional: a long-running job worker (see "Background jobs")
```

Then:

1. Register at `/register`.
2. Make that account an admin (this needs direct database access, so it can't be done from the web app):

   ```bash
   npm run admin:promote -- you@example.com
   ```

3. In **Admin → Settings**, enter the bank details (payments stay disabled until you do). The price defaults to LKR 5,000 for **12 calendar months**.
4. Register a second (doctor) account, then **Dashboard → Try with synthetic demo list**.

Everything works with the **demo providers**. Demo locations, routes, climate and facility values are synthetic, and the UI and Excel export label them "DEMO data".

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run db:migrate` | Apply SQL migrations (idempotent) |
| `npm run db:generate` | Generate a new migration after changing `src/server/db/schema.ts` |
| `npm run worker` | Long-running worker that processes queued research jobs |
| `npm run admin:promote -- <email> [--demote]` | Safe admin bootstrap; needs `DATABASE_URL` |
| `npm test` | Unit and integration tests (needs PostgreSQL; uses `nextplace_test`) |
| `npm run test:e2e` | Browser end-to-end scenario against a production build (`nextplace_e2e`) |
| `npm run typecheck` | TypeScript check |

## Product rules implemented

**Authentication and sessions.** Each account has one active session. A new login deletes the previous sessions server-side and records a hash of each revoked token, so the old browser is told that the account "signed in on another device". Tabs that share one browser session keep working. Every API request checks the session against the database; the session cookie cache is disabled. The `role` field cannot be set at sign-up or through profile updates. Login, sign-up and reset requests are rate-limited.

**Preferences.** An approximate home town (district centre) or a rounded map pin is enough. The app collects:

- an ordered list of preferred posts
- preferred and excluded institutions and districts
- travel mode and how often you travel
- visible travel thresholds
- an optional second reference location and its share of the travel score
- climate preferences
- how important nearby facilities are, and the search radius
- accommodation notes (recorded, not scored, because no reliable data source exists)
- mandatory requirements

Hard exclusions are kept and shown in an "Excluded" view; they are never deleted.

**Scoring** (`src/lib/scoring.ts`). The scores are deterministic, and no LLM is ever involved.

- *Post*: the k-th preferred post scores `max(floor, firstChoice − stepDown·(k−1))` (defaults 100, 15 and 40). Posts that match none of your preferences score `unmatched` (default 0).
- *Travel*: the estimated travel time for your mode scores 100 at or below the ideal and falls linearly to 0 at the maximum. If the time is unknown, road distance is used instead. Straight-line distance is never scored. Only one metric is used per leg, so distance and time are never counted twice. A second location contributes its configured share.
- *Climate*: annual mean temperature and annual rainfall, scored in linear bands that match your preference.
- *Facilities*: each category's count within the radius is divided by its target (schools 3, shops 5, pharmacies 2, banks 2), capped at 100, and weighted by your importance setting (0–3).
- *Preferred location*: 100 for a preferred institution, 70 for a preferred district, otherwise 0.
- `final = Σ score·weight / 100`. With missing data, `provisional = Σ score·w·k / Σ w·k`, where k is the share of a criterion that is known, and `coverage = Σ w·k`. The status is one of complete, provisional, low-evidence (below your "minimum confident coverage"; ranked after better-evidenced options) or Unscored (coverage 0).
- Tie-break order: status tier → score → coverage → post score → institution name → import order.
- Changing weights recalculates scores from stored evidence and never repeats external lookups. Each recalculation is saved as a `score_run`.

**Imports.** XLSX lets you choose the sheet. All formats get header-row detection, suggested mappings from synonyms (you can edit them), a row preview, and validation of required fields (institution and post). For PDFs, the column positions are rebuilt from the text layer. Header rows that repeat on later pages are removed, running headers and footers are removed, and wrapped lines are joined to the row above, flagged, and given lower confidence. Possibly truncated text and possible duplicates are also flagged; duplicates are never merged. Each row gets an internal UUID, keeps its original cells and provenance (for example "Sheet1 row 12" or "page 2, line y=…"), and can be manually corrected without changing the original values. INDEX is never assumed to be unique. A vacancies count of 3 is stored as a value, not turned into three rows. Scanned PDFs are detected; if OCR isn't configured, the app asks for an Excel or CSV version instead.

**Research jobs** (`src/server/services/analysis.ts`). The pipeline runs `geocode` per institution, then `climate` and `facilities` per location (shared across users and cached by each provider's terms), then `route` per home→institution pair (specific to the user and project). Ambiguous matches must be confirmed by the user. Concurrency is bounded and failures retry with exponential backoff. Runs can be cancelled and still give partial results. A daily per-user quota limits external lookups. Each evidence row stores the provider, source URL, retrieval time, units, query context, confidence, status, expiry and attribution.

**Free preview vs premium.** When the first analysis finishes, three option IDs are frozen for the project. They are chosen only from options that analysis actually researched, and the UI says whether every eligible option was researched. Free users get only these rows from every API: results, compare, assistant context and export. Sorting, filtering or re-weighting can't reveal more. Hidden rows are never sent to the browser. Free-project creation is capped per account (default 2), and deleting a project doesn't reset the count.

**Payments.** Bank transfer or ATM deposit, with an image or PDF receipt (checked by magic bytes, stored privately). Statuses are pending, approved and rejected. Uploading a receipt never grants access. Approval runs in one transaction: a row lock on the payment, a per-user advisory lock, and a `UNIQUE(payment_id)` on grants. Repeated or concurrent clicks therefore create exactly one grant. Access starts at approval time and lasts **12 calendar months in Asia/Colombo**; the length is configurable. A month end that doesn't exist is clamped (31 Jan + 1 month → 28/29 Feb, same local time). Renewing while access is active extends from the current expiry. When access expires, data is kept. The price appears only on the payment step, after the user has seen their free preview; the landing page does not show it.

**Final list.** The editor supports drag and drop (pointer and keyboard), up/down buttons, "move to position N", swap, search, undo/redo (Ctrl/Cmd+Z), autosave with a save-status indicator, and recovery of unsaved drafts. It uses optimistic concurrency: a stale revision gets HTTP 409 and the user is asked to reload. On every save the server checks that included plus excluded entries are exactly all options: none lost, none duplicated. Excluded entries are tracked separately. Resetting to the system ranking needs explicit confirmation. Finalizing creates an immutable `final_order_revision`; reopening starts a new editing revision.

**Assistant.** It returns a reply and at most one structured action (prioritize, move, exclude/include, or set weights). The server turns the action into a deterministic preview. The user must press Apply, and the server checks ownership, premium access, the current revisions and the option IDs again. The assistant's context contains only options the user can access. Uploaded and retrieved content is passed to it as quoted data, never as instructions. Without `ANTHROPIC_API_KEY`, a rule-based demo assistant is used, labeled "Demo assistant — rule-based, not AI".

**Export.** Exports are made only from a finalized revision. The original column names and values are kept in the finalized order, with a new **Preference Rank** first column (INDEX is untouched). There is an optional analysis sheet with scores, coverage, explanations and sources, plus "Left out" and "About this export" sheets. Text that could act as a formula is prefixed with an apostrophe. Workbook formatting, formulas and macros are explicitly not reproduced.

**Admin** (`/admin`). Pending payments with a private receipt viewer and notes, approve and reject, access periods, settings (price, access months, bank instructions, quotas, worker limits), failed jobs with retry and "run worker now", database and storage health, provider configuration status (secrets are never shown), the audit history, and the dev email outbox.

## Data model

`user`, `session`, `account`, `verification` (better-auth), `session_revocation`, `app_setting`, `project`, `preference`, `source_file`, `import_mapping`, `option`, `institution` (shared geocoding), `project_institution` (per-project confirmation), `evidence`, `analysis_run`, `job`, `score_run`, `option_score`, `final_order`, `final_order_revision`, `ai_message`, `ai_proposal`, `payment`, `access_grant`, `audit_event`, `usage_counter` (quotas and rate limits), `email_outbox`.

## Background jobs

Jobs live in PostgreSQL, so they survive restarts and redeploys. Any number of workers can run at once. They are processed by:

- **Request-triggered ticks:** while the analysis page polls, the server runs a bounded worker for that project after responding (`after()` in `src/app/api/projects/[id]/analysis/route.ts`). This makes progress on serverless hosts without any extra infrastructure.
- **`/api/cron/worker`:** protected by `CRON_SECRET`. `vercel.json` schedules it once a day, which is the Hobby-plan limit; use a more frequent schedule on Pro or call it from any external scheduler.
- **`npm run worker`:** a long-running process for a VM or container host.

## Deploying to Vercel + Supabase

1. Connect the Supabase integration, or set `DATABASE_URL`. The app reads `DATABASE_URL`, then `POSTGRES_URL`, then `POSTGRES_PRISMA_URL`; migrations prefer `POSTGRES_URL_NON_POOLING`.
2. Set `BETTER_AUTH_SECRET` (random, 32+ characters) and `APP_URL` (your production URL).
3. For private files, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), plus an optional `SUPABASE_STORAGE_BUCKET`. The bucket is created as **private** if it is missing, and the app refuses to use a public bucket.
4. Set `CRON_SECRET`.
5. The build command `npm run vercel-build` applies migrations, then builds.
6. Bootstrap an admin from your machine:

   ```bash
   DATABASE_URL=<supabase non-pooling url> npm run admin:promote -- you@example.com
   ```

7. Check **Admin → Overview & providers**. It tests the database connection and runs an upload/download/delete round-trip against private storage.

## Real integrations: what works immediately and what needs credentials

| Capability | Without credentials | With credentials | Tested live? |
| --- | --- | --- | --- |
| Accounts, imports, scoring, payments, admin, export | ✅ works | — | ✅ (local PostgreSQL) |
| Geocoding, routes, facilities | Demo synthetic data (labeled) | `MAPS_PROVIDER=google` + `GOOGLE_MAPS_API_KEY` (Places API (New), Routes API), or `osm` (Nominatim; no routing) | ❌ fixtures only |
| Facilities via OpenStreetMap | — | `FACILITIES_PROVIDER=overpass` + `OSM_CONTACT_EMAIL` | ❌ |
| Climate | Demo synthetic data (labeled) | `CLIMATE_PROVIDER=open-meteo` (free for non-commercial use; check the terms) | ❌ |
| AI assistant | Rule-based demo (labeled) | `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | ❌ |
| OCR for scanned PDFs | Shows "upload Excel/CSV instead" | `OCR_PROVIDER=google-vision` or `ocr-space` + key | ❌ |
| Password-reset email | Stored in the outbox (Admin → Audit) | `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` | ❌ |
| Private storage | Local `.data/storage` | Supabase Storage | See the deployment notes |

Provider pricing and quotas are not hard-coded. Set limits in **Admin → Settings → Quotas** and in each provider's console. Google Maps Platform terms limit caching of coordinates, so Google results expire after 30 days.

## Security notes

- Secrets are read only in server modules (`src/server/**`). A production build was scanned to confirm no secret names appear in the client bundles.
- Uploads are limited to 15 MB for lists and 8 MB for receipts. File types are checked by magic bytes. `.xlsm` and `.xls` are rejected, and macros, formulas and embedded scripts are never executed. Files are served only by authorized routes with `Content-Disposition`, `nosniff` and a sandboxing CSP.
- Ownership is enforced on every project query; other users' projects return 404. Ordinary users can't reach admin routes or other users' receipts.
- Mutating requests from another origin are rejected. Login and API requests are rate-limited.
- Logs are structured JSON. Keys that look like passwords, tokens, emails or coordinates are redacted.
- Retention: deleting a project removes its file and all derived data. Deleting an account removes everything, including receipts. See `/privacy`.

## Internationalization

Interface strings live in `src/lib/i18n/en.ts`, with `si` and `ta` dictionaries that fall back to English. Sentences are kept whole so translators can reorder words.

## Tests

- `tests/scoring.test.ts`: weight validation and normalization, every criterion rule, complete and missing-data formulas, low coverage, Unscored, deterministic tie-breaks, mandatory rules, and calendar-month and timezone handling.
- `tests/imports.test.ts`: alternate headers, sheet selection, title rows, formula cells, original values and duplicate INDEX kept, same institution with different posts, PDF repeated headers, footers and wrapped rows, scanned-PDF detection, and file-type sniffing.
- `tests/integration.test.ts` (real PostgreSQL): role injection at sign-up, single-session revocation, full import→analysis→preview, no extra rows across sorts and weights, premium blocks on compare, final, export and assistant, cross-user isolation, the free-project quota, private receipts, concurrent idempotent approval, renewal and expiry, rejection, partition checks on reorder, stale revisions, assistant proposal apply and staleness, finalize, export order, and XLSX column and value preservation with formula-injection protection.
- `e2e/run-e2e.ts`: the full browser scenario, with screenshots at desktop and mobile widths.
