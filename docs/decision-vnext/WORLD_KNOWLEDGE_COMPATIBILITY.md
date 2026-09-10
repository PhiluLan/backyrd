# Decision vNext canonical World/User compatibility matrix

Status: integration-closure evidence for Draft PR #268 on canonical base `e48ecc461604f4f6ec73f399a39e233f7f5e5559`.

| Requirement | Classification | Evidence / implementation | Deferred authority |
|---|---|---|---|
| World snapshot and reader | already supported canonically | direct imports of `WorldKnowledgeSnapshot`, `WorldKnowledgeReaderPort`, runtime parser | Production reader implementation |
| Registry/rule/snapshot identity | minimal Decision binding | manifest, candidate reference and envelope bind versions + hashes | registry evolution policy |
| Facts, trust, freshness, conflicts, readiness | compatible through canonical snapshot | adapter retains readiness/exclusions and source hashes; canonical parser enforces shape/hash | source policy |
| Expired/unauthorized/explanation-only facts | already supported canonically | canonical port excludes them; Decision open state remains non-pass | Product unknown policy |
| Capability-to-Intent relation | requires Product/World result | `CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED` is preserved; fixture mapping cannot become target policy | canonical relation registry |
| Multiple categories, capabilities, derived provenance | already supported canonically | no Decision copy; canonical snapshot owns the structures | future registry content |
| Event/Temporary Place separation | requires later World slices | Decision does not collapse them into Spot fields | canonical entities/relations |
| Owner/payment/ads/subscription | fully compatible | canonical exclusions plus strict Decision schemas and counterfactual tests | none; influence remains forbidden |
| User projection/port | already supported canonically | direct `RelevantUserProjection` and `DecisionVNextUserProjectionPort` consumption | Production projection adapter |
| consent/cold/missing/kill-switch neutrality | already supported canonically, bound by Decision | neutral reasons enter degradation/Confidence; no eligibility authority | final personalization sufficiency policy |
| Taste/Practical/Direct Spot separation | already supported canonically | Decision does not flatten or reinterpret the canonical arrays | target ranking semantics |
| Situational Context | minimal technical addition | strict v1 explicit/server/derived snapshot with hash and no User write | Mood/companion/occasion/budget vocabularies |
| Candidate/eligibility/baselines | compatible through Decision adapters | same frozen pool; central branded eligibility; fixture ranking only | target objective and weights |

The deleted pre-alignment `world-knowledge.ts` and `world-knowledge-port.ts` were `REPLACE`, not reusable canonical contracts. The remaining `WorldCandidate` is deliberately a Decision-stage projection that references a canonical snapshot; it is not a World persistence model or taxonomy.
