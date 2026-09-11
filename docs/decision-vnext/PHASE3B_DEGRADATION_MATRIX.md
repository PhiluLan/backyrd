# Phase 3B Degradation Matrix

| Zustand | Aktion | Behauptung |
|---|---|---|
| Unbekannte Release-/Registry-/Policy-Version | Fail closed | keine |
| Resolver nicht konfiguriert | Dimension `NOT_CONFIGURED` | keine semantische Reparatur |
| Resolver mehrdeutig | höchstens eine Clarification | Alternativen bleiben sichtbar |
| Location denied | explizite Stadt erforderlich | Device Location wird nicht Authority |
| Opening/Kitchen unknown bei Hard-Anforderung | Candidate ausgeschlossen | nicht als geschlossen behaupten |
| Accessibility unknown bei Hard-Anforderung | Unknown-Fallback, bestätigt zuerst | nicht als zugänglich behaupten |
| Accessibility known false | Candidate ausgeschlossen | belegter Komponenten-Fact |
| Age/Legal unknown | Evaluation `NOT_CONFIGURED` | keine rechtliche Annahme |
| Composite unvollständig | Partial mit Limitation | kein Composite-Grund |
| Externer Resolver fehlt | lokale Fixtures nur in Evaluation | keine Production-Reife |
| User Event Contract fehlt | Writeback `NOT_CONFIGURED` | Context bleibt run-scoped |

Es existiert kein stiller Default und kein unkontrollierter Production-Fallback.
