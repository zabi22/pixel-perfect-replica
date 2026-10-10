# Deploying DeployProof

DeployProof is one TanStack Start app plus **external services**:

| Part | Where it runs |
|---|---|
| Web app + server functions + `/api/public/worker/tick` | Your host: Cloudflare Workers **or** Vercel (Node) |
| Auth, Postgres, private screenshot storage | Supabase (any project; Lovable Cloud is a hosted Supabase) |
| Real Chromium | **Browserless** (external, required; paid tiers may be needed for volume/session length) |
| Plan drafting / failure analysis (optional) | Any OpenAI-compatible API |

The app never launches a browser itself.

## Build targets (verified with `vite build`)

- **Cloudflare** (default): `npx vite build` → nitro preset `cloudflare-module` in `dist/`; then `npx wrangler deploy` from the repo root using the committed `wrangler.jsonc` (uploads `dist/server` unbundled + `dist/client` as static assets, `nodejs_compat`). Verified: dry-run deploy and `wrangler dev` served `/` and `/auth` with 200.
- **Vercel**: `NITRO_PRESET=vercel npx vite build` (or let Vercel auto-detect). Output `.vercel/output`, Node 22 function. Inside the Lovable sandbox `NITRO_PRESET` is ignored (always Cloudflare); outside it (Vercel CI, local) it is honoured. `vite.config.ts` sets `maxDuration: 120` for the Vercel function so a claimed run (~80 s max) is not cut off on Hobby.

## Environment variables (server unless marked)

| Name | Required | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | yes | user-scoped DB access (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | worker writes results/screenshots |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | yes (build-time, public) | browser sign-in |
| `BROWSERLESS_TOKEN` | yes for runs | without it every run ends `infra_error / browser_not_configured`, nothing executes |
| `BROWSERLESS_ENDPOINT` | no | default `https://production-sfo.browserless.io` |
| `BROWSER_PROVIDER` | no | `browserless-function` (default, all hosts) or `browserless-playwright` (Node hosts only, see below) |
| `WORKER_SECRET` | yes off-Lovable | bearer for `/api/public/worker/tick` (on Lovable `LOVABLE_CRON_SECRET` is used) |
| `ALLOWED_ASSET_HOSTS` | no | extra comma-separated hosts the test browser may load (CDNs) |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | no | OpenAI-compatible; falls back to `LOVABLE_API_KEY` gateway; absent = manual plans, no analysis |

## Execution model

1. `createRun` persists a `queued` run (idempotency key; one active run per user, DB-enforced).
2. A worker claims it with a lease (`claim_run`/`claim_next_run`, `FOR UPDATE SKIP LOCKED`). Claimers: the run page (`advanceRun`) and the tick endpoint.
3. Each step result is written as it is produced (Playwright provider) or right after the session (function provider), screenshots to private storage.
4. Expired leases → `inconclusive / worker_interrupted` by `sweep_stale_runs`. Cancel sets `cancel_requested`, checked between steps.

Bound: 60 s browser budget, 25 steps, 15 s per step. The claiming request holds ≤ ~80 s, within Cloudflare (no wall-clock limit while awaiting I/O) and Vercel defaults (300 s with Fluid compute; Hobby without Fluid is 60 s — set `maxDuration` ≥ 90).

**Recovery backstop (recommended):** something must POST to `/api/public/worker/tick` every 1–5 min with `Authorization: Bearer $WORKER_SECRET`. Note: a Cloudflare Cron Trigger does NOT call an HTTP route — it invokes a `scheduled()` handler, which this app does not have, so do not add `triggers.crons` to `wrangler.jsonc`. Use Supabase `pg_cron` + `pg_net` (step 6 below), Vercel Cron, or any external HTTP scheduler. Without it, a run whose tab is closed before claim stays queued until someone opens it.

## Provider differences (honest)

- `browserless-function` (default): HTTP POST to Browserless `/function` with our fixed executor script (Puppeteer page) and the plan as JSON data. Works on Workers and Vercel. Step results appear when the session ends.
- `browserless-playwright`: `playwright-core` `chromium.connect` to `wss://…/chromium/playwright`. Streams per-step results and supports mid-run cancel. **Does not work on Cloudflare Workers.** On Vercel it requires `playwright-core` to be shipped with the function (it is loaded via a non-literal import and is not traced by default) — add it to nitro `externals.traceInclude` before using this mode.

Both share the same executor and security rules.

## Security notes

- URLs: http/https only, ports 80/443/8080/8443, no credentials, IPv4/IPv6 private/loopback/link-local/metadata/NAT64/6to4/Teredo blocked incl. encoded forms; DNS-over-HTTPS check of every A/AAAA at project creation, run creation and run start; reachability probe re-validates each redirect hop.
- In the browser every request is checked against the project site + asset allow-list; IP-literal hosts are refused. The browser runs on Browserless's network, so DNS pinning is not possible there; the allow-list is the control.
- Users can only INSERT queued runs (fixed column list) and UPDATE `cancel_requested`; verdict columns, step results and events are writable only by the worker.
- RLS: users only read their own rows; runs can only be inserted `queued`; step results/events are worker-only; worker RPCs are service-role only.

## Step-by-step: your own Supabase + Cloudflare

1. **Supabase project**: create one at supabase.com. Note Project URL, publishable (anon) key, service-role key, project ref.
2. **Schema**: apply (0000 schema+RLS+worker RPCs, 0001 evidence storage policies, 0002 `claim_run`, 0003 lineage+observations, 0004 verdict-column locks) `drizzle/migrations/0000_*.sql` … `0004_*.sql` in numeric order, e.g. `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/migrations/0000_migration.sql` (repeat per file) or paste each into the SQL editor. Apply to an empty project once; do not re-run.
3. **Storage**: the migrations add the policies but not the bucket. Create a **private** bucket named `evidence` (Storage → New bucket, Public off), or run `insert into storage.buckets (id, name, public) values ('evidence','evidence',false);`.
4. **Auth**: enable Email provider (confirm email on). Authentication → URL Configuration: Site URL = `https://<your-domain>`, Redirect URLs add `https://<your-domain>/**` (sign-up links return to `/dashboard` on the current origin).
5. **Cloudflare**:
   ```
   export VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=<anon> VITE_SUPABASE_PROJECT_ID=<ref>
   npx vite build            # VITE_* are baked in at build time
   npx wrangler login
   for n in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY BROWSERLESS_TOKEN WORKER_SECRET; do npx wrangler secret put $n; done
   # optional: AI_API_KEY AI_BASE_URL AI_MODEL BROWSERLESS_ENDPOINT
   npx wrangler deploy
   ```
   `WORKER_SECRET`: any long random string (e.g. `openssl rand -hex 32`). Add a custom domain in the Cloudflare dashboard, then use it in step 4.
6. **Recovery cron** (Supabase SQL editor; enable extensions `pg_cron`, `pg_net` and `supabase_vault` first). The secret lives in Vault, so it is never in committed SQL or in `cron.job.command`:
   ```sql
   -- once; paste the real value only in the SQL editor, never commit it
   select vault.create_secret('<WORKER_SECRET>', 'deployproof_worker_secret');
   select vault.create_secret('https://<your-domain>/api/public/worker/tick', 'deployproof_tick_url');

   -- idempotent: cron.schedule with an existing job name replaces that job (no duplicates)
   select cron.schedule('deployproof-tick', '*/2 * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'deployproof_tick_url'),
       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'deployproof_worker_secret')),
       body := '{}'::jsonb, timeout_milliseconds := 90000);
   $$);
   ```
   Rotate: `select vault.update_secret((select id from vault.secrets where name='deployproof_worker_secret'), '<new>');` and `npx wrangler secret put WORKER_SECRET`. Verify one job: `select jobname, schedule from cron.job;`. Remove: `select cron.unschedule('deployproof-tick');`. Results appear in `net._http_response` (status/body only, request headers are not stored).
   Manual check: `curl -X POST -H "Authorization: Bearer $WORKER_SECRET" https://<your-domain>/api/public/worker/tick` → `{"ok":true,"executed":0}`; without or with a wrong token → 401. Each tick sweeps expired leases (interrupted runs → Inconclusive) then executes at most one queued run.
7. **Acceptance test (live)**: sign up → confirm email link lands on your domain → create a project for a site you are authorised to test → run the "Homepage smoke test" template → report shows real steps + screenshots → refresh, still there → run a test with a deliberately wrong link text → Failed with observation → sign in as a second user and confirm the first user's project/runs are not visible.
