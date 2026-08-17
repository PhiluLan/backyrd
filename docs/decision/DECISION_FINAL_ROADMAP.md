# Backyrd Decision Final Roadmap

Status: **N1 ROADMAP — IMPLEMENTATION NOT STARTED**

Version: `backyrd-decision-final-roadmap-v1`

Parent: `backyrd-decision-north-star-constitution-v1`

## 1. Program sequence

The dependency-safe sequence remains:

`N1 Constitution → N2 Memory/User Intelligence → N3 Moment Intelligence → N4 Spot Intelligence → N5 Relevant User Projection → N6 AI Decision Buddy → N7 Confidence/Explanation → N8 Outcome Learning → N9 Life Simulation/Cross-City/Closed Beta Gate`.

No phase is a Production rollout by default. Each phase produces a separately reviewed candidate and preserves historical FAIL/NOT PROMOTED evidence.

## 2. N1 — Decision North Star Constitution

**Objective:** establish the final product promise, architecture boundaries and binding roadmap.

**Scope:** Constitution, six-system architecture, system contracts, existing-component disposition, privacy/Owner boundaries and N2–N9 definitions.

**Dependencies:** merged D0–D4 and Wave 1–4 evidence on current `main`.

**Reuse:** D2/D3 scientific contracts, D4 architecture, D4.2 boundary review and Flight Recorder principles.

**Acceptance:** documents are internally consistent; no historical verdict changes; runtime diff is empty; privacy and pay-to-rank prohibitions are explicit.

**Promotion gate:** architecture review approves all N1 verdicts.

**Non-goals:** Engine, schema, client, Production or experiment changes.

## 3. N2 — Backyrd Memory & User Intelligence Graph

**Objective:** create one consented, auditable evidence graph connecting Product events, Outcomes and the validated User Intelligence state.

**Scope:** versioned Memory event envelope; event-to-evidence ingestion; raw/derived separation; User Intelligence graph; Global/Place-Type/Contextual Taste integration; Behavioral/Occasion patterns; Confidence, Recency, Drift, replay, deletion and observability.

**Dependencies:** N1 contracts; current consent/data-rights contracts; Wave-3B.1 Taste Engine freeze.

**Existing components reused:** Wave-3B.1 Taste Space/learning, existing Product events, consent helpers, RLS/service boundaries and Decision Lab lifecycle simulation.

**New contracts:** `MemoryEvent`, `EvidenceEnvelope`, `UserIntelligenceProfile`, pattern taxonomy, replay/snapshot, retention/deletion and access contracts.

**Required data:** only inventoried First-Party request, exposure, interaction, deliberate intent, visit and explicit Outcome events with provenance. No new collection until purpose review passes.

**Privacy implications:** highest. Each event class needs consent/lawful basis, minimization, retention, export, correction and deletion. Missing consent fails neutral. Additive migrations only, if approved.

**Acceptance tests:** idempotent ingestion/replay; raw/derived consistency; independent evidence; consent grant/withdrawal; account deletion; own-user RLS; service-write isolation; correction rebuild; sparse/noisy/contradictory histories; city-independent profile; no Latent Truth leakage.

**Scientific validation:** lifecycle and adversarial simulations extend Wave 3B.1 without changing its historical contract; validate pattern accuracy, Confidence calibration, false-pattern rate, drift and observability limits.

**Promotion gates:** all privacy/RLS gates; deterministic replay; Wave-3B.1 non-regression; bounded false learning; complete evidence lineage; no unspecified event class; no Production write.

**Explicit non-goals:** Decision ranking, AI calls, new retrieval, final explanations or Outcome-based online learning.

## 4. N3 — Moment Intelligence Engine

**Objective:** resolve what the User wants now into one immutable, confidence-aware `CurrentMoment`.

**Scope:** Current Request, time/location policy, social situation, occasion, energy, budget, spontaneity, activity, duration, distance and mood; conflict resolution; clarification state; current-to-history separation.

**Dependencies:** N1; N2 for read-only pattern context, not for authority; promoted Wave-1 Intent/Hard Constraints.

**Existing components reused:** Structured Intent, Constraint Compiler, Decision Context and counterfactual Lab arms.

**New contracts:** `CurrentMoment`, field evidence/confidence/freshness, conflict and clarification, temporary retention and Moment-to-Memory Outcome boundary.

**Required data:** explicit request/guided inputs, current Product context and optional legitimate context signals. No hidden context inference.

**Privacy implications:** current location/time and social context are minimized and temporary; durable storage requires a separate legitimate Outcome purpose.

**Acceptance tests:** negation and hard/soft separation; same request/different context; ambiguous request; missing context; current Intent vs History; timezone/city; temporary-state deletion; deterministic and schema-validated AI parsing fallback.

**Scientific validation:** one-variable counterfactuals, multilingual/adversarial phrasing, Moment Understanding Confidence calibration and no History override.

**Promotion gates:** Hard/Product/Distribution integrity; field coverage; Intent authority; bounded ambiguity/clarification; privacy/latency/cost; locked holdout robustness.

**Explicit non-goals:** User learning, Spot enrichment, Candidate ranking or final UX copy.

## 5. N4 — Spot Intelligence Platform + Owner Intelligence Contract

**Objective:** represent what a Spot is and when it fits, in a language compatible with User and Moment Intelligence.

**Scope:** versioned Spot concept model; provenance/confidence/freshness; canonical, derived, community/Outcome and Owner claim sources; contradiction resolution; completeness; city portability; Owner authoring boundary.

**Dependencies:** N1 and N3 concept needs; existing Spot/Product/Distribution contracts.

**Existing components reused:** Wave-2 Spot Intelligence contract, structured/semantic documents, canonical Spot data, approved Owner workflows and Flight Recorder source evidence.

**New contracts:** `SpotIntelligenceClaim`, provenance/conflict policy, Owner claim schema, verification/freshness, completeness and pay-to-be-understood feature-lineage guard.

**Required data:** categories, descriptions, moods/vibes, occasion fit, price, hours, location and only additional attributes with a defined Decision purpose and reliable provenance.

**Privacy implications:** aggregate community evidence requires consent, minimum aggregation and anti-reidentification controls. Private Trust evidence remains excluded.

**Acceptance tests:** `UNKNOWN` semantics; conflicting claims; stale claim; Owner vs Outcome evidence; equivalent paid/free claim treatment; payment feature absence; sparse Spot degradation; source provenance; city-specific data isolation.

**Scientific validation:** concept coverage and inter-source agreement; retrieval/fit usefulness separated from Ground Truth; blinded Owner-status counterfactuals; Spot-data vs Engine failure decomposition.

**Promotion gates:** no direct paid rank effect; claim auditability; provenance coverage; truthfulness/moderation workflow; sparse-data safety; Product/Distribution integrity; acceptable owner and system latency.

**Explicit non-goals:** Owner ranking boost, advertising priority, final Decision model or Production enrichment at scale.

## 6. N5 — Relevant User Projection

**Objective:** select the smallest accurate, privacy-safe subset of User Intelligence relevant to one CurrentMoment.

**Scope:** relevance selection across Global, Place-Type, Contextual and Occasion beliefs; Confidence/Recency/Drift; conflict suppression; token/privacy budget; explainable inclusion/exclusion.

**Dependencies:** promoted N2, N3 and the N4 concept language.

**Existing components reused:** Wave-3B.1 hierarchical projections, Current Intent authority and Wave-3C.1 failure decomposition as negative evidence.

**New contracts:** `RelevantUserProjection`, projection policy/version/hash, inclusion reasons, token budget and city-portability semantics.

**Required data:** derived User Intelligence only; no raw History in Runtime projection.

**Privacy implications:** strict minimization, purpose-limited cache, no unrelated contexts, no sensitive inference and user-visible/resettable source beliefs.

**Acceptance tests:** Family/Friends/Date; fast coffee vs special occasion; same Moment/different Users; low-confidence unfamiliar activity; opposing History; city transfer; token ceiling; deterministic replay; no raw event or Latent Truth leakage.

**Scientific validation:** projection relevance precision/recall against evaluator-only synthetic truth; false-relevance and omitted-relevant-knowledge rates; Confidence calibration; causally isolated projection treatments.

**Promotion gates:** Current Intent authority; contextual differentiation; Low Confidence neutrality; privacy/token limits; multi-seed/holdout robustness; no Wave-3B.1 regression.

**Explicit non-goals:** ranking Candidates, prompt optimization or learning new User beliefs.

## 7. N6 — AI Decision Buddy

**Objective:** determine whether a replaceable AI model can rank already eligible Candidates better for a User and Moment than canonical controls.

**Scope:** compact input contract; one frozen model/config per experiment; structured output; deterministic validation/fallback; budget, cache, latency and failure controls; ACTUAL/NEUTRAL/OPPOSING; model portability.

**Dependencies:** promoted N3–N5; eligible bounded Candidate path; N1 AI boundary. D4.3/D4.3.1 may inform design only after their evidence is merged and reconciled.

**Existing components reused:** D4.3 Lab harness where valid, D2.2 treatments, Decision Lab, Flight Recorder, Wave-4 control and hard eligibility validators.

**New contracts:** AI input/output, reason-code allowlist, Candidate budget, model/prompt freeze, deterministic fallback, cost cap and AI validation/promotion contract.

**Required data:** CurrentMoment, Relevant User Projection, compact Candidate Spot Intelligence, evidence Confidence and Candidate IDs. No raw History, PII, private Trust Evidence, Latent Truth or evaluation labels.

**Privacy implications:** provider data minimization, retention/training settings, regional/legal review, secret isolation, no browser/client keys and documented deletion/caching.

**Acceptance tests:** unknown/duplicate/missing Candidate IDs; invalid schema; timeout; provider outage; budget stop; opposing History; Cold/Mature; same User/different Moment; same Moment/different User; fallback equivalence; provider swap.

**Scientific validation:** prospective Dry/Smoke/Pilot/Full stages; locked holdout only after freeze; conditional ranking and end-to-end metrics; cost/latency; multiple seeds; no cherry-picking or prompt tuning on holdout.

**Promotion gates:** positive robust quality lift; bounded Harm; Context/User differentiation; Intent authority; zero integrity violations; complete failure attribution; acceptable cost/latency; fallback readiness; Scientific Validity PASS.

**Explicit non-goals:** Production integration, autonomous Candidate generation, eligibility changes, online learning or provider lock-in.

## 8. N7 — Confidence & Relational Explanation

**Objective:** turn real evidence sufficiency into honest Decision behaviour and explain why this Spot fits this User now.

**Scope:** five-layer Confidence composition; Decision Confidence calibration; clarification/degradation policy; evidence-bound reason graph; relational explanation renderer.

**Dependencies:** promoted N3–N6 and complete Flight Recorder evidence.

**Existing components reused:** existing confidence findings, D3 explanation alignment arm, reason codes and Flight Recorder.

**New contracts:** Decision Confidence, evidence sufficiency, claim allowlist, `why_for_request/you/now/uncertainty`, fallback/clarification and explanation validation.

**Required data:** only evidence already used by the Decision plus safe provenance summaries.

**Privacy implications:** explanations minimize personal detail, never expose private History/Trust evidence and allow “we don't know yet.”

**Acceptance tests:** high/low User knowledge; ambiguous Moment; sparse/conflicting Spot data; unsupported claim rejection; explanation-rank alignment; same evidence produces stable reason codes; user reset/withdrawal.

**Scientific validation:** Confidence calibration, selective accuracy, explanation support/alignment, human comprehension and false-certainty/red-team tests.

**Promotion gates:** supported explanation rate and calibration floors frozen prospectively; zero fabricated claims; safe degradation; privacy review; no Decision-quality regression.

**Explicit non-goals:** marketing copy optimization, engagement persuasion or new learning signals.

## 9. N8 — Outcome Learning Loop

**Objective:** learn from consented real-world Outcomes without converting recommendations into self-reinforcing bias.

**Scope:** Decision-to-Outcome linkage; evidence hierarchy; exposure/position propensity; updates to User and Spot Intelligence; correction/replay; exploration logging; monitoring and rollback.

**Dependencies:** N2 evidence graph, N4 Spot claims, N6 Decisions, N7 Confidence/explanation and approved Product feedback surfaces.

**Existing components reused:** Product events, Taste evidence hierarchy, reviews/Moments, Decision Flight Recorder and D2.2 causal treatments.

**New contracts:** `DecisionOutcome`, attribution window, propensity/exposure, satisfaction/negative Outcome, learning eligibility, debiasing, replay and online-safety/shadow contract.

**Required data:** shown rank, deliberate choice/intent, verified visit where available, explicit feedback and contextual Outcome—never clicks alone as truth.

**Privacy implications:** explicit purpose/consent, bounded linkage windows, retention/deletion, user correction and aggregate safeguards for Spot learning.

**Acceptance tests:** non-action vs dislike; position bias; repeat exposure; delayed Outcome; contradictory feedback; deletion/replay; gaming; exploration; consent withdrawal; false Owner/community claims.

**Scientific validation:** offline counterfactual simulation, shadow learning with no serving effect, bias audits, calibration against explicit Outcomes and cohort fairness/harm analysis.

**Promotion gates:** no online serving mutation before shadow gates; bounded false learning; causal/propensity checks; rollback/rebuild; privacy and integrity PASS; human review for material Spot consequences.

**Explicit non-goals:** engagement optimization, irreversible profiles, automatic moderation or pay-to-rank.

## 10. N9 — End-to-End Synthetic Life Simulation, Cross-City Validation & Basel Closed-Beta Gate

**Objective:** determine whether the complete Decision Buddy is scientifically, operationally and ethically ready for a bounded Basel Closed Beta.

**Scope:** multi-month/year synthetic lifecycles; city moves/travel; Cold/Mature/Power; repeated moments; drift; sparse cities/Spots; failure/recovery; end-to-end Decision, Confidence, explanation and learning; Beta protocol.

**Dependencies:** all prior phases promoted for their stated responsibilities; historical limitations remain tracked.

**Existing components reused:** Decision Lab, D2/D3 contracts, Golden Scenarios, treatment twins, lifecycle simulations, Failure Decomposition and promotion governance.

**New contracts:** Life Simulation, cross-city treatments, User×Moment Plausibility, catastrophic mismatch, external-validity/Beta protocol, rollback and closed-beta promotion contract.

**Required data:** synthetic truth for internal evaluation; only consented, minimized Beta evidence under a separately approved protocol.

**Privacy implications:** complete DPIA/privacy review, participant consent, user controls, data-rights exercise, retention/deletion rehearsal and no Production-wide rollout.

**Acceptance tests:** familiar/new city; same User across cities; repeated Family/Friends/Date moments; wrong/ambiguous Intent; sparse Spot evidence; provider outage; learning drift; explanation honesty; account deletion; pay-status counterfactual; full rollback.

**Scientific validation:** frozen multi-seed/holdout Lab contract followed by a prospectively registered Closed-Beta protocol. Synthetic and Beta evidence remain separately labeled; neither is used to rewrite prior thresholds.

**Promotion gates:** zero integrity regressions; robust Decision-quality and plausibility gains; bounded catastrophic mismatch/Harm by cohort; city portability; Confidence/explanation calibration; cost/latency/reliability; privacy/security/Trust review; operational rollback; explicit human go/no-go.

**Explicit non-goals:** general availability, automated threshold shopping, Basel-only overfitting or treating Beta engagement as satisfaction.

## 11. Cross-phase gates

Every phase must prove:

- Product, Distribution and Hard User Eligibility remain authoritative;
- current explicit Intent remains authoritative;
- `UNKNOWN` is not silently converted to negative or certain;
- no Latent Truth or evaluation label enters Runtime;
- contracts, runners and results are versioned and reproducible;
- failures are attributed to the responsible layer;
- privacy, consent, deletion, cost, latency and rollback are first-class gates;
- failed mandatory gates are not compensated by a composite score;
- Production remains unchanged absent a separate explicit rollout authorization.

## 12. Biggest remaining unknowns and risks

1. Whether current First-Party Product evidence is sufficient to infer *why* superficially similar Users choose the same Spot.
2. Whether Moment fields can be resolved accurately without excessive friction or privacy cost.
3. Whether Basel and future-city Spot Intelligence can reach reliable coverage without Owner/community claim bias.
4. Whether an AI Decision Buddy provides robust lift after deterministic validation, at acceptable cost and latency.
5. How to calibrate Decision Confidence to real satisfaction rather than synthetic utility.
6. How to debias Outcomes from exposure, position, selection and recommendation feedback loops.
7. How well synthetic User×Moment plausibility predicts real-world trust.
8. How to provide useful user controls over Memory and corrections without making the product burdensome.

## 13. N2 readiness

N2 is **READY FOR A SEPARATE IMPLEMENTATION SPRINT** because the Memory purpose, allowed/prohibited evidence, User Intelligence responsibility, privacy controls and acceptance boundary are defined. N2 is not authorized to rank Candidates, call an AI model or change Production.

## Final verdicts

- **DECISION NORTH STAR CONSTITUTION — PASS**
- **FINAL DECISION ARCHITECTURE — DEFINED**
- **OWNER PREMIUM RANKING BOUNDARY — DEFINED**
- **USER MEMORY & PRIVACY BOUNDARY — DEFINED**
- **N2 MEMORY & USER INTELLIGENCE — READY**
- **PRODUCTION — UNCHANGED**
