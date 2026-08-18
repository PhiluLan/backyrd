# N6A.1 — Reason-Evidence Integrity Hardening

## Scope and invariant

N6A.1 is a forensic and contract-hardening change only. It made **zero** external AI calls (USD 0), did not rerun Smoke/Pilot/Full, and does not change N2 Memory, N3 Moment Intelligence, N4 Spot Intelligence, N5 projection semantics, eligibility, retrieval, ground truth, ranking metrics, or the historical N6A contract.

The historical N6A Smoke remains **FAIL**: five live `gpt-5.6-sol` calls, 12,978 input tokens, 8,067 output tokens, USD 0.6138 budget accounting cost, 28.15 s p50 / 33.62 s p95 latency, two accepted outputs and three `UNSUPPORTED_REASON_EVIDENCE` rejects. Its two accepted quality observations are not a quality verdict.

## Forensic result

| Scenario | Historical result | Reconstructable reason chain | Classification |
| --- | --- | --- | --- |
| 6101-0 | rejected | No — parsed structured output and reason codes were discarded | `OTHER_MEASUREMENT_ARTIFACT_GAP` |
| 6101-1 | accepted | Yes — adversarially audited from retained structured output | legacy validator/contract review required |
| 6101-2 | rejected | No — parsed structured output and reason codes were discarded | `OTHER_MEASUREMENT_ARTIFACT_GAP` |
| 6101-3 | rejected | No — parsed structured output and reason codes were discarded | `OTHER_MEASUREMENT_ARTIFACT_GAP` |
| 6101-4 | accepted | Yes — adversarially audited from retained structured output | legacy validator/contract review required |

The original runner stored `ranking: null` and only `UNSUPPORTED_REASON_EVIDENCE` for rejected responses, and cached only valid responses. Therefore the required reject-by-reject chain cannot honestly distinguish model claim failure, serialization loss, contract failure, or validator false negative. N6A.1 records this as a measurement-artifact gap, **not** as a model failure.

No serialization loss is proven: regenerated N6A inputs contain their N3, N4, and N5 representations. No model claim failure is proven from the three missing parsed outputs.

The retained accepts expose an independent problem: the legacy validator accepted broad codes from merely any request field, moment confidence, candidate concept, or candidate fact. `CURRENT_MOMENT_MATCH`, `CONTEXTUAL_SPOT_MATCH`, `PRACTICAL_FIT`, and `OCCASION_PATTERN_MATCH` did not require an exact candidate-linked evidence chain. The old accepts consequently remain historical valid outputs under the old contract, but are not proof of evidence-closed explanations. They intentionally fail the new contract because they have no evidence references and use legacy broad vocabulary.

## New reason contract

N6A.1 replaces broad labels with exact, reference-bound semantics:

| Scope | Code | Required evidence |
| --- | --- | --- |
| Why for you | `RELEVANT_TASTE_MATCH` | relevant N5 global/place-type taste plus matching N4 candidate concept; confidence/relevance ≥ 0.65, spot confidence ≥ 0.50 |
| Why for you | `CONTEXTUAL_TASTE_MATCH` | relevant N5 contextual taste plus matching N4 candidate concept at the same bounds |
| Why now | `CURRENT_INTENT_MATCH` | explicit current-intent concept plus matching N4 candidate concept |
| Why now | `CURRENT_MOMENT_MATCH` | sufficiently confident N3-derived moment concept plus matching N4 candidate concept |
| Why now | `PLACE_TYPE_MATCH` | explicit requested place type plus the candidate’s N4 place type |
| Uncertainty | `LOW_USER_KNOWLEDGE`, `LOW_MOMENT_UNDERSTANDING`, `SPARSE_SPOT_INTELLIGENCE`, `CONTRADICTORY_EVIDENCE` | exact N3/N4/N5 reference that establishes the uncertainty |

Every output reason must carry one or two `evidence_refs` from a serialized per-decision evidence index. A candidate may have no reason rather than inventing a weak one. Unknown references, cross-candidate references, wrong scopes, mismatched concepts, and ambiguous mappings fail closed.

This makes the boundary explicit:

- **Why for you** uses N5 user intelligence and a candidate-linked N4 concept.
- **Why now** uses current intent or N3 moment evidence and a candidate-linked N4 concept.
- User history alone cannot become a why-now reason; moment evidence alone cannot become a why-for-you reason.

## Changes and evidence closure

N6A.1 adds a separate input/output/validator contract, an evidence index, a strict output validator, and forensic capture. Future captures persist parsed structured output, the full reason audit, and failed validation; rejected responses can no longer disappear behind a generic error code. The original N6A contract and freeze are preserved.

The N5 serialization was not changed because forensics did not establish a required serialization gap. The input remains premium/billing/trust/latent-truth/PII blind.

## Adversarial validation

The automated suite proves fail-closed behavior for: complete supported evidence; invented user, moment, and spot claims; wrong code; low/sparse evidence; why-for-you from moment only; why-now from history only; correctly evidenced uncertainty; unsupported reason alongside a complete ranking; premium/billing references; and ambiguous/cross-candidate mappings. It also verifies both the preserved N6A freeze and the new N6A.1 freeze.

## Historical replay

The three old rejects remain `UNREPLAYABLE_MISSING_PARSED_OUTPUT`. The two old accepts are `FAIL_NEW_CONTRACT_MISSING_EVIDENCE_REFS_AND_LEGACY_VOCABULARY`. This is not a new quality run and does not convert historic model behavior into a verdict.

## Scientific validity and readiness

N6A.1 is scientifically valid for the limited hardening objective: it preserves uncertainty and reports the historical capture limit instead of fabricating attribution. A fresh, explicitly approved N6A Smoke is required to measure the frozen N6A.1 contract. It must use new live calls and may not reuse these five results for quality promotion.

**Verdicts**

- N6A.1 Reason-Evidence Integrity: **PASS**
- Root Cause: **MIXED** — three historical rejects are an unclassifiable measurement-artifact gap; legacy validator/contract ambiguity is proven in retained accepts
- Why-for-you evidence integrity: **PASS**
- Why-now evidence integrity: **PASS**
- Validator fail-closed behaviour: **PASS**
- Buddy uncertainty discipline: **PASS**
- Scientific validity: **PASS**
- New N6A Smoke: **READY** (fresh explicit approval required)
- External AI calls: **0**
- Production: **UNCHANGED**
