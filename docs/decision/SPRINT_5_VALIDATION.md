# Sprint 5 Validation

## Result

The offline integration and local database path pass. The visible deterministic decision was unchanged, eight required Shadow scenarios completed, and no Shadow result became N2 learning evidence.

One bounded live staging attempt reached the external provider boundary but produced no canonical usage-bearing response. No second live scenario was started after the predeclared two-transport-attempt ceiling could no longer be proven unused. The frozen model/configuration was not changed. Verified provider usage/cost recorded: USD 0.000000; conservative live exposure ceiling: USD 0.50.

Because a validated live provider output was not obtained, Sprint 5 is not closed for internal-user readiness. This is an integration readiness failure, not a reason to weaken the validator or alter the frozen engine.

## Executed gates

- Fresh local database reset and all migrations: PASS.
- N6 runtime/validator tests: 13/13 PASS.
- Required offline Product Shadow scenarios: 8/8 VALIDATED.
- Cold/LOW personalization exclusion: PASS.
- candidate identity and exact reasons: PASS.
- explicit Current Intent conflict: PASS.
- partial N4 and Copenhagen minimization: PASS.
- N6A.7 provider canonicalization: PASS.
- timeout, provider failure, queue-level technical retry, semantic no-retry: PASS.
- response-loss idempotency: PASS.
- consent-withdrawal race after claim: PASS; provider not called and work cannot resurrect.
- canonical account-erasure race after claim: PASS; Product profile erasure purges work and stale runner aborts.
- kill switch, per-user limit, global budget: PASS.
- RLS/cross-user mutation and read denial: PASS.
- deterministic response mutation: 0.
- N2 Shadow learning events: 0.
- frozen N6A plus Sprint 1-4 regression selection: 95/95 PASS.
- database lint on the fresh final schema: PASS.

The final representative local mock-provider validation recorded Top-1 agreement 0.875. Order difference is descriptive only and is not a quality verdict. Local validation latency excludes a real provider and is not a Production SLO.

The account-erasure fixture follows the repository's authoritative deletion order: owned Safety registry rows are removed before the profile. A direct local Auth Admin deletion bypassing that procedure is blocked by the pre-existing Safety actor synchronization trigger and is not a Sprint-5 regression.

## Required remaining closure proof

With explicit fresh authorization and the frozen model/configuration available at the provider boundary, obtain at least one usage-bearing canonical provider response that passes or is cleanly rejected by the validator and is persisted through the real Shadow queue. Do not make N6 visible.

## Commands

```sh
node --test packages/n6-shadow-runtime/test/*.test.mjs
node scripts/decision/validate-n6-shadow.mjs
```

The validation script is local/staging-only and restores all feature flags to off.
