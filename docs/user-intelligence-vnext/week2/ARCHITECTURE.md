# Architektur und Grenzen

## Kanonische Grenzen

- **Feature Gate:** Production bleibt zwingend aus. Der lokale synthetische Harness ist eine getrennte Test-Capability und keine Runtime-Aktivierung.
- **Authority:** Release, Trust Anchor, Consent, Lifecycle und Action werden rekursiv gebunden. Clientwerte sind keine Authority.
- **Ledger:** Event- und Idempotency-Key-Deduplizierung, append-only Corrections, verspätete/out-of-order Zustellung und echter Incremental-Pfad.
- **Projection:** ausschließlich `RelevantUserProjection`; Handoff bindet Purpose, Consent, Release, Schema, Projection-ID und Hash.
- **Privacy:** Legal Export hat eigene Authority und ist von Product-/Decision-Handoff getrennt.
- **No Write:** keine Datenbank-, Persistence-, Netzwerk-, Product-Consumer- oder Publisher-Abhängigkeit.

## Semantik

| Beobachtung | Dark Runtime | Decision-Handoff |
|---|---|---|
| Save | Direct-Spot Planning State | minimierter State, keine Taste-Aussage |
| Save Removal | beendet Planning State | kein Dislike |
| Visit | zählt eindeutige servergebundene Journey | Familiarity erst ab drei Journeys |
| Search | Ledger-Beobachtung | zurückgehalten; Maturity nicht konfiguriert |
| Quick Skip | Ledger-Beobachtung | keine globale Aversion |
| Dwell | Attention-Beobachtung | vollständig ausgeschlossen |
| Correction | append-only Audit | Ziel verliert aktiven Einfluss |

Es gibt keinen Taste Reducer, keine Gewichte, kein Decay und keine Long-Term-Promotion.
