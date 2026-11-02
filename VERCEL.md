# Vercel test deployment

This configuration serves React from `dist/` and the Express API from `api/index.ts`. It requires an external PostgreSQL database and private Supabase Storage. Local PGlite and filesystem uploads are explicitly disabled on Vercel. No Vercel or Supabase resources are created by these files.

## 1. Prepare Supabase

Use a separate test project. In Storage, create `transfer-compass-private` with **Public bucket disabled**. Obtain the project URL and server-only service-role key (or its compatible legacy JWT key) from project settings. Do not expose the service-role key through any VITE_ variable.

Obtain a PostgreSQL **transaction pooler** connection string from Connect (usually port 6543), using the database password and the user shown by Supabase. Use the supplied hostname and username, not the project URL. Configure TLS with certificate verification; do not add `rejectUnauthorized:false`. Supabase's server certificate must be trusted by the Node runtime. Use `sslmode=verify-full` with its trusted CA when configuring the connection string. Special characters in database passwords must be URL-encoded.

Migrations run idempotently under a PostgreSQL advisory lock on first API initialization. The connection user must have schema/table creation privileges for this test setup.

## 2. Import in Vercel

Import the GitHub repository and select the prepared deployment branch. Framework preset: **Other**. Root directory: repository root. The checked-in `vercel.json` sets `npm ci`, `npm run build`, and output `dist`. Use Node.js 24.x in Project Settings. The API function has a 60-second maximum duration.

Add these variables for the deployment environment you will test (Preview and/or Production), then deploy/redeploy:

| Variable | Value |
| --- | --- |
| DATABASE_URL | Supabase pooled PostgreSQL connection string |
| SUPABASE_URL | Your Supabase project's HTTPS URL |
| SUPABASE_SERVICE_ROLE_KEY | Server-only service-role key |
| SUPABASE_STORAGE_BUCKET | transfer-compass-private |

Vercel supplies VERCEL and NODE_ENV automatically. Do not set DATA_DIR or use local disk for persistence. Optional provider variables are listed in `.env.example`. No external API key is required for explicitly synthetic projects. Bank instructions remain empty until an admin sets them.

## 3. Test the preview

Open the deployment URL. Register, create a synthetic project, import `fixtures/vacancies.csv`, confirm mapping, start analysis, and keep the analysis screen open. Each progress poll advances one durable queued row. Closing the page pauses request-driven processing; reopening resumes it. The queue uses database leases to prevent duplicate concurrent workers, checkpoints each row, and reclaims abandoned leases after two minutes. Cancellation and three-attempt error recovery are supported. This preview architecture does not promise unattended job execution.

For unattended jobs, configure an external scheduler to request `GET /api/cron/jobs` with `Authorization: Bearer <CRON_SECRET>`. Set the same randomly generated secret in Vercel. Each request processes at most one option; choose a scheduler frequency and quotas appropriate for your project. No scheduler or paid plan is provisioned automatically. Do not expose this secret in browser code or a query string.

Vercel's request-body limit means uploads are limited to **4 MB** here (10 MB on the local persistent server). Scanned PDFs and long synchronous OCR calls can require a dedicated asynchronous worker instead. Geographic calls have bounded timeouts; failed or unavailable evidence remains unknown. Frontend error messages for unconfigured API infrastructure are intentional.

For admin testing, register a separate account, then use Supabase SQL Editor to promote that existing account:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your-registered-admin-email';
```

Use the exact lowercase registered email. Only project administrators with database access may do this. Do not add a public bootstrap endpoint or default password. Configure test-only bank instructions, upload a synthetic receipt, approve it, reload the doctor's page, compare, edit, finalize and export.

## Status and limitations

Local TypeScript, build, API/database, and serverless-style request-driven job tests are runnable in this repository. A local test cannot establish that a real Supabase connection, Vercel rewrites, TLS chain, or remote private bucket works. Verify them on the deployed preview before claiming live readiness. The application still uses per-instance in-memory HTTP rate limits; use platform/distributed limits before accepting public users. Refer to README.md for remaining product and dependency limitations. Do not use real patient or payment data during initial deployment testing.
