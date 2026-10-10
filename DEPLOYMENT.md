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

- **Cloudflare** (default): `npx vite build` → nitro preset `cloudflare-module`; deploy with `npx wrangler deploy` from the output dir. `nodejs_compat` is enabled by the preset.
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

**Recovery backstop (recommended):** call the tick every 1–5 min with `Authorization: Bearer $WORKER_SECRET` (Vercel Cron, Cloudflare Cron Trigger, or Supabase `pg_cron`+`pg_net` with `timeout_milliseconds := 90000`). Without it, a run whose tab is closed before claim stays queued until someone opens it.

## Provider differences (honest)

- `browserless-function` (default): HTTP POST to Browserless `/function` with our fixed executor script (Puppeteer page) and the plan as JSON data. Works on Workers and Vercel. Step results appear when the session ends.
- `browserless-playwright`: `playwright-core` `chromium.connect` to `wss://…/chromium/playwright`. Streams per-step results and supports mid-run cancel. **Does not work on Cloudflare Workers.** On Vercel it requires `playwright-core` to be shipped with the function (it is loaded via a non-literal import and is not traced by default) — add it to nitro `externals.traceInclude` before using this mode.

Both share the same executor and security rules.

## Security notes

- URLs: http/https only, ports 80/443/8080/8443, no credentials, IPv4/IPv6 private/loopback/link-local/metadata/NAT64/6to4/Teredo blocked incl. encoded forms; DNS-over-HTTPS check of every A/AAAA at project creation, run creation and run start; reachability probe re-validates each redirect hop.
- In the browser every request is checked against the project site + asset allow-list; IP-literal hosts are refused. The browser runs on Browserless's network, so DNS pinning is not possible there; the allow-list is the control.
- Users can only INSERT queued runs (fixed column list) and UPDATE `cancel_requested`; verdict columns, step results and events are writable only by the worker.
- RLS: users only read their own rows; runs can only be inserted `queued`; step results/events are worker-only; worker RPCs are service-role only.
