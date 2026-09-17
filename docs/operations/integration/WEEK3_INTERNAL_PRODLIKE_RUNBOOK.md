# Week 3 internal product-like control plane

This runbook is the operational source of truth for the integration-only Week 3 rehearsal. It grants no Production authority.

## Release train

The only permitted order is WORLD → USER → DECISION → INTEGRATION_FINAL_REVALIDATION. Each domain owns its semantics; Integration binds immutable identities, shared gates, recovery choreography, and evidence.

## Allowlist and activation boundary

The shipped state has zero real allowlist members. Authority, expiration, and retention remain `NOT_CONFIGURED`. Only a synthetic, pseudonymous fixture may enter `LOCAL_TEST` or `PROD_LIKE_TEST`; purpose, environment, release, request, validity interval, and envelope hash must all match. Missing, unknown, expired, cross-release, or modified input is denied.

## Kill switch rehearsal

1. Confirm every flag is false and every kill switch is engaged or forced off.
2. Execute OFF and verify all counters are zero.
3. Use the isolated synthetic authority to enter `PROD_LIKE_TEST` without persistence, network calls, or Product output.
4. Engage the global switch during the first World read. Discard partial state and verify there are no later reads, projections, evaluations, writes, network calls, or outputs.
5. Execute OFF again to prove idempotence. Record recovery time as an observation, never as an SLO or quality threshold.

## Incident and allowlist revocation

Engage the global kill switch first, then each domain switch. Revoke the synthetic authority or the affected allowlist entry, reject in-flight work, preserve only non-sensitive hash evidence, and keep Product output disabled. A real member cannot be added without a new authority decision.

## Rollback

Revert the scoped Integration commit and any separately authorized domain commit in reverse order. Do not rewrite migration history. Since Week 3 introduces no migrations, functions, Auth changes, or Product wiring, rollback is source-only unless a later separately authorized release changes that fact.

## Evidence capture

Bind the final combined commit, tree, one Node-20 artifact, all three release/allowlist hashes, kill-switch control hash, and source-aware plan hash. When Production has not run, the only truthful status is `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`.
