# Sprint 2 final validation — closed

## Production integration closure (2026-08-20)

The shared-runtime worker passed against the linked Backyrd Supabase project.
The derived latest-snapshot pointer now cascades with account deletion instead
of blocking it through `ON DELETE RESTRICT`. Own-card RLS evaluates consent
through an `auth.uid()`-bound helper without exposing the generic arbitrary-user
consent function.

Cloud proof: open/save produced zero signed nodes; contrasting Smart Reviews
produced six nodes; missing N4 stayed fail-closed; source deletion reduced the
card to two supported nodes; identical rebuild produced the same hash and no
fake ledger change. Progressive, full-rebuild, and direct-runtime hashes match.
The 100-event burst took 7.045 s and full rebuild 1.018 s.

The local/staging execution used actual Product source rows, the Sprint-1 N2
bridge, a claimed database work item, canonical N4 reads, the shared frozen
runtime, and the atomic persistence RPC.

## Human-readable card trace

| Card | Observable action | Result |
| --- | --- | --- |
| 0 | no evidence | no snapshot, no nodes |
| 1 | Decision exposures + open + save | snapshot with 0 Taste nodes; no Satisfaction invented |
| 2 | positive Smart Review, `gemütlich`, explicit positive text | `vibe.cozy` positive hypothesis, confidence `0.44`, GLOBAL + bar; not HIGH |
| 3 | contrasting negative Review, `laut`, explicit negative text | cautious negative hypotheses for lively/energetic; no durable dislike or HIGH claim |
| 4 | positive Review at a Spot without canonical N4 | no imputed concept; prior card knowledge unchanged except source identity |
| 5 | negative Review source removed, rebuild | unsupported negative nodes removed; six real semantic ledger changes |
| 6 | identical rebuild | identical hash; zero additional ledger changes |

The deletion hash was `9cd79c39b58a8e639f2eaac6541dd3e15ce7fc35eeeece729dac94ffc4527169`
on both rebuilds. Ledger count remained `14` on the second rebuild.

## Adversarial execution

- response lost after commit → `COMMITTED_RECOVERED`, no duplicate snapshot/ledger;
- two parallel runners → one `COMMITTED`, one `IDLE`;
- new event after claim watermark → first and follow-up generations both committed;
- abandoned claim → expired lease recovered and committed;
- temporary N4 failure → retryable, then committed;
- transaction/lease failure → rolled back, retryable, then committed;
- consent withdrawn before commit → no snapshot resurrection;
- account deleted before commit → no snapshot resurrection;
- User A could not read B's card/ledger, forge nodes, or enqueue B's rebuild.

## Performance (local synthetic stack)

- behavior-only card: `31.0 ms` total runner stage;
- review card: `22.8–27.6 ms`;
- 100-event burst including ingestion and processing: `206.5 ms`;
- full 112-event rebuild: `47.7 ms`.

These are measurements, not Production SLOs. The bounded rebuild-per-user
strategy is adequate for the current staging/beta scale.

## Gates

Shared runtime unit tests pass. Fresh migration reset passes. The four scoped
Production SQL tests pass. The real E2E, deletion, retry, concurrency,
security, deterministic rebuild, and persisted-snapshot parity checks pass.
The repository-wide legacy SQL suite still reports pre-existing local-fixture
failures for missing cron jobs/storage buckets; they are unrelated to this
Sprint and were not hidden or changed.

The runtime and runner stay feature-flagged off by default. Decision v13 and
all visible Product behavior remain unchanged. N3, N5.6.1, N6, deployment,
and Production activation remain unauthorized.
