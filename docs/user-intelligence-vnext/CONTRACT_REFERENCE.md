# Contract Reference

Normative Exports liegen in `packages/user-intelligence-vnext-core/src`. Jeder Object-Contract ist strict: unbekannte Felder werden abgelehnt. Unterstützte Versionen sind explizit gelistet; unbekannte Major- und nicht gelistete Minor-Versionen scheitern fail-closed.

| Contract | Zweck | Zentrale Invarianten |
|---|---|---|
| `CanonicalUserEvent` | servergebundene Beobachtung | Hash, Idempotency, Journey, Authority, Consent; keine freie Interpretation |
| `UserEventAuthority` | Wer darf was behaupten? | User-ID und Binding serverseitig; Client Observation kann kein starkes Outcome behaupten |
| `ConsentEnvelope` | Purpose und Processing-Recht | UNKNOWN/DENIED/WITHDRAWN autorisieren keine Personalization Evidence |
| `EvidenceChain` | gemeinsame Journey-Evidence | getrennte Exposure-, Intent-, Experience-, Satisfaction-, Correction-, Direct-, Taste- und Practical-Segmente |
| `UserConceptReference` | opaque World/User-Referenz | `{registryVersion, conceptId}`; kein Fuzzy Mapping |
| `TasteNode` | Concept-Taste | Affinity/Confidence sowie positive/negative Evidence getrennt |
| `PracticalPreference` | beobachtetes Verhalten | `causalPreferenceClaimed: false` |
| `DirectSpotAffinity` | direkte Spot-Beziehung | `propagatesToConceptTaste: false` |
| `UserIntelligenceManifest` | Replay-Identität | Contract-, Reducer-, Code-, Registry- und Policy-Referenzen |
| `UserIntelligenceSnapshot` | vollständiges internes Read Model | Source Watermark, Manifest, Lifecycle und kanonischer Hash |
| `RelevantUserProjectionRequest` | serverseitiger Projection-Aufruf | Actor servergebunden, minimierter Context, Item-/Bytebudget, Kill Switch |
| `RelevantUserProjection` | einzige Decision-User-Schnittstelle | keine Raw Events, Texte, Rohstandorte, Eligibility oder Ranking Authority |
| `UserTransparencyView` | spätere userlesbare Sicht | Herkunft/Unsicherheit/Korrekturbarkeit ohne Security- oder Fremddaten |
| `LifecycleCommand` | Export/Korrektur/Reset/Purge/Rebuild | Authority, Idempotency, Scope, Zielstores, Completion und Fehler |

`USER_INTELLIGENCE_VNEXT_SCHEMA_CATALOG` macht Contract-, Validator- und Kompatibilitätsidentitäten maschinenlesbar. Die Runtime-Schemas sind die normative funktionale Entsprechung zu statischen JSON-Schemas; eine zweite, driftanfällige Validator-Implementierung wird bewusst vermieden.

Technische Erstellungszeit steht bei Snapshot und Projection unter `technicalMetadata` und wird nicht in den fachlichen Hash aufgenommen. Eventzeiten und Source Watermarks bleiben Bestandteil des Hashes, weil sie fachliche Inputs sind. Arrayreihenfolge wird erhalten; nur Objektkeys werden kanonisch sortiert.
