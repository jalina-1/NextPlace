# Transfer Compass

A React / TypeScript application for Sri Lankan doctors to organize transfer preferences. Includes an Express API, PostgreSQL persistence, private files, a durable single-worker research queue, deterministic scoring, manual payment review, and finalized XLSX exports.

## Run locally

Requires Node 22+ (validated with Node 24).

```sh
npm ci
npm run dev
# Open port 3000 locally.
```

The default database is **PGlite**, PostgreSQL running locally with durable files in `.data/postgres`. No API keys or paid services are needed. The local database supports one application process. For a conventional PostgreSQL server, set `DATABASE_URL` before startup. Migrations in `migrations/001.sql` run idempotently at boot. Keep `.data` on persistent private storage and back it up securely. Never expose it as a static directory.

Environment variables are read from the process. `.env.example` lists the configuration; load your chosen `.env` through your process manager or `node --env-file=.env --import tsx server/index.ts`. Never commit credentials.

```sh
npm run typecheck
npm test
npm run build
npm start
```

Production cookies require HTTPS. For Vercel preview deployments, follow [VERCEL.md](VERCEL.md). Vercel uses the external PostgreSQL database, private Supabase storage, and bounded request-driven job execution. The persistent Node server remains supported for local operation. Nothing has been deployed publicly by these source changes.

## First workflow

1. Register with an email and a password of at least 10 characters.
2. Create a project with **synthetic demo research** checked.
3. Set preferred posts to `Medical Officer, Paediatrics`, and save your weights.
4. Upload `fixtures/vacancies.csv`, inspect suggested mappings, correct rows, and confirm.
5. Start analysis. The queue checkpoints each row; after completion the free preview freezes three option IDs.
6. Bootstrap a separate registered administrator (see below), configure bank instructions, submit a receipt, and approve it in the admin dashboard. Do not enter fictional banking details in a real deployment.
7. Refresh the doctor's session data by reloading the page. Compare results, edit the final order, finalize, and download Excel.

Synthetic provider output is deterministic and visibly labeled. It is not a factual statement about any institution. Real projects without provider keys retain unknown geographic evidence; post preference can still be scored from user input. No transfer, eligibility, official allocation, school admission, or accommodation guarantee is made.

## Safe admin bootstrap

Register the intended account first. Stop the local application before using this CLI against PGlite (one database process at a time):

```sh
npm run admin -- admin@example.com
npm run dev
```

This privileged filesystem/database operation promotes only an existing account. There is no public role assignment API, seeded password, or automatic premium grant. Use a separate account for administrative review. All payment decisions and settings edits are audited.

## Provider integrations

- **Google Maps**: `GOOGLE_MAPS_KEY` enables geocoding, Distance Matrix, and nearby-school Places queries. Enable and restrict the corresponding services in Google Cloud. Ambiguous geocodes require explicit confirmation. Mixed transport remains unknown. Routes are user-specific, estimated, and include source context. Google Maps attribution and terms apply. Review storage permissions before retaining provider data in a production deployment.
- **Open-Meteo**: after a real location is resolved, the archive API supplies last calendar year's mean daily temperature. Failure leaves climate unknown. This is historical climate evidence, not a forecast.
- **OpenAI**: `OPENAI_API_KEY`, optional `OPENAI_MODEL`, enable structured explanation/order proposals. Only server-authorized results are sent. The server validates permutations; applying uses the premium, revision-checked order endpoint. No key produces an explicit unavailable state.
- **OCR**: `OCR_SPACE_KEY` enables the OCR.space PDF integration. Alternatively configure an HTTPS `OCR_ENDPOINT` implementing `POST application/pdf` → plain extracted text with Bearer `OCR_KEY`. The same reviewed text-table parser handles output. This is an adapter contract for an OCR gateway, not a claim that a specific cloud OCR service was tested.
- **Email**: `RESEND_API_KEY` and a verified `EMAIL_FROM` enable Resend. Alternatively configure an HTTPS `EMAIL_ENDPOINT` implementing JSON `{to,subject,text}` with Bearer `EMAIL_KEY`. Recovery uses single-use tokens expiring after 30 minutes, invalidates sessions, and never logs tokens. No gateway means a clear unavailable state.
- **Storage**: local private files are implemented and authorized per request. Supabase-hosted PostgreSQL can be selected using `DATABASE_URL`. Set `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` to use the Supabase private object-storage adapter. Create that bucket as private in Supabase first; never expose the service-role key. Direct Supabase Auth integration is not used.

Live providers have not been tested with credentials. Nearby school proximity uses Google Places when configured; other facilities remain unknown. Accommodation, mandatory requirements, preferred locations, second reference point, travel frequency, and distance threshold are saved planning notes; only the four documented criteria contribute to scores. No unsupported facts are inferred.

Network destinations needed by configured providers include `maps.googleapis.com`, `archive-api.open-meteo.com`, `api.openai.com`, and your OCR/email gateway hosts. Use the environment's network settings for access; preserve TLS verification.

## Scoring and ranking

Enabled weights must sum to 100. A zero weight disables a criterion. Normalize is explicit.

- Post: exact case-insensitive ordered preference match, `100 - index*100/numberOfPreferences`; an unmatched post is 0; an empty preference list is unknown.
- Travel: `max(0,100 - 50*estimatedMinutes/preferredMinutes)`. Distance is displayed independently and never counted twice.
- Climate: `max(0,100 - 10*abs(annualMean-target))`, targets 18/24/29 °C for cool/temperate/warm. `any` is unknown/not evaluated.
- Schools: `max(0,100 - 20*nearestSchoolKm)` when available.

Provisional total is `sum(knownScore*weight)/sum(knownWeight)`. Coverage is the sum of known weights; no known weight means Unscored. The UI exposes coverage and provisional status alongside every score. Unknown values sort last. Ties use coverage then internal option ID. Hard exclusions are retained at the end of system ranking. Users must explicitly exclude rows from export in the editor. Changing weights does not trigger external calls. A low-coverage score is not a claim of superiority.

## Access, payments, privacy, and reliability

Sessions use random 256-bit HttpOnly SameSite cookies; only a SHA-256 digest is stored. Passwords use the maintained `@node-rs/argon2` implementation. New logins replace the prior database session; protected requests check it every time. Roles, ownership, preview IDs, premium expiry, comparisons, chat context, and export are server-enforced.

Approvals lock payment and user rows in a transaction. A payment can grant access only once. Renewal starts at the later of now and existing expiry. Add one calendar month in **Asia/Colombo**, clamping the day at the end of shorter months, preserving local time. Timestamps are stored as PostgreSQL timestamptz. Expiry never deletes orders.

Source values and source-row provenance remain attached to unique internal IDs. Duplicate INDEX values are allowed; VACANCIES is not expanded. CSV/XLSX data are preserved, not workbook appearance, formulas, macros, or formatting. PDF extraction is heuristic and requires manual review. Files are limited to 10 MB; PDFs to 100 pages; worksheets to 2,000 rows. Type signatures/extensions are validated. Spreadsheet exports escape formula-like untrusted text.

The queue has concurrency one, per-row checkpoints, cancellation, partial storage, three automatic attempts, admin retries, two analysis starts per project, and configurable project/row lookup limits. The durable queue uses database leases across instances. HTTP rate limits remain per-instance; distributed rate limits are not yet implemented. Current lookup limits count option research attempts, not exact provider billable units. Provider-level billing caps should be configured before live deployment. Synthetic institution facts are shared across projects without user route context. Live cross-project geographic caching is not enabled because provider storage terms need configuration.

Manual saves use optimistic project revisions. Finalization creates an immutable snapshot. Reopening creates a new editable revision without altering prior snapshots. Project deletion removes its database rows and private source files. Payment receipts and audit records remain for administrative review; no timed retention or self-service account erasure job is currently implemented. Document and operate an appropriate retention policy before accepting real users.

## Verification and limits

`npm test` exercises weights, missing evidence, import variants, wrapped/repeated PDF headers, IDs, single-session replacement, ownership, preview freezing, chat/compare/export paywalls, receipt isolation, payment idempotency, renewal/expiry, revision conflicts, manual permutations, and a downloaded finalized Excel workbook in a real HTTP/database workflow.

The UI includes landing/pricing, auth/recovery, projects, preferences, import review, progress, results, comparison, payments, editing, export, privacy, and administration. CSS adapts to mobile. The browser registration/import/preview flow passed at 1440px desktop and 390px mobile widths with no JavaScript errors or horizontal page overflow. Keyboard and drag/drop final editing still warrant broader accessibility testing before public release. English UI copy is cataloged in `src/i18n.ts` and `src/messages.en.ts`; dynamic messages and some control labels still need extraction before a complete translated release.

Dependency audit: the high-severity spreadsheet and PDF parser advisories were resolved by replacing SheetJS with ExcelJS and updating PDF.js. The current dependency tree still reports moderate transitive advisories in ExcelJS directory-globbing/UUID dependencies. No forced incompatible downgrade was applied; resolve these before production release.

## Windows quick start

Install Node.js 24 LTS. Extract the complete project ZIP first, then open its folder in File Explorer. Type `cmd` into the address bar and press Enter; this opens a terminal in the correct folder (the one containing `package.json`). Do not run the project commands from `C:\Windows\System32`.

```bat
npm ci
npm run dev
```

Open `http://localhost:3000` on that same computer. Keep the terminal open. In a second terminal in the same project folder, run `npm run typecheck`, `npm run build`, and `npm test`. The browser smoke test additionally needs `npx playwright install chromium` on Windows before `node tests/browser.mjs`. Windows compatibility adjustments were made for temporary paths and startup scripts; actual Windows execution has not been tested in this Linux environment.
