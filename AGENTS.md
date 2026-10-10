<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Browser execution goes only through `BrowserProvider` (src/lib/browser/provider.server.ts); the executor is one JS source string shared by all providers — keeps providers swappable and edge-safe.
- Never import `playwright-core` statically; edge (Workers) bundles cannot load it.
- Runs are DB-persisted jobs claimed with leases (claim_run / claim_next_run / sweep_stale_runs); never execute a run without claiming — prevents duplicates and enables recovery.
- Verdicts come only from recorded browser results (`deriveRunStatus`); AI output is stored separately as hypothesis — honesty is the product.
- All URL checks run server-side via src/lib/security/url-safety.ts; client checks are UX only.
- Server code uses web-standard APIs only so the app builds for both Cloudflare and Vercel (see DEPLOYMENT.md).
- Locator failures store a redacted accessible-page observation (step_results.page_observation); ambiguous matches are INCONCLUSIVE and never clicked — evidence over guessing.
- Run verdicts, step results and events are writable only by the service-role worker; users get column-limited INSERT on runs and UPDATE(cancel_requested) — prevents self-forged PASSED results.
