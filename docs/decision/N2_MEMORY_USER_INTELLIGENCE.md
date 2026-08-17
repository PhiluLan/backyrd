# Backyrd Decision North Star — N2 Memory & User Intelligence

Status: **PASS — LAB/CODE VALIDATED, NOT PRODUCT-WIRED**

Date: 2026-08-17

Branch: `codex/decision-n2-memory-user-intelligence`

## 1. Executive summary

N2 implements a purpose-limited, immutable User Memory ledger and a queryable User Intelligence graph foundation. Memory stores what happened; the unchanged Wave-3B.1 Taste Engine and a new conservative Pattern derivation interpret eligible Evidence. Consent withdrawal, deletion, replay, correction, privacy and cross-user boundaries fail closed.

No existing Product event was silently backfilled. Ambiguous legacy semantics remain documented adapter gaps. No Production connection, DB push, migration repair or Product switch occurred.

## 2. Architecture

`First-Party Product Event → validated Memory Event → immutable ledger → Taste adapter / Pattern derivation → User Intelligence graph → bounded query boundary for N5`

The graph is relational. Canonical registries own Event semantics and retention; PostgreSQL RLS owns access; deterministic Lab code owns derivation and replay. Taste remains a derived belief, never a fact copied into Memory.

## 3. Existing Event inventory

| Source | N2 disposition |
|---|---|
| Decision request/session | minimized request/Moment adapter |
| Decision impression/candidate exposure | neutral exposure with rank/propensity |
| taps/opens | weak interaction |
| favorites | deliberate intent |
| navigation/reservation intent | deliberate intent |
| verified visit/was-here | Outcome only where verification semantics are real |
| reviews/mood feedback | explicit Evidence after direction/concept qualification |
| positive/negative feedback | explicit scoped Evidence |
| not there | neutral correction |
| Remix | temporary request history |
| onboarding | bounded initial Evidence |
| legacy ML/Taste tables | adapter or ambiguity classification; no speculative backfill |

## 4. Memory and Evidence contract

The canonical contract defines 22 Event types across eight classes and eight bounded retention classes. Every Event carries identity, three timestamps, Decision/session/Spot references, minimized Moment/Spot Evidence, provenance, consent, idempotency, supersession, version and hash. Exact replay is free; conflicting replay fails.

Full contract: [N2_MEMORY_EVENT_CONTRACT.md](./N2_MEMORY_EVENT_CONTRACT.md).

## 5. User Intelligence graph and Taste integration

The graph links User, scoped Taste Concepts, Place Types, Contexts, Patterns, Memory Evidence and Outcomes. It reuses `buildUserTasteMap` through an explicit Memory-to-Taste adapter. The Wave-3B.1 source and contract freeze remain byte-for-byte unchanged and validate successfully.

`impression ≠ preference`, `tap ≠ strong preference`, `not there ≠ dislike`, repeated same-Spot activity does not create independence, and missing consent is no Evidence.

Full schema: [N2_USER_INTELLIGENCE_SCHEMA.md](./N2_USER_INTELLIGENCE_SCHEMA.md).

## 6. Behavioral/Occasion Memory

One-off Moments remain history but do not become Patterns. Repeated minimized signatures need independent sessions, independent Spots, Outcome support and time span. Sparse signatures remain `UNKNOWN`. Contradictions are preserved for future Context interpretation.

## 7. Confidence, timeline and drift

Pattern Confidence combines signal quality, session/Spot independence, time span, Outcome support, consistency and Recency. Taste Confidence/decay/drift remain owned by Wave-3B.1. The combined timeline reconstructs Memory, derived beliefs and known Pattern transitions without turning the profile into a black box.

## 8. Moment-history and cross-city boundaries

N2 stores only an allowlisted minimized post-Decision Moment signature; N3 will own the full temporary Moment. City is not embedded in global User truth. The acceptance artifact proves identical Taste hashes for the same Basel history when queried in Basel and Copenhagen with no Copenhagen visits.

## 9. Consent, privacy, retention and deletion

- ingestion requires active `personalized_recommendations` consent;
- raw Memory and derived state are distinct access domains;
- raw Memory is service-only and RLS-protected;
- withdrawal purges Memory, Patterns, Intelligence state and Memory-derived Taste state;
- profile/account erasure invokes the same purge and auth deletion also cascades;
- retention expiry invalidates derived state for rebuild;
- no fingerprints, external tracking, contacts, Wi-Fi, precise location history, sensitive inference or Trust evidence is accepted;
- missing consent is neutral.

The migration registers retention but schedules no Production job.

## 10. Security and adversarial validation

Tests cover replay, duplicate IDs, conflicting idempotency, out-of-order arrival, append-only correction, event flooding, same-Spot gaming, contradictory Evidence, forbidden client learning fields, cross-user batch/correction, consent bypass, withdrawal residue, malformed Moment signatures, future/stale Events and version mismatch. Database RLS denies raw Memory reads and all derived-state client writes.

## 11. Performance

The deterministic in-process synthetic test built and queried 1,000 and 10,000 Event histories. The 10,000-Event run completed in approximately `0.52 s` on the local test machine. Indexed database paths cover User/time, class/time, session, supersession, expiry and Pattern Confidence. This is an architectural smoke test, not a Production latency claim.

## 12. Version and freeze identities

| Identity | Value |
|---|---|
| Memory Event Contract | `backyrd-memory-event-contract-v1` |
| Evidence Mapping | `backyrd-memory-evidence-mapping-v1` |
| User Intelligence Schema | `backyrd-user-intelligence-schema-v1` |
| Behavioral Pattern Contract | `backyrd-behavioral-pattern-contract-v1` |
| Confidence Contract | `backyrd-user-intelligence-confidence-v1` |
| Retention Contract | `backyrd-memory-retention-v1` |
| Memory Contract hash | `0294d85141e4ee40545591d6ec68372b0558762f35b9b9a12e521b35ebe84b9d` |
| Evidence Mapping hash | `aba112b2add654dc19e1134b24523f5de5aa41cc425b7ffbb6f62bf0f25aff9d` |
| Retention hash | `8f048679d049ebb2283b5994896b9e2f2ac9fcf8cc252732e39af63c83a395bf` |
| N2 acceptance result hash | `227eafae0d0214c8409dc0a942abeaf8db44748952649dfb2174ecce6c108ea7` |
| protected Taste contract hash | `d7ec1a228d0c56641855bc051f3bf1715f539349e551be23ea2a7ba979f5fc46` |

Source/migration hashes live in `decision-lab/config/n2-memory-user-intelligence-v1.freeze.json` and fail closed on drift.

## 13. Acceptance and non-regression

- isolated N2 tests: Memory, learning, Patterns, lifecycle, cross-city, privacy, adversarial, 1k/10k histories;
- sealed deterministic acceptance artifact;
- N2 freeze verification;
- Wave-3B.1 Taste Engine freeze unchanged;
- additive SQL acceptance for ingestion, replay, immutability, consent, RLS, cross-user isolation and withdrawal purge;
- full Decision Lab and repository CI are required before PR handoff.

N2 changes no Product/Distribution eligibility, hard constraints, retrieval, ranking, Trust/Safety or Decision Quality contracts.

## 14. Remaining limitations

- Product sources are registered but not yet wired; no legacy backfill was guessed.
- Review/visit semantics require source-specific qualification before ingestion.
- Pattern thresholds are conservative v1 safeguards and need later scientific outcome validation.
- no Production retention scheduler or rebuild worker is enabled;
- N3 CurrentMoment and N5 Relevant User Projection remain separate future systems;
- local performance does not establish Production scale.

## 15. Readiness and verdicts

N3 can build a temporary `CurrentMoment` against the minimized post-Decision boundary. N5 can query scoped beliefs, Patterns, contradictions and confidence, but must still implement relevance selection and privacy/token budgeting.

**N2 MEMORY & USER INTELLIGENCE — PASS**

**CANONICAL USER MEMORY — READY**

**USER INTELLIGENCE GRAPH — READY**

**WAVE-3B.1 TASTE ENGINE INTEGRATION — PASS**

**BEHAVIORAL / OCCASION MEMORY — READY**

**CROSS-CITY PORTABILITY — PASS**

**PRIVACY & USER CONTROL — PASS**

**SCIENTIFIC VALIDITY — PASS**

**N3 MOMENT INTELLIGENCE — READY**

**N5 RELEVANT USER PROJECTION FOUNDATION — READY**

**PRODUCTION — UNCHANGED**
