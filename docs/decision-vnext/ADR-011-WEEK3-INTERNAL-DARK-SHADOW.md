# ADR-011 — Week-3 Internal Dark Shadow Operation

Status: Accepted for local and CI evaluation only
Scope: Decision vNext Week 3
Production authority: none

## Decision

Decision vNext exposes no Product or Production activation path. The public runtime control is fixed to `enabled:false`, `sampleRateBasisPoints:0`, `killSwitch:ENGAGED`, and every execution, persistence, network, Product-output, ranking, eligibility, confidence, learning, and mutation authority is `false`.

A separate, non-exported fixture module may rehearse `OFF → TEST_ON → EMERGENCY_OFF` in local synthetic or production-like test environments. Its process-local capability cannot be serialized, imported through the public package index, or minted from client input. Test-ON must consume the canonical `WorldKnowledgeReaderPort` through the World dark reader and the canonical minimized `DecisionVNextUserProjectionPort`.

## Bound execution

Every rehearsal binds a server-authored envelope to the pseudonymous internal subject, purpose, environment, request, server time and location, World reader/registry/source policy/cohort, User projection release, Phase-3C policy/release, candidate set, Week-2 reference report, source SHA, source tree, and artifact identity. A separately supplied artifact-trust record pins that envelope and source identity. Unknown, expired, cross-purpose, cross-environment, cross-request, cross-release, or rehashed mismatches fail before evaluation.

The operation emits only minimized technical evidence: candidate identity, candidate tier, core-intent state, hard-constraint counts, contextual-reject class, technical parity metrics, zero side-effect counters, and hashes. The complete Decision result is discarded, never persisted, and never returned to a Product consumer. Latency is observable but excluded from semantic identity.

## Kill switches

- Default OFF performs zero World/User reads, evaluations, writes, network calls, outputs, or mutations.
- Local TEST_ON requires the non-public process capability and a valid bound envelope.
- EMERGENCY_OFF invalidates the active generation. Already-started read-only calls may finish, but evaluation, persistence, Product output, mutation, and state leakage remain zero. The same controller cannot be re-enabled.

## Evidence and non-deployment

Replay deterministically rebuilds the run and compares canonical bytes. A rehashed inner report is not authoritative. Post-deploy evidence is deliberately `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`; it binds the report, source identity, and source-aware plan while keeping deployment, migration, and shadow traffic false.

## Deferred

Production adapters/data, Product ranking and eligibility, calibrated confidence, persistence, shadow sampling, client output, User learning, external providers, migrations, deployments, and Phase 3D remain out of scope.
