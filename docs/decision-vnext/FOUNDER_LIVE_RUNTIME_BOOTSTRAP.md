# Founder-Live Runtime Bootstrap

Status: **Draft source only — Production trust root not provisioned**

This slice introduces the contracts and verification tooling needed for a later, separately authorised Founder-Live Production bootstrap. It does not activate the runtime. The shipped Edge entrypoint still returns `503` before request-body parsing, Auth, allowlist, World/User reads, rate-limit, idempotency, evaluation, persistence or output.

## Authority model

`PRODUCTION_FOUNDER_READ_ONLY` is a distinct mode. It is never inferred from `LOCAL_TEST` or `PROD_LIKE_TEST`. A future authority record must be Ed25519-signed and bind all of:

- Supabase project ref;
- exact canonical main and tree;
- Founder-Live release, artifact and source-set hashes;
- source-aware Production-plan and Product-policy hashes;
- authority generation and nonce;
- kill-switch generation;
- validity interval;
- exactly two members;
- read-only scope and explicit false values for learning, writeback, ranking, eligibility, shadow traffic and generic Production authority.

The repository verifier can validate provenance, but returns only `VERIFIED_NON_EXECUTABLE`. It cannot mint a runtime capability. The accepted Production trust root is deliberately absent. Headers, environment variables, request payloads, repository hashes and a caller-created replacement key cannot provision it.

## Kill switch

A future activated release must read a fresh externally signed kill-switch record at request start and before Auth, allowlist, rate-limit, body parsing, location authority, retrieval, User read, every World read, evaluation, idempotency commit/replay, expert response and final output. A value captured at isolate startup is insufficient. Any missing, malformed, stale, cross-project, cross-release or wrong-generation record fails closed.

Emergency-OFF remains a separate operational path and must not depend on the normal deployment path.

## Session rotation and revocation

The current private UUID authority binds an exact server-verified session hash. Legitimate rotation therefore requires a newly sealed private authority record and revocation of the old record. The Decision runtime must never widen a UUID, accept an unbound new session, reuse an expired record, or fall back to email, metadata, headers, API keys or client flags. A stale session remains denied until the external identity authority publishes the replacement record.

## Scope of this Draft PR

- zero migrations;
- zero Auth configuration changes;
- only `decision-founder-live` Function source changes;
- `verify_jwt=true` preserved;
- default OFF and kill switch effectively engaged by the missing trust root;
- no Production queries, secrets, deployment, runtime activation, Product output or OTA;
- no World/User contract copies and no User-Intelligence writes.

## Prepared later runbook (not authorised here)

1. Verify the exact post-merge main, tree, parents and green gates.
2. Rebuild the exact source-aware plan and recovery-point evidence.
3. Verify the exact-two Auth cohort read-only; retain only count and non-PII hashes.
4. Provision the external authority while OFF and keep Emergency-OFF engaged.
5. Apply only the separately approved ten pending migrations and prove a second apply is `NO_OP`.
6. Deploy only `decision-founder-live` with `verify_jwt=true`.
7. Run OFF smokes.
8. Activate only the exact two members after a separate explicit authorisation.
9. Rehearse Emergency-OFF and reactivate only after separate approval.
10. End in `ACTIVE_FOR_TWO_FOUNDERS_ONLY` or `OFF_WITH_ROOT_CAUSE`.

None of these operational steps is executed by this PR.
