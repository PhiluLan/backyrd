# NukNuk als Backyrd-Verständnis-KI

Stand: 7. November 2026. Entwicklungsauftrag, kein Produktrelease.
Die erste Implementierung ist eine lokale Lern- und Evaluationswerkstatt,
kein Ersatz der veröffentlichten Decision und kein neues Foundation Model.

## Ziel und Verantwortungen

NukNuk soll freie Wünsche samt Anlass, Begleitung, Absicht, Bedingungen und
Unsicherheit verstehen. Die Qualität misst sich daran, ob das gewünschte reale
Erlebnis getroffen wird, nicht daran, ob JSON parsebar ist.

| Bestandteil | Verantwortung |
| --- | --- |
| Basismodell | Allgemeine Sprache und Schlussfolgerungen; derzeit vorhandenes Qwen3.5 |
| Verständnis-Adapter | Backyrds Bedeutungsauftrag, passende Schlussfolgerungen, Grenzen und Rückfragen lernen |
| Kanonischer Katalog | Gemeinsame Sprache für Angaben, Angebote, Bereiche und Bedingungen |
| World Knowledge | Aktuelle, belegte Spotinformationen mit Geltungsbereich und Quellenrechten |
| Bibliothekar | Zulässige, zusammengehörige Angebote und tatsächliche Bedingungen prüfen |
| Künftige kontextuelle Auswahl | Unter zulässigen Kandidaten begründen, welche Gesamterlebnisse zum Moment passen |
| User-Projektion | Nur berechtigte, einwilligungsgebundene persönliche Hinweise; kein Beweis über Begleitpersonen |

Der Adapter soll lernen, Daten zu lesen und sinnvoll zu verwenden. Er soll
nicht aktuelle Öffnungszeiten, Preise oder wechselnde Angebote auswendig lernen.
Diese bleiben abrufbares Wissen. Modelltraining repariert weder falsche World-
Daten noch einen fehlerhaften Bibliothekar. Die Fehlerquelle muss getrennt
ausgewiesen werden.

## Bestandsaufnahme

Die älteren lokalen Verständnisversuche unter dem historischen Branch
`codex/nuknuk-local` nutzten `product-ai-interpretation.ts`, nicht den heutigen
aktiven Bedeutungsauftrag. Sie bleiben historische Vergleichsbelege; der alte
Interpreter wird nicht wieder aktiviert. Die spätere Recherche ist ein eigener
Aufgabentyp (`nuknuk-research-v4.44`).

Die vorhandenen Modelle liegen im lokalen NukNuk-Arbeitsbereich:

- 27B: `mlx-community/Qwen3.5-27B-4bit`, Revision
  `45797d2985a12c55e6473686e9ea91b95e959553`.
- 9B: `mlx-community/Qwen3.5-9B-4bit`, Revision
  `8b2b98c00a6b4d291155e4890773ca8f769aee53`.

Die aktuelle Entwicklungsprüfung verwendet das vorhandene 27B-Modell ohne
Adapter. Dies behauptet nicht, dass nirgendwo frühere Adapter existieren.
Es wurden keine vorhandenen Modelle, Lernsammlungen oder Spotdaten gelöscht.

## Jetzt implementierter Ablauf

1. Der aktuelle kanonische Luna-Prompt, Kalender und Bedeutungskatalog werden
   wiederverwendet. Der neue lokale Auftrag ist versioniert und gehasht.
2. NukNuk liefert `meaning` im heutigen Bibliothekar-Vertrag und zusätzlich
   `moment`: Ziel, ausdrücklich als Vermutung markierte Deutungen, wichtige
   offene Angaben und höchstens eine Rückfrage.
3. Der vollständige Originalauftrag geht durch die vorhandenen Schema-,
   Referenz- und Bedeutungsprüfungen. Keine neue Modellantwort wird heimlich
   umgeschrieben, keine Pflicht abgeschwächt und keine fehlende Aktivität erfunden.
4. Zitate müssen wörtlich vorkommen. Die Software ermittelt ihre Positionen;
   das Modell muss keine Zeichenpositionen errechnen. Ein Zitat beweist noch
   nicht die sachliche Richtigkeit einer Deutung.
5. Ein wirklich offener Wunsch darf `NEEDS_CLARIFICATION` statt einer erfundenen
   ausführbaren Suche ergeben. Die produktive Engine wird dafür nicht verändert.
6. Optional liest das Diagnosewerkzeug einen lokalen World-Export und verwendet
   den bestehenden kanonischen Evaluator samt finaler Rangfolge. Es ruft keine
   produktiven RPCs auf und schreibt weder Spotdaten noch persönliches Learning.
   Moment-Deutungen verändern in diesem Schritt noch nicht das Ranking.
7. Modellrevision, erwarteter Adapter, Prompt-/Schemahash, Laufzeit, gemeldete
   Tokens sowie Fehler und rohe JSON-Antwort bleiben in privaten Diagnosebelegen.
   Ein Fehllauf bleibt ein Fehllauf. Strukturprüfung ist keine Qualitätsfreigabe.

Zusätzlich ist eine zweite lokale Aufgabe implementiert: `ASSESS_CANDIDATES`.
NukNuk erhält dabei das Momentziel und strukturierte, vom Bibliothekar für die
Ausgabe bestätigte Gründe bereits zulässiger Kandidaten. Private Profile,
Taste-Vektoren und ungefilterte World-Snapshots werden nicht übergeben. Eine
Bewertung muss Belegcodes desselben Kandidaten nennen; neue Kandidaten und
erfundene Belegcodes werden abgelehnt. Die sprachliche Schlussfolgerung braucht
trotzdem fachliche Prüfung. Dieser Schritt ist nur beratend und verändert
weder die Rangfolge noch die Zulassung. Beide Aufgabentypen werden vom
Lern-Intake und Export getrennt unterstützt.

Die Werkstatt ist nicht im Product-Index exportiert und wird von keinem
App-/Web-/Edge-Produktaufruf importiert. Sie ist kein paralleler Decision-Host.

## Die Lernsammlung

Sie ist von Recherchetraining und persönlichem Nutzer-Learning getrennt.
Vorhandene positive oder negative Berichte sind Entwicklungsbelege, keine
automatisch freigegebenen Zielantworten.

Ein Lernfall enthält Eingabe, feste Referenzzeit, korrigierte strukturierte
Zielantwort, Herkunft, Erlaubnis zur Trainingsnutzung, Szenariogruppe und Split.
Inhaltshash und Reviews binden sich an exakt diesen Inhalt. Jede Korrektur
entwertet eine frühere Freigabe.

Erforderliche lokale Reviews: Bedeutung/Angemessenheit sowie Datenschutz und
Quellennutzung. Die Datei dokumentiert eine lokale Prüfung mit expliziter
Urheberschaft. Historische Reviews ohne `reviewerKind` sind Menschenentscheidungen;
beauftragte Assistenzprüfungen tragen `DELEGATED_ASSISTANT` und den Hash der
konkreten menschlichen Beauftragung. Sie
beweist keine authentifizierte Admin-Identität. Diese Metadaten sind keine
Produktions-, Import- oder Deployment-Berechtigung.

Die ersten sechs Soll-Antworten sind ausdrücklich **von der Assistenz verfasste
Entwicklungsentwürfe**; drei Eingaben greifen die deidentifizierten beauftragten
Founder-Beispiele auf, drei sind synthetisch. Keine Founder-Freigabe zur
Zielantwort oder Trainingsnutzung und kein unangetasteter Test wird behauptet:
Geburtstagsessen, lockerer Hochzeitstag, Spielplatz mit vierjährigem Kind,
Familienausflug mit Tieren, notwendige Ruhe beim alleinigen Kaffee sowie ein
offener besonderer Wunsch für eine andere Person. Jeder Fall hat einen
fachlichen Prüffokus. Alle stehen zunächst auf TRAIN/PENDING ohne Reviews.

Vor dem ersten sinnvollen Trainingslauf wird der Bestand erweitert:

| Bereich | Gezielte Unterschiede |
| --- | --- |
| Anlass und Bedeutung | Geburtstag, Dank, Wiedersehen, Trauer, Feierlichkeit ohne Luxuszwang |
| Begleitung | Familie, Paar, Freunde, allein; bekannte und unbekannte Vorlieben |
| Bedingungen | Pflicht, Wunsch, Ausschluss, Alternative, Reihenfolge, Personenbezug |
| Alltagssprache | Deutsch, Schweizer Formulierungen, Englisch, Tippfehler |
| Fehlende Informationen | Hilfreiche Rückfrage, unbekannt lassen, trotzdem eine Richtung anbieten |
| World-/Bibliothekar-Verständnis | Angebot/Bereich, geerbte Zeiten, bedingte Eignung, fehlender Beleg |
| Gegenbeispiele | Kein Geburtstagspaket aus Geburtstag; kein Haustierzugang aus Tiererlebnis |
| Vertrauensgrenzen | Keine erfundenen Preise/Verfügbarkeit, fremde Anweisungen als Daten |

Planungsgrösse für die erste bewertbare Kohorte: etwa 200 bis 300 sorgfältig
geprüfte Beispiele. Das ist kein ausreichender Qualitätsnachweis durch Menge.
Szenarien und ihre Paraphrasen werden **vorher gruppiert** auf TRAIN,
VALIDATION und TEST verteilt. Identische normalisierte Eingaben über Splits
werden technisch abgelehnt; semantische Ähnlichkeit braucht zusätzliche Prüfung.
Bereits zur Verbesserung benutzte Fälle sind niemals ein Blindtest.

## Konkreter Trainingsplan und Abnahme

1. **Ausgangsmessung:** 27B unverändert mit festem Auftrag und einer festen
   Kohorte prüfen. Rohantwort, Interpretationsfehler, Bibliothekar-Ergebnis und
   Zeit getrennt erfassen. Wiederholte Eingaben auf erhaltene Bedingungen prüfen.
2. **Geprüfte Ziele sammeln:** Gute Antworten fachlich bestätigen, schlechte
   Antworten korrigieren. Keine automatische Übernahme selbst bewerteter
   Modellantworten als Wahrheit. Keine privaten Nutzerchats ohne passende Erlaubnis.
3. **Pilotadapter trainieren:** Lokales Supervised Fine-Tuning mit LoRA;
   Basismodell bleibt unverändert. Zunächst konservativ nur `q_proj`/`v_proj`,
   Rang 8, Lernrate 1e-5, Batch 1, 20 Schritte als Technikpilot. Diese Werte
   sind Startwerte, keine bewiesene optimale Konfiguration.
   Vor dem eigentlichen Lauf müssen Bedarf und Maskierung am vorhandenen Mac
   geprüft werden. Das bisherige volle Instruktionspaket umfasst etwa 15.000
   Tokens je Beispiel. Ein Adapter allein entfernt diese Eingabelänge nicht;
   ein späterer kürzerer Auftrag muss separat trainiert und verglichen werden.
4. **Basis gegen Adapter vergleichen:** Identische Eingaben, Referenzen,
   World-Snapshots, Softwareversionen und bekannte Profilbedingungen. Mit
   VALIDATION Einstellungen wählen. Danach den eingefrorenen TEST einmalig
   bewerten. Nach Optimierung an diesem Test muss ein neuer Testbestand her.
5. **Gesamtauswahl verbessern:** Separat den Bibliothekar und die Beurteilung
   passender Gesamterlebnisse evaluieren. Erst dies kann die Geburtstags-
   Empfehlung verbessern; ein bestandener Übersetzungstest reicht nicht.
6. **Produktintegration:** Erst nach brauchbaren realen Resultaten und gemessener
   Latenz über den bestehenden geschützten Product-Pfad integrieren. Kein
   ungeschütztes lokales Modell als öffentliches Backend veröffentlichen.

Abnahme betrachtet konkret: alle ausdrücklich genannten Wünsche erhalten,
keine erfundenen Pflichten oder Fakten, richtige Personen-/Angebotsbezüge,
brauchbare Rückfragen, menschlich nachvollziehbare Auswahl und stabile
Interpretation bei Wiederholungen. Eine bestandene JSON-Prüfung oder eine
niedrigere Trainings-Loss genügt nicht. Aktuelles Product-Gesamtbudget: 20 s
als Code-Default; ein minutenlanger lokaler Lauf ist keine Produktfreigabe.

## Befehle und Artefakte

Alle Befehle aus dem Repository, keine Zugangsschlüssel erforderlich.
Die lokale MLX-Umgebung und die Modellgewichte werden wiederverwendet; es gibt
keinen automatischen Download oder Umbau der alten Python-Umgebung.

```sh
npm run decision-vnext:build
node --test packages/decision-vnext-core/test/nuknuk-understanding.test.mjs
python3 -B -m unittest scripts/decision-diagnostics/test_nuknuk_train.py

node scripts/decision-diagnostics/nuknuk-understanding.mjs probe \
  --query 'Geburtstag von meiner Frau, etwas besonderes mit Abendessen' \
  --model /ABSOLUTER/LOKALER/MODELLPFAD/45797d2985a12c55e6473686e9ea91b95e959553 \
  --output .local/nuknuk-understanding/birthday.json
```

Der lokale Dienst muss ausschliesslich auf `127.0.0.1:8088` laufen. Basismessung
erwartet `loaded_adapter:null`. Adaptervergleich verlangt `--adapter` und
`--adapter-sha256`, prüft Dateihash und tatsächlich vom Dienst gemeldeten Pfad.
Nie einen unbekannten geladenen Adapter als Basismodell protokollieren.

`--catalog` beim Probe-Befehl ergänzt den kanonischen Bibliothekar-Vergleich
mit einem privaten lokalen Export. Er enthält keine aktuelle Datenbeschaffung,
keine Personalisierung des Founders und keinen neuen Anlass-Ranker.

`assess --report PROBE_MIT_EVALUATION --model MODELL --output NEUE_DATEI`
übt die begründete Auswahl anhand dieses Ergebnisses. Ohne bestätigte
Kandidaten erfolgt kein weiterer Modellaufruf. Daraus entsteht keine
Produktionsfreigabe und keine automatisch akzeptierte Lernantwort.

`audit --dataset DATEI --split-hash HASH --output PRIVATER_NEUER_BERICHT` prüft
die Lernsammlung. `export` mit denselben Parametern erstellt in einem neuen
Verzeichnis `train.jsonl`, `valid.jsonl`, `test.jsonl` und ein Hashmanifest.
Offene/abgelehnte Reviews, fehlende Trainingsnutzung oder fehlende Splits
verhindern den Export. Kein vorhandener Export wird überschrieben.

`revise` mit `--case`, dem aktuellen `--content-hash`, einer korrigierten
`--target`-Datei und ausdrücklichem `--training-permission PENDING|APPROVED`
speichert einen geänderten Lernfall und entfernt dessen bisherige Reviews.
`review` mit Fall/Hash, `--kind SEMANTICS|PRIVACY_AND_SOURCE_USE`,
`--verdict ACCEPT|REJECT`, `--reviewer` und `--note` dokumentiert die tatsächlich
erfolgte lokale Prüfung. Beauftragte Assistenzarbeit muss gesondert ausgewiesen
werden und darf keine persönliche Menschenprüfung behaupten. Beide verlangen ebenfalls den eingefrorenen
`--split-hash` und schreiben in eine neue private `--output`-Datei. Eine
Assistenz darf damit keine nicht erfolgte menschliche Prüfung behaupten.

Der Pilot läuft mit dem Python der bestehenden lokalen MLX-Umgebung:

```sh
PFAD_ZUM_PYTHON -B scripts/decision-diagnostics/nuknuk-train.py \
  --model /ABSOLUTER/LOKALER/MODELLPFAD/45797d2985a12c55e6473686e9ea91b95e959553 \
  --data .local/nuknuk-understanding/REVIEWTER_EXPORT \
  --manifest-sha256 SHA256_DER_MANIFEST_DATEI \
  --output .local/nuknuk-understanding/NEUER_ADAPTER
```

Ohne `--execute` prüft er nur. Vor Gewichtsänderungen werden Exportbytes,
Tokenlängen und die echte Completion-Maske geprüft. Zu lange Beispiele werden
abgelehnt statt still abgeschnitten. Der Trainer bekommt nur TRAIN/VALIDATION;
TEST wird nicht für Gradienten oder Konfigurationsauswahl verwendet. Ein
Adapter wird separat gespeichert, nie in das Basismodell fusioniert und nie
automatisch aktiviert. Der Trainingslauf hat eine Prozessgrenze von zwei
Stunden für den begrenzten Technikpilot, kein neues Recherche-Abbruchlimit.

Die bestehende Recherche-Lernsammlung behält ihren eigenen strengeren
Quellen-/Belegvertrag. Die Verständnis-Werkstatt entfernt dort keine Sperren.
Lokale Rohantworten, Reviews, Exporte und Adapter gehören unter `.local/`,
nicht in Git. Die Löschung eines personenbezogenen Lernfalls muss vor einem
späteren Training möglich bleiben; trainierte Gewichte sind kein einfach
zeilenweise löschbarer Datenspeicher.

Referenzen: [MLX-VLM Training](https://github.com/Neywa-Labs/mlx-vlm),
[MLX LoRA](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md).
CLI-Optionen und Datenvorbereitung wurden zusätzlich an der tatsächlich lokal
installierten MLX-VLM-Version geprüft; aktuelle Internetbeispiele ersetzen
diese Kompatibilitätsprüfung nicht.

## Erste echte Messung, 7. November

| Prüfung | Beobachtung | Einordnung |
| --- | --- | --- |
| Geburtstagsanfrage, zunächst nur JSON-Objekt verlangt | 187,9 s; falsche Felder/zusätzliche Verschachtelung; genaue Personenzahl und Datumsvorstellung ergänzt | Fehlgeschlagen; als Ausgangsbeleg erhalten |
| Dieselbe Anfrage, kanonisches Schema beim Decoding erzwungen | 181,5 s; 14.657 Eingabe- und 817 Ausgabetokens; technisch gültig | Inhaltlich nicht bestanden: genaue Personenzahl, unbelegte zeitnahe Besuchsvermutung; „besonders“ bleibt unprüfbare Pflicht |
| Diese Modellantwort mit einem synthetischen Restaurant an den Bibliothekar gegeben | Dinner vorhanden, aber keine bestätigte besondere Eigenschaft; keine Hauptempfehlung | Nachvollziehbare Folge der weiterhin problematischen Übersetzung; kein realer Basel-Katalogtest |
| Zweite Aufgabe: korrigierter Entwicklungsauftrag und ein synthetischer, bestätigter Dinner-Kandidat | 31,1 s; 560 Eingabe- und 395 Ausgabetokens; lediglich POSSIBLE, besondere Geburtstagseignung ausdrücklich nicht aus Dinner abgeleitet | Nützlicher enger Befund; Wort „Verfügbarkeit“ im Urteil bleibt missverständlich. Keine reale Empfehlungs-/Sprachqualitätsfreigabe |
| Tatsächliche Datenvorbereitung mit Modellprozessor, zwei Entwicklungsbeispiele | 15.029 und 14.892 Tokens; Completion-Masken vorhanden, kein Abschneiden | Kompatibilität dieser Beispiele bestätigt, kein Training und kein Speicherbedarf eines Gradientenlaufs bewiesen |

In diesem ersten Messlauf wurden **keine Gewichte trainiert**, keine Beispiele als menschlich geprüft
markiert und keine Produktdaten verändert. Der erste Entwicklungslauf beweist
gerade noch keine ausreichende Modellqualität oder Echtzeitfähigkeit. Die
Verständnisfehler werden als Korrekturaufgaben gesammelt statt durch einen
Parser in vermeintlich richtige Antworten umgeschrieben.

## Erster eingefrorener Pilotbestand, 7. November 2026

Der nächste Vorbereitungsschritt ist umgesetzt: **40 Lernfälle, 10
Entwicklungsfälle und 14 zurückgehaltene Prüfaufgaben**. Zusammen sind es
44 Aufgaben zum Verstehen einer Anfrage und 20 zum Einschätzen bestätigten
Spotwissens. Die sechs bereits gezeigten Beispiele gehören ausschliesslich
zum Lernbestand. Die Zuordnung der neuen Fälle wurde vor ihrer Ausarbeitung
in `scripts/decision-diagnostics/nuknuk-pilot-plan.json` festgelegt.

Der Bestand deckt Anlass, Begleitung, funktional notwendige Ruhe, Budget,
Alternativen, Abfolgen, Negationen, Ernährung und offene Wünsche ab.
Die Spotübungen verwenden ausdrücklich fiktive Angaben durch den bestehenden
kanonischen Bibliothekar. Bei derselben Anfrage ändern sich die tatsächlich
an das Modell übergebenen Belege oder die Zahl gleich passender Kandidaten.
Nur andere interne Kennnummern gelten nicht als neues Beispiel. Identische
Eingaben und Kandidatenüberschneidungen zwischen den Teilbeständen werden
erkannt. Verwandte Szenarien bleiben in derselben Aufteilung.

Die Freigabe im Chat wurde nur für die **sechs ursprünglichen fachlichen
Sollantworten mit identischem Inhaltshash** erfasst. Neue Sollantworten bleiben
Entwürfe; Datenschutz-/Quellennutzungsprüfungen und Trainingsfreigaben bleiben
offen. Daraus wird weder eine automatische Menschenprüfung noch eine
Exportfreigabe abgeleitet. Die fünf lesbaren Prüfgruppen enthalten je zehn
Lern-/Entwicklungsfälle. Die 14 Prüfaufgaben sind davon getrennt und wurden
nicht an NukNuk gesendet oder zum Prompt-Tuning verwendet. Sie stammen aber
von derselben Assistenz: Ein unabhängiger Blindtest wird nicht behauptet.

Eine korrekt verstandene Anforderung, für die dem Bibliothekar eine Fähigkeit
fehlt, bleibt im lokalen Auftrag erhalten und erhält
`UNSUPPORTED_CAPABILITY`. Der Offline-Vergleich führt sie nicht aus und meldet
die konkrete Lücke. Ungültige Familien, Referenzen und Belegstellen werden
weiterhin abgelehnt. Das verhindert, dass wir zum Bestehen einer Softwaregrenze
falsche Sprachziele trainieren. Der produktive Decision-Pfad bleibt unverändert.

Reproduzieren (neues Ausgabeverzeichnis; ohne Freigabedatei bleiben alle Fälle
ungeprüft):

```sh
npm run decision-vnext:build
node scripts/decision-diagnostics/nuknuk-pilot-cohort.mjs \
  .local/nuknuk-understanding/NEUER_PILOT_ORDNER \
  /ABSOLUTER/PFAD/ZUR_TATSAECHLICHEN_SECHS_FALL_FREIGABE.json
```

Der gespeicherte Bestand liegt lokal unter
`.local/nuknuk-understanding/pilot-20261107-v1/`. Er enthält Manifest,
Inhaltshashes, Audit, separate Prüfdatensätze und lesbare Prüfseiten. Vorhandene
Bestände werden nicht überschrieben. Korrekturen brauchen eine neue Revision;
inhaltlich geänderte Beispiele verlieren ihre bisherigen Freigaben.

| Beleg | SHA-256 |
| --- | --- |
| Eingefrorener Plan | `44bc38ea9861361e84c132ec9f196a90541f5d954e04b9ef00874c846955bdc9` |
| Aufteilung | `669649b537fe63cdf38fa1a5c2ca8afebe2d4a0fa3ad56e20387ab189e230383` |
| Bestand einschliesslich sechs fachlicher Freigaben | `24fe8206beb085d928d5b03bbf4830f23f704652eb7a41380cba4f40b0f852d5` |

Für diesen Vorbereitungsschritt: **0 Modellaufrufe, keine trainierten Gewichte,
keine Produktdatenänderungen**. Die technische Prüfung bestätigt Struktur,
Reproduzierbarkeit und Freigabegrenzen; sie belegt keine bessere Modellqualität.
Als Nächstes werden die neuen Sollantworten geprüft und korrigiert, bevor ein
freigegebener Export, ein Baseline-Vergleich und der getrennte Adapterpilot
gestartet werden.

## Erweiterung auf 200 Trainingsbeispiele

Der Founder hat am 7. November die zweite Prüfgruppe bestätigt, weitere
Einzelabnahmen abgewählt und die Erstellung von mindestens 200 Beispielen
beauftragt. Der vorbereitete Bestand enthält jetzt **200 TRAIN**, weiterhin
**10 VALIDATION** und **14 TEST**. TRAIN besteht aus 128 Interpretationsaufgaben
und 72 Aufgaben zur beleggebundenen Kandidateneinschätzung. Dazu kommen 100
ausdrücklich formulierte neue Anfragen und 60 neue Evidenzübungen zum ersten
Bestand. Diese 60 Übungen sind 30 bewusst verwandte Gegenbeispielpaare und
werden nicht als 60 unabhängige Szenarien bezeichnet.

Schwerpunkte: besondere/einzigartige/spezielle Wünsche mit und ohne Preisziel,
Verneinungen dieser Wörter, Anlass und Empfängergeschmack, notwendige versus
gewünschte Merkmale, Familienkontext, Essen, Alternativen und Abfolgen,
Bereichsbezug, Zugang, Budgetumfang, Datum, Sprachwechsel und nicht vertrauenswürdige
Anweisungen. Zehn neue Ziele enthalten ausdrücklich gekennzeichnete plausible
Momentdeutungen; daraus entstehen keine neuen harten Pflichten. Ein gewünschtes
einzigartiges Erlebnis ist kein Beleg für eine einzigartige Spoteigenschaft.

Die Vorbereitung läuft über `nuknuk-expanded-cohort.mjs`, ergänzt den bestehenden
Bestand und erhält dessen unveränderte Fälle, Aufteilung und vorhandene Reviews.
Die Quelle ist synthetisch und im Auftrag der Gründung erstellt. **20 fachliche
Menschenbestätigungen bleiben dokumentiert; für die neuen Inhalte werden keine
individuellen Menschenprüfungen erfunden.** Der bestehende Exportprüfer bleibt
unverändert. Dieser Schritt erstellt eine Trainingssammlung, keinen ungeprüft
freigegebenen Trainingslauf. Keine Modelle, Gewichte oder Produktdaten werden
verändert. Weitere Einzelfallabnahmen werden nicht beim Founder eingefordert.

```sh
node scripts/decision-diagnostics/nuknuk-expanded-cohort.mjs \
  .local/nuknuk-understanding/NEUER_200ER_BESTAND \
  /ABSOLUTER/PFAD/ZUM_BESTAETIGTEN_ELTERNBESTAND/cohort.json
```

Der aktuelle lokale Stand ist
`.local/nuknuk-understanding/understanding-200-20261107-v2/`. Eine frühere lokale
Vorbereitungsrevision wurde bei der inhaltlichen Nachprüfung korrigiert:
unspezifisches „spielen“ erzeugt keine bestimmte Bewegungsspielart, und separat
nutzbares Frühstück bleibt eine Zugangsanforderung statt blossem Kontext.
Die alte Revision wird nicht überschrieben oder als aktueller Trainingsbestand
verwendet. Manifest und Inhaltshashes erlauben den exakten Abgleich.

## Externe Datensätze und Softwarebibliotheken

Die recherchierte Auswahl und Importanforderungen sind maschinenlesbar in
`scripts/decision-diagnostics/nuknuk-external-resources.json` festgehalten.
Bei dieser ersten Auswahl waren noch keine externen Beispiele importiert.
Der anschliessende Auftrag zur Umsetzung von Punkt 1–4 ergänzt die unten
dokumentierte geprüfte Auswahl. Zusätzliche Pakete wurden nicht installiert.

| Ressource | Nutzen und Grenze |
| --- | --- |
| [MASSIVE](https://huggingface.co/datasets/AmazonScience/massive) | Mehrsprachige Absichten und markierte Detailangaben, einschliesslich Deutsch. Datenkarte: CC BY 4.0. Erste Wahl für gefilterte Zusatzaufgaben; die Alexa-Taxonomie ist nicht der Backyrd-Katalog. |
| [PAWS-X](https://github.com/google-research-datasets/paws/tree/master/pawsx) | Ähnlich klingende Satzpaare mit gleicher oder veränderter Bedeutung, auch Deutsch. Gute Kontrastaufgabe. Training maschinell übersetzt; Datenqualität filtern und Quellsatzgruppen trennen. [Publisher-Lizenz](https://raw.githubusercontent.com/google-research-datasets/paws/master/LICENSE) erlaubt freie Verwendung für beliebige Zwecke. |
| [Schema-Guided Dialogue](https://github.com/google-research-datasets/dstc8-schema-guided-dialogue) | Annotierte englische Dialoge zum Aufgabenverständnis und zu Zustandsänderungen; über 20.000 Gespräche. CC BY-SA 4.0 verlangt separate Prüfung des konkreten abgeleiteten Artefakts. Für eine spätere Dialogaufgabe, kein direktes Importformat für unseren Einzelauftrag. |
| [XNLI](https://github.com/facebookresearch/XNLI) | Mehrsprachige Entwicklungs-/Prüfaufgaben zu Schlussfolgerung, Widerspruch und Unbekanntem. Die veröffentlichten Prüfaufgaben gehören nicht in TRAIN. |

Die Empfehlung lautet zunächst MASSIVE und PAWS-X als getrennte Hilfsaufgaben,
mit Backyrd-Beispielen als Domänenkern. Das ist eine technische Auswahl, kein
bereits gemessener Qualitätsgewinn und keine Lizenzfreigabe jedes beliebigen
Downloads. Vor einem Import werden konkrete Revision, Bytehash, Quelle, Sprache,
Zeilen-ID, Lizenz und Zuordnung zum Originalsplit erfasst. Keine automatische
Übersetzung fremder Labels in unpassende Backyrd-Pflichten. Die vorhandenen
Prüfaufgaben und externe Testsplit-Zeilen bleiben ausserhalb des Trainings.

Bei der Software bleibt [MLX-VLM](https://github.com/Neywa-Labs/mlx-vlm) der
vorhandene Mac-Trainingsweg. [Hugging Face Datasets](https://huggingface.co/docs/datasets/index)
hilft beim Laden und Filtern externer Sammlungen. [PEFT](https://huggingface.co/docs/peft/index)
und [TRL/SFTTrainer](https://huggingface.co/docs/trl/sft_trainer) sind eine Option
für einen späteren kompatiblen Transformers-/GPU-Trainingsweg. Sie müssen nicht
zusätzlich in die bestehende MLX-Laufzeit eingebaut werden. Die Installation
einer Softwarebibliothek vermittelt dem Modell noch kein Wissen.

## Beauftragter Trainingsdurchlauf mit externen Hilfsaufgaben

Der explizite Auftrag „bitte komplett machen Punkt 1-4“ umfasst die fachliche
Assistenzprüfung, Quellenprüfung, lokale Adaptererstellung und den internen
Vergleich. Die Einzelabnahme weiterer synthetischer Beispiele wurde zuvor
abgewählt. Dies ist keine Freigabe zur Änderung produktiver Profile oder Modelle.

`nuknuk-training-bundle.mjs` dokumentiert diese Beauftragung und die zugehörigen
Assistenzprüfungen mit Inhaltshash. Die historischen Founder-Bestätigungen bleiben
im unveränderten Elternbestand erhalten. Durch Inhalts-/Freigabeänderungen
entstehende neue Hashes bekommen neue, ehrlich zugeordnete Reviews.
Die technischen Prüfungen auf Belegbindung, Aufteilung, unveränderte Inhalte,
Quellennutzung und explizite Trainingsberechtigung werden weiterhin angewendet.

Die Prüfung korrigiert drei Ziele: „unter 45“ wird `LT` statt `LTE`, aus dem
Parkausflug entfällt der erfundene Pflicht-Spaziergang, und „uns beide“ erhält
die ausdrücklich genannte Personenzahl. Die externen Übungen bleiben eigene
Aufgaben mit Originalkategorien statt erfundenen Backyrd-Fakten.

- 200 Backyrd-Ziele, darunter 128 Interpretations- und 72 Evidenzaufgaben.
- 24 deutsche MASSIVE-1.1-Trainingszeilen mit passenden Original-Qualitätsurteilen
  und wortwörtlich überprüften Detailangaben. Arbeiterkennungen werden nicht exportiert.
- 16 geprüfte PAWS-X-Trainingspaare, acht gleichbedeutend und acht unterschiedlich.
  Die Originalkategorie bleibt erhalten. Zweifelhafte Übersetzungs-/Labelpaare
  wie 1235 und 3958 werden ausgeschlossen statt still korrigiert.
- 10 Entwicklungsfälle und 14 zurückgehaltene Aufgaben bleiben getrennt.

Der Download von Googles ursprünglicher PAWS-X-Datei lieferte HTTP 403. Verwendet
wird der offizielle Google-Research-Datensatzspiegel auf Hugging Face, Revision
`4cd8187c404bda33cb1f62b49b001115862acf37`; der SHA-256 der deutschen Trainingsdatei
entspricht dem veröffentlichten LFS-Hash
`b2fc8cdcbd926761a222c30f4f046a7cbae2ea1b14c2dbaf94f3d8a94aef1e45`.
MASSIVE wird aus dem offiziellen versionierten 1.1-Archiv entnommen. Beide
Lizenzen, MASSIVE-Notice, gewählte Zeilen-IDs und alle Quelldateihashes sind lokal
gespeichert. Keine externen Testzeilen gehen ins Training.

Der lokale Trainingsbestand liegt unter `.local/nuknuk-understanding/training-20261107-v1/`.
Die Datei `manifest.json` hat den Bytehash
`7f55297c0f98b257f615c809f2af895da43f5496e8641b2263c43e4e78153f8e`.
Die tatsächliche MLX-Aufbereitung prüft alle 240 Trainings- und 10 Entwicklungszeilen;
Maximum 2.364 bzw. 2.252 Tokens, keine abgeschnittenen Beispiele, echte Completion-Masken.

Dieser Versuch verwendet explizit `COMPACT_ADAPTER_V1`: eine kurze Beschreibung
derselben Felder, unveränderte kanonische Ausgabegrammatik und Eingabedaten.
Der bisherige volle Auftrag bleibt Standard und der produktive Pfad unverändert.
Ein Vergleich zwischen vollem altem Auftrag und kurzem neuen Auftrag würde
Prompt- und Trainingswirkung vermischen. Deshalb benutzen Basis und Adapter
denselben kurzen Auftrag, dieselben Eingaben und dieselbe Antwortgrenze.

Konfiguration: vorhandenes 27B-4bit-Modell, Rang 8, Alpha 16, Lernrate 1e-5,
Batch 1, Seed 7, ein Durchgang über alle 240 Zeilen. Nur q/v-Projektionen im
letzten Full-Attention-Block werden angepasst: 188.416 Parameter. Das ist ein
kleiner erster Adapter, kein vollständiges Neutraining aller Modellgewichte.
Der frühere 20-Schritt-Technikpilot bleibt als CLI-Standard separat verfügbar.
Gewichte, Konfiguration und Logs werden in einem neuen Adapterordner gespeichert.

`nuknuk-run-comparison.py` startet Basis und Adapter nacheinander nur auf Loopback,
prüft ihre Identität und beendet ausschliesslich die eigenen Server. Die 14
zurückgehaltenen Aufgaben und sechs zusätzlich vor dem Vergleich eingefrorene
Formulierungsvarianten verwenden identische Prompt-/Eingabe-/Zielhashes und
2.048 Ausgabetokens. Unvollständige oder ungültige Antworten gelten nicht als Erfolg;
Rohtext bleibt privat zur Diagnose erhalten. Wörtliche Faktendifferenzen sind
Diagnosehinweise, keine automatische semantische Qualitätsnote. Die vier
Evidenzaufgaben sind Einzelaufgaben mit vorgegebenem Moment und Kandidatenwissen,
keine Tests eines vollständigen Live-Suchlaufs. Die Basisgewichtdateien werden
abschliessend gegen ihre ursprünglichen Bytehashes geprüft. Keine automatische
Aktivierung oder Qualitätsfreigabe nach niedrigerem Trainingsverlust.

### Tatsächliches Ergebnis vom 7. November 2026

Die vier beauftragten Arbeitsschritte wurden ausgeführt, einschliesslich echtem
Gewichtstraining und Vergleich. Das ist keine Freigabe als produktive Verständnis-KI.
Alle 240 Trainingszeilen wurden einmal verarbeitet (240 Optimiererschritte,
69 Minuten 5 Sekunden). Die Validierungsverluste nach 120/240 Schritten waren
0,49923/0,44213. Ein vergleichbarer Verlust des unveränderten Basismodells wurde
nicht gemessen; daraus folgt keine Qualitätsnote. Der maximale gemeldete
Speicherbedarf betrug 24,276 GB.

Der separate Adapter enthält vier endliche q/v-LoRA-Tensoren und tatsächlich
gelernte, von null verschiedene B-Gewichte. SHA-256 von `adapters.safetensors`:
`fcfa703eab226ecc7e0108bff703aa98a34087f37e52480c1547bc4d2c1765c8`.
Die drei ursprünglichen Basisgewichtdateien stimmen nach dem Versuch mit ihren
vorher gespeicherten Bytehashes überein. Der Adapter wurde weder fusioniert noch
produktiv aktiviert. Die eigenen Vergleichsserver wurden beendet.

Der vollständige Vergleich liegt lokal in
`.local/nuknuk-understanding/comparison-20261107-v2/`. Beide Varianten bekamen
dieselben 20 Eingaben, denselben kurzen Auftrag, Temperatur 0 und maximal 2.048
Ausgabetokens. Die sechs Transferaufgaben tragen den Inhaltshash
`62dc371f5d3cf51d651374757f09e7cee8da3d57d02cd6552e99fc0568a5f3f1`.
Keine dieser Aufgaben wurde trainiert oder nach Betrachtung der Ergebnisse zum
Nachtrainieren dieses Adapters verwendet. Die Aufgaben wurden von derselben
Assistenz erstellt wie der Korpus; sie sind kein unabhängiger Blindtest.

| Messung | Unveränderte Basis | Separater Adapter |
| --- | --- | --- |
| Strukturell gültig, einschliesslich Beleg-/Rückfragevertrag | 17/20 | 18/20 |
| Gesamtdauer der 20 Modellaufrufe | 21 Min. 47 Sek. | 19 Min. 24 Sek. |
| Median je Modellaufruf | 64,0 Sek. | 62,7 Sek. |

Diese Zeiten sind ein einzelner lokaler Versuch ohne Wiederholungsmessung,
keine Latenzzusage für eine vollständige Decision. Die Strukturquote ist ausdrücklich
keine Quote korrekt verstandener Anfragen. Die Basis scheiterte an einer
abgeschnittenen Antwort und zwei nicht wörtlichen Zitaten. Der Adapter scheiterte
an einem nicht wörtlichen Zitat und einer Rückfrage, deren Dimension nicht zu den
angegebenen Wissenslücken passt. Beide vollständigen Rohantworten bleiben erhalten.

Die fachliche Einzelauswertung steht in `NUKNUK_UNDERSTANDING_REVIEW.md`.
Nachgewiesen sind einzelne Verbesserungen bei Belegbewertung und Antwortabschluss,
aber weiterhin Fehler bei Verneinung, Zeitbezug, Rollen und Bedingungslogik.
Insbesondere ist der Adapter kein ausreichend zuverlässiger Ersatz für die
produktive Interpretation. Auch die Daten-/Auftragsabdeckung ist noch lückenhaft:
Der kompakte Auftrag erklärt ANY/SEQUENCE, aber nicht ausreichend IF und
Wetterbedingungen; im Trainingsbestand fehlen passende echte Bedingungszweige.
Der misslungene Wetterfall lässt deshalb keine isolierte Aussage über die
grundsätzliche Fähigkeit des 27B-Modells zu.

Für eine nächste, getrennt zu beauftragende Iteration sind gezielte Kontraste
für NOT_REQUIRED/EXCLUDED, Rollen, Zeitbezug und Bedingungen sowie ein vollständiger
kompakter Vertrag nötig. Adapterumfang und Trainingsdauer müssen an Entwicklungsfällen
verglichen werden. Die jetzt gesehenen Testfälle sind danach bekannte Diagnosefälle;
eine neue Qualitätsbewertung braucht frische zurückgehaltene Aufgaben. Allgemeine
externe Sprachdaten ersetzen diese Backyrd-spezifischen Übersetzungsziele nicht.

### Zweite beauftragte Runde am 8. November 2026

Auftrag: „Perfekt, los gehts“ zur vorgeschlagenen zweiten Runde. Der Bestand wird
additiv um 120 ausdrücklich formulierte Kontraste in zehn Themen ergänzt:
Modalität, Personenrollen, Zeit, Budget, Besonderheit, Wetterbedingungen,
Verknüpfung, Geltungsbereich, Nicht-Erfinden und Sprachwechsel. Die vorherigen
200 Backyrd- und 40 externen Beispiele bleiben erhalten. Zwölf neue Entwicklungs-
und zwölf neue zusammengesetzte Prüfaufgaben sind separat ausgewiesen. Historische
Testantworten dienen nicht zur Adapterauswahl. Alle neuen Ziele sind beauftragte
Assistenzarbeit, keine erfundene persönliche Founder- oder unabhängige Gold-Abnahme.

`COMPACT_ADAPTER_V2` beschreibt die vorhandene kanonische Grammatik ohne den
alten und neuen Auftrag doppelt hintereinander zu senden. IF-Zweige, Wetterrollen,
Personenbezüge, exakte Belege und Rückfragedimensionen sind ausdrücklich enthalten.
FULL und V1 bleiben reproduzierbar; der produktive Interpreter wird nicht verändert.
Die Kalenderreferenz der Sammlung bleibt der 7. November 2026 in Europe/Zurich.
Diese Runde ist deshalb kein Nachweis breiter Kalender- oder Zeitzonengeneralisierung.

Der erste Einrichtungsversuch mit doppelt beschriebenem Auftrag wurde nach 106
Sekunden kontrolliert beendet und aus dem Variantenvergleich ausgeschlossen.
Sein Wächter erfasste nur normalen Speicherdruck und keinen Swap-Zuwachs.
Der bereinigte Bestand liegt lokal in `training-20261108-v2-compact` mit Manifest-
Bytehash `71d16f4c0fda441b50980fcbf32b816b22717cdbeca3f3f0f0262b16c5a3bca0`.
Beide Varianten erhalten dieselben 360 Zeilen einmal, Seed 7, Rang 8, Alpha 16
und Lernrate 1e-5: q/v im letzten einen bzw. letzten zwei Full-Attention-Blöcken.
Sie starten beide vom unveränderten Basismodell, nicht voneinander oder vom alten
Adapter. Auswahl nach fachlicher Sichtung derselben zwölf Entwicklungsantworten;
erst danach neue Prüfaufgaben, Basisvergleich und Wiederholungen.

**Ressourcenregel:** Docker bleibt aus. `nuknuk-resource-guard.py` überwacht seinen
eigenen MLX-Prozess und den macOS-Speicherdruck alle fünf Sekunden. Kritischer
Druck, drei Warnmessungen nacheinander oder mehr als 2 GiB neuer Swap stoppen
den eigenen Prozessbaum. Bereits vorhandener Swap allein ist kein Abbruchgrund.
Ausfall der Überwachung stoppt ebenfalls. Fremde Prozesse werden nicht beendet.
Die MLX-Allocator-Richtlinie beträgt 32 GiB, der freie Cache maximal 512 MiB;
dies sind keine harten Grenzen für den gesamten Mac. Ein erfolgreicher Lauf ist
erst mit Ressourcenbeleg und tatsächlicher Auswertung abgeschlossen. Kontrolliert
beendete Server erhalten einen Unterbrechungsbeleg statt eines erfundenen Erfolgs.
Keine Gewichts-Fusion, produktive Aktivierung oder automatische Veröffentlichung.
