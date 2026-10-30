# Basel admin diagnostic

This Admin-only diagnostic executes the ten fixed questions in `admin-diagnostic.ts`. Following the Founder's explicit instruction on 30 October, it has no minute/day request quota and no calendar expiry. The model reference is frozen to the first live test's 30 October local date. Normal consumer transport is unchanged.

The Edge Function requires the gateway JWT check, the same verified session binding as Product Decision, and `admin_is_admin_v1` through the caller's own client. It uses the existing server-only OpenAI secret. Runtime control, body validation and the per-request timeout remain active. The page never automatically retries. Repeated tests can incur provider charges without an application-level quota; provider/platform limits still apply.

The diagnostic returns the structured model meaning, its librarian request, every deterministic candidate fact assessment and the final response/ranking vectors. An optional request-local observer captures the actual search result without repeating catalog matching. It makes no second model call. Raw user-intelligence nodes, credentials and model reasoning items are not returned or logged. Only the selected account's existing personal projection influences ranking.

There are no Spot, learning or normal decision-ledger writes. Existing authorization and runtime control remain active. Diagnostic quota counters are no longer consumed; their history is retained and never reset. The ordinary engine answer is built in memory; `decisionPersisted:false` and `learningPersisted:false` are explicit in the diagnostic envelope. The diagnostic now makes no quota-counter writes. Its output explicitly includes adminTestQuotaApplied:false.

Open `/decision-diagnostics` in the Admin dashboard and choose **Zehn Tests starten**. Download results before leaving; the page does not persist them. The production output is not publicly exposed or cached. A completed transport is not a semantic pass.

Deployment must include the new compiled `admin-diagnostic.js`, the additive observer in the evaluation provider/evaluator, and the existing runtime dependencies. For a comparison with an already deployed engine, bind the bundle to that consumer's retrieved source files and record their hashes; do not silently substitute a newer local runtime. Deploy this function alone; do not apply pending migrations or redeploy consumer functions for this test.

Validation: `npm run decision-vnext:build`, `node --test packages/decision-vnext-core/test/admin-diagnostic.test.mjs`, Deno entrypoint check, Admin type/lint checks, unauthenticated denial, authenticated non-admin denial where a suitable test account is available, and ten real admin requests. Never label fixture tests as real model runs.

## Historical validation before quota/expiry removal

Live validation (30 October): ten authenticated requests completed against diagnostic v2 with the consumer v217 runtime plus the additive search observer. All 444 candidates per request were captured. Runtime-only totals were 66.0 seconds; this is not a semantic acceptance result. The initial duplicate-search draft was rejected by Edge CPU limits.

Founder explicitly approved up to twenty additional calls for 30 October 2026. Only that UTC day has subject/global daily caps of 40 instead of 20. Minute caps, operation identity, existing counters, authentication, Admin authorization and expiry remain unchanged. The cap automatically returns to 20 on 31 October. No counter is reset or removed.

After those twenty calls completed, the Founder separately approved exactly two
more controls for the source-time metadata schema correction (fixed cases 2 and
9). The 30 October UTC cap is now 42, still returning to 20 on 31 October.
The page supports an individual fixed-case selection; it does not accept new
prompts or automatically retry failed calls. Preserve counters and all access
checks, and restore the baseline diagnostic bundle after the candidate trial.

Both approved final controls completed against candidate diagnostic v10,
prompt/schema 8, Decision source 15cefe44 and diagnostic source c9d1ddab.
The time source quotations are CONTEXT and actual date/day-phase duties remain
REQUIRED. Baseline diagnostic v11 was then restored (hash
6bcb6b69d90d9b6feb6ab44dd497c543eec1785dac3dc43e275c1709deac2e60),
retaining only the approved 42/day exception. The global count is 42 with one
earlier blocked attempt; consumer decision-v13 remains v217.
