# Bounded Basel admin diagnostic

This temporary diagnostic executes the ten fixed questions in `admin-diagnostic.ts`. It expires on 2 November 2026. The model reference is frozen to the first live test's 30 October local date. Normal consumer transport is unchanged.

The Edge Function requires the gateway JWT check, the same verified session binding as Product Decision, and `admin_is_admin_v1` through the caller's own client. It uses the existing server-only OpenAI secret. A separate launch-cost operation limits all administrators together to twenty attempts per UTC day. Errors consume an attempt; the page never automatically retries.

The diagnostic returns the structured model meaning, its librarian request, every deterministic candidate fact assessment and the final response/ranking vectors. An optional request-local observer captures the actual search result without repeating catalog matching. It makes no second model call. Raw user-intelligence nodes, credentials and model reasoning items are not returned or logged. Only the selected account's existing personal projection influences ranking.

There are no Spot, learning or normal decision-ledger writes. Existing authorization, control and quota checks remain active. The ordinary engine answer is built in memory; `decisionPersisted:false` and `learningPersisted:false` are explicit in the diagnostic envelope. The only database writes are the standard cost counters.

Open `/decision-diagnostics` in the Admin dashboard and choose **Zehn Tests starten**. Download results before leaving; the page does not persist them. The production output is not publicly exposed or cached. A completed transport is not a semantic pass.

Deployment must include the new compiled `admin-diagnostic.js`, the additive observer in the evaluation provider/evaluator, and the existing runtime dependencies. For a comparison with an already deployed engine, bind the bundle to that consumer's retrieved source files and record their hashes; do not silently substitute a newer local runtime. Deploy this function alone; do not apply pending migrations or redeploy consumer functions for this test.

Validation: `npm run decision-vnext:build`, `node --test packages/decision-vnext-core/test/admin-diagnostic.test.mjs`, Deno entrypoint check, Admin type/lint checks, unauthenticated denial, authenticated non-admin denial where a suitable test account is available, and ten real admin requests. Never label fixture tests as real model runs.

Live validation (30 October): ten authenticated requests completed against diagnostic v2 with the consumer v217 runtime plus the additive search observer. All 444 candidates per request were captured. Runtime-only totals were 66.0 seconds; this is not a semantic acceptance result. The initial duplicate-search draft was rejected by Edge CPU limits.
