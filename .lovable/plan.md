# DeployProof MVP plan

Real-browser website QA: sign in, add a site, describe a journey, review the AI-drafted steps, run them in a real hosted Chromium (Browserless), and get an evidence-backed report.

## Architecture

```text
Browser UI (React)
   |  server functions (logged-in users only)
App server (TanStack Start)
   |-- Lovable Cloud: login, database, private screenshot storage
   |-- Lovable AI: plain English -> limited set of step types; explain failures
   |-- Browserless: Playwright connects to a remote Chromium over a websocket
```

- No step runs if the Browserless key is missing. The UI shows "Browser worker not configured" and never makes up results.
- Each run gets its own fresh browser context. No cookies are shared between users.

## Phases (smallest working slice first)

1. **Foundation**: enable Cloud with email login. Database tables: projects, tests, steps, runs, step results. Each user can only see their own rows. Private screenshot storage. URL safety checker plus unit tests.
2. **One full journey**: new project with an ownership checkbox and a reachability check. Test builder that drafts steps with AI; steps can be edited. Run: the server executes the steps one by one and writes each result as it happens. The live run page polls for real progress. Cancel stops after the current step.
3. **Evidence**: screenshots after failures and at the end, console and navigation errors, timings. AI analysis split into "Observed" and "Possible cause". Rerun creates a new, separate run.
4. **Screens and checks**: dashboard with real counts and latest failures, project history with run comparison and a "now passing" badge. Run acceptance checks A–G against a small test page we serve ourselves (form, slow page). Report what actually passed.

## Status rules
PASSED only if every assertion passed. FAILED means a recorded action or assertion failure. INCONCLUSIVE covers navigation, DNS or blocked-destination errors and worker failures. These are never labelled app bugs. RUNNING and CANCELLED are also tracked.

## Technical details
- Step types (checked with Zod): goto, click, fill, select, press, waitFor, assertText, assertVisible. Targets are given by role+name, label, text or testId. No raw code is ever executed. Each step has a timeout capped at 15s. A run has at most 25 steps and 90s total. Max 3 tests per project and 1 active run per user.
- Safety: only http/https. Resolve DNS over DoH and block private, loopback, link-local and metadata IP ranges (v4 and v6). Check again after redirects. Playwright `page.route` blocks every request to a disallowed host. Block clicks whose text looks like buy/pay/delete. Generate fake test data.
- Execution runs inside a server function call (under 90s). If that proves too tight on the hosting limits, it moves to a background run.
- Screenshots are stored in a private bucket and shown via signed URLs that expire after 10 minutes.
- Secret needed: `BROWSERLESS_TOKEN` (from browserless.io → account → API key). We'll ask for it once the run engine exists.
- Not in scope: auto code fixes, PRs, monitoring, payments, teams.
