# ADR-006 — Founder-Live Production Adapter (inaktiv)

Status: Draft, nicht aktiviert. Source base: `96f648cebbfdfd854aec688613ddbedb447c25bb`.

## Entscheidung

Die vorbereitete Founder-Live-Server-Grenze besitzt eine eigene, diskriminierte Mobile-Grenze. Es wird ausdrücklich keine Edge Function eingecheckt; ohne die separat autorisierten kanonischen Production-Ports existiert kein aktivierbarer Runtime-Einstieg. `FOUNDER_LIVE_READ_ONLY` ist eine nachvollziehbar als Evaluation gekennzeichnete Nur-Lese-Antwort ohne Spot-IDs, Navigation, Enrichment, Impressionen, Feedback, Memory, Learning oder Product-Ranking. `EXISTING_ENGINE` delegiert ausschließlich an den unveränderten v13-Pfad. Fehler, unbekannte Versionen und Cross-Engine-Continuations führen nie zu einem stillen Fallback.

Die Session wird serverseitig über Supabase Auth geprüft. UUID, Session und Subject Binding stammen nie aus dem Client-Payload. Die Allowlist konsumiert den kanonischen privaten User-Intelligence-Provider; sie besitzt keine Enumeration. World-Snapshots werden ausschließlich über den kanonischen `WorldKnowledgeReaderPort` aus einer serverprivaten, hashgebundenen Cohort gelesen. User Intelligence muss ausschließlich eine kanonische minimierte `RelevantUserProjection` über den injizierten Production-Port liefern; eine synthetische oder leere Ersatzprojektion ist verboten. Es gibt weder Raw-Event-Zugriff noch Writeback.

## Fail-closed Controls

- Standard: API aus, Kill Switch engaged, Sampling und Shadow Traffic 0.
- Fehlende Secrets, Manifest-, Snapshot-, Registry-, Session- oder Location-Bindungen stoppen die Auswertung.
- Request-Limit und Timeout begrenzen den technischen Slice. Der kanonische atomare Durable-Idempotenz-Port (`CREATED | REPLAYED | CONFLICT`) und der getrennte Gate-7-Rate-Limit-Port werden fail-closed gebunden; prozesslokale Ersatz-Stores sind für Production verboten. Auch ein gültiger Replay konsumiert weiterhin zuerst das getrennte Rate-Limit.
- Alle Decision Authorities (Product Output, Ranking, Eligibility, Confidence, Learning, Mutation) bleiben `false`.
- Es existiert kein Edge-Einstieg und damit kein Environment-basierter Aktivierungspfad.

## Mobile-Kompatibilität

Der alte `backyrd.decision-api.request@1.0`-Client bleibt Authority-frei. Der Server übersetzt nur Freitext und explizite Zielstadt. Mood-, Audience- und Place-Type-Werte werden nicht in erfundene Product-Semantik umgedeutet. Eine v13-Continuation kann nicht in Founder Live fortgesetzt werden. Die bestehende Binding-Datei enthält weiterhin keine vNext-Funktion; es findet keine Aktivierung statt.

## Nicht autorisiert

Deployment, Production-Abfragen, Secret-Schreiben, Migration, Shadow Traffic, Product-Ausgabe, Ranking, Learning, Persistenz und Merge sind nicht Teil dieses Changes.

## Aktueller NO-GO

Der atomare Durable-Idempotenz-Port ist über die gebundene Foundation aus PR #311 integriert. Die kanonische read-only Production-Projection-Factory des User-Tracks ist direkt gebunden und erlaubt weder Fallback noch Writeback. Der getrennte Gate-7-Rate-Limit-Adapter bindet ausschließlich den bereits kanonischen service-only RPC `backyrd_consume_launch_cost_boundary_v1`; er führt keine neue Migration ein. Runtime-/Edge-Autorisierung bleibt geschlossen. Eine Edge Function und jede Runtime-Aktivierung bleiben einer separaten Freigabe vorbehalten.
