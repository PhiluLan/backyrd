# Contract Reference

Phase-3A-Contracts und Authority-/Hash-Invarianten sind in [`phase3a/ADR-003-USER-MODEL-LEARNING-KERNEL.md`](phase3a/ADR-003-USER-MODEL-LEARNING-KERNEL.md) dokumentiert. `interpretation-policy@3a.0`, `observation-record@3a.0`, `interpretation-record@3a.0`, `user-model-manifest@3a.0`, `user-model-snapshot@3a.0` und `user-model-state@3a.0` sind additiv; Phase 1/2 bleibt kompatibel.

Phase 3B ergänzt `SignalSemanticsRegistry`, `CalibrationPolicy`/`CalibrationPolicyTrustAnchor`, `CalibrationEvidence`/`CalibrationEvidenceTrustAnchor`, `CalibrationScenario` und `CalibrationReport`. Die semantischen Validatoren sind im Schema Catalog gelistet. Eigenhashes reichen nicht: Policy und Evidence benötigen getrennte externe Acceptance-Anker; Reports werden vollständig aus denselben Inputs rekonstruiert.

Normative Exports liegen in `packages/user-intelligence-vnext-core/src`. Jeder Object-Contract ist strict: unbekannte Felder werden abgelehnt. Unterstützte Versionen sind explizit gelistet; unbekannte Major- und nicht gelistete Minor-Versionen scheitern fail-closed.

| Contract | Zweck | Zentrale Invarianten |
|---|---|---|
| `CanonicalUserEvent` | servergebundene Beobachtung | Hash, Idempotency, servergelöste Journey/Referenzen, hashgebundener Resolution-Record, Temporal Binding, Authority, Consent |
| `EVENT_REFERENCE_MATRIX` | Event-spezifische Referenzregeln | required/allowed References, Journey- und Source-Authority fail-closed |
| `TemporalValidationPolicy` | injizierbare Zeitprüfung | Occurrence- und Server-Clock-Skew, Reihenfolge, Ingestion und explizite Offline-Policy |
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
| `RelevantUserProjection` | einzige interne Decision-User-Schnittstelle | servergebundener Subject Hash statt direkter User-ID; keine Raw Events, Texte, Rohstandorte, Eligibility oder Ranking Authority |
| `UserTransparencyView` | spätere userlesbare Sicht | Herkunft/Unsicherheit/Korrekturbarkeit ohne Security- oder Fremddaten |
| `LifecycleCommand` | Export/Korrektur/Reset/Purge/Rebuild | Authority, Idempotency, Scope, Zielstores, Completion und Fehler |
| `CANONICAL_EVENT_CATALOG` | Phase‑2-Semantik | Klasse, Authority, References, Product State, Journey, Slots, verbotene Interpretationen, Purpose, Retention-Verantwortung, Correction und Dedupe |
| `JourneyResolution` | deterministische serverseitige Journey-Zuordnung | fünf Resolution States, Reason Codes, externe Authority-Proofs, Input-/Proof-Hash; Same-Spot allein bleibt ungelöst |
| `DeduplicationRecord` | Retry-/Idempotency-Audit | Event-ID, Idempotency Key und Product Source Record; Konflikte fail-closed |
| `EvidenceChainV2` | aktive und historische Journey-Evidence | pseudonymes Subject, Event Hashes, zehn Slots, World/Context, Reliability State, Independence, Uncertainty, Limitations, Corrections und Chain Hash |
| `WorldEvidenceBinding` | event-time World Consumer Port | opaque Registry-/State-Hashes, Trust/Freshness/Provenance, Conflicts/Unknowns/Exclusions; kein World-Type-Duplikat |
| `ContextEvidenceBinding` | minimierter damaliger Context | explizit/serverautorisiert/abgeleitet/unknown; kein Rohstandort, keine privaten Social-Daten, kein Long-Term-Taste |
| `CorrectionAuthorityRecord` | serverseitiger Correction Lookup | Record-ID, Gültigkeit, Policy, Ziel-User/-Spot/-Zeit und Resolution Hash; exakter Abgleich mit injiziertem Ledger-Port |
| `EvidenceEngineState` | deterministischer Rebuild-/Lifecycle-State | Chains, Ledger-Hashes, Pointer, Caches und Work Items; neutrale/gelöschte States enthalten keine Personenbindung |

`USER_INTELLIGENCE_VNEXT_SCHEMA_CATALOG` macht Contract-, Validator- und Kompatibilitätsidentitäten maschinenlesbar. Die Runtime-Schemas sind die normative funktionale Entsprechung zu statischen JSON-Schemas; eine zweite, driftanfällige Validator-Implementierung wird bewusst vermieden.

`ProjectionBuildInputSchema` ist die externe/runtime-validierte Builder-Grenze. Danach arbeiten die Builder-Teile nur mit dem daraus abgeleiteten internen Typ. Unbekannte kommerzielle Felder werden damit vor der Projektion abgewiesen.

Technische Erstellungszeit steht bei Snapshot und Projection unter `technicalMetadata` und wird nicht in den fachlichen Hash aufgenommen. Eventzeiten, servergebundene Referenzen und Source Watermarks bleiben Bestandteil des Hashes, weil sie fachliche Inputs sind. Arrayreihenfolge wird erhalten; nur Objektkeys werden kanonisch sortiert.

`verifyEvidenceChainV2` prüft nicht nur den äußeren Hash. Es bindet Subject, Consent/Purpose/Version, erlaubte Verarbeitung, Builder-/Lifecycle-/Retention-Policy und jedes innere Item erneut an Canonical Event, Katalog, Journey-Resolution, World-/Context-Proof, Correction Authority, Reliability, Reference Index, Independence und Limitations. `verifyEvidenceEngineState` rekonstruiert anschließend den vollständigen State aus autorisiertem Rebuild-Material. Eine innere Bedeutungsänderung, falsche Pointer oder ein ausgelassener Ledger-Eintrag werden daher auch mit neu berechneten Chain- und State-Hashes abgewiesen.
