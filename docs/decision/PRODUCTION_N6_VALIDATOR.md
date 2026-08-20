# Production N6 Validator

The validator is fail-closed and preserves the frozen N6A.2 authorization-first behavior.

It requires:

- exact decision/input identity from the server-side trace;
- every frozen candidate exactly once, with unique contiguous ranks;
- bounded confidence values and exact N3/N5 sufficiency;
- exact candidate-specific reason code plus exact evidence-reference pair;
- every selected reason to map back to an existing Sprint-4 authorized reason;
- WHY_NOW only from Current Intent/Moment/Spot evidence;
- WHY_FOR_YOU only from projected user knowledge × candidate N4 evidence;
- zero WHY_FOR_YOU in `LOW_OR_UNKNOWN`;
- the frozen explicit-intent tier and strength ordering never to be reversed;
- no commercial, owner, payment, Trust, latent-truth, opaque, or encrypted output field.

There is no fuzzy repair, reason transfer, partial salvage, or semantic near-match. A single invalid candidate or reason rejects the whole N6 output. Validated structured output is wrapped with the authoritative `decisionId`; provider prose is never authoritative.

The adversarial suite rejects hallucinated/missing/duplicate candidates, wrong ranks, unauthorized or cross-candidate reasons, fake evidence references, LOW-mode personalization, Current-Intent violations, malformed schemas, forbidden commercial fields, and unexpected model-output fields. N6A.7 canonicalization drops all non-allowlisted provider metadata before persistence.
