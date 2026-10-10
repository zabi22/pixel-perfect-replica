# DeployProof MVP plan (revised)

Real-browser website QA. Sign in, add an authorised site, describe a journey, review the AI-drafted steps, run them on remote Chromium (Browserless first, replaceable later), then get an evidence-backed report.

## Hosting and runtime assumptions

- The app is TanStack Start. It builds for Cloudflare Workers today, which is also what the Lovable preview uses. Vercel needs its Nitro/Vercel preset, and we document the build switch. Server code sticks to web-standard APIs (fetch, Web Crypto, URL) and never imports Vercel- or Cloudflare-specific modules.
- We never launch Chromium inside Vercel Functions, Workers or Edge Functions. Playwright only connects to Browserless over its WebSocket endpoint.
- Supabase is used through the standard `@supabase/supabase-js` client and plain env vars. Lovable Cloud is just a hosted Supabase, so any Supabase project works and there is no Lovable lock-in at runtime.
- The only Lovable-specific dependency is the AI gateway, used for drafting plans and analysing failures. It sits behind an `AiProvider` interface with an OpenAI-compatible adapter (base URL + key), so it can point at OpenAI or another compatible provider. If no AI key is set, the user writes steps by hand and analysis is skipped. Test verdicts never depend on AI.

## Known risks, stated up front

1. **Playwright on Cloudflare Workers.** `playwright-core` relies on Node APIs that workerd may not provide, even with `nodejs_compat`. Phase 2 opens with a spike to confirm whether `chromium.connect()` to Browserless actually works on Workers. If it doesn't, the Cloudflare build uses a `BrowserlessFunctionProvider`. That provider sends a fixed executor script written by us, plus the JSON plan as data, to Browserless's `/function` HTTP API. No user code is ever sent. Vercel (Node runtime) uses the direct Playwright WebSocket provider. Both providers implement the same interface.
2. **Browserless plan.** The free tier caps session length and monthly usage. Our 60s run cap and one concurrent run per user should fit it. Account features beyond a basic token are not needed. I'll report the real limits once the token is in use. If a call is rejected for plan reasons, the run is marked INFRA_ERROR with the message Browserless returned.

## Durable async execution

```text
UI --createRun--> runs row (queued, idempotency key)   <- 1 active run per user
            tick (cron every minute + kick right after create)
                   |
       claim_next_run() RPC: FOR UPDATE SKIP LOCKED, sets lease_until
                   |
       executor: connect provider -> run steps -> write each step_result
                 renew lease, check cancel_requested between steps
                   |
       finalize: passed / failed / inconclusive / cancelled / infra_error
UI polls run + step_results every 1.5s (progress comes only from real rows)
```

- A run is saved as `queued` before anything executes. A unique `(user_id, idempotency_key)` makes double-clicks harmless.
- **Tick endpoint** `/api/public/worker/tick` requires the `WORKER_SECRET` header. It is triggered by Supabase `pg_cron` + `pg_net`, which works on any host with no extra service. A Vercel Cron or Cloudflare Cron Trigger can call it instead. Right after creating a run, the server also kicks the tick without waiting for it, so start-up is fast.
- Each run has a budget of at most 60s wall time, 25 steps and 15s per step. If the lease runs out, the sweeper marks the run `inconclusive` with the reason "worker interrupted". Steps it never reached are marked `skipped`. A run is never silently retried. Rerun creates a new run.
- To cancel, the server sets `cancel_requested`. The executor checks it between steps and closes the browser.

## Security (all enforced on the server)

- Only http/https. Credentials in URLs and non-standard ports are rejected, except 80 and 443 (with optional 8080/8443).
- Before every run, hostnames are resolved over DNS-over-HTTPS. Every A and AAAA record is checked against blocked IPv4 and IPv6 ranges: loopback, RFC1918, CGNAT, link-local, metadata 169.254.169.254, fd00::/8, ::ffff: mapped, 6to4, NAT64, multicast and reserved ranges. IP-literal and decimal/hex/octal host tricks are normalised before checking.
- In the browser, `page.route('**')` re-checks every request host, including redirects, subresources and later resolutions. Anything disallowed is aborted. Hosts that pass can only be same-site as the project origin or an allow-listed asset domain. Service workers are blocked. Downloads are disabled.
- Step targets must stay on the project origin. A small set of safe step types is validated with Zod. Destructive-looking clicks (buy/pay/delete/checkout) are refused. Fill values are synthetic.
- Page text only ever counts as evidence. It is never fed back to the AI as instructions. Only the run's own observations go to the AI analysis.

## Data and evidence

Tables: `projects`, `tests`, `test_steps`, `runs`, `step_results`, `run_events`. Each has an owner column and RLS limited to `auth.uid()`. Screenshots go in a private `evidence` bucket with the path `user_id/run_id/step.png`, served by signed URLs that expire after 10 minutes. Each step result stores expected, observed, status, duration, console and network errors, and a screenshot path. AI output is kept in a separate `analysis` column labelled "Hypothesis". Statuses are PASSED, FAILED, INCONCLUSIVE, RUNNING, CANCELLED and INFRA_ERROR (config or connection problems are never reported as an app bug).

## Phases (I report at the end of each)

1. Supabase auth (email), schema plus RLS, evidence bucket, URL-safety module with unit tests for the IPv4/IPv6/encoding cases.
2. Workers spike, `BrowserProvider` interface plus the Browserless adapter, executor, tick/claim/lease. One real journey against our own `/test-site` (form, success message, a slow page, a missing button). **The BROWSERLESS_TOKEN is requested only at this point.**
3. Evidence capture, live progress page, cancel, timeouts, rerun, AI analysis.
4. Dashboard, project history, run comparison with a "now passing" badge, acceptance checks A–G, deployment docs.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY | server | data access as the user |
| VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY | browser | sign-in (public by design) |
| SUPABASE_SERVICE_ROLE_KEY | server | worker writes results and uploads evidence |
| BROWSER_PROVIDER | server | `browserless-ws` or `browserless-function` |
| BROWSERLESS_TOKEN, BROWSERLESS_ENDPOINT | server | e.g. `wss://production-sfo.browserless.io` |
| WORKER_SECRET | server | authenticates tick calls |
| AI_BASE_URL, AI_API_KEY, AI_MODEL | server, optional | plan drafting and analysis |

`DEPLOYMENT.md` will cover the Vercel and Cloudflare steps, cron setup and the incompatibilities above.

## Out of scope
Auto code fixes, PRs, monitoring, payments, teams, logins to production sites.
