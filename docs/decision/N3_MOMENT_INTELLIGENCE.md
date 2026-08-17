# Backyrd Decision North Star — N3 Moment Intelligence

Status: **PASS — LAB/CODE VALIDATED, NOT PRODUCT-WIRED**

Date: 2026-08-17

Branch: `codex/decision-n3-moment-intelligence`

## 1. Executive summary

N3 implements the first immutable, confidence-aware `CurrentMoment`. It combines the current request, explicit guided input, safe current facts and conservative read-only N2 Pattern hypotheses while preserving provenance and `UNKNOWN` per field.

N3 performs no retrieval, ranking, Spot scoring, User learning or LLM call. It writes nothing to N2. Only a separate, minimized post-Decision signature is prepared for a future legitimate N2 Memory event.

## 2. Architecture

`Current Request + Guided Input + Consented Current Facts + Read-only N2 Patterns → Evidence Envelope → Authority Resolution → Current Desire Projection + Confidence → CurrentMoment`

Every field has a value, Confidence, source class, provenance, timestamp, freshness and reason code. The Flight Recorder retains accepted and superseded Evidence, contradictions, unknown fields and Memory-supported hypotheses.

## 3. Evidence hierarchy and authority

The frozen order is:

1. `EXPLICIT_CURRENT_INPUT`;
2. `OBSERVED_CURRENT_FACT`;
3. `INFERRED_FROM_CURRENT_REQUEST`;
4. `MEMORY_SUPPORTED_HYPOTHESIS`;
5. `UNKNOWN`.

Guided explicit input is the most precise representation of a current statement and wins a contradictory textual interpretation. Objective clock/location facts stay facts; they are not rewritten by a metaphorical or emotional request. Explicit Hard Constraints remain unchanged upstream authority.

Memory is never treated as current truth. A Pattern must be `KNOWN`, current/aging rather than stale, have Confidence at least `0.55`, match at least two currently known anchors and contradict none. Its field Confidence is capped at `0.74`.

## 4. Current Moment and desire projection

The v1 schema contains 21 bounded dimensions covering social Context, Occasion, activity, vibe, energy, budget, spontaneity, planning tolerance, duration, distance, environment, orientation, novelty, social intensity, city and local calendar/time facts plus explicit constraints and other current needs.

Only justified fields are emitted. Unsupported fields occur in `unknownFields`; N3 does not fill them with defaults. `desireProjection` excludes objective facts and carries only current needs that downstream systems may consider.

Full schema: [N3_MOMENT_SCHEMA.md](./N3_MOMENT_SCHEMA.md).

## 5. Confidence and Buddy uncertainty

Dimension Confidence describes support for one field. Overall Moment Confidence is a weighted sufficiency score over core current dimensions with a contradiction penalty, not an average over every possible field and not model self-confidence.

- `HIGH`: enough justified core evidence for a confident direction;
- `PARTIAL`: useful direction with relevant unknowns;
- `LOW`: sparse or vague Moment; downstream systems must stay close to explicit input.

Machine reason codes prepare N7 communication without implementing final copy.

## 6. Time, location and cross-city

Time derives from the Decision timestamp in the explicit IANA timezone. Tests cover weekday/weekend, four dayparts and a UTC-to-local midnight transition. No global UTC daypart assumption is used.

Location is city-only. Device-derived city requires active location consent; an explicitly selected city is direct User input. Precise coordinates and movement trails are neither accepted nor persisted. A Basel N2 Pattern remains usable in Copenhagen when its current anchors match; city changes the Moment fact, not User identity.

## 7. N2 boundary

N2 remains the sole Memory/User Intelligence owner. N3 consumes only version-valid, `KNOWN` Behavioral Patterns read-only. It does not mutate Taste, Pattern Confidence, Evidence weights or lifecycle state.

After a Decision, `buildMomentHistorySignature` can prepare only N2's allowlisted fields: audience, daypart, calendar, occasion, Place Type proxy, friction and distance willingness. It excludes raw request, city, vibe, precise location and arbitrary Context. Actual persistence remains a future Product/Outcome action under N2 consent and purpose contracts.

## 8. N5 and N6 boundaries

N5 receives the immutable `CurrentMoment` with Confidence and provenance and must decide which separate N2 User Intelligence is relevant. N3 does not produce that projection.

N6 may receive a compact serialization containing only field value, Confidence and source class plus Moment-level uncertainty. It receives no raw History and N3 makes no LLM call.

## 9. Privacy and security

- consent-aware device location and N2 Pattern use;
- no Cross-User query or Memory access path introduced;
- no database or persistent temporary-Moment table added;
- forbidden Runtime fields include Latent Truth, oracle/evaluation labels, future Outcomes, private Trust/moderation data, fingerprints, contacts and sensitive demographics;
- malformed schema, timezone, Pattern version and unsupported guided inputs fail closed;
- prompt-like text is data and cannot alter the deterministic parser.

## 10. Validation result

The contract was frozen before the official run. Three deterministic seeds each cover ten canonical Moment scenarios plus dedicated counterfactual/adversarial arms.

| Metric | Result | Gate |
|---|---:|---:|
| Explicit Intent Preservation | `1.0000` | `1.0000` |
| Moment Dimension Accuracy | `1.0000` | `>= 0.92` |
| False Inference Rate | `0.0000` | `<= 0.08` |
| UNKNOWN Correctness | `1.0000` | `>= 0.90` |
| Provenance Correctness | `1.0000` | `1.0000` |
| Confidence Brier | `0.0188` | `<= 0.08` |

All additional gates pass: History override safety, same User/different Moment, different User/same explicit Moment, cross-city, timezone, social Context, privacy/consent, N2 boundary, deterministic replay and fail-closed adversarial behavior.

These are synthetic contract results, not a claim of Production language coverage or real-world Moment accuracy. Full contract: [N3_MOMENT_VALIDATION_CONTRACT.md](./N3_MOMENT_VALIDATION_CONTRACT.md).

## 11. Measurement-integrity finding

Development testing found that a Pattern with a contradictory audience could originally qualify through two matching time anchors. Before freeze and official execution, N3 was hardened so any contradiction among comparable current anchors disqualifies the Pattern. No official result from the earlier development run was retained.

## 12. Version and freeze identities

| Identity | Hash |
|---|---|
| Moment Contract | `291a36edf3d3608f534879c2a4914c82c43725af779406296c8c3a2d40eb46e9` |
| Moment Schema | `5d1dd5d31ac8d4b15a10db46978c751d467dd13ced3b6d1954908b7115ef6136` |
| Inference Contract | `ec986855c9c73c49e251ead280c345a61bf593ade03ff6af6049f6d1adf37d44` |
| Provenance Contract | `3b5119db5cdaf5e4fc42aa2cc6fdb95cc42dc4ef319eadb3f4568b4ce355eff5` |
| Confidence Contract | `81cb03b2b7f7617bef1ce891c1a304070c60599b78e2bd8c6b740c522f80a9c6` |
| History Signature | `9c73d5005df88f4a3618b187a5216ad5ea9c96c396a5f37292e5d525aa64537a` |
| Validation Contract file | `70b29868e6a4ff3918d859e9c78e4f9806d16b204cb5dfdfcd4ff3c96eb52d03` |
| Official Result | `ac3d5c59ff2286e098e29e2797cf141c85738640e278faf37d9eb808feeaf312` |
| Protected N2 Memory Contract | `0294d85141e4ee40545591d6ec68372b0558762f35b9b9a12e521b35ebe84b9d` |

Source and test hashes live in `decision-lab/config/n3-moment-intelligence-v1.freeze.json`.

## 13. Remaining limitations

- deterministic v1 language coverage is intentionally bounded; unsupported nuance remains `UNKNOWN`;
- no clarification dialogue or probabilistic/AI parser is implemented;
- overall Confidence is contract-calibrated only on synthetic N3 cases;
- no Product event adapter invokes N3 yet;
- city-level location and timezone must be supplied by a legitimate Product context;
- N4 must provide compatible Spot Intelligence before end-to-end Moment fit can be evaluated;
- N5 must independently select relevant User Intelligence.

## 14. Readiness and verdicts

**N3 MOMENT INTELLIGENCE — PASS**

**CURRENT MOMENT MODEL — READY**

**EXPLICIT INTENT AUTHORITY — PASS**

**MOMENT CONFIDENCE — PASS**

**MEMORY-SUPPORTED MOMENT INTELLIGENCE — PASS**

**SAME USER / DIFFERENT MOMENT — PASS**

**CROSS-CITY MOMENT INTELLIGENCE — PASS**

**PRIVACY & PROVENANCE — PASS**

**SCIENTIFIC VALIDITY — PASS**

**N4 SPOT INTELLIGENCE — READY**

**N5 RELEVANT USER PROJECTION — READY**

**PRODUCTION — UNCHANGED**
