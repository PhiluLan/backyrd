# N6A.2 — Evidence-Bounded Reason Authorization

## Root cause

The frozen N6A.1 Smoke contained eight `CONTRADICTORY_EVIDENCE` claims. Every one joined different attributes or an intent/moment preference with a non-matching spot attribute; none had an upstream N3/N4/N5 canonical contradiction marker. They were differences, mismatches, or uncertainty—not confirmed contradictions. Their confidence and provenance remain intact in the source Smoke; they do not convert into contradiction evidence.

## Canonical contradiction contract

`CONTRADICTORY_EVIDENCE` is authorized only by an explicit structured `CONTRADICTION` reference emitted upstream. Attribute differences, multiple sources, unknowns, missing data, low confidence, global/contextual variation, and weak/strong evidence differences are expressly insufficient.

## Authorized reason set

Before an AI call, Backyrd derives a deterministic, candidate-specific set of exact `{ code, evidence_refs }` instances:

- WHY-FOR-YOU: N5 global/place-type or contextual taste with sufficient confidence and relevance plus a matching N4 candidate concept.
- WHY-NOW: explicit current intent or sufficiently confident N3 moment concept plus a matching N4 candidate concept; place type requires an exact requested/candidate place-type pair.
- Uncertainty: only an exact N3/N4/N5 marker. `CONTRADICTORY_EVIDENCE` is absent unless the canonical marker exists.

The model receives both the normal permissible decision evidence and this authorization set. The set limits what Backyrd may claim; it does not remove legitimate structured ranking evidence or change the ranking task.

The validator first rejects any emitted reason that is not exactly authorized for that candidate and family, then applies the preserved N6A.1 semantic validator. It does not remove, repair, substitute, or near-match reasons.

## Offline replay and adversarial checks

The five captured Smoke outputs were replayed offline with zero AI calls. All eight contradiction claims are not authorized; the fifty previously supported captured reasons remain authorizable. The replay is not a quality run.

Tests cover candidate-specific authorization, copied reasons, explicit and absent contradiction markers, low-confidence/UNKNOWN/global-context differences, why-for-you/why-now boundary violations, empty sets, invented reasons, premium/billing, private trust/security, and prompt-injection-shaped references. Known-truth fixtures yield false accepts **0** and false rejects **0**.

## Boundaries and readiness

N2–N5, retrieval, candidate set, eligibility, distribution, taste semantics, ranking, ground truth, and metrics are unchanged. The authorization path excludes premium, billing, trust/security, latent truth, and private history outside N5.

N6A.2 has zero external AI calls and zero external cost. The next N6A Smoke must be a fresh, explicitly approved run with at most five new calls; its result is required before any quality or pilot decision.

**Verdicts**

- N6A.2 Evidence-Bounded Reason Authorization: **PASS**
- Contradictory-Evidence Contract: **PASS**
- Candidate-Specific Authorization: **PASS**
- WHY-FOR-YOU / WHY-NOW / Uncertainty Authorization: **PASS**
- Validator fail-closed: **PASS**
- False Accepts / False Rejects: **0 / 0**
- Scientific Validity: **PASS**
- New N6A Smoke: **READY**
- External AI Calls: **0**
- Production: **UNCHANGED**
