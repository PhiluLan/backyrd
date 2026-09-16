# ADR-DECISION-VNEXT-008 — Disabled Dark Shadow Foundation

Status: accepted technical Week-1 architecture candidate; not Production-authorized.

## Context

Decision vNext needs a future path to compare a candidate engine with the canonical Decision result on the same inputs. Phase 3C supplies a complete offline result and accepted Founder semantics, but Production wiring would currently exceed authorized Product, Privacy and Operations policy.

## Decision

Introduce a standalone, versioned shadow boundary in `@backyrd/decision-vnext-core` with these invariants:

- the only valid runtime control is `DISABLED`, kill switch `ENGAGED`, sample rate zero;
- the envelope consumes canonical Phase-3C World/User/Context/candidate identities rather than copying domain contracts;
- the same ordered candidate set is mandatory for canonical and shadow results;
- comparison metrics are structural technical observations, not Product-quality or ranking claims;
- the candidate engine is an explicitly synthetic mirror fixture with ranking and confidence `NOT_CONFIGURED`;
- all semantic content is canonically hashed; measured duration is a non-semantic diagnostic;
- fixture authority provisioning is excluded from the public runtime index;
- replay recursively validates the envelope, result and metrics and rebuilds the report byte-for-byte;
- no persistence, network adapter, Production source, Decision-v13 call, User write or visible output path exists.

## Consequences

This proves contracts, identity, tamper detection, metric construction and deterministic replay locally and in CI. It does not prove capacity, real traffic compatibility, ranking quality, confidence calibration, Privacy retention, Production authorization or operational response.

Any later real shadow integration must be a separate reviewed slice. It must supply an externally accepted source/artifact authority, a read-only request adapter, privacy-approved minimization and retention, Operations-owned sampling/kill-switch controls, observability storage and a separately authorized deployment plan. It may not weaken the literal disabled contract in this release; activation requires a new version.

## Rejected alternatives

- Reusing `n6-shadow-runtime`: rejected because it is coupled to historical Decision-v13/Supabase behavior.
- Calling Production RPCs from the sandbox: rejected because it would cross the explicit no-Production-data boundary.
- Adding a dormant boolean to an existing Product path: rejected because accidental activation and authority are not structurally excluded.
- Treating technical parity as Product relevance: rejected because no approved ranking or confidence oracle exists.

