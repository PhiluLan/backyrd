# Backyrd Decision System Contracts

Status: **N1 ARCHITECTURE CONTRACTS — NO IMPLEMENTATION**

Version: `backyrd-decision-system-contracts-v1`

Parent: `backyrd-decision-north-star-constitution-v1`

## 1. Purpose

This document defines the boundaries between the six North-Star systems. It is intentionally implementation-neutral. N2–N9 must version concrete schemas and freezes beneath these boundaries without silently changing their meaning.

## 2. Shared evidence envelope

Every evidence-bearing contract must support:

- stable Evidence ID and subject (`user`, `moment`, `spot`, `decision`, `outcome`);
- event/claim type and schema version;
- occurred/observed/ingested time and freshness;
- source family and provenance;
- consent purpose and collection basis;
- signal direction, strength and Signal Confidence;
- applicable scope (Global, Place Type, Context, city or Decision);
- exposure/position/propensity when learning from recommendations;
- supersession, correction and deletion state;
- no raw secret, private Trust Evidence or Latent Truth.

Evidence is immutable; corrections append a superseding record. Derived state is rebuildable from eligible Evidence or a fully versioned consistent snapshot.

## 3. System boundary matrix

| System | Authoritative input | Output | Must not decide |
|---|---|---|---|
| Memory | consented First-Party events and Outcomes | auditable Evidence ledger | preference, relevance, eligibility or rank |
| User Intelligence | eligible Memory Evidence | confidence-aware User beliefs | current Intent, eligibility or final rank |
| Moment Intelligence | Current Request and legitimate current Context | immutable `CurrentMoment` | durable User identity or long-term Taste |
| Spot Intelligence | canonical Spot facts and provenance-bearing claims | confidence-aware Spot representation | eligibility policy or paid rank |
| Relevant User Projection | CurrentMoment + User Intelligence | minimal relevant User evidence | Candidate eligibility or final rank |
| AI Decision Buddy | eligible Candidates + Moment + Projection + Spot Intelligence | validated ordering, confidence and reason codes | Candidate creation, eligibility or learning writes |
| Outcome Learning | exposure-aware Decision and subsequent legitimate Outcomes | weighted learning Evidence | automatic proof of satisfaction or permanent preference |

## 4. Memory event classes

| Class | Examples | Default learning interpretation |
|---|---|---|
| Request | structured current request and explicit constraints | Moment evidence; not automatically durable Taste |
| Exposure | shown Candidate, rank, source and propensity | required debiasing context; no positive preference alone |
| Weak interaction | open/tap | weak, bounded evidence only with eligible consent |
| Deliberate intent | save, navigation, reservation intent | stronger but not proof of visit or satisfaction |
| Outcome | verified visit, completed reservation where legitimately available | strong behavioral evidence, still context-dependent |
| Explicit feedback | review, Moment, mood feedback, like/dislike | strongest declared evidence within its stated scope |
| Onboarding | explicit initial preferences | bounded initial evidence, correctable by later Outcomes |

`not there`, missing interaction and missing consent are not dislikes. Replays are idempotent. Repeated same-Spot/same-session evidence cannot manufacture independence.

## 5. User Intelligence contract

Each belief contains concept, signed affinity, positive and negative support, Confidence, independent Spot/session counts, first/last evidence, Recency/decay class, Drift state, source families, scope, engine version and evidence summary.

The hierarchy is:

`Global belief → Place-Type specialization → matching Context/Occasion adjustment`.

Narrower evidence may specialize a broader belief when sufficiently supported. It does not blindly add to or duplicate the same evidence. Sparse scopes fall back to broader scopes. `UNKNOWN` is a valid state.

## 6. CurrentMoment contract

`CurrentMoment` contains:

- structured current goal and activity sequence;
- hard requirements/exclusions with evidence;
- soft preferences;
- time/timezone and location/city/radius policy;
- social context, group size and occasion;
- energy, budget, duration, spontaneity and distance willingness;
- mood/vibe and other legitimate current signals;
- field-level source, Confidence, freshness and conflict state;
- `needsClarification` and version.

It is immutable for one Decision. Explicit guided/current text evidence outranks inferred fields and History. Low-confidence hard-looking inference remains soft or asks for clarification.

## 7. Spot Intelligence contract

Spot claims use the same controlled concept language as User and Moment projections and include value, Confidence, provenance, freshness and contradiction state.

Source families are distinct:

- canonical Product facts;
- verified operational data;
- Backyrd-derived Intelligence;
- consented aggregate Outcome/community Evidence;
- Owner-provided claims.

Missing claims stay `UNKNOWN`. Owner Premium status is never included. A conflict resolver may prefer more reliable/fresher evidence, but preserves provenance and cannot convert a paid claim into truth.

## 8. Relevant User Projection contract

Input: `CurrentMoment`, versioned User Intelligence and a declared privacy/token budget.

Output:

- relevant concepts and scopes;
- affinity and User Knowledge Confidence;
- recency/drift/conflict indicators;
- compact supporting-evidence summaries;
- inclusion reason tied to Moment fields;
- excluded-scope summary without raw History;
- projection Confidence, version and content hash.

Required invariants:

- same inputs produce the same projection;
- unrelated History is absent;
- explicit Current Intent can suppress conflicting History influence without deleting the belief;
- Low Confidence attenuates rather than invents preference;
- city changes do not erase city-independent beliefs;
- Latent Truth and evaluation labels are structurally inaccessible.

## 9. AI Decision Buddy contract

The AI receives a frozen ordered Candidate set with canonical IDs, CurrentMoment, Relevant User Projection, compact Spot Intelligence and evidence Confidence. Its output is schema-validated and contains only input Candidate IDs, unique ranks, bounded fit/confidence and allowlisted reason codes.

Fail-closed validation rejects unknown IDs, duplicates, invalid schema, eligibility mismatch and unsupported reason codes. Timeout/error/invalid output invokes a deterministic non-AI fallback. AI cannot write Memory or learning state directly.

Model, prompt, candidate budget, temperature/reasoning, token/cost budget, cache semantics, retries, timeout and fallback are versioned. Any model comparison uses identical contracts and pre-registered evaluation.

## 10. Confidence composition

Confidence values are not interchangeable probabilities. Each retains meaning, calibration cohort and owner. Decision Confidence must expose:

- evidence sufficiency;
- Moment ambiguity;
- User knowledge sufficiency for the relevant dimensions;
- Spot-data completeness/conflict;
- agreement/separation among top Candidates;
- model/output validity.

Decision Confidence cannot exceed deterministic validity. An invalid output has no Decision Confidence and is discarded.

## 11. Explanation contract

Reason codes and claims map to Flight Recorder Evidence. The explanation renderer may transform supported claims into user language but cannot add new reasons. Required relation types are `why_for_request`, `why_for_you`, `why_now` and `uncertainty`.

When User evidence is insufficient, `why_for_you` is omitted or explicitly uncertain. Private Trust, moderation, raw History and Owner payment status never appear.

## 12. Outcome learning contract

Learning joins a Decision exposure to a later event only through a purpose-approved, auditable association. It records what was shown, rank/propensity, what was chosen, Outcome strength, context, delay and uncertainty.

It must distinguish:

- no observation;
- observed non-action;
- deliberate choice;
- visit/Outcome;
- explicit satisfaction/dissatisfaction.

Updates are idempotent, bounded, confidence-aware and reversible through replay after correction/deletion. Position bias, repeated exposure and recommendation-induced feedback are evaluated before promotion.

## 13. Privacy and access contract

Raw Memory, derived User Intelligence and model projections are separate access domains. Client reads are own-user and consent-gated where Product policy permits. Writes occur only through validated server contracts. Service role remains server-only.

Before N2 promotion, every event class requires purpose, consent/lawful basis, retention owner, deletion behavior, export representation and learning eligibility. No unspecified field may be persisted “for later.”

## 14. Flight Recorder contract

Every Decision must reconstruct:

- versions and hashes of all material contracts;
- CurrentMoment and confidence without unnecessary raw text;
- eligibility decisions and reasons;
- retrieval sources and Candidate identity;
- Relevant User Projection and inclusion reasons;
- Spot claims and provenance summaries;
- AI input hash, validated output and fallback state;
- rank, reason codes and Decision Confidence;
- failure attribution (`RETRIEVAL`, `USER_INTELLIGENCE`, `MOMENT`, `SPOT_DATA`, `DECISION`, `EXPLANATION`, `UNKNOWN`).

The Flight Recorder is an audit/evaluation record, not a new unrestricted analytics stream.
