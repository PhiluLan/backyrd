# Basel Launch Corpus V1

Status: Gate-2 acceptance evidence. This document records an operational
snapshot; it is not a Product lifecycle, ranking, Gold, or Admin Quality
contract.

## Acceptance identity

- Measured at: `2026-08-29T07:41:21.227Z`
- Canonical `main` baseline: `f0000f8ac3cb14e0ecd1b43fcff7ff696f2fc21e`
- Production project: `hjgcrrzfjchzqoegcywn`
- Launch geography: exact canonical `city = Basel` (Basel city proper)
- Manifest identity: `1bad92d9115581aa84604f36a51274952717a0a20a80452f50dcf9c8a81cb002`
- Product-ID set identity: `e43f63348b98165ea7bb751ffaaeea650c700ade1c24158597412cf882fe77df`
- Machine-readable companion: `docs/readiness/BASEL_LAUNCH_CORPUS_V1.json`

The final Gate-2 merge SHA and deployment lineage are recorded in the Gate-2
closure report because a commit cannot embed its own future merge SHA.

## Readiness definitions

- **Discovery Ready:** approved non-fixture Product Spot in Basel, valid
  identity/category/Basel coordinates, and Distribution eligible.
- **Decision Ready:** Discovery Ready, existing known archetype, and at least
  three active source-bound N4 dimensions. This measures knowledge sufficiency;
  it never affects ranking.
- **Detail Ready:** Discovery Ready plus at least 80 characters of effective
  canonical description. A Discovery-only page may still be usable when its
  identity, category, image/fallback, address and actions are truthful.
- **Reason Ready:** Decision Ready plus a valid current source-bound canonical
  fact in an authorized factual-reason family.
- **Core intent ready:** at least two source-bound factually matching candidates
  and at least two candidates at confidence `>= 0.90`.

Corpus Readiness asks whether enough trustworthy knowledge exists. Ranking asks
which eligible Spot fits a Decision. Launch Readiness is neither Gold nor Admin
Quality, and none of these readiness values enter `final_score`.

## Production universe

| Measure | Count |
| --- | ---: |
| All canonical Spots | 130 |
| Non-test Product Spots | 125 |
| Approved Product Spots | 122 |
| Basel launch Product Spots | 99 |
| Discovery Ready | 99 |
| Decision Ready | 69 |
| Detail Ready | 66 |
| Reason Ready | 39 |

The corpus contains zero Product-visible TEST/FIXTURE rows. Five retained test
or fixture tombstones remain archived outside the Product universe.

## Category coverage

| Category | Product | Discovery | Decision | Detail | Reason | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Restaurant | 43 | 43 | 21 | 25 | 15 | Ready; largest sparse tail |
| Bar | 26 | 26 | 18 | 20 | 8 | Ready |
| Museum | 10 | 10 | 10 | 5 | 3 | Ready |
| Aktivität | 7 | 7 | 7 | 7 | 4 | Ready |
| Café | 7 | 7 | 7 | 6 | 6 | Ready |
| Besonderes Erlebnis | 3 | 3 | 3 | 2 | 2 | Ready |
| Unterkunft / Hotel | 2 | 2 | 2 | 0 | 0 | Discovery-only long tail |
| Aussichtspunkt | 1 | 1 | 1 | 1 | 1 | Supported narrow category |

The corpus is gastronomy-heavy, but not gastronomy-only: culture, activity,
family/rain, social context and indoor/outdoor semantics all have factual
candidate depth. Dedicated wellness/spa is honestly unsupported rather than
filled with inferred truth.

## Geography

Current Product semantics do not persist neighborhoods. Postal-code distribution
is therefore used as a reproducible analytical proxy, without inventing new
boundaries.

| Postal code | Spots | Postal code | Spots |
| --- | ---: | --- | ---: |
| 4001 | 3 | 4055 | 2 |
| 4002 | 1 | 4056 | 18 |
| 4051 | 30 | 4057 | 10 |
| 4052 | 5 | 4058 | 20 |
| 4053 | 4 | 4059 | 1 |
| 4054 | 3 | unknown postal token | 2 |

All 99 have valid Basel coordinates. The center is intentionally denser, while
4056–4058 provide material spread. The two unparsed postal tokens do not impair
map location because their canonical coordinates are valid.

## Core-intent matrix

The minimum depth is two: it preserves a real alternative for the initial
choice/`Weiter` flow without inventing an arbitrary five-candidate target. Every
candidate below is matched from current canonical source-bound facts; category
alone is not counted.

| Intent/context | Factual candidates | Confidence >= 0.90 | Category diversity | Verdict |
| --- | ---: | ---: | ---: | --- |
| Coffee + morning | 3 | 3 | 2 | Ready |
| Food + friends | 15 | 15 | 3 | Ready |
| Date + evening | 19 | 19 | 3 | Ready |
| Afterwork + drinks | 9 | 9 | 2 | Ready |
| Culture + rain | 3 | 3 | 1 | Ready |
| Family + rain | 19 | 19 | 6 | Ready |
| Indoor activity + friends | 5 | 5 | 2 | Ready |
| Craft beer + friends | 2 | 2 | 1 | Ready |
| Cocktails + date + evening | 4 | 4 | 1 | Ready |
| Quick bite + lunch | 6 | 6 | 1 | Ready |
| Quiet + solo | 6 | 6 | 5 | Ready |

Honest unsupported/future long tail: dedicated wellness/spa, rich hotel
reasoning, and broader outdoor-specific combinations. They are not counted as
prominent core promises.

## Knowledge and integrity

| Dimension | Coverage | Truth-quality result |
| --- | ---: | --- |
| Valid identity/category/location | 99/99 | Pass |
| Google Place linkage | 99/99 | Pass; not treated as Product truth |
| Any opening hours | 72/99 | 27 remain honestly unknown |
| Full seven-day hours | 30/99 | No invented intervals |
| Authoritative Web header image | 9/99 | 90 intentional Backyrd fallbacks; 0 broken |
| Mobile authenticated Google image | 99/99 | 0 broken canonical states |
| Effective description >=80 chars | 66/99 | Canonical read model only |
| At least three source-bound N4 dimensions | 69/99 | Registry remains 60 |
| Current canonical Accepted Fact | 40/99 | Invalid current facts: 0 |
| ML document and matching embedding | 99/99 | Stale: 0 |
| Offering hierarchy conflicts | 0 | Pass |
| Definite active duplicates | 0 | Pass |

Legacy adapter facts lacking the current evidence-scope/semantic contract are
not counted as canonical current Human Summary, Offering, Purpose, or Reason
truth. This prevents old populated fields from masquerading as verified facts.

One exact-coordinate pair remains: S AM Schweizerisches Architekturmuseum and
Kunsthalle Basel share a building/address but have distinct Google Place IDs and
web identities. It is a proven legitimate co-location, not an ambiguous or
consumer-visible duplicate.

## Human sampling

Deterministic sample seed:
`Basel:BASEL_LAUNCH_CORPUS_V1:2026-08-29`. The first 12 ascending values of
`SHA-256(seed + ':' + canonical UUID)` were inspected across high, medium and low
readiness. A second 12-Spot sample deliberately selected the lowest Reason,
Detail, fact and N4 coverage.

Both samples pass. The weakest entries remain real, correctly categorized,
locatable and actionable Discovery entries. They are not promoted to Decision or
Reason readiness. Unknown facts stay unknown. No sampled factual error was found,
so the observed critical/material false-fact rate was `0/24`; no broader
statistical confidence is claimed.

Eight reference Spots also pass: Volta Bräu, KaBar, Eatery77,
Naturhistorisches Museum Basel, Zoo Basel, ELYS Boulderloft, Galizi and Bäckerei
Kult Volta.

## Gate-2 remediation and mutation log

Production mutations were bounded, auditable, and executed through existing
contracts:

1. Archived duplicate `Basler Papiermühle`
   (`01c40cfb-d002-4ad0-9c34-b8f4a598e232`) in favor of the richer canonical
   identity (`a054f361-3a6d-404d-8e12-373f810fc6fc`). Request ID:
   `2d84d37e-9b68-4a52-8d23-43a280c4a201`. Dependencies/history retained.
2. Archived temporarily closed `Balz Club`
   (`514bdf47-f9f5-4cfd-80b2-b8677bc8e3da`) after authoritative venue evidence
   contradicted its active distribution state. Request ID:
   `6ffb79b4-208e-4a7a-a8ea-36259ccb0ba2`. Dependencies/history retained.
3. Requeued the stale Amber Bar embedding using
   `gate2_stale_embedding_repair`; the worker completed and source/document hashes
   now match.

No Spot, social, Decision, analytics, User Card, N2, Taste, or historical data was
deleted or rewritten. No fact, hours, image, category, archetype, Offering,
Purpose or N4 value was fabricated or bulk-filled.

Systemic Product fixes:

- Mobile now presents missing hours as unknown, never closed.
- Consumer Web exposes the existing canonical effective description and hours,
  with an explicit uncertainty state.
- Public Spot Detail now fails closed for non-approved, test/fixture, or
  Distribution-ineligible Spots.
- A bounded live corpus guard detects fixture leakage, identity/coordinate/
  category breakage, definite duplicates, invalid facts, N4 drift, stale
  embeddings, membership and core-coverage regressions.

The database change is an additive replacement of the existing public Spot
Detail RPC return document. It creates no table, column, readiness state, or
schema-level Product semantics.

## Remaining gaps

Important non-blockers:

1. Web uses the intentional fallback for 90/99 Spots. Visual sampling found the
   fallback coherent and unbroken, but authoritative licensed imagery should be
   expanded through Owner/Admin pathways.
2. Only 40/99 Spots have current canonical facts and 39 are Reason Ready. This is
   enough for all core intents, but the long tail remains shallow.
3. Hours are unknown for 27/99 Spots. The systemic false-closed defect is fixed;
   enrichment should follow authoritative sources rather than inference.

Acceptable unknowns include subjective nuance, non-core long-tail suitability,
and missing volatile hours. Future expansion should target hotel knowledge,
wellness/spa and broader outdoor combinations only when Product scope demands it.

## Acceptance

- Corpus sanity: PASS
- Coverage regression: PASS
- Identity/coordinates/categories/duplicates: PASS
- Fixture isolation: PASS
- N4 and Offering/Purpose structural contracts: PASS
- Reference/random/adversarial human samples: PASS
- Launch blockers remaining: 0
- Gate-2 corpus verdict: **READY**

The snapshot is an acceptance baseline, not an immutable truth freeze. Normal
canonical enrichment may continue after launch; a changed manifest must be
explicitly re-certified rather than silently updating this evidence.
