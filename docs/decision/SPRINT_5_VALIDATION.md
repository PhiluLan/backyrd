# Sprint 5 Validation

## Result

The offline integration and local database path pass. The visible deterministic decision was unchanged, eight required Shadow scenarios completed, and no Shadow result became N2 learning evidence.

Sprint 5.1 added secret-safe provider error metadata and repeated the real queue path under a USD 0.50 hard cap. One logical live Shadow run consumed the frozen maximum of two technical attempts. The provider returned HTTP 429 with `error.type=insufficient_quota` and `error.code=credit_balance_exhausted`; the final request identity was retained without body text or secrets. Neither attempt returned a canonical usage-bearing response. Verified provider usage/cost recorded: USD 0.000000.

Because a validated live provider output was not obtained, Sprint 5 is not closed for internal-user readiness. The remaining blocker is external provider credit/quota availability, not ranking semantics, parsing, structured-output configuration, or validator behavior. No model, prompt, timeout, decision semantics, or gate was changed.

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

## Sprint 5.1 provider diagnosis

- endpoint: `POST /v1/responses`; reached provider.
- model: `gpt-5.6-sol`; officially supports Responses and Structured Outputs.
- request format: `text.format.type=json_schema`; matches the current Responses API contract.
- response: HTTP 429 provider error object, not a Response object.
- provider disposition: `insufficient_quota / credit_balance_exhausted`.
- completion/output/usage: unavailable because generation never started.
- parser/canonicalizer/validator: correctly not invoked for the provider error.
- queue: attempt 1 became retryable; attempt 2 became terminal `FAILED`.
- visible deterministic mutation: 0; N2 learning delta: 0.

The earlier Sprint-5 response body was not retained, so its precise provider error cannot be claimed retroactively. Sprint 5.1 fixes that observability gap and establishes the exact current blocker without guessing.

## Required remaining closure proof

After provider credit/quota is restored, use the same frozen model/configuration to obtain one usage-bearing canonical provider response that passes or is cleanly rejected by the validator and is persisted through the real Shadow queue. Do not make N6 visible.

## Commands

```sh
node --test packages/n6-shadow-runtime/test/*.test.mjs
node scripts/decision/validate-n6-shadow.mjs
```

The validation script is local/staging-only and restores all feature flags to off.
