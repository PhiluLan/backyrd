# ADR-006 — Founder-Live Production Adapter (inaktiv)

Status: Draft, nicht aktiviert. Source base: `96f648cebbfdfd854aec688613ddbedb447c25bb`.

## Entscheidung

Die vorbereitete Founder-Live-Server-Grenze besitzt eine eigene, diskriminierte Mobile-Grenze. Es wird ausdrücklich keine Edge Function eingecheckt; ohne die separat autorisierten kanonischen Production-Ports existiert kein aktivierbarer Runtime-Einstieg. `FOUNDER_LIVE_READ_ONLY` ist eine nachvollziehbar als Evaluation gekennzeichnete Nur-Lese-Antwort ohne Spot-IDs, Navigation, Enrichment, Impressionen, Feedback, Memory, Learning oder Product-Ranking. `EXISTING_ENGINE` delegiert ausschließlich an den unveränderten v13-Pfad. Fehler, unbekannte Versionen und Cross-Engine-Continuations führen nie zu einem stillen Fallback.

Die Session wird serverseitig über Supabase Auth geprüft. UUID, Session und Subject Binding stammen nie aus dem Client-Payload. Die Allowlist konsumiert den kanonischen privaten User-Intelligence-Provider; sie besitzt keine Enumeration. World-Snapshots werden ausschließlich über den kanonischen `WorldKnowledgeReaderPort` aus einer serverprivaten, hashgebundenen Cohort gelesen. User Intelligence muss ausschließlich eine kanonische minimierte `RelevantUserProjection` über den injizierten Production-Port liefern; eine synthetische oder leere Ersatzprojektion ist verboten. Es gibt weder Raw-Event-Zugriff noch Writeback.

## Fail-closed Controls

- Standard: API aus, Kill Switch engaged, Sampling und Shadow Traffic 0.
- Fehlende Secrets, Manifest-, Snapshot-, Registry-, Session- oder Location-Bindungen stoppen die Auswertung.
- Request-Limit und Timeout begrenzen den technischen Slice. Durable, kanonische Idempotenz- und Rate-Limit-Ports sind verpflichtend zu injizieren; prozesslokale Ersatz-Stores sind für Production verboten.
- Alle Decision Authorities (Product Output, Ranking, Eligibility, Confidence, Learning, Mutation) bleiben `false`.
- Es existiert kein Edge-Einstieg und damit kein Environment-basierter Aktivierungspfad.

## Mobile-Kompatibilität

Der alte `backyrd.decision-api.request@1.0`-Client bleibt Authority-frei. Der Server übersetzt nur Freitext und explizite Zielstadt. Mood-, Audience- und Place-Type-Werte werden nicht in erfundene Product-Semantik umgedeutet. Eine v13-Continuation kann nicht in Founder Live fortgesetzt werden. Die bestehende Binding-Datei enthält weiterhin keine vNext-Funktion; es findet keine Aktivierung statt.

## Nicht autorisiert

Deployment, Production-Abfragen, Secret-Schreiben, Migration, Shadow Traffic, Product-Ausgabe, Ranking, Learning, Persistenz und Merge sind nicht Teil dieses Changes.

## Aktueller NO-GO

`main` stellt noch keinen freigegebenen Production-Port für die reale minimierte `RelevantUserProjection` und keine Founder-Live-spezifischen durable Idempotency-/Rate-Limit-Ports bereit. Der Adapter akzeptiert deshalb ausschließlich injizierte kanonische Ports. Eine Edge Function und jede Runtime-Aktivierung bleiben einer separaten Freigabe vorbehalten.
