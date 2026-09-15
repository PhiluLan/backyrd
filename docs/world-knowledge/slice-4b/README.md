# World Knowledge Slice 4B — Contextual Spot Semantics

Status: Draft-PR, lokale Founder-Umgebung, keine Production-Aktivierung und keine Decision-vNext-Anbindung.

## Fachliche Grenze

Slice 4B ergänzt Registry 2.1 additiv um fünf Aussagen. `purpose.primary_visit` beantwortet den hauptsächlichen Besuchsgrund. `offering.onsite` beschreibt nur ein zum Spot gehörendes oder eingebettetes Zusatzangebot; ein Angebot in der Nähe ist ausdrücklich kein Spot-Fakt. `context.visit_situations`, `context.atmosphere` und `context.typical_dayparts` tragen optionale Bedingungen für Tageszeit, Wochentag, Bereich, Anlass, Gruppengröße, Alterskonstellation, Begleitung und Veranstaltungsbetrieb.

Atmosphäre ist beobachtbares, kontextgebundenes World Knowledge und weder User Taste noch ein Nutzer-Intent. Direkte Legacy-Suitability, Mood-Scores und numerische Confidence bleiben ausgeschlossen. Die neuen Kontextattribute sind nicht für `INTENT_MATCHING` autorisiert. Ein späterer Consumer muss den separaten `backyrd.world-knowledge.context-handoff@1.0` ausdrücklich unterstützen; unbekannte Versionen scheitern fail-closed.

## Bestehendes System

- **KEEP:** append-only Claims, Source/Actor/Verification-Trennung, Resolver, Registry Governance, Founder Scope und serverseitige Owner/Admin-Authority.
- **ADAPT:** Authoring erhält den neunten Bereich „Besuch und Atmosphäre“; Source- und Entitlement-Policies werden auf 4b.1 gebunden; der Shadow Resolver verarbeitet Registry 2.1.
- **REPLACE:** keine parallelen Modelle. Die unbedingte Research-Aussage `research.subjective_fits` wird nicht in die neue objektive Semantik umgedeutet.
- **PROHIBITED:** User Taste, User Intent, N4-Suitability, Mood-Confidence, Abo, Payment, Kontakte oder Angebote in der Nähe im Context-Handoff.

Die maschinenlesbare Zuordnung steht in `compatibility-matrix.json`. Historische Registry-2.0-Artefakte und deren Hash bleiben unverändert validierbar.

## Lokale Founder-Kohorte

Die additive Migration und 24 kontextuelle Claims wurden ausschließlich auf der isolierten Founder-Datenbank angewendet. Die fünf bereits ausgewählten Kohorten-Spots bleiben unter ihren vorhandenen IDs erhalten. Wiederholung derselben 24 idempotenten Requests erzeugte null neue Claims.

| Spot | Hauptzweck | Zusatzangebot vor Ort | kontextuelle Aussage | bewusst offen |
| --- | --- | --- | --- | --- |
| Volta Bräu | Essen oder trinken | keines erfunden | abends im Normalbetrieb | Besuchssituation, Atmosphäre |
| ELYS Boulderloft | Sport und Bewegung | Familien-Bistro, Kinder-Spielbereich | Familie mit gemischtem Alter und erwachsener Begleitung | Atmosphäre, typische Tageszeit |
| Tierpark Lange Erlen | Natur- oder Tiererlebnis | Kiosk, Spielplatz | Familie mit gemischtem Alter und erwachsener Begleitung; Vormittag/Nachmittag | Atmosphäre |
| Consum Weinbar | Essen oder trinken | eingebettete Unterkunft | keine ungesicherte Situation abgeleitet | Besuchssituation, Atmosphäre, typische Tageszeit |
| Café Frühling | Essen oder trinken | Laden als Teil des Spots | Frühstück am Morgen; Werktags-Mittagessen | Besuchssituation, Atmosphäre |

Die Aussagen beruhen auf bereits vorhandenen lokalen objektiven Fakten und den offiziellen Spot-Seiten: Volta Bräu (`voltabraeu.ch`), ELYS Boulderloft (`boulderloft.ch`), Tierpark Lange Erlen (`erlen-verein.ch`), Consum (`consumbasel.ch`) und Café Frühling (`cafe-fruehling.ch`). Unbelegte Atmosphäre oder pauschale Eignung wurde nicht geraten, sondern ausdrücklich unbekannt gelassen. Der frühere Claim-Bestand jedes Spots ist byte-identisch erhalten; nur neue 4B-Claims und ihre serverseitig gebundenen `ADMIN_CONFIRMED`-Verification Records kamen hinzu.

Der deterministische lokale Export `backyrd.world-knowledge.founder-cohort-shadow@3.0` enthält fünf getrennte `context-handoff-shadow@1.0`-Objekte. Kohorten-Hash: `a19dbaa05f2369e3e65aa6f5fbe0e0f3dd96667e16fda934f8228f5ac07280ba`. Kontext und Zusatzangebote werden weiterhin aus der bestehenden Decision-Projektion entfernt.

## Persistenz und Sicherheit

Die Forward-Migration `20260915163631_world_knowledge_slice_4b_contextual_semantics.sql` legt nur die additive Registry-/Policy-Version an und bindet die bestehenden RPC-Namen an die neue akzeptierte Version. Direkte Ledger-Writes bleiben für `anon` und `authenticated` gesperrt. Öffentliche Owner-/Admin-RPCs prüfen Auth, Ownership/Adminstatus, Entitlement und Registry-Wert serverseitig. `service_role` bleibt serverseitig. Die bestehende Decision-Projektion enthält weiterhin weder öffentliche Kontakte noch die neuen Kontextfelder; der Context-Handoff ist ein nicht angebundener Exportvertrag.

Der Supabase-Changelog wurde am 15. September 2026 geprüft. Relevant bleibt die seit 28. April 2026 explizite Data-API-Freigabe: Tabellenzugriff benötigt eigene Grants; RLS und Grants werden weiterhin als getrennte Schutzschichten getestet. Daraus entsteht in diesem Slice keine Production-Konfigurationsänderung.

## Bewusst offen

- Capability→Intent-Mappings und Ranking-Gewichte
- Produktgewicht oder universelle Priorität einzelner Kontextaussagen
- eine automatische Ableitung von Hauptbesuchszweck aus Kategorie oder Zusatzangebot
- allgemein gültige Freshness-/TTL-Werte für kontextuelle Beobachtungen
- unbedingte Übernahme historischer Mood-/Suitability-Daten
- Production Migration, Backfill, UI-Rollout und Decision Runtime
