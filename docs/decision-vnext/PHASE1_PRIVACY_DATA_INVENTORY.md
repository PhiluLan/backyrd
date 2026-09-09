# Decision vNext Phase-1 privacy data inventory

Status: technical planning artifact. No Production schema or retention policy is
created by Phase 1.

| Contract/data | Personal? / sensitivity | Source and purpose | Phase-1 persistence | Future retention direction | Export / deletion | Access | Replay / forensic alternative |
|---|---|---|---|---|---|---|---|
| `DecisionRequest` | potentially personal; location, social context and free text may be sensitive | explicit client input for one decision | memory/test only, synthetic | minimize precise location; short free-text retention | export and delete | owning user + server | retain normalized facts/hash after raw expiry |
| `DecisionExecutionEnvelope` | personal when authenticated; operational | server auth/session/rollout authority | memory/test only | bounded operational retention | actor/session mapping export/delete where personal | server only | manifest and pseudonymous execution ID |
| `DecisionContextSnapshot` | personal; inferred situational context can be sensitive | deterministic context resolution | embedded in synthetic result | bounded exact-replay window | export and delete | owning user + authorized service | later keep coarse facts, evidence and hash |
| `WorldCandidate` | normally non-personal spot data | World adapter for candidacy | embedded synthetic | source-dependent | generally not user export; delete with source where required | engine/read adapter | content-addressed fact snapshot |
| `WorldConceptRef` / registry version | non-personal technical taxonomy reference | approved future World registry; fixture-only in Phase 1 | embedded synthetic | retain with dependent facts | generally not user export | World adapter + engine | concept ID/version pair |
| `WorldFact` / Situation derivation | normally non-personal; provenance may identify a contributor in future | typed World truth and derivation lineage | embedded synthetic | source- and fact-class-specific | contributor-linked provenance may require export/delete | World adapter; least-privilege operations | typed value/state, source version, times, Evidence/fact hashes |
| World entity/concept relations | normally non-personal | keep capability mappings and Event/Temporary Place links explicit | embedded synthetic shape only | relation lifecycle | source-dependent | World adapter + engine | relation endpoints, registry version and hash |
| `WorldKnowledgePort` query/result | potentially indirectly personal when candidate IDs derive from a request | sole future real-World boundary | no Phase-1 implementation or persistence | request association should be short-lived | delete/export only if associated with an identifiable request | server-side adapter only | request ID, as-of time, versions and result hashes |
| `CandidatePoolSnapshot` | indirectly personal through request association and exposure opportunity | fair comparison and forensic retrieval | embedded synthetic | shorter than durable aggregate metrics | export/delete association | service; limited own-result read | candidate IDs, versions and fact hashes |
| `EligibilityResult` | indirectly personal through constraints | prove hard-rule enforcement | embedded synthetic | align with result audit window | export/delete with result | own result + authorized operations | checks, evidence IDs and hashes |
| `EligibleCandidate` | transient branded runtime value | enforce stage boundary | never independently persisted | none | not applicable | process memory | reconstruct from eligibility record |
| `FitDimensions` | personal once personalization exists; potentially sensitive inference | transparent rank inputs | embedded synthetic, non-personal fixtures | bounded exact replay; avoid indefinite user projection | export/delete | own result + restricted operations | dimension keys, bounded values, evidence hashes |
| `Confidence` | indirectly personal; may reveal sparse history | communicate evidence sufficiency | embedded synthetic | result-aligned | export/delete with result | own result + operations | component/limitation record |
| `EvidenceItem` | may be personal for future user/context evidence | authorize facts and explanations | synthetic World evidence only | per evidence kind; raw sensitive evidence shorter | personal items export/delete | kind-based least privilege | source identity, value class and content hash |
| `DecisionRecommendation` | personal inference | selected ordered result | embedded synthetic | bounded product/audit retention | export/delete | owning user + restricted operations | rank, evidence, manifest and hash |
| `DecisionResult` | personal product history | return and explain decision | synthetic output only | exact replay time-limited; aggregates deidentified | export/delete | owning user + authorized operations | durable forensic manifest and evidence chain |
| `EngineManifest` | non-personal | identify executable artifacts | embedded synthetic/content-addressed | long-lived | no user deletion needed | public technical metadata where safe | primary replay identity |
| Synthetic world/user fixtures | explicitly non-production and synthetic | local/CI evaluation | repository config/generated memory | versioned fixtures; generated data disposable | no data-subject export/delete | repository/CI | regenerate from config and seed |

## Binding privacy directions

- No unlimited retention of complete User Model snapshots.
- Production exact replay, if introduced, is time-limited and access-controlled.
- Long-term forensic explanation is preferred over permanent raw snapshots.
- Precise coordinates and raw free text are minimized.
- Ranking and future AI receive projections and evidence, never raw user history.
- Every future persistent personal type must be assigned retention, export,
  deletion and consent behavior before its migration is approved.
- Synthetic configuration and generated worlds must remain credential-free and
  must never ingest Production data.

## Existing-system follow-up

The current data-export function predates several Memory, User Intelligence and
Decision trace tables. Phase 2 database planning must include an automated data
inventory check so new personal tables cannot be added without an explicit
export/deletion/retention classification. Phase 1 deliberately does not modify
that Production function.
