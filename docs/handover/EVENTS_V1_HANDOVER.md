# Events V1 — technisches Handover

Stand: 6. September 2026  
Handover-Branch: `codex/events-v1-complete-technical-handover`  
Verifizierter Ausgangspunkt: `origin/main` @ `81721a242c2679c4da31e9e996183c10c3d31965`

Dieses Dokument beschreibt den aus Repository, CI, Supabase Production, Vercel und EAS nachweisbaren Stand. Chat-Zwischenstände sind kein Beleg. Wo eine ältere Dokumentation dem ausführbaren Repository oder dem verifizierten Production-Zustand widerspricht, ist der Widerspruch ausdrücklich vermerkt.

## 1. Product-Ziel

Events V1 ist Backyrds deterministischer Basel-Eventkalender. Nutzer sollen zuverlässig beantworten können: „Was läuft heute, morgen oder dieses Wochenende in Basel?“ Events werden synchronisiert beziehungsweise manuell gepflegt, validiert, als Event plus konkrete Occurrences gespeichert und ohne Ranking- oder Intelligence-Engine chronologisch ausgespielt.

Zum V1-Produkt gehören:

- **„Was läuft?“** als kleinste Integration in die bestehende Discovery-/Orte-Struktur, ohne neue globale Navigation.
- eine Event-Sektion auf Mobile- und Web-Home;
- Listen für Heute, Morgen, Wochenende und Alle sowie Kategorie-Filter;
- Event Cards und eine eigenständige Event-Detailansicht;
- die optionale, explizite Verknüpfung eines Event-Venues mit einem bestehenden Backyrd Spot;
- auf dem Detail zunächst weitere Occurrences derselben Serie („Nächste Termine“), danach andere Events am selben Venue;
- ehrliche Loading-, Empty- und Error-States.

Bewusst **nicht** Teil von Events V1 sind Event Intelligence, AI/LLM-Klassifikation, Ranking, Decision-Integration, Recommendation Engine, Ticketing, Event Reviews, Event Likes, Event Moods, Social-Funktionen, HTML-Scraping und die Erzeugung oder Anreicherung von Spots durch Eventimporte. Externe Bilder dürfen ohne belegte Nutzungsrechte nicht gespeichert oder angezeigt werden.

## 2. Canonical Architektur

### Datenfluss und Ownership

Der vorgesehene Source-Fluss lautet:

`Source Adapter → Staging → Validate/Normalize → Venue Match → Conservative Dedup → Event/Occurrences → Publish`

Die Datenbankseite dieses Flusses ist vorhanden. Ein ausführbarer externer Source-Adapter ist auf `main` derzeit nicht vorhanden; der aktive Production-Datensatz stammt aus `MANUAL_ADMIN`.

Supabase PostgreSQL ist die kanonische Quelle. Die relevanten Tabellen sind:

- `public.event_sources_v1` — Source-Vertrag, Rechte-/Aktivierungsstatus und Konfiguration;
- `public.event_ingest_runs_v1` — Ingest-/Reconciliation-Läufe;
- `public.event_staging_v1` — rohe, source-bezogene Staging-Daten;
- `public.event_venues_v1` — Venue-Daten und optionaler `matched_spot_id`;
- `public.events_v1` — langlebige Event-Entität und Recurrence-Vertrag;
- `public.event_occurrences_v1` — konkrete Termine;
- `public.event_source_records_v1` — Source-Record-Zuordnung, Fingerprints und Tombstones.

Die Consumer-Projektion ist `public.event_discovery_v1`. Die View läuft mit `security_invoker=true`, projiziert ausschließlich freigegebene Spalten und verbindet Event, Occurrence, Venue und optional Spot. Consumer lesen nicht aus Staging- oder Provenienz-Tabellen.

### Event und Occurrence

`events_v1` enthält Identität und semantische Stammdaten: Source und Source Event ID, Titel, Beschreibung, Kategorien, Status, Preis, Veranstalter, Links, Bildmetadaten, Recurrence-Regel, Provenienz sowie Lifecycle-Zeitpunkte. `event_occurrences_v1` enthält einzelne Start-/Endzeitpunkte, eigenen Status und Exception-Metadaten. Ein wiederkehrendes Event bleibt genau **ein** Event; jeder konkrete Termin ist eine Occurrence.

Relevante Eindeutigkeitsregeln:

- Event: `(primary_source_id, primary_source_event_id)`;
- regulär generierte Occurrence: partielle Eindeutigkeit `(event_id, recurrence_index)` für `is_recurrence_exception = false`;
- externe Source Records binden Source-Identität und Fingerprint für idempotente Wiederholung.

### Recurrence / RRULE-äquivalenter Vertrag

`events_v1.recurrence_rule` ist die langfristige Wahrheit. Es ist ein validiertes JSONB-Regelmodell, **kein frei interpretierter RFC-5545-RRULE-String**. Unterstützt werden einmalig, täglich, wöchentlich einschließlich Intervall und Wochentagen sowie monatlich; ein optionales `until` oder `count` begrenzt die Serie.

Für manuelle Events materialisiert `public.regenerate_manual_event_occurrences_v1(uuid)` deterministisch nur den rollierenden Zeitraum von heute bis zwölf Monate in die Zukunft in der Zeitzone `Europe/Zurich`. `public.reconcile_manual_event_occurrences_v1()` verlängert denselben Horizont für alle manuellen Serien und beendet vergangene, noch `SCHEDULED` geführte Termine. Ein externer täglicher Scheduler für diese RPC ist im Repository beziehungsweise in Production nicht belegt; die RPC selbst und der aktuelle 12-Monats-Bestand sind belegt.

Einzelne Änderungen oder Absagen erhalten `is_recurrence_exception = true`. Die Regeneration löscht oder überschreibt solche Zeilen nicht und unterdrückt die reguläre Neugenerierung anhand von `recurrence_index` beziehungsweise `original_start_at`. Damit bleiben Exceptions bei Refresh/Reconciliation erhalten.

### Lifecycle

Event-Status: `DRAFT`, `PUBLISHED`, `SCHEDULED`, `POSTPONED`, `CANCELLED`, `ENDED`, `DELETED`.  
Occurrence-Status: `SCHEDULED`, `POSTPONED`, `CANCELLED`, `ENDED`, `DELETED`.

`published_at` und RLS steuern die Consumer-Sichtbarkeit. Gelöschte Events beziehungsweise Occurrences werden aus der Discovery-View ausgeschlossen. Abgesagte Termine bleiben ausspielbar, damit die Absage ehrlich kommuniziert werden kann. Source-Reconciliation kann verschwundene externe Records tombstonen und zugehörige Daten als gelöscht/unveröffentlicht markieren.

### Provenienz und Bilder

Die interne Provenienz bleibt in `events_v1.provenance`, Source-Feldern und Bildmetadaten erhalten, wird aber nicht ungefiltert an Consumer ausgegeben. Für `MANUAL_ADMIN` zeigt die Presentation Layer bei Bedarf „Angaben vom Veranstalter“.

Der öffentliche Storage-Bucket ist `event-images` mit 10 MiB Limit und JPEG/PNG/WebP-Allowlist. Authentifizierte Admins dürfen über `admin_is_admin_v1()` hochladen, ersetzen und löschen. Ein Event darf nur dann einen Storage-Pfad führen, wenn `image_rights_verified = true` und ein Credit gespeichert ist. Beim aktuellen manuellen Workflow wird das Bildrecht intern belegt; interne Upload-/Founder-Texte werden consumer-seitig unterdrückt. Externe Ingestion übernimmt derzeit ausdrücklich kein Bild.

Beim Ersetzen eines Admin-Bildes wechselt die Event-Referenz auf das neue Objekt. Der aktuelle Client löscht das zuvor referenzierte Storage-Objekt nicht automatisch; eine Orphan-Bereinigung ist nicht implementiert.

### Venue Matching und Spots

Die fachliche Reihenfolge lautet:

1. stabile Source-/Venue-ID;
2. exakte Adresse beziehungsweise eindeutige Koordinaten;
3. normalisierter Name im passenden Ort.

Es gibt keine aggressive Fuzzy-Zusammenführung. Unsichere Venues bleiben unmatched. Das Ingest-RPC übernimmt ein bereits ermitteltes Match; ein ausführbarer externer Matcher/Adapter ist aktuell nicht im Repository. Der manuelle Admin-Flow wählt dagegen einen vorhandenen, freigegebenen Spot explizit und legt nur die Venue-Zuordnung mit `SOURCE_ID` und Confidence `1` an. Events erstellen oder verändern keine Spot-Daten.

### RLS, ACL, Consumer Reads und Admin Writes

RLS ist auf allen sieben Events-Tabellen aktiv. `anon` und normale `authenticated` Consumer erhalten nur eine spaltenbezogene Read-Allowlist für veröffentlichte, nicht gelöschte Events/Occurrences und deren sichtbare Venues. Ein Production-Negativtest auf nicht freigegebene Provenienzspalten wurde mit `42501 insufficient_privilege` abgewiesen. Die View erbt als Security-Invoker diese Regeln.

Admin-Policies erlauben `SELECT/INSERT/UPDATE/DELETE` nur bei `admin_is_admin_v1()`. Source-Konfiguration, Runs, Staging und Source Records bleiben `service_role`-only. Die Admin-Oberfläche schreibt Event/Venue direkt über den authentifizierten Supabase-Client und ruft anschließend die Recurrence-RPC auf; Bild-Upload, Event-Upsert und Regeneration sind aktuell kein einzelner atomarer RPC-Workflow.

Relevante Funktionen/RPCs:

- `public.ingest_event_record_v1(jsonb, jsonb, uuid, timestamptz)` — `service_role`-only;
- `public.reconcile_event_source_v1(text, uuid, timestamptz, timestamptz, timestamptz)` — `service_role`-only;
- `public.regenerate_manual_event_occurrences_v1(uuid)` — RLS-geschützter manueller Refresh;
- `public.reconcile_manual_event_occurrences_v1()` — RLS-geschützter rollierender Refresh;
- `public.set_events_v1_updated_at()` — Timestamp-Triggerfunktion.

### Relevante Repository-Dateien

Schema und Beweise:

- `supabase/migrations/20260905193445_create_events_v1_basel_pilot.sql`
- `supabase/migrations/20260905203748_extend_events_v1_manual_admin.sql`
- `supabase/migrations/20260905212123_bound_manual_event_recurrence_horizon.sql`
- `supabase/migrations/20260905212627_keep_external_event_sources_disabled_for_manual_pilot.sql`
- `supabase/canonical/application-schema-events-v1.sha256`
- `supabase/canonical/public-acl-events-v1.sha256`
- `supabase/production/preapplied-migration-import.json`
- `scripts/ci/events-v1-later-application-schema-reconstruction.sql`
- `scripts/ci/events-v1-later-public-acl-reconstruction.sql`
- `docs/decision/D2_D3_EVENTS_V1_EVIDENCE_RECERTIFICATION_V23_2026_09_06.md`

Shared Contract und Presentation:

- `packages/shared/src/dto/event.ts`
- `packages/shared/src/presentation/event.ts`
- `packages/shared/src/index.ts`
- `packages/shared/test/event-presentation.test.mjs`

Admin:

- `admin-dashboard/app/sidebar.tsx`
- `admin-dashboard/app/events/page.tsx`
- `admin-dashboard/app/events/EventEditor.tsx`
- `admin-dashboard/app/events/new/page.tsx`
- `admin-dashboard/app/events/[id]/edit/page.tsx`

Mobile:

- `mobile/app/events/index.tsx`
- `mobile/app/events/[id].tsx`
- `mobile/components/events/HomeEventsSection.tsx`
- `mobile/lib/events-v1.ts`
- `mobile/app/(tabs)/index.tsx`
- `mobile/app/_layout.tsx`
- `mobile/metro.config.js`

Consumer Web:

- `web/app/events/page.tsx`
- `web/app/events/[id]/page.tsx`
- `web/app/events/events.module.css`
- `web/components/home-events.tsx`
- `web/components/consumer/home-experience.tsx`
- `web/lib/events-public.ts`
- `web/tests/consumer-contracts.test.mjs`

## 3. Manual Admin

Der Navigationspunkt **Events** ist im Admin vorhanden. Der aktuelle Funktionsumfang ist:

- Liste der `manual_admin`-Events;
- Suche nach Titel oder Veranstalter;
- Filter für Alle, Draft, Published, Cancelled und Ended;
- neues Event anlegen und bestehendes Event bearbeiten;
- lokale Formularvorschau;
- als Draft speichern oder veröffentlichen;
- gesamte Veranstaltung absagen;
- einmalige, tägliche, wöchentliche, alle X Wochen und monatliche Regeln mit optionalem Enddatum oder Occurrence-Anzahl;
- deterministische Regeneration ohne Event-Duplikate;
- einzelne Occurrence absagen;
- einzelne Occurrence verschieben beziehungsweise ihre Zeit ändern, ohne die Serie zu zerstören;
- Eventbild hochladen und Event-Referenz ersetzen;
- einen bestehenden freigegebenen Backyrd Spot auswählen oder das Venue ehrlich unmatched lassen;
- Mehrfachkategorien, Mindestalter, Familienstatus, Gratis/Preis, Veranstalter und externen Link pflegen.

Einzeltermin-Änderungen werden als Exceptions erhalten. `created_by` wird im aktuellen Client nicht gesetzt; der Production-Testdatensatz hat deshalb `created_by = null`. Die Vorschau ist eine lokale Formularvorschau, keine separate veröffentlichte Preview-URL.

## 4. Consumer Product

### Mobile

Mobile enthält „Was läuft?“ mit Heute, Morgen, Wochenende und Alle, Kategorieauswahl, Event Cards, Loading/Error/Empty/Refresh, Event Detail, Home-Sektion, Venue Card, „Spot ansehen“, Route, „Mehr erfahren“, kompakte nächste Serientermine und weitere Events am selben Venue.

### Consumer Web

Web enthält `/events`, `/events/[id]`, dieselben Kernkarten und Detailinformationen sowie die Home-Sektion. Der aktuelle Web-Filter exponiert für den Basel-Pilot die Kategorien Sport, Aktivität und Freizeit. Mobile exponiert die vollständige vorhandene Kategorieauswahl.

### Gemeinsame Presentation-Semantik

Mobile und Web verwenden `packages/shared/src/presentation/event.ts` für lokalisierte Kategorien, natürliche Recurrence-Texte, Zeitspannen, Alters-/Familieneigenschaften, Adressbereinigung und sichere Source-/Bild-Credits. Das Detail zeigt Bild nur bei belegtem Recht, Titel, Datum, vollständige Zeit, Recurrence, Kategorien, Preis/Gratis, Alter/Familie, Beschreibung, Veranstalter und externen Link.

Die Venue Card erscheint nur bei einem `matched_spot_id`. Fehlendes Spotbild wird nicht ersetzt oder erfunden; Event-Details fragen aktuell keine Spot-Moods ab. Die Route verwendet Koordinaten, falls vorhanden, sonst die bereinigte Adresse beziehungsweise den Venue-Namen.

„Nächste Termine“ zeigt weitere Occurrences derselben Serie kompakt, zunächst drei und über „Alle Termine“ weitere. „Weitere Events im &lt;Venue&gt;“ ist eine getrennte, chronologische Auswahl anderer Events am selben Venue. Ein Fallback auf beliebige andere Basel-Events ist aktuell nicht implementiert; es gibt keine Recommendation Engine.

### Nachweisbare Abweichung zwischen Mobile und Web

Der Repository-Stand definiert „Wochenende“ nicht identisch: Mobile berechnet Samstag/Sonntag, Web filtert Freitag/Samstag/Sonntag. Das widerspricht einem vollständigen Cross-Surface-Filtergleichlauf und ist als bekannte, nicht in diesem Handover behobene Product-Abweichung zu behandeln. Die oben genannte gemeinsame **Presentation**-Semantik ist davon unberührt.

## 5. Open Court Volta Pong — Production-Testdatensatz

Production wurde am 6. September 2026 direkt gelesen und gegen die öffentliche Projektion sowie privilegiert gegen die interne Provenienz geprüft.

| Feld | Production-Wert |
|---|---|
| Event-ID | `9a3fc0d4-21dd-4c15-a5e8-49329d501410` |
| Primary Source | `manual_admin` |
| Source Event ID | `9a3fc0d4-21dd-4c15-a5e8-49329d501410` |
| Provenienz | `MANUAL_ADMIN`; Bildquelle `FOUNDER_PROVIDED` |
| Venue-ID | `e5c1695f-1bbc-4b6c-ad27-2dfe08e5b3f7` |
| Bestehender Spot-ID | `580d1398-38e7-46d2-8cff-07f0b167e2ae` |
| Match | `SOURCE_ID`, Confidence `1` |
| Adresse | `Voltastrasse 30, 4056 Basel, Schweiz` |
| Storage-Pfad | `9a3fc0d4-21dd-4c15-a5e8-49329d501410/founder-open-court-volta-pong-8db570f8.jpg` im Bucket `event-images` |
| Bilddatei | `1-Foto-1.jpg`, SHA-256 `8db570f8a4f69a871bda8383ed7811156e9871e14d1ad2dca49e01c3c06d943b` |
| Bildrechte | `image_rights_verified = true`; Credit intern `Vom Founder für dieses Event hochgeladen`; consumer-seitig unterdrückt |
| Recurrence | wöchentlich, Intervall `2`, Montag, 16:00–23:00 Europe/Zurich, ohne langfristiges Enddatum/Count |
| Materialisierte Occurrences | `26`, alle `SCHEDULED`, keine aktuelle Exception |
| Materialisierter Zeitraum | 14.09.2026 bis 30.08.2027 |
| Erste Occurrence-ID | `d8946233-d4e1-4d5f-8481-b16051c2b4bf` |
| Letzte Occurrence-ID | `424a0792-a597-4b5f-b2cb-5999c93a5360` |
| Kategorien | `SPORT`, `ACTIVITY`, `LEISURE` |
| Mindestalter/Familie | 14 / Ja |
| Preis | Gratis; `price_min = 0`, `CHF` |
| Veranstalter | Volta Pong |
| Link | `https://voltapong.ch` |
| Publication State | `PUBLISHED`, `published_at = 2026-09-06T07:19:03.146Z` |

Der verknüpfte Production-Spot ist freigegeben und wurde nicht durch den Eventimport erstellt. Er hat aktuell weder `header_photo_path` noch in der Eventansicht ausspielbare Mood-Daten. Die Venue Card stellt das ehrlich dar und schreibt keine Eventdaten in Spot-Facts zurück.

Der öffentliche Bildabruf lieferte HTTP 200, `image/jpeg`, 148011 Bytes. Der erste Termin wird öffentlich mit „Montag, 14. September · 16:00–23:00“ ausgespielt.

## 6. External Sources

In Production sind **alle externen Sources deaktiviert** (`ingestion_enabled = false`). Der aktuelle Source-Stand lautet:

| Source | Repository-/Production-Status |
|---|---|
| Eventfrog | Source Contract (`API`, `PUBLIC_API_TERMS`) und generische SQL-Ingest-/Reconciliation-Verträge vorhanden; Production deaktiviert; externe Bilder deaktiviert. Kein ausführbares `@backyrd/events-sync`-Paket oder Eventfrog-HTTP-Adapter auf canonical `main`. Kein aktivierter, vom Runtime-Code nutzbarer Eventfrog-Token belegt. |
| PROZ/ProgOnline | Source Contract `CONTRACT_PENDING`; Production deaktiviert; kein Adapter. Aktivierung erst mit Lizenz/Vertrag und API-Zugang. |
| BaselLive | Source Contract `CONTRACT_PENDING`; Production deaktiviert; nur ausdrückliche Partnership, kein HTML-Scraping. |
| Basel-Stadt OGD | Source Contract `OPEN_DATA_LICENSE`; Production deaktiviert; als ergänzende Quelle vorgesehen, kein aktiver Adapter. |
| Manual Admin | Aktiv gepflegter Pfad; kein externer Ingest. Manuell autorisierte Bilder zulässig. |

Wichtiger Dokumentationswiderspruch: `docs/events/EVENTS_V1_BASEL_PILOT.md` nennt als zukünftigen Pilotbefehl `npm --workspace @backyrd/events-sync run pilot:eventfrog`. Dieses Workspace-Paket existiert auf dem verifizierten `main` nicht. Die SQL-Tests belegen den kanonischen Ingest-Vertrag mit synthetischen Records, **nicht** einen echten Eventfrog-API-Import.

Für Ticketmaster, basel.com/Basel Tourismus, Kaserne Basel, Theater Basel, Kunstmuseum Basel, HEK, Kuppel und Viertel existieren auf canonical `main` keine registrierten V1-Source-Contracts oder Adapter. Im Repository befindet sich außerdem kein eigenständiges kanonisches Source-Discovery-Ergebnis mit belastbaren Einzel-Lizenzentscheiden für diese Quellen; deshalb werden hier keine erfundenen Zugangs- oder Nutzungsrechte attestiert.

Die akzeptierte Source-Discovery-Richtung für eine spätere Freigabe ist:

**Eventfrog + lizenzierter PROZ/ProgOnline-Zugang + BaselLive-Partnership; Basel-Stadt OGD als Ergänzung.**

Es gilt weiterhin: kein Scraping, keine ungeklärten Bilder, keine Event Intelligence Engine und keine Aktivierung weiterer Adapter ohne Founder-Freigabe.

## 7. Product Polish

| Founder-Finding / Zielzustand | Implementierung | Production |
|---|---|---|
| Keine `MANUAL_ADMIN`-/`manual_admin`-/internen Uploadtexte consumer-sichtbar; stattdessen „Angaben vom Veranstalter“ | IMPLEMENTED | DEPLOYED; Live-Web negativ/positiv geprüft |
| `SPORT` → Sport, `ACTIVITY` → Aktivität, `LEISURE` → Freizeit | IMPLEMENTED | DEPLOYED |
| Natürliche Recurrence Copy, für Open Court „Jeden zweiten Montag“ | IMPLEMENTED | DEPLOYED |
| Start- und Endzeit, „Montag, 14. September · 16:00–23:00“ | IMPLEMENTED | DEPLOYED |
| Eigenschaften „Ab 14 Jahren“ und „Familiengeeignet“; Unknown ausgeblendet | IMPLEMENTED | DEPLOYED |
| Consumer-Adresse ohne redundantes Schluss-„Basel“ | IMPLEMENTED | DEPLOYED |
| Kompakte „Nächste Termine“ plus „Alle Termine“ | IMPLEMENTED | DEPLOYED |
| Getrennte „Weitere Events im &lt;Venue&gt;“ nur bei tatsächlich anderen Venue-Events | IMPLEMENTED | DEPLOYED |

Der Production-Web-Detail-HTML enthielt alle erwarteten Texte und keinen internen Source-/Founder-Uploadtext. Die gemeinsame Presentation-Library und ihre Tests gelten für Mobile und Web. Die abweichende Weekend-Zeitspanne aus Abschnitt 4 ist eine separate Filterlogik-Abweichung und darf nicht als gelöste Parität dargestellt werden.

## 8. Metro-/Decision-v26-Stand

Nach dem ersten Product-Polish-Stand wurde ein Mobile-OTA-Lauf **vor dem Upload sicher abgebrochen**. Es wurde aus diesem fehlgeschlagenen Versuch keine fehlerhafte OTA erzeugt oder veröffentlicht.

Root Cause: Mobile importiert die Shared Presentation zur Laufzeit aus `../packages/shared`, aber Expo Metro beobachtete dieses Verzeichnis nicht. Der Bundle-Schritt konnte `../../../packages/shared/src/presentation/event` deshalb nicht auflösen.

Der minimale Fix war ausschließlich:

- `mobile/metro.config.js`: `path.resolve(__dirname, "../packages/shared")` zu `watchFolders` hinzufügen.

Danach bestanden lokale iOS- und Android-Exports. Der Founder autorisierte die additive Decision-v26-Evidence-Re-Zertifizierung ausdrücklich nur für diese Datei und diesen Packaging-Scope. Die Re-Zertifizierung wurde tatsächlich durchgeführt:

- Contract: `decision-lab/config/decision-v13-production-recertification-v26.json`;
- Evidence: `docs/decision/D2_D3_EVENTS_V1_METRO_PACKAGING_RECERTIFICATION_V26_2026_09_06.md`;
- Fix-Commit: `95ba3174787a4f40d6d81dcf107a34eab292a383`;
- PR #211 wurde regulär gemergt;
- Decision Lab: `318/318 PASS`;
- lokale iOS-/Android-Exports: PASS;
- Production OTA wurde anschließend aus canonical `main` veröffentlicht.

Unverändert blieben Decision Engine, Ranking, Mood, Taste, N4/Gold, Auth, Push, Deep Links, Gate-1–7, Events-Modell/-Semantik, DB, RLS, Admin und Spot Engine. Die v26-Bindung ist eine Packaging-Evidence-Bindung und keine semantische Produktänderung.

## 9. Repository-, PR-, Migration- und Deployment-Lineage

### Pull Requests

| PR | Inhalt | Ergebnis | Merge-Commit |
|---|---|---|---|
| #208 | Events V1: manual Basel production pilot | MERGED, 06.09.2026 08:29Z | `fbaca4422eba56cb337e4565b90b8612b732ef9a` |
| #209 | canonical Phase-1 Mobile Design | MERGED, 06.09.2026 09:38Z | `612209ba40ff42075e209a6731e6419a21f4e7d4` |
| #210 | Events V1 consumer presentation polish | MERGED, 06.09.2026 10:40Z | `3454f012c9c1d70b71dafda5e0b2cd31c8d9b234` |
| #211 | Mobile Shared-Presentation Metro Packaging | MERGED, 06.09.2026 10:55Z | `81721a242c2679c4da31e9e996183c10c3d31965` |

Beim Handover-Check gab es keinen offenen Events-/Polish-PR. Die früheren Remote-Branches für Events Polish/Metro waren bereits nach Merge gelöscht. Der eigentliche lokale Repository-Checkout enthielt umfangreiche, nicht zu Events gehörende Decision-Arbeiten auf `codex/canonical-semantic-alignment-v1`; dieses Handover wurde deshalb in einem separaten sauberen Worktree vom verifizierten `origin/main` erstellt und verändert ausschließlich diese Datei.

### Canonical Main und Required Checks

Verifizierter canonical `origin/main` HEAD vor Erstellung dieses Dokuments:

`81721a242c2679c4da31e9e996183c10c3d31965`

Für diesen Commit bestanden die relevanten GitHub-Workflows:

- CI / Security — PASS;
- Supabase Production Deployment — PASS, einschließlich Source-aware Contract und canonical-main Production Deploy;
- CI / Database — PASS;
- CI / Quality — PASS.

### Events-Migrationen und v23-Re-Zertifizierung

Die vier Production-Migrationen wurden bei PR #208 eindeutig über Repository-Datei-Hash, normalisierten Statement-Hash und Production-Schema-Fingerprint zugeordnet. Es gab keine Ledger-Reparatur, keine History-Umschreibung und keine erneute Anwendung.

| Migration | Repository SHA-256 | Statements | Statement SHA-256 |
|---|---|---:|---|
| `20260905193445_create_events_v1_basel_pilot.sql` | `69975ac8f4f9b04f218412fb260412c0b4940013c61a97b77d8f7d680475650d` | 54 | `8427ea390bf8a45bef6acbd1a7fe9ddbc89c7e0e50cee3e69d1ac4f8f8a55482` |
| `20260905203748_extend_events_v1_manual_admin.sql` | `030d5b72fe0879390feb63ab448145ac62d6061d692660da8b82c94ec7f1da89` | 31 | `1bea4917ba7a1975509377f5927c57a331ffc4a53d74d806d449a82763387dc6` |
| `20260905212123_bound_manual_event_recurrence_horizon.sql` | `4b3a9b881a3e9dd562b40afa510b17c2d465d086c6f2e4616baab210bcae4a18` | 6 | `7a50e7960ccab611e29ddcc64289d8c4aef4bc031b8c4fe1482bd19e77535e4f` |
| `20260905212627_keep_external_event_sources_disabled_for_manual_pilot.sql` | `0a7814ce964860fb3c6cab4e0adc89c57588d9083064788660a125b86b8f71bc` | 1 | `7421d12d21d2f4c275931999280f159dc85381acdc46ae2e839ba8cdc30dee8f` |

Events-spezifischer Production-/Fresh-Boot-Schema-Fingerprint:

`1335d79ea194ba39e89ea56891f27b62c6134c4343446f7f83197e78126379dd`

Events-spezifischer Public-ACL-Fingerprint:

`ce26543378b1e9c67cf89e29a0af2e4a434f5ca6aaf0afe679cebcac961e562e`

Die historische Gate-Rekonstruktion entfernt die später hinzugekommenen Events-Objekte und Grants nur innerhalb der jeweiligen Beweistransaktion. Production zeigte beim v23-Beweis 7/7 Events-Tabellen mit RLS, 22 Storage-Policies, 0 aktivierte externe Sources, 1 manuelles Event und 26 Occurrences. Der vollständige Canonical Database Boot und die relevanten Schema-/ACL-Gates waren PASS.

### Web Production

Vercel meldete für canonical main erfolgreiche Deployments. `https://www.backyrd.ch/events` und die Open-Court-Detailseite lieferten HTTP 200; `backyrd.com` ist nicht die kanonische Domain und lieferte beim Check 404. Die verifizierten Deployment-IDs waren:

- `backyrd-intelligence`: `CEBuNxoRwJBZWdzpjeiHwpoJVQSp`;
- `backyrd-web`: `67CyZCTm5cjb6qJp8hAwArZbvKcf`.

### Mobile Production OTA

Die aktuelle Events-relevante Production-OTA ist:

- Group: `c3a98122-3132-4aa8-ae0e-12eff3c0615e`;
- Android Update: `01a0765f-e040-738e-aa68-02cba139fe99`;
- iOS Update: `01a0765f-e040-7e0e-9490-a8325fcac061`;
- Channel/Branch: `production`;
- Runtime: `1.1.0`;
- Git Commit: `81721a242c2679c4da31e9e996183c10c3d31965`;
- `isGitWorkingTreeDirty = false` für beide Plattformen.

Damit stammt die OTA nachweisbar aus demselben canonical-main-Commit, der Events V1, das neue Design, Product Polish und den Metro-Fix enthält.

### Source-aware Lineage und dokumentierter Widerspruch

`docs/operations/PRODUCTION_PRODUCT_LINEAGE.json` ist im aktuellen Repository ein **vor Deployment gebundener Candidate-Manifest-Stand**. Seine Mobile-/Web-Felder zeigen noch ältere deployed Commits/Groups und `production_verified = false`; die DB-Lineage ist dort Production-verifiziert. Dieser Manifest-Stand ist für die nachfolgende tatsächliche Mobile-/Web-Auslieferung veraltet. Die neueren GitHub-, EAS-, Vercel- und Live-HTTP-Belege oben sind die aktuelle Production-Truth. Das Manifest wird in diesem reinen Handover-Commit bewusst nicht verändert.

## 10. Unveränderliche Invarianten

Events V1 darf folgende Systeme und Semantiken nicht verändern:

- Decision Engine und Decision-Evidence-Semantik;
- Mood und Taste;
- N4/Gold;
- Ranking;
- Auth;
- Trust & Safety;
- Spot Engine und Spot-Facts;
- Gate-1–7 Product-Semantik.

Es gibt keine Event Reviews, Event Likes, Event Moods, Social-Mechanik oder eigenes Ticketing. Eventimport darf keinen Spot erzeugen oder Spotdaten überschreiben. Guards, RLS, ACL und Rechteprüfungen dürfen nicht gelockert werden.

## 11. Known Deferred

- echter Eventfrog-Basel-Pilot nach Implementierung eines überprüfbaren API-Adapters, aktiviertem Token und separater Founder-Freigabe;
- BaselLive ausschließlich über ausdrückliche Partnership;
- PROZ/ProgOnline ausschließlich mit Lizenz/Vertrag und API-Zugang;
- Basel-Stadt OGD als klar lizenzierte Ergänzung nach separater Scope-Freigabe;
- externe Bilder nur mit pro Source belegtem Recht und Credit;
- weitere Source-Adapter erst nach Founder-Freigabe;
- Aktivierung/Beweis eines täglichen Schedulers für den rollierenden manuellen Reconciliation-Refresh;
- Entscheidung und anschließende Angleichung der unterschiedlichen Mobile-/Web-Weekend-Definition;
- optionaler Storage-Orphan-Cleanup bei manuellem Bildersatz;
- Spot-Moods in der Venue Card nur bei eigenem, freigegebenem Product Contract; aktuell nicht abgefragt;
- allgemeiner „andere kommende Basel-Events“-Fallback nach den Venue-Events ist nicht implementiert und darf nicht als Recommendation Engine eingeschleust werden.

## 12. Exact Current Status

| Bereich | Exakter Stand |
|---|---|
| **EVENTS SCHEMA** | **PRODUCTION PASS** — vier Events-Migrationen attestiert, Events-Fingerprint konvergent, 7/7 Tabellen mit RLS, Canonical Database Boot und ACL-Gates PASS. |
| **MANUAL ADMIN** | **PRODUCTION DEPLOYED** — Create/Edit, Draft/Publish/Cancel, Suche/Filter, Preview, Recurrence, Einzel-Exceptions, Bild-Upload/-Referenzwechsel und Spot-Auswahl vorhanden. |
| **OPEN COURT PRODUCTION** | **PUBLISHED** — Event `9a3fc0d4-21dd-4c15-a5e8-49329d501410`, Founder-Bild mit verifizierten Rechten, 26 kommende Occurrences. |
| **MOBILE** | **PRODUCTION DEPLOYED** — OTA Group `c3a98122-3132-4aa8-ae0e-12eff3c0615e` aus canonical main, iOS und Android. |
| **WEB** | **PRODUCTION DEPLOYED** — Events-Liste und Open-Court-Detail auf `www.backyrd.ch` mit HTTP 200 und Live-Polish-Beleg. |
| **HOME INTEGRATION** | **DEPLOYED** — Mobile- und Web-Home enthalten die Event-Sektion. |
| **EVENT DETAIL** | **DEPLOYED** — Bild, Zeit, Recurrence, Eigenschaften, Venue/Spot, Route, externer Link und deterministische Folgetermine. |
| **RECURRENCE** | **PASS** — langfristige JSONB-Regel, rollierende 12 Monate, idempotente Generierung und Exception-Erhalt; Scheduler-Aktivierung nicht belegt. |
| **VENUE MATCH** | **PASS FÜR MANUAL PILOT** — vorhandener Production-Spot Volta Pong per stabiler Spot-ID verbunden, kein Spot erzeugt; externer Matcher noch nicht implementiert. |
| **PRODUCT POLISH** | **DEPLOYED/PASS FÜR DIE ACHT PRESENTATION-PUNKTE** — gemeinsame Shared Presentation; bekannte Weekend-Filterabweichung bleibt offen. |
| **EVENTFROG** | **DISABLED / ADAPTER PENDING** — Source-/SQL-Vertrag vorhanden, kein ausführbarer Adapter, kein aktivierter Token, kein Production-Ingest. |
| **EXTERNAL SOURCES** | **DISABLED** — PROZ/BaselLive vertraglich pending, OGD ergänzend vorgesehen; keine externe Source produziert Daten. |
| **DECISION/GATE SEMANTICS CHANGED** | **NO** — v23/v26 Evidence bestätigt unveränderte Decision-, Ranking-, Mood-, Auth-, Spot- und Gate-1–7-Semantik. |
| **CURRENT BLOCKER** | Kein Blocker für das ausgelieferte manuelle Events V1; externe Ingestion ist durch fehlenden Adapter/Token beziehungsweise fehlende Partnerschaft/Lizenz blockiert. Zusätzlich besteht eine nicht blockierende Mobile-/Web-Abweichung bei der Weekend-Definition. |
| **NEXT EXACT STEP** | Dieses Dokument reviewen; danach ohne neue Founder-Freigabe weder Source aktivieren noch Product-Semantik ändern. Bei neuem Scope zuerst die Weekend-Definition festlegen oder für den späteren Eventfrog-Pilot Adapter, Token und Rechtebeleg vollständig herstellen. |
