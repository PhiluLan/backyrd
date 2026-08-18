# N6A AI Decision Buddy Contract v1

Status: frozen lab contract. Production integration is not started.

## Responsibility and authority

The Buddy ranks an already eligible, bounded candidate set. Product eligibility, distribution eligibility and hard constraints run before the model and cannot be changed by it. Inside the Buddy, explicit current intent outranks the N3 moment; the moment outranks relevant high-confidence N5 knowledge; low-confidence knowledge is weak evidence and UNKNOWN is neutral.

The Buddy never creates candidates, mutates upstream intelligence, or receives latent truth, evaluation labels, trust data, raw history, owner tier, billing or payment state. N4 evidence may include `owner_provided` provenance, but commercial entitlement is absent. Identical intelligence must therefore produce identical input regardless of Free/Premium status.

## Input

`backyrd-n6-ai-decision-input-v1` contains only:

- a hashed decision reference and structured current intent;
- compact `backyrd-current-moment-schema-v1` data with confidence and provenance class;
- compact `backyrd-n6-user-knowledge-serialization-v1` data with decision-specific knowledge sufficiency;
- ten `backyrd-relevant-spot-intelligence-boundary-v1` candidates.

Candidate identity and order are frozen across ACTUAL, NEUTRAL and OPPOSING treatment arms. The evaluator truth is held in a separate object and is never serialized into model input.

## Output

`backyrd-n6-ai-decision-output-v1` requires every candidate exactly once with rank, bounded buddy fit, bounded confidence, WHY-FOR-YOU codes, WHY-NOW codes and uncertainty codes. It also requires decision confidence plus echoed user-knowledge and moment-understanding sufficiency.

WHY-FOR-YOU codes: `USER_TASTE_MATCH`, `PLACE_TYPE_TASTE_MATCH`, `CONTEXTUAL_TASTE_MATCH`, `OCCASION_PATTERN_MATCH`.

WHY-NOW codes: `CURRENT_INTENT_MATCH`, `CURRENT_MOMENT_MATCH`, `CONTEXTUAL_SPOT_MATCH`, `PRACTICAL_FIT`.

Uncertainty codes: `LOW_USER_KNOWLEDGE`, `LOW_MOMENT_UNDERSTANDING`, `SPARSE_SPOT_INTELLIGENCE`, `CONTRADICTORY_EVIDENCE`.

Every code is deterministically checked against the exact candidate and input evidence. Unsupported reasons, invented IDs, duplicates, omissions, invalid ranks, malformed confidence, sufficiency mismatch, or low-sufficiency over-personalization invalidate the response. Invalid output uses the canonical input-order fallback in the experiment; it is never silently repaired.

## Confidence and sufficiency

LOW user knowledge prohibits WHY-FOR-YOU claims. Sparse spot intelligence and partial moment understanding must remain visible as uncertainty. Decision confidence is evaluated against actual decision accuracy and is not treated as model self-certification.

## Security and privacy

The API key and budget are environment-only. The cache is local, mode `0600`, ignored by Git, and keyed by model/config plus N3, N4 and N5 hashes. Outputs and reports contain hashes, token counts, latency and cost only—never secrets or raw user history. The model output is an untrusted suggestion until deterministic validation succeeds.

Contract hash is generated from the executable `N6A_CONTRACT`; freeze identity is stored in `decision-lab/config/n6a-ai-decision-buddy-v1.freeze.json`.
