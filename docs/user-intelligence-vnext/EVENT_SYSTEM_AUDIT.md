# Existing Event System Audit — Phase 2

Base: `6f2f259e1bd82f4fbdb56b14dab61ff2bfed6f1a`

Tree: `42ad6063fffdd5d06d0ef74854a649a395990e6f`

Modus: read-only Repository-Audit; keine Production-Abfrage, kein Backfill und kein Wiring.

Die normative maschinenlesbare Matrix liegt in [`event-producer-consumer-matrix.json`](./event-producer-consumer-matrix.json). Sie inventarisiert Quelle, Authority, Ausführungsseite, Referenzen, Idempotency, heutige Semantik, personenbezogene Daten, Purpose, Retention-Situation, Zuverlässigkeit, möglichen kanonischen Typ und Disposition.

## Wesentliche Befunde

- `decision_sessions`, sichtbare Impressions, Product-Memory-Actions, Favorites, Decision Actions und Reviews besitzen verwertbare Source Records, benötigen aber jeweils source-spezifische Authority-Adapter.
- `mobile/lib/memory-bridge.ts` begrenzt direkte Product Actions derzeit auf `spot_opened` und `navigation_intent`. Die serverseitige Bridge ist best-effort und Product-verhaltensneutral.
- Favorites sind persistierter Product State. Erst der erfolgreiche Datensatz beziehungsweise dessen serverseitige Transition kann `SAVED` oder `SAVE_REMOVED` autorisieren.
- Standard und Smart Review landen als persistierte Review-Erfahrung. Der Einstieg unterscheidet nicht die Learning-Semantik. Text, Mood und Fotos werden nicht in Chains kopiert und begründen ohne separates Signal keine Satisfaction.
- `analytics_events` hat einen anderen Consent-Purpose (`optional_product_analytics`) und wird nicht automatisch zu Personalisierungsevidence.
- `backyrd_log_taste_event_v3` und `user_taste_events_v2.factor` sind keine zulässige Phase‑2-Evidence-Authority: kein semantischer Idempotency-Vertrag, Legacy-Faktoren und absichtlich geschluckte Fehler.
- `backyrd_ml_events_v1.spot_detail_view` ist ausdrücklich kein Visit. Eventnamen werden nicht als Wahrheit übernommen.
- Raw Search, Dwell, Fotoansichten, Category Navigation, Quick Skip, Moments, Share, Follow und Friend Profile Open besitzen keine freigegebene Phase‑2-Semantik. Sie bleiben `NOT_CONFIGURED` beziehungsweise `UNKNOWN_NEEDS_PRODUCT_DECISION`.
- Die bestehenden event-time Evidence Envelopes sind eine mögliche spätere Provider-Quelle. Phase 2 bindet sie nicht produktiv ein und kopiert keine World-Typen.

## Consumer

Historische Consumer reichen von `backyrd_memory_events_v1` über `backyrd_user_evidence_processing_v1`, Snapshot-/Latest-/Work-Tabellen und Decision-Lab-Reducer bis zu Projection-Pfaden. Phase 2 fügt keinen Consumer in diesen Laufzeitpfad ein. Der neue Builder ist ein reines Package mit synthetischen Inputs und Outputs.

## Retention

Das Legacy-N2-Schema enthält konkrete Tageswerte. Diese sind Bestandsbefund, keine Phase‑2-Freigabe. Der neue Chain-Vertrag trägt eine Retention-Klasse und `retentionDurationDefined: false`; finale Zeiten bleiben Privacy/Product-Policy.
