# Naturhistorisches Museum Basel — Post-Authoring Reality Check

Production read-only geprüft am 23. August 2026. Spot: `ab4da026-0d47-4ea1-b626-5293106b4fc2`. Es wurden keine Daten, Proposals, Snapshots oder Engine-Zustände verändert.

## Ergebnis in einem Satz

Philipps Bearbeitung ist im kanonischen Pfad angekommen: 22 Fakten sind aktiv, davon 16 in der jüngsten manuellen Session bestätigt. Backyrd kann den Spot nun für einen Regentag mit einem vierjährigen Kind faktisch als Indoor-, regen- und familiengeeignet mit passender Altersspanne erkennen. GOLD_READY bleibt wegen alter, ungescopter Research-Fakten und des historischen nichtkanonischen `MUSEUM`-Place-Types korrekt blockiert.

## Aktueller Product- und Readiness-Zustand

- APPROVED; Kategorie Museum; kanonische Ortsart für N4/Decision: Kultur.
- Adresse: Augustinergasse 2, 4051 Basel; Stadt Basel; Koordinaten vorhanden. Land ist im Formular leer.
- Website `https://www.nmbs.ch`, Beschreibung und ein Bild vorhanden. Telefon, E-Mail und Preisniveau fehlen.
- Öffnungszeiten: Montag geschlossen, Dienstag bis Sonntag 10:00–17:00.
- Human Readiness: **PARTIAL 92%**.
- READY: Alter, Kategorie, Website/Telefon, Beschreibung, Umgebung, Grunddaten/Standort, gültiger Snapshot, Öffnungszeiten, Regen und Bilder.
- REVIEW_REQUIRED/BLOCKING: historischer Place-Type `MUSEUM` sowie ungescopte Research-Fakten für Identität, Kategorie, Place-Type, Website, reguläre Öffnungszeiten und `opening.status`.
- REVIEW: `opening.status=OPEN` ist nicht „jetzt geöffnet“; die gewählte zeitliche Eignung muss unabhängig von Öffnungszeiten verstanden werden.
- Offene Proposals im Human Editor: 0. Der bounded Product-Read-Pfad zeigt keine offenen PENDING/CONFLICT/STALE Proposals. Historische REJECTED-Proposals werden in dieser Hauptansicht bewusst nicht dargestellt.

## So versteht Backyrd diesen Ort

| Bereich | Zustand | Aktuelles Verständnis |
|---|---|---|
| Was ist es? | KNOWN | Ein Museum/Kulturort in Basel. Der aktuelle Snapshot verwendet `culture`; der alte bestätigte Wert `MUSEUM` wartet noch auf menschliche Bereinigung. |
| Aktivitäten | KNOWN | Museum/Ausstellung, Kultur und Geschichte. |
| Drinnen oder draußen? | KNOWN | Hauptsächlich drinnen. |
| Bei Regen? | KNOWN | Gut geeignet. |
| Zielgruppen | KNOWN | Gut allein, mit Freunden, Familie und Gruppen; nicht als Date- oder Arbeitsort beschrieben. |
| Familien/Kinder | KNOWN | Allgemein familien- und kindergeeignet, jetzt aus einer neuen SPOT-weiten Admin-Bestätigung statt aus Event-Evidence. |
| Alter | KNOWN | 3–99 Jahre; Begleitung durch Erwachsene erforderlich. |
| Atmosphäre | KNOWN, NICHT QUALIFIZIERT | Entspannt und inspirierend wurden bestätigt, werden vom aktuellen Gold→N4-Mapper aber nicht in N4-Concepts übersetzt. |
| Lautstärke | KNOWN, NICHT QUALIFIZIERT | Normalerweise mittel. Das erzeugt bewusst weder „ruhig“ noch „lebendig“. |
| Gespräche | KNOWN | Gut/mittel; als Decision-Fakt verfügbar, aber kein `conversation_friendly`-Concept, weil nur HIGH/LOW semantisch qualifiziert werden. |
| Besuchsdauer | KNOWN | Etwa 60–120 Minuten beziehungsweise mittlere Dauer. Im N4-Fact vorhanden, im aktuellen Decision-v2-Paket nicht serialisiert. |
| Planung | QUESTIONABLE | „Einfach vorbeikommen“ und gleichzeitig „Reservierung empfohlen“ sind beide aktiv. Beide sind N4-Facts, aber derzeit nicht Teil des Decision-v2-Fact-Sets. |
| Barrierefreiheit | PARTIAL | Aufzug, stufenloser Zugang und barrierefreies WC bestätigt; Rollstuhlgerechtigkeit, Hörunterstützung und Assistenzhunde unbekannt. |
| Wann passt der Ort? | KNOWN, REVIEW | Morgens, nachmittags, werktags und am Wochenende manuell gewählt; die Readiness-Warnung prüft derzeit pauschal, ob dies nur aus Öffnungszeiten abgeleitet wurde. |
| Preis | UNKNOWN | Kein Preisniveau gepflegt. |
| Besonderheit | UNKNOWN | Keine kanonische Signature-Angabe bestätigt. Die Beschreibung nennt Ausstellungen, Sammlungen, Forschung und Naturgeschichte; das ist Product-Text, keine automatisch qualifizierte Taste-Wahrheit. |

## Aktive bestätigte Fakten

Vor der aktuellen Human-Editor-Session waren 8 aktive Feldwerte dokumentiert. Aktuell sind es **22**; 16 Fakten wurden in der aktuellen Session angenommen, wobei Family und Daypart frühere Werte ersetzen. Netto kamen 14 neue aktive Felddimensionen hinzu.

Alle neuen Einträge wurden am 23.08.2026 zwischen 01:24:57 und 01:25:22 UTC als `ADMIN_VERIFIED`, Scope SPOT, Confidence-Policy 0.95 und `backyrd-canonical-semantics-v1` bestätigt. Die sechs unveränderten Research-Fakten haben Confidence 0.90 und noch keinen belastbaren Scope.

| Menschliche Angabe | Wert | N4 | Decision |
|---|---|---:|---:|
| Name | Naturhistorisches Museum Basel | Basis/Identity | Product-Basis |
| Kategorie | Museum | Adapter → culture | Ja |
| Website | nmbs.ch | Nein | Product-Basis |
| Reguläre Öffnungszeiten | Di–So 10–17, Mo geschlossen | Product-Fakt | Öffnungspolitik, nicht qualitative Eignung |
| Historischer Öffnungsstatus | OPEN | Nein | Nicht als open-now |
| Historischer Place-Type | MUSEUM | im Snapshot korrigiert/Fact blockiert | nicht serialisiert |
| Aktivitäten | Museum, Kultur, Geschichte | Suitability-Fakt | Ja |
| Umgebung | Indoor | Fact + Concept | Ja |
| Regen | geeignet | Suitability-Fakt | Ja |
| Familie/Kinder | geeignet | zwei Concepts | Ja |
| Alter | 3–99, Begleitung | Suitability-Fakt | Ja |
| Detaillierte soziale Eignung | Solo/Freunde/Familie/Gruppen ja; Date/Work nein | Suitability-Fakt | Ja |
| Basis-Zielgruppen | Solo/Freunde/Familie/Gruppen | Nein | Nein |
| Gespräche | mittel/gut | Suitability-Fakt | Ja |
| Lautstärke | mittel | kein Concept | Nein |
| Atmosphäre | entspannt, inspirierend | derzeit kein Mapping | Nein |
| Barrierefreiheit | 3 ja, 3 unbekannt | Fact | Ja |
| Besuchsdauer | 60–120 Minuten / mittel | Fact | Nein |
| Reservierung/Spontanität | WALK_IN + empfohlen | Fact | Nein |
| Tageszeiten | morgens, nachmittags, werktags, Wochenende | kein Snapshot-Concept | Ja, mit Review-Hinweis |

## Aktuelles N4

- Snapshot hash: `ec542b6bdcb2785fe0c1caf37a00a2234c67c25e658b3b7d900f25675e813ff1`.
- Neu berechnet in derselben atomaren Annahme wie der letzte Fakt nach `2026-08-23T01:25:22.213831Z`. Der exakte `calculated_at`-Wert sowie die numerische interne Completeness werden im vorgesehenen Admin-Read-Contract nicht angezeigt; die Product-Readiness ist ausdrücklich nicht diese N4-Completeness.
- Kanonische Ortsart: `culture`.
- Aktive Concepts: 3, jeweils Präsenz 1 und Confidence 0.95:
  - **Drinnen:** Backyrd versteht das Erlebnis als Indoor.
  - **Kinderfreundlich:** Backyrd versteht es als geeignet für Unternehmungen mit Kindern.
  - **Familienfreundlich:** Backyrd versteht es als familienfreundlichen Ort.
- Provenance: jedes Concept verweist auf den konkreten akzeptierten SPOT-Fakt und seine Evidence-ID.

## Kam Philipps Eingabe an?

| Human-Section | Status |
|---|---|
| Grundinformationen | INPUT ARRIVED + PRODUCT/CANONICAL; Website, Beschreibung, Adresse, Kategorie, Öffnungszeiten vorhanden; Telefon/E-Mail/Land/Preis fehlen |
| Activities | INPUT ARRIVED + CANONICAL + DECISION |
| Environment | INPUT ARRIVED + CANONICAL + N4 + DECISION |
| Rain | INPUT ARRIVED + CANONICAL + DECISION |
| Family | INPUT ARRIVED + CANONICAL + N4 + DECISION |
| Age | INPUT ARRIVED + CANONICAL + DECISION |
| Social suitability | INPUT ARRIVED + CANONICAL + DECISION |
| Atmosphere | INPUT ARRIVED BUT NOT CONSUMED |
| Noise | INPUT ARRIVED; MODERATE erzeugt bewusst kein N4-Concept und ist nicht im Decision-v2-Paket |
| Conversation | INPUT ARRIVED + CANONICAL + DECISION; MEDIUM erzeugt kein N4-Concept |
| Reservation/planning | INPUT ARRIVED + N4 FACT, NOT SERIALIZED TO DECISION |
| Duration | INPUT ARRIVED + N4 FACT, NOT SERIALIZED TO DECISION |
| Accessibility | INPUT ARRIVED + CANONICAL + DECISION |
| Daypart | INPUT ARRIVED + DECISION, REVIEW REQUIRED |
| Signature/characteristics | NOT ENTERED |

## Frühere Museum-Probleme

| Problem | Status heute |
|---|---|
| Top-level MUSEUM statt culture | FIXED im aktuellen N4/Decision; historischer Accepted Fact bleibt sichtbar und blockiert Readiness bis zur menschlichen Klärung. |
| Event-basierte Family-Wahrheit | HUMAN-CORRECTED / CLEAN: aktive Family-Evidence ist jetzt eine neue Admin-verifizierte SPOT-Angabe. |
| `opening.status=OPEN` als open-now | STILL PRESENT als alter Fact, aber im Human Editor markiert und vom Decision-Fact-Set/open-now getrennt. |
| Aus Schedule abgeleitete Dayparts | HUMAN-CORRECTED: neuer SPOT-Fakt durch Philipp; der pauschale Review-Hinweis bleibt bestehen. |
| Accepted Website vs. Raw/Readiness | FIXED: Website ist im Product-Feld sichtbar und erfüllt Readiness. |
| Ungültige FULL-Serialisierung | FIXED: N4/Decision erhalten `culture`; ungültiges `MUSEUM` kann nicht mehr als kanonischer Place-Type serialisiert werden. |

## Decision- und Benchmark-Sicht

Im Decision Package verfügbar sind `culture`, die drei N4-Concepts sowie Family, Age, Environment, Rain, Activity, Conversation, Social Suitability, Accessibility und Dayparts. Atmosphäre, Basis-Zielgruppen, Lautstärke, Reservierung und Dauer sind heute nicht im Decision-v2-Fact-Set.

Für **„Regentag mit meiner 4-jährigen Tochter“** erzeugt N3 V2 ausdrücklich Rain=PREFERRED, Family-with-child und Child age=4; alle bleiben Current Request Facts und keine langfristige Präferenz.

- FAMILY: MATCH — Spot-Fakt SUITABLE.
- AGE 4: MATCH — 4 liegt in 3–99; Begleitung ist vorgesehen.
- RAIN: MATCH — Spot-Fakt SUITABLE.
- INDOOR: MATCH — Spot-Fakt INDOOR.
- ACTIVITY: UNKNOWN — die Anfrage fordert keinen expliziten Activity Type.
- PLACE TYPE: NEUTRAL — `culture` ist gültig, aber die Anfrage fordert keine Kategorie.
- ATMOSPHERE: für diese Anfrage nicht relevant.

Die vier faktischen Matches erhöhen den deterministischen Factual-Fit. Evidence-honest autorisierbar sind:

- „Für einen Regentag als geeignet belegt.“
- „Bietet einen belegten Innenbereich für diesen Regentag.“
- „Als familien- und kindergeeignet belegt.“
- „Die belegte Alterseignung passt zu einem 4-jährigen Kind.“

Nicht zulässig sind unter anderem „ruhig“, „perfekt für jedes Kind“, „gerade geöffnet“, „barrierefrei“ als pauschale Aussage, „ideal für ein Date“ oder persönliche WHY_FOR_YOU-Aussagen ohne passende User-Projektion.

## Technisches Verständnis – Scorecard

- Spot Identity: GOOD
- Activity: GOOD
- Family: GOOD
- Age: GOOD
- Weather: GOOD
- Environment: GOOD
- Social: GOOD
- Atmosphere: PARTIAL (gespeichert, aber nicht qualifiziert)
- Accessibility: PARTIAL (einzelne Fähigkeiten sauber bekannt, andere UNKNOWN)
- Planning: PARTIAL (gespeichert, aber nicht Decision-sichtbar; WALK_IN/Reservierung empfohlen erklärungsbedürftig)
- **Overall: GOOD für den Benchmark, PARTIAL als vollständiges Spot-Modell.**

## Kleine UX-Empfehlung für den nächsten Task

1. Die zwei Zielgruppen-Fragen sind doppelt: `audience.basic` schreibt eine einfache Positivliste, `social.suitability` eine vollständige Tri-State-Map. Founder/Admin sollten nur die detaillierte Frage sehen; Owner Basic kann dieselbe Komponente in vereinfachter Form nutzen. Der kanonische Zielwert sollte `social.suitability` sein.
2. Founder/Admin-Eingaben mit Scope SPOT, validem typisiertem Wert und `ADMIN_VERIFIED`/verifizierter offizieller Quelle können in einer einzigen atomaren Aktion Source + Proposal + Acceptance + Rebuild speichern. Review bleibt zwingend für Research-/Owner-Claims, EVENT/PROGRAM/TEMPORARY, Konflikte, subjektive bzw. nicht qualifizierbare Angaben sowie Place-Type/Opening-Status-Korrekturen.
3. Die pauschale Daypart-Warnung sollte zwischen wirklich schedule-derived und ausdrücklich manuell als qualitative Eignung bestätigten Angaben unterscheiden.

## Verdicts

- POST-AUTHORING REALITY CHECK — PASS
- PHILIPP INPUT → ACCEPTED FACTS — PASS
- ACCEPTED FACTS → N4 — PARTIAL
- N4 → DECISION — PARTIAL
- MUSEUM CANONICAL PLACE TYPE — PASS
- EVENT FAMILY CONTAMINATION — CLEAN
- GOLD READINESS — HONEST
- FAMILY MATCH — YES
- AGE MATCH — YES
- RAIN MATCH — YES
- INDOOR MATCH — YES
- EVIDENCE-HONEST REASONS — YES
- OVERALL SPOT UNDERSTANDING — GOOD
- DUPLICATE AUDIENCE UX — CONFIRMED
- FOUNDER DOUBLE-CONFIRMATION UX — CONFIRMED
- CODE CHANGES — 0
- DATA CHANGES — 0
- PRODUCTION — UNCHANGED
