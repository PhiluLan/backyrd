# Phase-2-Readiness

Phase 2 sollte den `EvidenceChainBuilder` implementieren, weiterhin ohne sichtbare Personalisierung.

Empfohlener Scope:

1. read-only Adapter für explizit freigegebene bestehende Memory-Eventversionen;
2. semantische Adaptertabelle ohne rückwirkendes Raten;
3. Journey-Zuordnung und semantische Deduplizierung;
4. getrennte Slots für Exposure, Intent, Experience, Satisfaction und Correction;
5. Independence- und repeated-spot Regeln;
6. event-time World-Evidence-Referenzen;
7. Lifecycle-Propagation bei Correction, Retention und Erasure;
8. deterministischer Full- und Incremental-Chain-Rebuild.

Nicht vor Phase 2 entscheiden oder bauen: finale Gewichte, Maturity, Taste Reducer, Occasion Patterns, Product Event Wiring, Ranking oder Shadow Traffic.

Vor Phase 2 benötigte Product-Entscheidungen sind nur jene, die Eventklassifikation blockieren: ausdrückliche Satisfaction-/Dissatisfaction-Signale, Save-Semantik und zulässige langfristige Context-Dimensionen. Review Moods und Moments können UNKNOWN bleiben.
