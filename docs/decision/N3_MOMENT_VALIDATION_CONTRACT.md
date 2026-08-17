# N3 Moment Validation Contract v1

Status: **FROZEN BEFORE OFFICIAL RUN — PASS**

Version: `backyrd-moment-validation-contract-v1`

Contract hash: `40380a9b8d9c1ada6748a184b36660acf85a333a6f9d9c80ef55ea42e8301154`

## 1. Scientific boundary

The Runtime Engine receives request, guided current inputs, safe current Context and version-valid N2 Patterns only. Scenario truth is evaluator-only. No Latent Truth, expected field, evaluation utility or holdout result enters Runtime.

Engine source, validation source, tests, validation thresholds, N2 contract and Structured Intent source were frozen before the official run. Only the official Result hash was appended afterward.

## 2. Canonical scenarios

Three deterministic seeds each execute:

1. Family Sunday Afternoon;
2. Friends Friday Night;
3. Date Saturday Evening Low Budget;
4. Solo Tuesday Afterwork;
5. Spontaneous Tourist/New City;
6. Business Lunch;
7. Cold User/Vague Request;
8. Mature User/Recurring Context;
9. Explicit Request vs History Conflict;
10. Same User/Date Moment.

Separate arms cover same User/different Moment, different User/same explicit Moment, missing location consent, stale/wrong Pattern, cross-city portability, local midnight, malformed/schema-invalid input, prompt-like text, sensitive fields and deterministic replay.

## 3. Frozen gates

| Gate | Threshold |
|---|---:|
| Explicit Intent Preservation | `1.00` |
| Moment Dimension Accuracy | `>= 0.92` |
| False Inference Rate | `<= 0.08` |
| UNKNOWN Correctness | `>= 0.90` |
| Provenance Correctness | `1.00` |
| Confidence Brier | `<= 0.08` |
| History Override Safety | `1.00` |
| Same User / Different Moment | `1.00` |
| Different User / Same Explicit Moment | `1.00` |
| Cross-City, Time, Social Context | each `1.00` |
| Privacy/Consent, N2 Boundary, Replay | each `1.00` |

Missing required arms fail closed. Thresholds were not altered after the official result.

## 4. Official result

Every mandatory gate passed. Dimension Accuracy and Explicit Preservation were `1.00`, False Inference was `0.00`, UNKNOWN and Provenance correctness were `1.00`, and Confidence Brier was `0.0188`.

Result hash: `ac3d5c59ff2286e098e29e2797cf141c85738640e278faf37d9eb808feeaf312`.

The result certifies the bounded deterministic v1 contract on its synthetic scenarios. It does not establish Production language coverage, Product usefulness, Spot ranking quality or external validity.
