# N4 Spot Intelligence Schema v1

Version: `backyrd-spot-intelligence-schema-v1`

## Semantic language

N4 reuses the 45 concepts of `backyrd-taste-space-v1` so User and Spot describe atmosphere, energy, social style, occasion, price, discovery, novelty, character, environment and Place Type in one language. It adds only seven decision-specific Spot concepts: planning friction/commitment, kids/group fit, and night/weekday/weekend fit. No parallel Mood taxonomy is introduced.

## Fact envelope

Facts are category, Place Type, city, price level, accessibility, environment, reservation character and duration character. A Fact is selected from evidence with a defined source and Confidence; it is never silently converted into an interpretation.

## Interpretation envelope

Each Concept is bounded to `[-1, 1]` and carries state (`KNOWN`/`UNKNOWN`), Confidence, evidence IDs, provenance and whether it is contextual. Missing data is `UNKNOWN`, not negative fit.

## Context model

The canonical profile is global plus bounded adjustments for audience (`solo`, `date`, `friends`, `family`, `work`) and time (`morning`, `afternoon`, `evening`, `night`, `weekday`, `weekend`). Unsupported combinations fail closed. N4 does not create one profile per Context permutation.

## Quality fields

`completeness` measures how many dimensions are known. `intelligenceConfidence` measures support for known dimensions. They are intentionally separate. Completeness is a data-quality/Owner-UX diagnostic and is prohibited as an organic ranking boost.

## N6 boundary

`backyrd-relevant-spot-intelligence-boundary-v1` serializes Spot ID, supported Facts, a bounded set of strongest Concepts, contradictions, Intelligence Confidence and evidence sufficiency. It excludes Owner identity, tier, payment state, private User evidence, Trust evidence and raw source references. N5/N6 still decide which fields are relevant; N4 only supplies the safe boundary.
