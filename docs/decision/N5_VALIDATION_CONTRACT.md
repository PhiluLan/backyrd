# N5 Validation Contract v1

Status: **FROZEN BEFORE OFFICIAL RUN**

## Scientific boundary

The runtime N5 Engine sees only Current Intent, canonical N3 Current Moment and canonical N2 User Intelligence. Scenario relevance truth exists only in the evaluator. Candidate data, Ground Truth, evaluation labels and Latent Truth are prohibited runtime inputs. Missing mandatory arms fail closed. Thresholds may not change after result inspection.

## Coverage

- Seeds: `5001`, `5002`, `5003`
- 10 controlled scenarios/Seed, 30 total scenario arms
- Cohorts: Cold, Onboarding, Early, Mature, Long-Term
- 5 lifecycle arms/Seed, 15 total Cohort arms
- performance fixtures: 0, 1,000 and 10,000 Memory events

Scenario coverage includes same User/different Moment, different User/same Moment, explicit Intent conflict, matching Pattern, cross-city, first Culture request, broad multi-category request and a huge Mature profile.

## Promotion gates

| Gate | Threshold | Official |
|---|---:|---:|
| Relevant Knowledge Precision | >= 0.95 | 1.00 |
| Relevant Knowledge Recall | >= 0.90 | 1.00 |
| Irrelevant Knowledge Suppression | >= 0.95 | 1.00 |
| Current Intent Authority | 1.00 | 1.00 |
| Contextual Differentiation | 1.00 | 1.00 |
| Place-Type Scoping | 1.00 | 1.00 |
| Pattern Applicability | 1.00 | 1.00 |
| Confidence Preservation | 1.00 | 1.00 |
| Knowledge Sufficiency Calibration | >= 0.90 | 1.00 |
| Cross-City Portability | 1.00 | 1.00 |
| Projection Size Compliance | 1.00 | 1.00 |
| Privacy/Data Minimization | 1.00 | 1.00 |
| Provenance Integrity | 1.00 | 1.00 |
| Deterministic Replay | 1.00 | 1.00 |
| Lifecycle Cohort Coverage | 1.00 | 1.00 |

Performance gate: p95 `<= 20 ms`, serialization `<= 12,000 bytes`, token estimate `<= 3,000`.

## Measurement integrity note

`N5-MI-001` was detected before certification: the first runner revision declared lifecycle Cohorts but did not execute them as independent mandatory arms. Its unsealed output was deleted. The runner gained explicit fail-closed Cohort coverage, affected identities were re-frozen, and the complete official run restarted from the beginning. No N5 selection rule, validation threshold, scenario truth or protected N2/N3/N4 contract was changed to obtain a PASS.

## Official identity

- Validation Contract: `backyrd-relevant-user-projection-validation-v1`
- Validation Contract Hash: `38ec27456cc740cf4422a0d702b345658546a36d3b9c99e79bafae43c4111902`
- Official Result Hash: `c877dcc7b986823011ac2ec33612504f2539f8ef2dadcb7c6b5cd7de42ed1ac8`
- Scientific Validity: **PASS**
- Production: **UNCHANGED**
