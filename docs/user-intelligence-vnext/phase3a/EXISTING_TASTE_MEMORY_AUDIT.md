# Existing Taste / Memory Audit — Phase 3A

## Ergebnis

Das Repository enthält drei Generationen: produktnahe Legacy-Speicher und Producer, deterministische Decision-Lab-Modelle mit fest codierten Zahlen sowie die kanonische Phase-1/2-Contract- und Evidence-Schicht. Die Legacy-Systeme sind Producer-/Migrationshinweise, aber keine Product Truth für Phase 3A.

| System | Heutige Rolle | Einstufung | Phase-3A-Grenze |
|---|---|---|---|
| `user-intelligence-vnext-core` Phase 1/2 | Authority, Events, Journeys, Dedupe, Evidence, Consent/Lifecycle | KEEP | einzige zulässige Evidence-Quelle |
| `backyrd_taste_evidence_v1` / `backyrd_user_taste_map_v1` | numerische Affinity, Confidence und Decay | REPLACE | keine Zahlen/Tabellen übernehmen; keine Migration |
| `backyrd_memory_events_v1` und Evidence Envelopes | Legacy Ledger und Moment-/Spot-Envelopes | ADAPT | später nur über Phase-2-Authority-Adapter |
| Product Memory Bridge | Decision, Impression, Action, Favorite, Reservation, Smart Review | ADAPT | Producer-Inventar; kein Wiring |
| `user-intelligence-runtime` Worker/Repository | liest Legacy Memory und schreibt Taste Map | DEPRECATE | nicht vom neuen Kernel aufrufen |
| Decision Lab Taste Engine | feste Eventstärken, Decay, Confidence und Scope-Gewichte | PROHIBITED | nicht als Production Policy importieren |
| N2 Memory User Intelligence | ältere Pattern-, Confidence- und Retention-Logik | REPLACE | keine Thresholds/Zeiträume übernehmen |
| `RelevantUserProjection` | minimierte Decision-Grenze | KEEP | wiederverwenden; Phase 3A nur neutral |
| Decision-vNext User Adapter | validiert Projection-Boundaries | KEEP | unverändert; kein Ranking Wiring |
| Mobile `memory-bridge` | Actions zum bestehenden RPC | ADAPT | Client darf keine Interpretation/Strength setzen |
| Standard/Smart Review | Product Experience Records | ADAPT | gleiche Learning-Semantik; keine implizite Satisfaction |
| Favorites | serverseitiger Save-Zustand | UNKNOWN / NEEDS PRODUCT DECISION | Save/Removal ohne Interpretation |
| Moments und Review Moods | Content-/Review-Kontext | UNKNOWN / NEEDS PRODUCT DECISION | keine Taste-Wirkung |
| Dwell, Quick Skip, Search | unvollständig/telemetrisch | UNKNOWN / NEEDS PRODUCT DECISION | `NOT_CONFIGURED` und fail-closed |
| Social Follow/Share/Profile | Social Observation | PROHIBITED | keine Taste- oder Cross-User-Propagation |

Mobile/Web-Oberflächen sind keine Policy-Autorität. Die vorhandenen Supabase-Trigger/RPCs werden nicht verändert. Der Legacy Worker bleibt getrennt. Export, Reset und Erasure aus Phase 1/2 bleiben bindend und werden um alle neuen Model Stores ergänzt. Details stehen in `compatibility-matrix.json`.
