# Basel Gold Data Foundation

Stand: 21. August 2026

Scope: Basel Live-Daten, Product-Provenance, Mood-Validierung und kanonische N4-Grundlage.

Nicht im Scope: Decision-Engine-, N3-, N5-, N6- oder Ranking-Änderungen; öffentliche Aktivierung; historische Massen-Backfills.

## Ergebnis

Die Live-Daten besitzen jetzt eine belastbare Provenance-Grenze, eine kontrollierte Mood-Grenze und ein bewusst kuratiertes Gold-Set aus 60 realen Basel-Spots. Test- und Fixture-Daten sind weiterhin auditierbar, werden aber von realer N4-Qualifikation und öffentlichen Product-Kandidaten ausgeschlossen. Die neuen Suitability-Fakten liegen in einer additiven Product-Datenschicht; die eingefrorene N4-Registry bleibt unverändert bei 60 Dimensionen.

Die Grundlage ist technisch funktionsfähig, aber inhaltlich noch nicht breit genug für einen seriösen Beta-Qualitätsvergleich: 16 der 60 Spots sind `GOLD_READY`, 44 sind `PARTIAL`. N4 ist für alle 60 serialisierbar, jedoch besitzen nur 25 eine belastbare kanonische Interpretation; 35 sind identity-only. Alters-Eignung bleibt überall `UNKNOWN`.

## 1. Provenance und Fixture-Isolation

Die additive Migration `20260821170000_create_basel_gold_data_foundation_v1.sql` führt die kanonischen Origins `REAL`, `FIXTURE`, `TEST`, `LEGACY` und `IMPORT` für Spots, Reviews und relevante N4-Evidence ein.

| Live-Bestand | REAL | FIXTURE | TEST | LEGACY | IMPORT | Gesamt |
|---|---:|---:|---:|---:|---:|---:|
| Spots | 0 | 31 | 0 | 129 | 0 | 160 |
| Reviews | 0 | 27 | 0 | 71 | 0 | 98 |
| N4-Evidence | 180 | 31 | 0 | 234 | 0 | 445 |

Die 31 bekannten Fixture-Spots wurden über ihre exakten, bereits dokumentierten IDs klassifiziert. Zugehörige Reviews/Evidence erben `FIXTURE`. Die übrigen Bestandsdaten bleiben konservativ `LEGACY`; insbesondere wurden 71 Reviews ohne sichere Herkunft nicht nachträglich als Smart Reviews ausgegeben.

`FIXTURE` und `TEST` sind für reale Product-Distribution und kanonische N4-Reads ausgeschlossen. Es wurden keine Spots, Reviews oder User-Memory-Daten gelöscht. Es gab keinen globalen User-Card-Rebuild und keinen historischen Backfill.

## 2. Review-Provenance

Neue Reviews erhalten serverseitig zwingend eine `review_origin`:

- `SMART_REVIEW` nur mit dem bestehenden Product-Marker `smart_review_v1`
- ansonsten `STANDARD_REVIEW`
- `LEGACY`, `IMPORT` und `FIXTURE` nur über privilegierte, serverseitige Pfade

Authenticated Clients können die Herkunft nicht frei setzen. Fehlende oder ungültige Provenance wird an der Datenbankgrenze fail-closed behandelt. Bestehende origin-lose Reviews wurden nicht semantisch umgedeutet.

## 3. Kontrolliertes Mood-Vokabular

Das versionierte Vokabular `backyrd_product_mood_vocabulary_v1` entspricht dem realen Mobile-Katalog:

`gemütlich`, `lebendig`, `romantisch`, `laut`, `leise`, `authentisch`, `versteckt`, `urban`, `instagrammable`, `chillig`, `rustikal`, `modern`.

Explizite Synonyme werden versioniert normalisiert, zum Beispiel `ruhig` → `leise`, `lebhaft` → `lebendig` und `cozy` → `gemütlich`. Nur Moods mit bereits eingefrorener semantischer Entsprechung qualifizieren Direct Evidence. Ein gültiger Product-Mood ist damit nicht automatisch eine positive Aussage.

Placeholder wie `a`, `b`, `test` oder `unmapped-mood` werden für neue reale Reviews abgelehnt und können keine qualifizierte Evidence erzeugen. Bestehende Rows bleiben unverändert und werden nicht still neu interpretiert.

## 4. Basel Gold Set

Das initiale Set enthält 60 reale Spots, kuratiert nach Product-Situationen statt Tabellenreihenfolge:

| Reale Taxonomie | Spots | GOLD_READY | PARTIAL |
|---|---:|---:|---:|
| Restaurant | 17 | 6 | 11 |
| Bar | 12 | 8 | 4 |
| Café | 7 | 0 | 7 |
| Museum | 10 | 1 | 9 |
| Aktivität | 7 | 1 | 6 |
| Besonderes Erlebnis | 3 | 0 | 3 |
| Unterkunft / Hotel | 2 | 0 | 2 |
| Aussichtspunkt | 1 | 0 | 1 |
| Nachtleben | 1 | 0 | 1 |
| **Gesamt** | **60** | **16** | **44** |

Abgedeckte Situationen sind Restaurants, Bars, Cafés, Museen/Kultur, Activities, Family/Kids, Indoor, Outdoor, Regen, Date, Friends, Solo, Nightlife und besondere Erlebnisse. Die Abdeckung ist nicht gleichbedeutend mit ausreichender Intelligence: besonders Cafés, Activities, Museen und besondere Erlebnisse bleiben überwiegend partiell.

## 5. GOLD_READY-Vertrag

Ein Spot ist nur `GOLD_READY`, wenn alle folgenden Punkte belegt sind:

- verifizierbare Identität sowie korrekte Stadt und Position
- kanonische Kategorie/Place Type
- nutzbare Beschreibung und visuelle Quelle
- Website/Grunddaten soweit verfügbar
- Öffnungszeiten mit Zustand und Provenance
- mindestens eine belastbare strukturierte Suitability-Aussage
- kanonisches N4 mit Confidence und Evidence-Provenance
- keine qualifizierende Test-/Fixture-Evidence

Reviews sind keine Pflicht. Ein Spot kann durch belastbare Admin-/Source-Fakten Gold werden; Fake Reviews oder generierte Fakten sind ausdrücklich unzulässig.

## 6. Reale N4- und Suitability-Abdeckung

| N4 im Gold Set | Anzahl |
|---|---:|
| FULL | 25 |
| PARTIAL (identity-only) | 35 |
| UNKNOWN | 0 |

`FULL` bedeutet hier mindestens eine qualifizierte reale Interpretation zusätzlich zur kanonischen Identität. Nur bereits registrierte N4-Konzepte werden materialisiert. Family/Kids-, Age-, Rain-, Activity-, Conversation- und Social-Fakten erweitern nicht die eingefrorene N4-Taxonomie, sondern werden mit eigener Provenance unter `facts.suitability` serialisiert. Fehlende Information wird weiterhin als `UNKNOWN` geführt; Legacy- oder Fixture-Intelligence wird nicht ersatzweise als kanonische Wahrheit ausgegeben.

| Strukturierte Dimension | Spots mit belegtem Fakt |
|---|---:|
| Family/Kids | 13 |
| Indoor/Outdoor | 3 |
| Rain suitability | 4 |
| Activity type | 7 |
| Conversation suitability | 25 |
| Social-context suitability | 25 |
| Age suitability/range | 0 |

Die größten konkreten Data Gaps sind:

- 35 Spots ohne kanonische N4-Interpretation
- 35 Spots mit dünner strukturierter Suitability
- 60 Spots ohne belegte Alters-Eignung
- 27 Spots mit noch nicht vollständig verifizierter Identity/Location
- 21 ohne nutzbare Beschreibung
- 21 ohne belastbare Öffnungszeiten
- 17 ohne hinreichende Basic Facts

## 7. Query-Coverage ohne Engine-Änderung

Read-only Coverage über belegte Gold-Fakten:

| Query | Ausreichend verstandene Spots | Beispiele / Grenze |
|---|---:|---|
| Regentag mit meiner 4-jährigen Tochter | 3 | Basler Papiermühle, Freizeithalle Dreirosen, Kletterhalle 7; Alter 4 bleibt UNKNOWN |
| Date am Freitagabend | 5 | Safran Zunft, B1, Baltazar, Grenzwert, Pot Still |
| ruhige Bar zum Reden | 1 | VinOptimum |
| spontaner Nachmittag allein | 1 | Kunsthalle |
| Freunde + Drinks | 10 | tragfähige Bar-/Social-Coverage |
| Museum/Kultur | 10 | breite Kategorie, aber meist partielle N4-Tiefe |
| etwas Besonderes | 3 | Botanischer Garten, Tinguely Brunnen, Zoo |
| gemütliches Café | 0 | zentrale Content-/N4-Lücke |

Die Datenbasis kann einige reale Situationen jetzt unterscheiden, ist aber für eine robuste Beta-Qualitätsbewertung noch zu schmal.

## 8. Live-Query vor/nach Foundation

Rekonstruiertes Decision-Paket: `de4fdb71-7cad-4cbe-aeed-b4bdb2e581e0`, Query „Regentag mit meiner 4-jährigen Tochter“, Knowledge Mode `LOW_OR_UNKNOWN`.

| Stufe | Ergebnis |
|---|---|
| v13 Retrieval | 10 Spots |
| harte Eligibility | 5 Spots |
| Vorherige Reihenfolge | Tierpark Lange Erlen, ELYS Boulderloft, Galizi |
| N4 nach Foundation | Tierpark `FULL`, MAX Restaurant `FULL`, ELYS/Galizi/1777 `UNKNOWN` |
| Read-only deterministische Reihenfolge danach | Tierpark Lange Erlen, MAX Restaurant, ELYS Boulderloft |

Tierpark besitzt nun belegte Family/Kids-, Outdoor-, Ruhe-, Relaxed- und Conversation-Fakten. MAX besitzt belegte Family-, Group-, Romantic-, Cozy-, Lively- und Relaxed-Fakten. Für ELYS, Galizi und 1777 fehlen im aktuellen Gold-Bestand belastbare kanonische Interpretationen.

Es wurde kein N6-Call durchgeführt und kein Decision-Trace persistiert. Die bestehende N3-Repräsentation bewahrt Regen und das konkrete Alter noch nicht vollständig; weil N3-Änderungen verboten sind, wurde dies nicht umgangen. Die Foundation verbessert die reale Differenzierbarkeit, löst den konkreten Request aber noch nicht vollständig.

## 9. Prioritäten vor realem Beta-Qualitätstest

**P0**

- belegte Age-/Family-/Rain-/Indoor-Fakten für die wichtigsten Family- und Activity-Spots erheben
- kanonische N4-Interpretation für ELYS und andere tatsächlich retrievte Family-Kandidaten vervollständigen
- Herkunft der verbleibenden Legacy-Reviews nur dort kuratieren, wo objektive Source-Evidence existiert

**P1**

- 44 partielle Gold-Spots um Beschreibung, Öffnungszeiten, Basic Facts und Source-Provenance ergänzen
- ruhige-Bar-, Solo- und gemütliches-Café-Coverage ausbauen
- reale Reviews organisch mit kanonischer Origin und kontrollierten Moods wachsen lassen

**P2**

- Gold Set nach belegter Content-Anreicherung über 60 Spots hinaus erweitern
- Coverage-Matrix und N4-Freshness operativ überwachen
- einen separaten, ausdrücklich autorisierten historischen Review-Provenance-Audit durchführen

## 10. Sicherheit, Deployment und Validierung

- Die additive Migration ist auf dem verknüpften Live-Supabase-Projekt angewendet.
- Fixture-Isolation, DB-seitige Review-Origin und Mood-Validierung sind live.
- Bestehende echte Reviews, User Memory und User Cards wurden nicht gelöscht oder global neu gebaut.
- Es wurden keine Spots, Reviews, Beschreibungen, Family-/Weather-/Age-Claims oder andere Fake Evidence erzeugt.
- Der Edge-Function- und Mobile-Quellcode ist vorbereitet, aber wegen des ausdrücklich untersagten öffentlichen Rollouts nicht deployed. Die Datenbankgrenze schützt neue Writes bereits authoritative.
- Decision Engine, N3, N5 und N6 blieben unverändert.

Validierung:

- lokaler kompletter Supabase-Reset inklusive Seed: PASS
- `basel_gold_data_foundation.sql`: PASS
- vollständiger Supabase-CI-Pfad mit frischem Datenbank-Boot und allen Acceptance-Tests: PASS
- Migration uniqueness/order validation: PASS (47 aktive eindeutige Migrationen)
- Secret Scan: PASS
- Decision Input, Orchestrator und User-Intelligence Runtime: 33/33 PASS
- DB-Lint: keine neue Meldung; drei bekannte Baseline-Fehler in bestehenden Funktionen bleiben
- Mobile TypeScript-Gesamtlauf: durch zahlreiche vorbestehende, sachfremde Repository-Fehler nicht grün; kein neuer Fehler aus den geänderten Review-Dateien festgestellt

Deployment-Hinweis: Alle drei Foundation-Migrationen sind live. Der ausdrücklich freigegebene Cleanup entfernte ausschließlich sieben in diesem Sprint transient angelegte N4-Definitionen und 77 daraus erzeugte Evidence-Zeilen. Die eingefrorene Registry enthält wieder exakt 60 Dimensionen. Alle 77 Suitability-Fakten und 60 Gold-Snapshots sind erhalten beziehungsweise neu aufgebaut. Reviews (98), Memory Events (53) und User-Intelligence-Snapshots (7) blieben unverändert.

## Final Verdicts

- BASEL GOLD DATA FOUNDATION — PASS
- TEST/FIXTURE ISOLATION — PASS
- REVIEW PROVENANCE — PASS
- CONTROLLED MOOD VOCABULARY — PASS
- GOLD SPOT CONTRACT — PASS
- BASEL GOLD SET — PARTIAL
- REAL-SPOT N4 — PARTIAL
- FAMILY/KIDS DATA — PARTIAL
- INDOOR/RAIN DATA — PARTIAL
- FAKE/SYNTHETIC EVIDENCE CREATED — NO
- DECISION ENGINE CHANGED — NO
CURRENT LIVE DATA READY FOR MEANINGFUL BETA QUALITY TEST — NO
