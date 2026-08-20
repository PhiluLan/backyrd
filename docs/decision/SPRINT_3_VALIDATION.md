# Production Sprint 3 Validation

## Result

Sprint 3 produces a complete, evidence-honest N6-ready Decision Input Package in local/staging shadow mode. Production and visible `decision-v13` are unchanged.

## Executed Product-path cases

The validation uses authenticated Product RPCs to create `decision_sessions`, `decision_impressions`, and the actual V13 request context source. The service repository then reads the latest canonical User Card, Distribution eligibility, Product candidate facts, and canonical N4 in one bounded batch before building and persisting the package.

| Case | Observed result |
| --- | --- |
| Cold Friends / Friday / Drinks / Basel | valid N3; no personal claims; `LOW_OR_UNKNOWN`; FULL/PARTIAL/UNKNOWN N4 candidates |
| Known Friends | Friends `vibe.lively`, matching Bar, and portable Global signal selected; `PARTIAL` |
| Same user Date | Date `vibe.romantic` replaces Friends context signal; no Friends leakage |
| Same user Solo / Family | corresponding context nodes selected when supported |
| Explicit quiet conversation request | historical `vibe.lively` suppressed with `CURRENT_INTENT_CONFLICT` |
| Copenhagen | portable Global/Place-Type knowledge available; no Basel Spot/evidence trail |
| Broad “Was soll ich machen?” | zero selected taste nodes; `LOW_OR_UNKNOWN`; no profile dump |
| Mixed N4 coverage | FULL, PARTIAL, and UNKNOWN candidates coexist in one valid package |

Four human-readable proofs are represented directly by the Cold, Friends, Date, and explicit-conflict traces; Copenhagen and Broad Unknown add portability and uncertainty controls.

## Parity and determinism

- N3 Product adapter vs frozen Lab N3: exact equality across ten Golden moment fixtures.
- N5 Product adapter vs frozen Lab N5.6.1: exact raw-result equality for equivalent Current Moment/User Card/current intent.
- Package replay: identical semantic package and hash.
- Trace replay: same trace identity; conflicting frozen package rejected.
- Candidate order: existing V13 retrieval position retained.

## Security and privacy

- Candidate facts, canonical N4 read, User Card read, package creation, and trace write are server-side.
- Authenticated clients cannot write traces/settings or invoke privileged package persistence.
- Cross-user card/package identities fail closed.
- RLS hides another user's User Card and all Decision traces.
- The package excludes raw history, evidence references, latent truth, review dumps, and commercial signals.

## Performance (local, synthetic)

Warm Product-path runs completed in approximately 12–15 ms total; first cold run was approximately 31 ms. Typical measured components were candidate source read 4–6 ms, eligibility facts 2–4 ms, N4 batch read 1–2.5 ms, User Card read about 1 ms, N3 0.6–2.5 ms after warm-up, N5 below 1 ms, validation below 1 ms, and trace persistence 1.3–2.7 ms. These are measurements, not Production SLOs.

## Test status

- 54 relevant Node tests passed across frozen N3, frozen N5.6.1, Sprint-2 shared runtime/worker, and Sprint-3 adapters/package.
- N3 official deterministic validation: all mandatory gates passed.
- N5.6.1 official deterministic validation: all mandatory gates passed.
- Fresh local database reset and migration chain: passed.
- Sprint-1 bridge, Sprint-2 runtime/execution, Sprint-2.1 N4, and Sprint-3 SQL assertions: passed when executed directly with fail-fast SQL.
- Local schema lint reported only pre-existing PostGIS/baseline functions; no Sprint-3 function issue was reported.
- Repository-wide `supabase test db` remains red for pre-existing harness/environment reasons: assertion-style SQL files have no TAP plans, canonical Storage buckets are absent in the local test harness, and historical Trust cron-job fixtures are absent. The Sprint-3 SQL file itself executed with exit status 0 inside that run and independently.

## Commands

```sh
node --test packages/decision-input-runtime/test/*.test.mjs
psql "$LOCAL_DB_URL" -f supabase/tests/production_decision_input_runtime.sql
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/decision/validate-decision-input-runtime.mjs
```

`scripts/decision/run-decision-input-package.mjs <decision-id>` is the bounded server entrypoint for a single staging/shadow package. It fails while the feature flag is disabled.

## Boundaries

No N3/N5 threshold, confidence, or semantic change was made. N4 is read-only and not rematerialized. N6, visible ranking, Decision copy, UI, and Production activation remain unauthorized and unchanged.
