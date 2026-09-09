# Decision vNext Phase 1: World Knowledge compatibility matrix

Status: pre-merge technical alignment for Draft PR #268. This document does
not approve a World taxonomy, registry design, product semantics or production
adapter.

## Matrix

| Requirement | Pre-alignment state | Classification | Phase-1 evidence / action | World Knowledge audit dependency |
|---|---|---|---|---|
| Subcategories | no structural section | minimal technical adjustment necessary | `WorldKnowledge.subcategories: WorldFact[]` | concept definitions and normalization |
| Decision Intents | fixture string array on `WorldCandidate` | minimal technical adjustment necessary | separate `decisionIntents.facts` plus typed capability relations | intent registry and relation semantics |
| Capabilities | absent | minimal technical adjustment necessary | independent `capabilities: WorldFact[]` | capability registry and meaning |
| Situation Fit | fixture mood array only | minimal technical adjustment necessary | separate `directClaims` and `derivedFits` | fit concepts and derivation policy |
| Amenities & Constraints | eligibility projections already existed | compatible through a generic extension point after adjustment | typed `amenitiesAndConstraints` facts; the three Phase-1 projections remain technical inputs | canonical concepts and source precedence |
| Temporal & Current State | open-state projection and timestamped evidence existed | compatible through a generic extension point after adjustment | typed temporal facts with observation and validity windows | temporal model, freshness and expiration policies |
| Evidence & Confidence | discriminated evidence, confidence and hashes existed | already fully compatible | evidence is now owned by the World Knowledge envelope; existing explanation chain remains unchanged | source-specific confidence calibration |
| Stable registry/concept references | only versioned fixture keys | minimal technical adjustment necessary | opaque `{registryVersion, conceptId}` refs; manifest binds registry version | registry ownership, lifecycle, aliases and canonical IDs |
| Multiple categories per spot | singular fixture place type | minimal technical adjustment necessary | `categoryAssignments: WorldFact[]`; sandbox proves more than one assignment | 16 category values and assignment rules |
| Typed fact provenance | evidence had source/time/confidence; facts were not first-class | minimal technical adjustment necessary | discriminated values, source, verification, observed/valid time, confidence, evidence IDs and fact hash | authoritative sources and verification rules |
| False/unknown/not applicable/disputed/expired | open status distinguished only open/closed/unknown | minimal technical adjustment necessary | mutually distinguishable `WorldFact.state` variants, including `known_false` | per-concept interpretation and conflict resolution |
| Direct versus derived situation fit | absent | minimal technical adjustment necessary | direct facts and derived records with derivation version and input fact IDs | allowed derivations and their ownership |
| Event and temporary-place separation | not represented | minimal technical adjustment necessary | distinct entity kinds and content-hashed relations; entities are never embedded as spots | entity schemas, relation concepts and lifecycle |
| Owner/payment neutrality | commercial probes discarded before `WorldCandidate` | already fully compatible | strict schemas plus counterfactual test; port query rejects unknown owner fields | none for engine boundary |
| Future World integration | `versioned_adapter` retrieval attribution only | minimal technical adjustment necessary | async `WorldKnowledgePort` interface and strict request/result schemas; no implementation | real port contract details and adapter mapping |
| No current table as domain contract | package has no Supabase/legacy import | already fully compatible | no database types, table names or production IDs enter the package | source adapter audit only |
| No fixture taxonomy as product truth | fixture IDs and versions explicitly unapproved | compatible through existing extension points | schema accepts opaque future registry/concept IDs; fixture vocabulary stays sandbox-only | all canonical vocabulary |

## Boundary outcome

The Phase-1 contract now fixes only the neutral envelope: concept references,
typed fact states and values, provenance, relations, derivation lineage and
port isolation. It does not define any category, intent, capability, situation,
amenity, temporal or relation vocabulary.

The flat Phase-1 city, distance, distribution, open, popularity and quality
fields remain explicit evaluation projections required by the already approved
eligibility and baseline slice. They are not a persistence model and a future
`WorldKnowledgePort` adapter must produce the authoritative World Knowledge
snapshot from its own approved source mapping.
