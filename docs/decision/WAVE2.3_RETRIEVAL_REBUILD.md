# BACKYRD DECISION NEXT GEN — WAVE 2.3 RETRIEVAL ARCHITECTURE REBUILD

Status: **COMPLETE — FAIL / NOT PROMOTED**

Evaluation: `wave2.3-retrieval-rebuild-v1`

Canonical evidence: `decision-lab/baselines/wave2.3-retrieval-rebuild-v1.json`
Sample: 3 seeds × 42 Golden Scenarios = 126 FULL_FIDELITY decisions

## 1. Executive Summary

Wave 2.3 rebuilt retrieval as an explicit multi-stage system rather than extending the Wave 2.2 shortlist. The rebuilt path combines specialized recall sources, a deduplicated evidence-preserving union, and an observed-evidence shortlist before the existing downstream Decision layers.

The architecture produced a large, robust improvement over the same-run Wave 2.2 control: Capacity Capture@20 rose from `0.3626` to `0.5894`, Full-Pool Recall from `0.4410` to `0.6427`, and Best-Available Retrieval from `0.4365` to `0.6905`. The paired Capacity Capture lift was `+0.2268`, with bootstrap 95% interval `[0.1934, 0.2605]`, 111 wins, 9 ties, and 6 losses.

This is not sufficient for promotion. The frozen D4.1 absolute gates remain unmet. Wave 2.3 is therefore **FAIL / NOT PROMOTED**, despite the material learning and improvement. No threshold, Ground Truth, scenario, or product engine was changed.

## 2. Root Causes Addressed

Wave 2.2's dominant failure modes were used as the architecture input:

| Miss state | Wave 2.2 | Wave 2.3 | Interpretation |
|---|---:|---:|---|
| Retrieved in Top 20 | 781 | 1,274 | +493 successful retrievals |
| Source-ordering failure | 2,083 | 2,982 | More previously uncovered candidates became visible but remained below Top 20 |
| Coverage gap | 5,237 | 3,845 | −1,392, or −26.58% |

Coverage was materially improved. Ordering was not structurally solved: the absolute ordering-failure count increased by 899 as coverage misses moved into the found-but-not-shortlisted state. This is not counted as success merely because total retrieval improved.

## 3. New Retrieval Architecture

The Lab implementation is:

```text
Structured Intent
→ Product / Distribution / Wave-1 Hard Eligibility
→ specialized recall sources
→ evidence-preserving candidate union and deduplication
→ observed availability and quality evidence
→ deterministic retrieval shortlist
→ Top-20 candidate set
→ unchanged downstream Decision evaluation
```

The rebuild is implemented as an isolated evaluation adapter. It does not switch Mobile, Web, V11, V12, V13, SQL, or Edge Functions to a new product path.

## 4. Specialized Sources

Active evidence sources and their Lab contribution were:

| Source | Purpose | Candidate evidence | Useful density |
|---|---|---:|---:|
| `structured_category_v1` | Explicit structured/category fit | 3,606 | 0.4368 |
| `category_entity_v1` | Exact category/entity recovery | 618 | 0.2071 |
| `lexical_entity_v2` | Exact and lexical intent | 890 | 0.3000 |
| `lexical_v1` | Existing lexical recall | 2,624 | 0.4017 |
| `semantic_v13` | Broad conceptual recall | 3,318 | 0.3909 |
| `personalized_v12` | Existing personalized recall component | 1,096 | 0.4544 |
| `vibe_review_v1` | Observed review mood/vibe evidence | 1,698 | 0.4988 |
| `price_attribute_v1` | Explicit structured price evidence | 395 | 0.4557 |
| `availability_v1` | Observed availability preference | 9,241 | 0.4606 |
| `observed_quality_v1` | Observed reviews/actions | 9,241 | 0.4606 |

`availability_v1` and `observed_quality_v1` annotate the broad eligible set, so exclusive unique-candidate attribution is not meaningful for those universal evidence sources. Their effect is measured through isolated experiment deltas and shortlist movement instead.

## 5. Shortlisting and Evidence Aggregation

The shortlist combines only retrieval evidence: source overlap, calibrated source score, exact structured/category evidence, lexical evidence, semantic evidence, observed review/action evidence, availability, and data confidence. It does not consume Ground Truth or latent user/spot state, and it is not a final product utility reranker.

Source scores are normalized within their source. Equal raw evidence remains tied and uses stable deterministic tie-breaking; arbitrary UUID/source-rank order is not converted into false relevance. The candidate budget is capped at 80 and the promotion shortlist remains K=20.

## 6. Semantic Role

Semantic is **KEEP** as one focused FULL_FIDELITY recall source. Cosine similarity is not treated as final Decision utility.

An additional semantic-concept projection was tested and rejected: it did not materially improve retrieval quality and increased p95 latency. The final stack uses the existing focused semantic projection only. No embedding-model switch was made.

## 7. Spot Representation

Wave 2.3 adds only retrieval evidence already representable through synthetic observed Backyrd data: category, name/description, review mood/vibe, price, availability, and observed review/action aggregates. Missing evidence remains unknown and is not converted into negative evidence.

The review/action aggregation proves the retrieval contract in the synthetic Lab. It is not a Production materialization, schema migration, or permission to leak latent truth into product inputs.

## 8. Hypotheses and Rejected Experiments

| Experiment | Result | Decision |
|---|---|---|
| H0 — Wave 2.2 control | Capacity `0.3626` | Control |
| H1 — specialized recall sources | Capacity `0.3577`; Full-Pool `0.4462` | Insufficient alone |
| H2 — availability-first shortlist | Capacity `0.5412`; Full-Pool `0.6272`; Best `0.6270` | Kept |
| H3 — observed-quality evidence | Capacity `0.5894`; Full-Pool `0.6427`; Best `0.6905` | Kept as architecture evidence; stack rejected for promotion |
| Extra semantic-concept projection | No material quality gain; materially worse latency | Rejected |

The final evaluated stack contains only the winning availability and observed-quality evidence changes plus the diagnostic specialized-source architecture.

## 9. Comparative Metrics

| Stack | Capacity@20 | Full-Pool Recall | Best Available | Mean pool | Hard violations |
|---|---:|---:|---:|---:|---:|
| V13 legacy | 0.2969 | 0.2154 | 0.1667 | 36.55 | 27 |
| Wave 1 | 0.2973 | 0.2154 | 0.1667 | 36.52 | 0 |
| Wave 2 | 0.3568 | 0.5282 | 0.4921 | 97.59 | 0 |
| Wave 2.1 | 0.3686 | 0.5022 | 0.4841 | 90.21 | 0 |
| Wave 2.2 same-run control | 0.3626 | 0.4410 | 0.4365 | 73.34 | 0 |
| Wave 2.3 | **0.5894** | **0.6427** | **0.6905** | **73.34** | **0** |

Diagnostic Capacity Capture was `0.5508` at K=10, `0.5894` at K=20, and `0.6364` at K=50.

## 10. D4.1 Promotion Gate Matrix

| Required gate | Result | Verdict |
|---|---:|---|
| Capacity Capture overall ≥ 0.70 | 0.5894 | FAIL |
| Capacity Capture each seed/split ≥ 0.65 | seeds 0.5696 / 0.6136 / 0.5851; splits 0.5355 / 0.6019 / 0.6578 | FAIL |
| Best Available overall ≥ 0.80 | 0.6905 | FAIL |
| Full-Pool Recall overall ≥ 0.70 | 0.6427 | FAIL |
| Robust paired lift ≥ 0.03 | +0.2268; 95% CI lower bound 0.1934 | PASS |
| Every seed improves | yes | PASS |
| Locked Holdout non-regression | yes | PASS |
| Pool / latency / cost | within D4.1 bounds | PASS |
| Hard / Product / Distribution integrity | 0 / 0 / 0 | PASS |
| No-result / starvation | 1/126 / 1/126 | PASS |

No composite score compensates for these failed mandatory gates.

## 11. Split and Seed Evidence

Capacity Capture by seed was `0.5696`, `0.6136`, and `0.5851`. By split it was Development `0.5355`, Locked Holdout `0.6019`, and Regression `0.6578`.

Full-Pool Recall by split was Development `0.5876`, Locked Holdout `0.6999`, and Regression `0.6681`. Best Available by split was `0.6481`, `0.7222`, and `0.7222`. The Locked Holdout improved, but the Development split remains the principal quality limitation.

## 12. Efficiency

- Candidate pool: mean `73.34`, p95/max `80`
- Useful-candidate density: `0.4606`
- Lab p95 latency: `596.481 ms` versus `1,098.056 ms` for the same-run Wave 2.2 control
- Embedding model: `text-embedding-3-small`, 1,536 dimensions
- Measured embedding cost per decision: approximately `$0.00000269`
- Query/spot prompt tokens for the controlled run: 16,926 / 41,802

These are isolated Lab measurements, not Production performance claims.

## 13. Remaining Misses and Findings

The primary remaining limitation is shortlist ordering: 2,982 relevant candidates were present below Top 20. Coverage also remains incomplete with 3,845 misses. Development scenarios are materially weaker than Regression and Locked Holdout.

No new P0 was found. The architecture demonstrates that observed availability and quality evidence are valuable, but it does not yet satisfy the frozen quality standard and must not be promoted or used as a Product engine.

## 14. Scientific Validity and Integrity

- D2.1 freeze: `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf`
- D2.2 freeze: `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053`
- D4.1 retrieval freeze: `6c6421d61e2e4cb6ccdbc8ce4a8c807392bfdc7742797b8cb2d3734564ae3947`
- Scientific Validity: PASS
- Latent truth in engine input: false
- D4.1 contract mutation: none
- Wave-1 user hard-constraint failures: 0
- Product eligibility failures: 0
- Distribution eligibility failures: 0
- Duplicate candidates: 0
- Production access: none

## 15. Tests and Reproducibility

Durable tests cover observed-only signal construction, deterministic source evidence, deduplication, candidate budgets, stable tie behavior, availability ordering, latent-input prohibition, and the sealed FULL_FIDELITY baseline verdict. The runner starts an isolated local database and guards against Production targets.

Reproduce with:

```bash
npm run decision-lab:wave2.3
```

The canonical artifact result hash is `fed4e0367e917e1f34b2dab812a72d3f0c8008dfd02d180f1e96aaca0247032a`.

## 16. Git and Production

Branch: `codex/decision-wave2-3-retrieval-rebuild`

Delivery: Draft PR; no merge in Wave 2.3

Production: unchanged; no connection, deployment, `db push`, migration repair, schema mutation, synthetic Production data, or app switch.

## 17. Wave 3 Readiness

Wave 3 is **NOT READY**. Retrieval Next Gen has not passed the D4.1 contract. The next retrieval iteration must address the remaining source-ordering problem and Development-split coverage without weakening the frozen gate.

## Final Verdicts

- **WAVE 2.3 RETRIEVAL ARCHITECTURE — FAIL**
- **D4.1 RETRIEVAL PROMOTION CONTRACT — FAIL**
- **RETRIEVAL NEXT GEN — NOT PROMOTED**
- **COVERAGE GAP — MATERIALLY REDUCED**
- **SOURCE ORDERING GAP — NOT MATERIALLY REDUCED**
- **SEMANTIC RETRIEVAL — KEEP**
- **WAVE 1 STRENGTH REGRESSION — NONE**
- **WAVE 3 CONTEXT & PERSONALIZATION — NOT READY**
- **PRODUCTION — UNCHANGED**
