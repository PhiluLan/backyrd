# Events direkt beim Spot pflegen

Status: **Live seit 18.10.2026**. Implementierung DATABASE_PR, Veröffentlichung PRODUCTION_RELEASE.

## Produktionsnachweis

- Main-Release: `af51fb0dd788809fa23c4b96b72c7abc029aa7fd` (PR #514).
- Main-Zertifizierung: Run `39109347891`, erfolgreich.
- Manifest: `11cb12b0f09ea4a7fb3e9205417260a0f1a8ee6c66b5a3947972fb1f52169b22`.
- Produktionsdeployment: Run `39109660214`, Ergebnis PASS; Audit `66715d1e50343466de43fb478f7e1a0eab7468c630d172ef38c6f75f8e304fff`.
- Datenbank: 187 Migrationen, neue Spitze `20261018015918_spot_event_authoring_v1`; Decision-Funktion Version 214 aktiv.
- Produktionsrechte geprüft: Anonyme dürfen den Writer nicht ausführen, authentifizierte Aufrufer gelangen zur serverseitigen Ownership-/Admin-Prüfung; Audit ist RLS-geschützt und für Clients nicht lesbar.
- Web und Admin: Vercel-Main-Deployments erfolgreich. Öffentliche Volta-Pong-Spotseite zeigt Open Court, den 26. Oktober um 16 Uhr, Gratis-Hinweis und Link zur konkreten Durchführung.
- iOS Production, Runtime `1.1.0`: Gruppe `e8a620df-cb67-4af7-aac6-7f5f67a21930`, Update `01a14e07-2c1a-7399-9f8f-67423d74d1a2`. Öffentlicher Update-Manifest und Bundle-Bytes stimmen mit dem CI-Artefakt überein.
- Grenzen der Sichtprüfung: Der Mac war beim abschliessenden nativen Admin-Browsertest gesperrt. Kein neues Testevent in Produktion angelegt; Erstellen/Freigeben wurde mit isolierter Datenbank und synthetischem Browser-RPC geprüft. Installation auf dem iPhone nicht beobachtet.
- Founder hat die begrenzte Terminbereinigung und anschliessend separat das ungeprobte Wiederherstellungsrisiko dieser exakten Migration bestätigt. Backup `39106807088` erfolgreich; kein Restore-Drill und keine Garantie für vollständigen Datenbank-Rollback.

## Bedienung

Owner und Admin öffnen im Spot den Bereich **Events & Veranstaltungen**. Einmalige und wiederkehrende Veranstaltungen sind dieselben kanonischen `events_v1` und `event_occurrences_v1`, die die öffentliche App und die Decision Engine lesen. Es gibt keinen zweiten Eventkatalog und keinen Eintrag im World-Spot-Ledger.

Der Spot ist als Veranstaltungsort fest verbunden. Das Formular erfasst Titel, Beschreibung, Termin (Europe/Zurich, auch über Mitternacht), Wochen-/Monatsrhythmus, Kategorien, ausdrücklich angebotene Aktivitäten, Musikformat, Eintritt, Mindestalter, Familienhinweis, Veranstalter und Link. Fehlende optionale Angaben bleiben unbekannt. Der erste Termin liegt höchstens ein Jahr in der Zukunft; eine bestehende laufende Serie darf ihr ursprüngliches Startdatum behalten.

Owner speichern Entwürfe oder reichen zur Prüfung ein. Nur Admins dürfen veröffentlichen. Die Admin-Eventliste zeigt eingereichte Events als „Zur Prüfung“ und führt zum zugehörigen Spot. Änderungen eines Owners ziehen ein veröffentlichtes Event bis zur erneuten Freigabe zurück; Absagen betreffen die gesamte Serie. Das kompakte Formular pflegt jeweils die ganze Serie. Die bestehende separate Eventverwaltung behält ihre Einzeltermin-Ausnahmen und Bildfunktionen für dort angelegte Events. Bestehende dort angelegte Events bleiben über diese Verwaltung bearbeitbar, damit deren umfangreichere Wiederholungsregeln nicht durch das kompakte Formular überschrieben werden.

Die neue Quelle `manual_owner` bleibt erkennbar und gelangt erst nach Admin-Veröffentlichung über den vorhandenen öffentlichen Reader in die Engine. Source-Evidenz und Aktivitäten bleiben getrennt von Venue-Fakten. Die App und die öffentliche Spotseite zeigen eine kompakte Liste der nächsten Veranstaltungen, eine nächste gültige Durchführung je Serie, mit Link zum genauen Termin.

## Berechtigungen und Integrität

- `save_spot_event_v1` speichert Event, Spot-Verknüpfung und Termine atomar. Die privilegierte Implementierung liegt im nicht exponierten Schema `event_authoring_private`; der öffentliche Einstieg ist ein Invoker-Wrapper.
- Die aktuelle Zuordnung `spots.owner_id` und die bestehende Admin-Prüfung werden bei jedem Aufruf aus der Datenbank geprüft. Ein ehemaliger Owner verliert sofort Schreibrechte. Keine neuen direkten Owner-Schreibrechte auf Eventtabellen oder Storage.
- Source, Spot, Actor und Freigabestatus kommen aus der Serverprüfung. Freigaben lassen sich nicht über Clientfelder fälschen.
- `updated_at` schützt vor dem Überschreiben paralleler Bearbeitungen. Eine stabile Request-ID verhindert eine zweite Erstellung bei unklarer Antwort; bei Konflikt bleibt der Entwurf erhalten und die Liste kann neu geladen werden.
- Jede Aktion über den neuen Editor wird privat mit Actor, Spot, Event, Zeitpunkt und Statusübergang protokolliert.
- Die bestehende öffentliche View, RLS, Freigabevoraussetzungen und Service-only Engine-Autorisierung bleiben erhalten.

## Prüfung

`supabase/tests/spot_event_authoring_v1.sql` prüft mit isolierten Fixtures Owner/Admin, Fremdzugriff, Publikationssperre, atomaren Fehlerfall, Quelle, wiederkehrende Nachttermine, öffentliche App-View, echten Service-Reader, Konflikte, Entzug der Ownership und erneute Freigabe. Die bestehenden Event-Reader-Tests bleiben aktiv. Ergänzend: Core-Matching für `manual_owner`, gemeinsame Präsentationstests gegen Duplikate/abgesagte Termine sowie Browserprüfung des Editors mit synthetischem RPC bei 390px.

Die Migration ist additiv und führt keinen Produktions-Backfill aus. Die Veröffentlichung erfolgte nach dem regulären Datenbank-/Produktrelease mit der separaten Freigabe der exakten Migration. Dieser Nachweis erteilt keine Freigabe für spätere Migrationen.
