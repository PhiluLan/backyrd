# D3-A Failure Decomposition

## Failure budget

The evaluator emitted 141 primary failure records for 126 Decisions. Failures can co-occur, so these rows are not a Decision-rate denominator.

| Primary layer | Failure records | Mean eligible Top-1 utility loss | Interpretation |
|---|---:|---:|---|
| Retrieval | 118 | 0.2962 | Best eligible latent-utility Spot absent from V12 first pool |
| Constraint | 16 | 0.3514 | Category/exclusion hard rule violated |
| Opening hours | 5 | 0.2581 | Closed Spot returned for open-now |
| Ranking | 2 | 0.5103 | Best candidate retrieved but not near top |
| Unknown | 0 | — | No unattributed evaluator failure |

Retrieval is the dominant diagnosed loss layer by frequency. This result is structurally valid but semantic attribution is simulation-only because query embeddings were approximated. The evaluator's first-stage rule is deliberately strict: it classifies the best eligible Spot missing from V12 as retrieval loss even if another useful Spot is returned.

## D3-F-001

`21/126` Decisions (`16.67%`) violated at least one hard user constraint:

| Gate | Applicable | Failed | Rate |
|---|---:|---:|---:|
| Hard Category | 18 | 13 | 72.22% |
| Category Exclusion | 9 | 3 | 33.33% |
| Open Now | 6 | 5 | 83.33% |
| Product Eligibility | 126 | 0 | 0% |
| Distribution Eligibility | 126 | 0 | 0% |

Failures appeared in every seed and every split. This is a confirmed current Engine integrity defect and blocks Decision exposure despite the measurement itself being complete.

## Personalization and current intent

Across 18 controlled same-person treatments, mean ACTUAL-minus-NEUTRAL utility was `-0.00251`; median was `0`; `5/18` (`27.78%`) were harmful. Mature users were harmful in `2/3` Worlds (mean `-0.00247`), and Power users in `2/3` (mean `-0.02133`). Developing users showed small positive mean lift (`+0.00666`). These are low-N synthetic diagnostics, not real-user causal estimates.

Counterfactual relevance response was weak: mean Top-10 overlap `95.29%`, positive directional response `5/15` (`33.33%`), mean directional utility delta `-0.00330`. This supports a current-intent underreaction finding.

## Remix and memory

The 18 canonical Remix pairs produced only `1.78` new candidates on average. There were `112` repeated returned Spot occurrences after excluding the initial lists, mean set overlap was `62.86%`, and mean utility changed by `-0.01373`. No candidate starvation or fallback activation occurred. This is strong evidence that exclusions are not honored across the complete candidate path.

## Explanations

| Classification | Candidates | Share |
|---|---:|---:|
| Aligned | 13 | 1.03% |
| Partially aligned | 736 | 58.41% |
| Misleading | 121 | 9.60% |
| Unsupported | 390 | 30.95% |

Only `59.44%` were aligned or partially aligned, below the frozen `0.95` explanation-support floor. Classification uses deterministic current copy-to-flight-recorder evidence; it does not introduce LLM judging.

## Engine vs observed data

Missed-opportunity evidence classified 74 Decisions as primarily Engine, 23 as observed-data limitation and 29 as interaction of both. This is a diagnostic heuristic based on available observed description/mood evidence, not a new Constitution gate.

## D0-F-002

Natural occurrence was `0/126`: no final candidate set exposed a semantic-only/fallback REDUCED-over-NORMAL comparison. This is a valid zero-exposure result, not evidence that the known defect is harmless. The controlled detection fixture remains separate and is not counted in natural frequency. D0-F-002 remains P1, unquantified for natural rank/utility impact under this simulation-only semantic exposure.

## Opportunity map for D4

- High frequency / high impact: retrieval loss; hard category/exclusion/open-now violations.
- High frequency / moderate impact: explanation mismatch; Remix repetition.
- Moderate frequency / moderate impact: personalization harm in mature/power cohorts.
- Unexposed but known: D0-F-002 semantic/fallback Distribution priority loss.

No fixes or architecture recommendations are made here.
