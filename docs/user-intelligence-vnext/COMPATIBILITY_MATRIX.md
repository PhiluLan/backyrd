# World-/Decision-vNext Compatibility Matrix

Untersucht wurden Decision-vNext Draft-PR #268 und der parallele World-Knowledge-Prototyp read-only. Beide wurden nicht verändert.

| Grenze | Status | Phase-1-Ausrichtung | Spätere Arbeit |
|---|---|---|---|
| DecisionRequest ohne User-ID | kompatibel | Projection Request ist serverseitig | User-Port im Execution Layer einfügen |
| DecisionExecutionEnvelope | Adapter | authenticated Actor und Decision-ID sind abbildbar | Snapshot-/Projection-Referenz ergänzen |
| Engine Manifest und Replay | kompatibel | User Manifest, Snapshot- und Projection-Hash vorhanden | gemeinsames Run Manifest festlegen |
| Context Snapshot | Adapter | nur minimierte placeTypes/domainKeys + Hash | gemeinsame Context-Version und Allowlist |
| World Concept Reference | kompatibel | opaque `{registryVersion, conceptId}` | gemeinsame Registry-Ownership |
| World Strength/Confidence/Status | kompatibel | `WorldKnowledgePort` modelliert alle Felder | finale Enum-/Provenance-Ausrichtung |
| World-Knowledge-Gesamtkatalog | bewusst offen | nur synthetischer Slice | Founder/CTO-Freigabe |
| Eligibility | kompatibel | Projection besitzt keine Eligibility Authority | keine |
| Ranking | kompatibel | Projection besitzt keinen finalen Score | spätere bounded policy |
| UNKNOWN | kompatibel | fail-closed oder neutrale Projection | gemeinsame Fehlercodes abstimmen |
| Client User Identity | kompatibel | servergebundener Actor | gemeinsamer Envelope-Typ nach Merge |

Der PR ist kein Dependency dieser Branch. Nach seinem Merge sollte ein kleiner Adapter gemeinsame Typen nutzen, statt Contracts zu duplizieren. Der World-Prototyp bleibt bis zur Freigabe eine Entwurfsquelle.
