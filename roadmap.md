# DeployProof roadmap

- [x] Phase 1: auth, schema + RLS, evidence bucket, URL-safety module + tests
- [x] Type errors fixed; Cloudflare + Vercel production builds verified
- [x] Runner, provider interface, lease/claim/sweep, cancel, rerun, evidence UI, AI analysis
- [x] Real Browserless runs verified (pass + failing assertion) against example.com
- [ ] Run against /test-site (needs publish)
- [ ] Scheduled tick backstop (after publish)
- [ ] Acceptance A–G against real browser
- [x] Locator diagnostics: page observation on failure, ambiguous = inconclusive, redaction, edit & rerun with lineage
- [x] Cloudflare + Vercel builds re-verified
- [ ] Live deploy on Vercel or Cloudflare (needs your account + secrets)
