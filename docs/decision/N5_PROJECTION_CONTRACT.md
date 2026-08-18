# N5 Relevant User Projection Contract v1

## Purpose

N5 emits the minimum necessary, decision-relevant subset of canonical N2 User Intelligence for the current N3 Moment. It is Candidate-independent and contains no ranking decision.

## Input contract

Exactly three top-level inputs are accepted:

- `currentIntent`: bounded Place-Type scope, explicit Concept directions and broad-activity marker.
- `currentMoment`: canonical N3 Current Moment with its hash, per-dimension Confidence and provenance.
- `userIntelligence`: canonical N2 User Intelligence with Wave-3B.1 Taste Map, Patterns, contradictions, Consent and version identities.

Inputs fail closed on unsupported top-level fields, incompatible N2/N3/Taste/Pattern versions, missing Consent, cross-user projection, malformed structures, Candidate payloads, Latent Truth or prohibited private/scientific fields.

## Relevance contract

Authority and specificity are:

`EXPLICIT_CURRENT_INTENT > N3_CURRENT_MOMENT > N2_CONTEXT_TASTE > N2_PLACE_TYPE_TASTE > N2_GLOBAL_TASTE`.

For each Concept, only the most specific applicable row survives. Explicit direction conflicts suppress History. Context and Place-Type rows require exact applicable scope. Stale or Confidence `< 0.35` rows are suppressed. Global rows require active relevance; bounded fallback is allowed only for a broad request or absence of other relevant Taste Evidence. Low-friction Moments reduce discovery/novelty/design relevance rather than treating them as universally active.

Patterns require:

- canonical known state;
- current recency;
- Confidence `>= 0.55`;
- at least two matching context anchors;
- no contradictory anchor;
- similarity `>= 0.60`.

## Output contract

The canonical projection includes:

- decision and source hashes;
- applicable Contexts and Place Types;
- relevant Taste with affinity, Confidence, relevance, selected source layer, bounded provenance, reason codes and aggregate Evidence summary;
- relevant Patterns with applicability and Outcome support;
- bounded recent relevant Evidence summaries;
- relevant contradictions;
- decision-specific knowledge sufficiency;
- uncertainties;
- suppression count and bounded audit;
- explicit authority and scope boundaries;
- deterministic projection hash.

## Sufficiency contract

Sufficiency is a bounded function of relevant Taste Evidence, applicable Pattern Evidence, current Context/Place-Type specificity, Moment Confidence and contradiction penalty. A Place-Type request without Place-Type/context knowledge receives a scope penalty. Levels are:

- `HIGH >= 0.72`
- `MEDIUM >= 0.42`
- `LOW < 0.42`

These levels describe the current Decision only.

## N6 serialization

N6 receives structured Evidence, not a biography. The serialization omits User ID, raw Memory, city history, Candidate/Spot data, security Evidence and ranking fields. It is bounded to 12,000 bytes and an estimated 3,000 tokens.

## Reason codes

Reason codes include known global/context/Place-Type preference, recurring Pattern, recent relevant Outcome, low context or Place-Type knowledge, conflicts, Cold Start, Intent override, suppression, global fallback and minimum-necessary knowledge.

## Version and hashes

- Projection: `backyrd-relevant-user-projection-v1`
- Relevance: `backyrd-user-knowledge-relevance-v1`
- Sufficiency: `backyrd-decision-user-knowledge-sufficiency-v1`
- Suppression: `backyrd-user-knowledge-suppression-v1`
- Serialization: `backyrd-n6-user-knowledge-serialization-v1`
- Projection Contract Hash: `1a2b39de24132937db719a9a4290ee25d89824e9eda51e8273096d801cfd7420`
- Relevance Hash: `2e9714daacd485e44a0e554abdca79c361c5c6402e3da0847581b89f079f8843`
- Sufficiency Hash: `8d5c721d38ff0c4e7524cb776b828e5a70824dbd4497632d605623ae9d6e2422`
- Suppression Hash: `a3fdf1d6fca0359aa19712097c2d0546a28923ad75b4c8c08731c4ec41a01118`
