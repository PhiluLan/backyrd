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

**Ressourcenschutz, Stand 9. November 2026:** Docker bleibt aus. Der bestehende
Trainingsstarter und der Basis-/Adapter-Vergleich starten MLX ausschliesslich über
`nuknuk-resource-guard.py`. Ein exklusiver Benutzer-Lock verhindert zwei gleichzeitig
geschützte Modellläufe. Direkt ausserhalb dieses Starters gestartete Programme
werden dadurch nicht automatisch überwacht.

Vor dem Modellstart und danach im Abstand von einer Sekunde prüft der Wächter den
macOS-Speicherdruck, neuen Swap, die Summe des RSS der eigenen Prozessgruppe und
freien Platz auf Arbeits- und Ausgabevolume. Messaufrufe haben jeweils eine Sekunde
Timeout. Bereits die erste Speicherwarnung beendet die eigene Gruppe per SIGKILL;
ebenso weniger als 30 GiB freie SSD, mehr als 28 GiB Gruppen-RSS, mehr als 512 MiB
zusätzlicher Swap oder ein laufendes Docker Desktop. Vorhandener alter Swap allein
verhindert den Start nicht. Grenzen sind konservative Betriebsregeln für diesen
48-GiB-Mac, keine nachgewiesenen Mindestanforderungen des Modells. Die MLX-Richtlinie
ist 24 GiB und der Cache auf 256 MiB begrenzt; dies ist kein hartes OS-Speicherlimit.
RSS allein erfasst nicht verlässlich sämtliche Metal-/Systemspeicherlast.

Ein separater kleiner Watchdog besitzt eine Pipe zum Hauptwächter. Stirbt dieser,
führt das Pipe-Ende sofort zur Beendigung der Modellgruppe. Fehlt zehn Sekunden
lang ein erfolgreicher Mess-/Journal-Heartbeat, wird die Gruppe ebenfalls beendet.
Auch ein Ausfall des unabhängigen Watchdogs beendet den Modelllauf. Damit hängt die
Notabschaltung nicht vom erfolgreichen Schreiben eines Abschlussberichts ab.
Messwerte werden fortlaufend mit Flush und fsync in `*.samples.jsonl` gesichert;
Abbruchgrund und Exitstatus kommen in den Ressourcenbeleg. Bei vollem/defektem
Datenträger kann ein letzter Beleg fehlen; das darf keinen Prozess weiterlaufen lassen.

Der Starter zeigt beim Start `manualStopFile`. Ein `touch` auf genau diesen Pfad
(z.B. `touch /absoluter/ausgabepfad/host-memory.stop`) oder Ctrl-C/SIGTERM an den
Wächter beendet nur die eigene Modellgruppe. Es gibt keinen automatischen Neustart.
Eine Notabschaltung verwirft den laufenden Schritt; nur bereits geschriebene
Checkpoints sind vorhanden. Fremde Anwendungen, Originalgewichte und Docker-Daten
werden nicht gelöscht oder beendet. Nach 14.000 Sekunden endet ein unbeaufsichtigter
MLX-Lauf ebenfalls, vor dem äusseren Timeout des Trainingsstarters.

Die Prüfung verwendet kleine echte Prozesse mit simulierten Warnmesswerten, einen
zusätzlichen Worker, SIGKILL und SIGSTOP des Hauptwächters sowie Journalfehler und
manuellen Stopp. Sie überlastet den Mac nicht und lädt kein Modell. Der technische
20-Schritte-Probelauf nutzt nur eine abschliessende Loss-Prüfung auf zwei
Validierungsbatches; der volle Epoch-Lauf behält die vollständige Validierung.
Das ist keine fachliche Auswertung der Antworten. Ein weiterer kurzer gemessener
Modelllauf bleibt vor längerem Training erforderlich. Eine
absolute Garantie gegen Kernel-, Treiber- oder Hardwareabstürze ist damit nicht
möglich. Keine Gewichts-Fusion, produktive Aktivierung oder Veröffentlichung.


### Echter Ressourcen-Probelauf vom 9. November 2026

`adapter-20261109-resource-pilot-v3` startete vom unveränderten 27B-Basismodell mit
dem eingefrorenen V2-Datensatz (360 Trainingsbeispiele), einem Attention-Block und
20 geplanten Optimierungsschritten. Nach 410,2 Sekunden Gesamtzeit endete der
Aufruf mit Fehlerstatus: 19 Schritte wurden im Trainerlog als abgeschlossen
bestätigt; beim folgenden Abschnitt meldete macOS erstmals Warnstufe 2. Der
Wächter beendete die Modellgruppe per SIGKILL. Dies ist ein bestandener realer
Abschaltfall, aber **kein vollständig bestandener 20-Schritte-Trainingslauf**.

384 Messungen wurden dauerhaft geschrieben. Swap blieb durchgehend bei 0;
die kleinste freie SSD-Reserve betrug etwa 87,7 GiB. Der zuletzt vom Trainer
gemeldete MLX-Spitzenwert war 24,045 GB (Allocator-Messung, nicht gesamter Mac).
Das Gruppen-RSS blieb viel kleiner und darf ausdrücklich nicht als vollständiger
Metal-/Prozessspeicherbedarf ausgegeben werden. Direkt nach dem Abbruch belegte
Spotlights `mds_stores` rund 16,3 GiB RSS. Das zeigt zusätzliche Systemlast, belegt
aber ohne gleichzeitige Prozessmessung am Warnzeitpunkt keine alleinige Ursache.
Keine Docker-Prozesse wurden beobachtet; kein automatischer Wiederholungsstart.

Ein Adapter-Zwischenstand von Schritt 10 wurde gespeichert; er ist weder der
abgeschlossene 20-Schritte-Adapter noch fachlich freigegeben. Die lokalen
Detailbelege liegen im Ausgabeordner (`host-memory.json`, fortlaufende Samples,
`training-result.json`, `pilot-review.json`) und im zugehörigen Trainerlog.
Vor einer Wiederholung muss die zusätzliche Hostlast eingegrenzt werden; die
Warnschwelle wird nicht zur Erreichung eines erfolgreichen Status aufgeweicht.


### Nachprüfung des Abbruchs vom 9. November

Der tatsächlich benutzte Pfad ist `mlx_vlm.train -> Trainer.train ->
trainer/common/engine.py`. Dort wird Schritt 20 zuerst berechnet und protokolliert;
erst danach folgt die Abschlussvalidierung. Im Log fehlt der Bericht zu Schritt
20. Der Abbruch lag daher vor dessen protokolliertem Abschluss; die These einer
bereits laufenden Abschlussvalidierung ist nicht belegt. Vorbereitungs- und
Berechnungsphase innerhalb dieses Schritts sind nicht einzeln zeitgestempelt.

Der Ressourcenbeleg zeigt Warnstufe 2 bei 406,64 Sekunden und anschliessend
Exit -9 durch unseren Wächter. Keine MLX-Out-of-memory-Ausnahme wurde protokolliert.
Die Systemprotokolle enthalten um 10:05:49 einen Idle-Exit von `dirhelper`;
dieser ist kein Nachweis eines OOM-Kills des Modells. Frühere Diagnoseberichte
betreffen andere PIDs/Zeiten und dürfen diesem Versuch nicht zugerechnet werden.

Die frühere Spotlight-Vermutung war als Ursache nicht belastbar: Bei der
Nachprüfung zeigte `ps` für `mds_stores` bis über 29 GiB RSS, während Apples
`top` nur etwa 921 MiB MEM und 854 MiB CMPRS auswies. Beide Werte stammen aus
der Nachprüfung, nicht vom Warnzeitpunkt. Die direkte `proc_pid_rusage`-Abfrage
für diesen geschützten Systemprozess war nicht erlaubt; der fehlende Wert wurde
nicht als 0 Speicherverbrauch interpretiert. Es wurde kein Dienst beendet oder
umkonfiguriert. Eine sichere Zuordnung des damaligen Engpasses zu Modell,
Spotlight oder anderen Prozessen ist mit den alten Messungen nicht möglich.

Der Wächter erfasst deshalb ab Belegversion 4 zusätzlich Apples
`ri_phys_footprint` für die eigene Prozessgruppe und eine begrenzte `top`-Übersicht
(PID, Programmname, MEM, CMPRS) bei jeder Messung. Der 28-GiB-Abbruch gilt nun
zusätzlich für den physischen Footprint; RSS bleibt eine separate Messung.
`libproc`-Messfehler stoppen den Lauf, statt fehlenden Speicher als 0 auszugeben;
ein zwischenzeitlich beendeter Worker (ESRCH) wird ignoriert. Die Top-Abfrage hat
zwei Sekunden Timeout. Warnschwelle, Swap- und SSD-Regeln bleiben unverändert.
Das ergänzt die bisher fehlende Ursachenbeobachtung; es rekonstruiert keine
verlorenen Messwerte und ist kein neuer Modelllauf.


### Wiederholung mit Footprint-Messung (V4), 9. November 2026

Der ausdrücklich beauftragte Wiederholungslauf
`adapter-20261109-resource-pilot-v4` endete nach 63,6 Sekunden erneut mit
`HOST_MEMORY_WARNING`, Prozess-Exit -9. Zwei Optimierungsschritte sind im Log
bestätigt; kein neuer Adapter wurde gespeichert. Die Trainingskonfiguration ist
bis auf den separaten Ausgabepfad identisch zum vorigen Probelauf. Hostzustand,
Dateicaches und Zeitpunkt waren naturgemäss nicht eingefroren. V3 bleibt erhalten.

Die korrigierte Messung erfasste maximal rund 21,3 GiB physischen Footprint der
Modellgruppe. Beim Warnsignal waren es rund 19,6 GiB; der gleichzeitige RSS-Wert
betrug nur rund 356 MiB und ist damit eindeutig kein geeigneter Gesamt-RAM-Wert
für diesen Prozess. Der zuletzt abgeschlossene Schritt meldete einen MLX-Peak
von 23,701 GB. Diese unterschiedlichen Messgrössen werden nicht addiert oder
als identische Speicherbilanz ausgegeben.

Im Abstand weniger Sekunden zeigte `top` zuerst 43G Systemspeicher und 5732M
Kompressor, dann 47G und 17G Kompressor und beim Warnsignal 45G und 19G
Kompressor. NukNuk war mit etwa 20G MEM/15G CMPRS mit Abstand der grösste sichtbare
Anwendungsprozess. Spotlight blieb bei etwa 927M MEM, die übrigen Top-Prozesse
jeweils unter 1G. Swap war immer 0, die SSD hatte mindestens rund 85 GiB frei,
Docker war aus. Nach dem Abbruch war der Druck wieder normal; eine spätere
Messung zeigte 30G Systemspeicher, 4460M Kompressor und 17G unbenutzt.

Das belegt eine reale Host-Speicherwarnung im zeitlichen Zusammenhang mit der
Modellberechnung und starker Kompressionslast. Eine dominante fremde Anwendung
ist in diesen Messungen nicht sichtbar. Die erfassten Anwendungsbilanzen erklären
aber nicht einzeln jede Kernel-/GPU-/Cache-Seite. Eine genaue Aufteilung nach
GPU-Treiber und temporärer Trainingsoperation sowie der Grund, warum V3 länger
lief, bleiben offen. Kein dritter Lauf und keine Lockerung der Warnschwelle.
Der nächste technische Schritt ist die Untersuchung und Reduktion der
Trainings-Speicherspitzen, bevor die volle zweite Runde startet.
Die lokalen vollständigen Messungen und Prüfsummen stehen in `pilot-review.json`.


### Phasenweise Ursachenmessung vom 9. November 2026

Die neue lokale Diagnose `nuknuk-memory-probe.py` wird ausschliesslich über den
bestehenden Wächter gestartet. Sie begrenzt sich auf maximal drei Schritte,
Batchgrösse 1, LoRA und den unveränderten eingefrorenen Datensatz. Sie verändert
keine Dateien in der installierten Bibliothek. Zusätzliche Vorwärtsberechnungen,
Synchronisationsbarrieren, Cache-Leerung und optionale macOS-Speichersnapshots
ändern die Ausführungsplanung: Die Messung ist keine unveränderte Wiederholung
des normalen Trainings und kein Geschwindigkeitsbenchmark.

| Phase / Bestandteil | Gemessener Bedarf |
| --- | --- |
| Vollständig geladenes Modell | 14,953 GiB aktiv in MLX; etwa 15,4 GiB physischer Footprint |
| Trainierbare Adapterparameter | 753.664 Bytes (188.416 Float32-Parameter) |
| Finale Gradienten dieser Parameter | 753.664 Bytes |
| Optimiererzustand nach Update | 1.507.340 Bytes |
| Langes Beispiel, nur Vorwärtsrechnung und Loss | Peak 18,667–18,774 GiB MLX |
| Langes Beispiel, Vorwärts- und Gradientenrechnung | Peak 22,074–22,287 GiB MLX |
| Nach Gewichtsupdate und Bereinigung, Schritte 1–3 | etwa 14,955 GiB aktiv in MLX |

Beim zweiten Beispiel wird auf `[1, 2208]` gepaddet. Die Vorhersage hat die Form
`[1, 2207, 248320]` und wird im lokalen Bibliothekspfad ausdrücklich auf Float32
konvertiert: 2.192.168.960 Bytes allein für diese Matrix. Obwohl nur 191 Tokens
überwacht werden, berechnet der vorhandene Loss Vorhersagen und Cross-Entropy für
alle Positionen und maskiert danach. Dies ist eine konkrete grosse temporäre
Allokation. Ihr Vorwärts-/Rückwärtsgraph verursacht erheblich mehr Speicher als
die kleinen Adapter- oder Optimierertensoren. Ein selektiver/chunkweiser Loss
wäre ein gezielter Optimierungsansatz; er ist hier noch nicht implementiert.
Keine Anweisung oder Referenzantwort wurde gekürzt.

Die Speicherkarten des dritten Diagnoseversuchs ordnen den Grundbestand den
`IOAccelerator (graphics)`-Regionen zu (etwa 15 GiB). Python-Malloc ist dagegen nur
im Bereich von etwa 0,1 GiB. Beim Laden meldete die Karte noch etwa 9 GiB unter
SWAPPED, nach der ersten GPU-Berechnung und begrenzter Residenz dagegen ungefähr
0 in den Grafikregionen. SWAPPED enthält hier auch Kompression und ist kein
Nachweis eines gleich grossen SSD-Swaps; der beobachtete SSD-Swap blieb bei rund
0,25 MiB. GPU-Treiberzähler werden zusätzlich und getrennt protokolliert. Sie
umfassen das Gerät, also auch andere GPU-Nutzer, und dürfen nicht einfach zum
Prozess-Footprint addiert werden. Nach Schritt 2 lagen sie bei rund 16,8 GB
in-use, nach Cleanup bei rund 16,3 GB. Nach Freigabe des Modells sank MLX aktiv
nahe 0 und der GPU-Gerätezähler auf rund 0,58 GB; ein zu diesem Zeitpunkt höherer
Footprint ist kein Beweis eines Tensor-Lecks. Optionale vmmap-Corpse-Snapshots
und verzögerte Systembuchhaltung können die Beobachtung beeinflussen.

**Residenzvergleich:** Der tatsächlich verwendete gemeinsame Trainingspfad setzt
keine explizite GPU-Residenz; der gemessene Ausgangswert war 0. Das bisherige
24-GiB-Allocatorbudget ist keine harte Obergrenze für den gesamten Mac und nicht
identisch mit `set_wired_limit`. Laut offizieller MLX-Dokumentation hält Letzteres
Speicher resident; die zulässige Systemempfehlung dieses Macs beträgt rund
37,44 GiB, der untersuchte Prozesswert bleibt mit 24 GiB darunter:
https://ml-explore.github.io/mlx/build/html/python/_autosummary/mlx.core.set_wired_limit.html

Zwei sequenzielle, gleich instrumentierte Dreischrittversuche mit 0 bzw. 24 GiB
Residenzbudget endeten beide ohne Warnung. Loss-Werte aller drei Updates waren
identisch; beide Adapter haben SHA-256
`ca393f1b1eb4f72c7ac29747b7771eb649c380759c3fa5733281ef7f3dff0875`.
Das bestätigt gleiche Updates in diesen drei Beispielen, keine fachliche Güte.
Die Laufzeiten waren 104,69 und 107,34 Sekunden, also keine nachgewiesene
Beschleunigung. Nach Beginn der ersten eigentlichen Berechnung blieb die
Kompression im gebundenen Versuch bei ungefähr 4–4,5 GiB; ohne Bindung stieg sie
gegen Ende bis ungefähr 14 GiB. **Über den gesamten Start betrachtet** hatte der
gebundene Versuch aber eine frühe Ladespitze von 19 GiB Kompression. Die frühere
Zwischenmeldung über niedrigere Kompression bezog sich auf die laufende Rechnung,
nicht auf den maximalen Gesamtwert. Unterschiedlicher Host-/Cachezustand und
Messbarrieren verhindern eine alleinige Kausalzuweisung der alten Abbrüche.

Ein zusätzlicher, auf zwei Schritte begrenzter Versuch mit GPU-Treiberzählern,
vm_stat und vmmap schloss nach 70,30 Sekunden ab. Er ist in
`memory-phases-20261109-driver-maps` dokumentiert. Der erste Vergleich liegt unter
`memory-phase-comparison-20261109.json`; Rohdaten beider Dreischrittversuche liegen
unter `memory-phases-20261109-default` und `memory-phases-20261109-wired24`.
Die drei Originalgewichtedateien wurden danach unverändert per SHA-256 bestätigt.

**Betriebsstand:** Belegversion 5 ergänzt lokal 24 GiB GPU-Residenzbudget neben
unveränderten Warn-, Swap-, SSD- und Footprint-Abschaltungen. Die unabhängige
Notüberwachung bleibt erhalten. Dies ist eine begründete Kandidatenkonfiguration,
noch keine Bestätigung eines stabilen langen Trainings. Die automatische Prüfung
lehnte den zusätzlichen normalen 20-Schritte-Bestätigungslauf wegen vorheriger
Speicherwarnungen und nicht eindeutiger Freigabe dieses weiteren Laufs ab. Er
wurde nicht gestartet und nicht über die kleine Diagnose umgangen. Deren
Konfiguration weist mehr als drei Schritte ausdrücklich zurück. Der genaue
anstehende Umfang steht in der lokalen `memory-diagnosis-next-run.json`.
Keine produktive Aktivierung und kein automatischer Neustart.


### Ausdrücklich freigegebener 20-Schritte-Kontrolllauf, 9. November 2026

Nach der zusätzlichen Nutzerfreigabe „Ja bitte durchführen“ wurde genau der
vorbereitete normale Kontrolllauf `adapter-20261109-resource-pilot-v5-wired24`
ausgeführt. Keine zusätzlichen Diagnose-Vorwärtsläufe oder vmmap-Snapshots in
diesem Lauf. Daten, Lernrate, Seed, Batchgrösse, Zielmodule und Maskierung sind
gegenüber dem früheren 20-Schritte-Probelauf unverändert; ergänzt ist das lokale
24-GiB-Residenzbudget neben allen bisherigen Abschaltregeln.

**Ergebnis: Ressourcen-Probelauf bestanden.** Alle 20 Optimierungsschritte, zwei
abschliessende Validierungsbatches und beide Adapter-Schreibabschlüsse wurden
regulär beendet. Gesamtdauer inklusive Vorbereitung: 398,98 Sekunden (6:39 Min.).
Der Wächter hat 308 Messungen gesichert, ausschliesslich Druckstufe 1. Kein
zusätzlicher Swap; der bereits vor Start vorhandene Stand betrug 0,25 MiB.
Der maximale gemessene physische Footprint war 24.842.466.096 Bytes (23,136 GiB),
der letzte MLX-Spitzenwert 24,275 GB. Der angezeigte System-Kompressionsspeicher
blieb im gesamten erfassten Lauf bei höchstens rund 3,327 GiB.

Der finale Adapter und der gespeicherte Stand 20 sind bytegleich, enthalten vier
Tensoren mit zusammen 188.416 Parametern und haben SHA-256
`36ac59787cb14b0b5df306a75fd43b045f1275344d74cadee9fbf3eded1a77df`.
Der Stand 10 ist ausserdem bytegleich mit dem früheren ungebundenen Probelauf
(`a780e71ca1d03ee8930f6d2ce2ea869de25bcc1c19b868be5e0583defbcc04f2`).
Alle drei Originalgewichte-Dateien wurden unverändert gegen die vor dem Training
gespeicherten SHA-256-Werte geprüft. Der vollständige lokale Nachweis liegt im
Ausgabeordner als `pilot-review.json`, neben Ressourcenjournal, Trainerlog und
Trainingsresultat. Der Freigabe-/Laufplan wurde auf abgeschlossen gesetzt.

Dies belegt einen stabilen normalen 20-Schritte-Lauf mit dieser Konfiguration,
keine vollständige 360-Schritte-Epoche und noch keine fachliche Verbesserung der
Antworten. Der Host-/Dateicachezustand war nicht identisch zu den früheren
Fehlläufen; die Wirkung der Residenzsteuerung ist daher nicht als alleiniger
Kausalnachweis aller früheren Abbrüche auszugeben. Die zwei vollständigen
Adaptervarianten, Entwicklungsauswahl und frische Verständnisprüfung bleiben
als nächste Arbeit offen. Keine automatische weitere Ausführung und keine
produktive Modellaktivierung.

### Wiederholter 20-Schritte-Kontrolllauf, 9. November 2026

Auf die ausdrückliche Begrenzung „Erstmal 20 Schritte durchführen“ wurde ein
weiterer unabhängiger Lauf vom unveränderten Basismodell gestartet, keine
Fortsetzung des vorherigen Adapters und keine vollständige Epoche. Ausgabe:
`adapter-20261109-resource-pilot-v5-wired24-repeat1`. Daten, Seed und
Trainingskonfiguration entsprechen dem vorherigen erfolgreichen Kontrolllauf.

Alle 20 Schritte, zwei abschliessende Validierungsbatches und die Speicherung
endeten regulär nach 399,16 Sekunden (6:39 Min.). Alle 308 Ressourcenmessungen
zeigten Druckstufe 1; es entstand kein zusätzlicher Swap. Der maximale physische
Footprint betrug 24.607.814.424 Bytes (22,918 GiB), die maximale gemessene
Systemkompression rund 3,20 GiB. Der finale Adapter ist bytegleich mit dem
vorherigen 20-Schritte-Ergebnis (SHA-256 `36ac59787cb14b0b5df306a75fd43b045f1275344d74cadee9fbf3eded1a77df`).
Die drei Originalgewichtedateien wurden erneut unverändert bestätigt.

Damit sind zwei normale kurze Ressourcenläufe mit gleichem Ergebnis belegt.
Eine inhaltliche Qualitätsverbesserung und die Stabilität einer vollständigen
360-Schritte-Epoche sind weiterhin nicht geprüft. Der vollständige Lauf bleibt
zurückgestellt; keine produktive Aktivierung. Der lokale Nachweis steht im
Ausgabeordner unter `pilot-review.json`.


### Vollständige kleine Variante, 9. November 2026

Nach ausdrücklicher Freigabe des längeren Trainings wurden alle 360 Schritte der
kleinen Variante vom unveränderten Basismodell ausgeführt. Gesamtdauer inklusive
Vorbereitung und Validierung: 7.788,65 Sekunden (2:09:49). Ausgabeordner:
`adapter-20261109-round2-small-epoch1-v5`. Die Validierung über alle 22 Beispiele
lief nach Schritt 120, 240 und 360; der Loss sank dabei von 0,39588 über 0,36413
auf 0,34176. Das misst die Annäherung an vorgegebene Antworten, keine fachliche
Freigabe und keinen Vergleich mit dem Basismodell.

Alle 6.055 Ressourcenmessungen zeigten Druckstufe 1; kein zusätzlicher Swap.
Der maximale physische Footprint betrug 23,142 GiB. Der finale Adapter ist mit
Stand 360 bytegleich und hat SHA-256
`5d1b3400044f9029c3e6b60e89ffcc6691446db0dfa0693c5d893fbcd1e14feb`.
Alle drei Originalgewichtedateien wurden nach Abschluss gegen die gespeicherten
SHA-256-Werte unverändert bestätigt. Nachweis: `epoch-review.json` im Ausgabeordner.

Die grössere Variante wurde nicht trainiert. Auf anschliessenden Nutzerauftrag
wird jetzt direkt diese abgeschlossene kleine Variante mit dem Basismodell auf
den bereits eingefrorenen zwölf frischen TEST-Fällen verglichen. Dies ist eine
bewusste Abweichung vom früheren Plan einer Auswahl zwischen zwei Varianten;
es wird kein Sieger aus zwei trainierten Varianten behauptet. Nach Einsicht in
diese TEST-Antworten dürfen sie nicht weiterhin als ungesehener Test für eine
weitere Trainings-/Auswahlrunde bezeichnet werden. Keine produktive Aktivierung.


### Direkter Verständnisvergleich nach vollständiger Epoche, 9. November 2026

**Entscheidung: keine Freigabe für die produktive Verständnisrolle.** Es gibt
punktuelle Verbesserungen und neue Fehler; zuverlässiges Backyrd-Verständnis
ist mit diesem Adapter nicht nachgewiesen. Das Experiment beweist weder eine
prinzipielle Unfähigkeit des Basismodells noch, dass weitere identische Epochen
helfen würden. Die Ursachenanteile von Modellkapazität, Trainingsumfang,
Beispielauswahl und Instruktion sind in diesem Vergleich nicht isoliert.

Verglichen wurden unverändertes Basismodell und kleiner Adapter auf denselben
zwölf vorher eingefrorenen frischen TEST-Fällen. Identische Eingaben, Anweisungen,
Referenzzeit, Antwortschema, maximal 2.048 Ausgabetokens und temperature 0 wurden
geprüft. Beide Server wurden nacheinander unter dem Ressourcenwächter betrieben;
Adapteridentität wurde vor jedem Aufruf abgeglichen. Keine Anweisungsänderung,
keine Wiederholung nach Fehlern und kein Nachtraining während der Auswertung.

| Beobachtung (je zwölf Fälle) | Basismodell | Adapter |
| --- | ---: | ---: |
| Formal gültige Antworten | 12 | 12 |
| Vom bestehenden Vertrag als ausführbar eingestuft | 7 | 10 |
| Fälle mit nicht angefragten Zeitfakten | 10 | 9 |
| Davon mit erfundenem Datum/Uhrzeit/Tagesphase als REQUIRED | 7 | 2 |
| Mittlere Dauer pro Anfrage | 62,9 s | 61,4 s |

Ausführbar bedeutet nur, dass der aktuelle Vertrag keinen unterstützungsbedingten
Blocker meldet. Es bescheinigt keine richtige Bedeutung. Die beiden Zeitmetriken
zählen nur strukturierte time.date/time.clock/time.window/time.day_phase-Fakten
in Anfragen ohne Besuchstag; der explizite tomorrow-Fall ist ausgenommen.
Zusätzliche erfundene Mahlzeitenpflichten, falsche Erklärungen oder Beziehungen
sind darin nicht enthalten. Es wird keine allgemeine semantische Erfolgsquote
aus formalen oder rein wörtlichen Zielvergleichen abgeleitet.

Die qualitative Prüfung akzeptiert Synonyme, indirekt eindeutig dargestellte
Personenzahlen und gleichwertige Zeit-/Sequenzdarstellungen. Sie unterscheidet
falsche weiche Kontextangaben von falschen Pflichtbedingungen. Die vollständigen
Einzelbelege und Dateihashes stehen lokal in
`comparison-20261109-round2-small-fresh/semantic-review.json`; Rohantworten und
unveränderte Ein-/Ausgabevergleiche liegen nebenan in `baseline/`, `adapter/`
und `comparison.json`.

| Fall | Basismodell | Adapter nach Training |
| --- | --- | --- |
| Vietnamesisch, Tante, aussergewöhnlich, kein Dresscode | Erfindet Besuchstag, Abendessen und ab 13 Uhr | Erfindet weiter Besuchstag, Abendessen und genau 13 Uhr; Zeitfeld jetzt ausführbar |
| Bouldern, Dusche kein Muss, Schuhverleih nötig | Optionalität richtig; Verleih in nicht unterstütztem Pflichtfeld | Zeitkontext entfernt; verbindliche Begleitung im falschen Feld participation.partner; Verleihfeld weiter ungeeignet |
| Nudeln nach Konzert 22:45, Datum offen | Konzertende und Sequenz erhalten, Datum als Kontext erfunden | Sequenz erhalten; Datum weiter erfunden, jetzt nicht erforderlich statt Kontext |
| Sushi, Mutter 57, möglichst unter CHF 70 zusammen | Gruppenbudget erkannt, aber falsch typisiert; heutiger Nachmittag und Mittagessen als Pflicht erfunden | Gruppenbudget korrekt typisiert und harte Zeit-/Mittagessenpflicht entfernt; falscher Zeitkontext und LTE statt LT bleiben |
| Bei Sonne Boot, sonst Keramik | Wetterzweige richtig, Zeitkontext erfunden | Wetterzweige richtig; zusätzliche erfundene Uhrzeit und Nachmittag im Ziel |
| Döner, Cousin, Besonderheit kein Muss, reden können | Gesprächswunsch erkannt; fehlende Besonderheit-Optionalität, harte Zeitvorgaben erfunden | Besonderheit jetzt NOT_REQUIRED; neue erfundene lunch-Pflicht, Zeitkontext bleibt |
| Frühstück für drei, vegan nur für Freundin | Personen-/Ernährungszuordnung richtig; Besuchstag als Pflicht erfunden | Zuordnung weiter richtig; Besuchstag nur noch Kontext, bleibt unbelegt |
| Crêpe oder Waffel, Schokolade, keine Musik | Alternativen als ein Textfeld statt expliziter ANY-Verknüpfung | Gleicher Fehler; Begründung erfindet zusätzlich eine genannte Uhrzeit |
| Erst Schmuck, danach woanders essen | Reihenfolge richtig, anderer Ort in nicht unterstütztem Feld; Besuchstag erfunden | SAME_PLACE widerspricht woanders; zusätzliche nicht unterstützte Sequenzpflicht; Besuchstag/Nachmittag erfunden |
| Bagel unter CHF 13, Sitzplätze egal | Sitzplätze optional richtig; LTE statt LT, heutiger Mittag als Pflicht erfunden | Harte Zeitpflicht entfällt; falscher Zeitkontext und Preisgrenze bleiben |
| Memorable beer tasting for dad tomorrow, not necessarily expensive | Vater/Aktivität/morgen richtig; Preispräferenz und entspannt hinzugedacht | Vater/Aktivität/morgen richtig; Betrag 0 CHF als NOT_REQUIRED erfunden, keine harte Kostenlos-Pflicht |
| Wind, Comic-Workshop, Nichte 12, Mittagessen nett | Wind/Alter/Aktivität/weiches Essen richtig; heute Nachmittag als Pflicht erfunden | Kern erhalten, harte Zeitpflicht entfällt; heutiger Mittag im Ziel, redundante Essens-/Altersangaben |

Keine der zwölf Antworten ist in sämtlichen Angaben ohne die beschriebenen
Restfehler. Das bedeutet ausdrücklich nicht, dass sämtliche Anliegen oder
Teilinformationen falsch verstanden wurden. Die Wetteralternative und die
personengebundene vegane Option sind beispielsweise schon vor dem Training
korrekt und bleiben korrekt. Das Freigabehindernis sind wiederkehrende falsche
Zusatzangaben und direkte Widersprüche wie SAME_PLACE bei woanders.

Beide Server wurden nach der jeweiligen Auswertung regulär durch den Runner
beendet. Der Ressourcenbeleg nennt deshalb SUPERVISOR_INTERRUPTED; das war das
geplante SIGTERM beim Aufräumen, kein Speicherabbruch. Alle Messungen zeigten
Druckstufe 1, kein zusätzlicher Swap, maximal 18,59 bzw. 18,70 GiB physischer
Footprint. Beide Aufrufserien endeten vollständig; alle drei Basismodellgewichte
wurden anschliessend erneut unverändert per SHA-256 bestätigt. Keine Aktivierung,
keine Spotdatenänderung und keine produktive Suche.

Grenzen: zwölf synthetische, im selben Entwicklungsprozess verfasste Beispiele,
keine unabhängige menschliche Abnahme; je ein Durchlauf, keine Wiederholungs-
stabilität; keine Ende-zu-Ende-Prüfung von Spotsuche oder Ranking. Die grössere
Variante wurde nicht trainiert. Die zwölf Fälle sind nun eingesehen und müssen
bei künftigem Tuning als bekannte Diagnosefälle gelten. Vor weiterer Aktivierung
braucht es eine gezielte Prüfung der Referenzzeit-Verwechslung, der falschen
Pflichtzuweisungen und der kanonischen Feldauswahl sowie neue ungesehene Tests.


### Founder-Präzisierung und lokales Eingabeexperiment V3, 9. November 2026

Der Founder hat präzisiert: „Bouldern mit Kollegen ist ja auch eine
pflichtangabe.“ Diese Begleitung ist tatsächlich verbindlich und darf nicht
als optionaler Wunsch behandelt werden. Korrigiert wird die Fehlerdiagnose:
Nicht die Verbindlichkeit ist falsch, sondern participation.partner als
Anforderung an die Durchführungsform des Anbieters. Der kanonische Vertrag
speichert die tatsächliche mitgebrachte Besuchsgruppe unter people.relationship
CONTEXT. CONTEXT bedeutet hier gegebenen Gruppenkontext, nicht verzichtbare
Begleitung. Produktvertrag, Personengruppe und Zugangsregeln werden nicht
abgeschwächt. Die lokale Einzelfallauswertung enthält diese Founder-Korrektur.

Die fehlerhaften Zeitwerte stammen auffällig aus der technischen Eingabe:
reference.now und calendar.today/localTime stehen bisher neben request in der
User-Nachricht. Das ist ein belegter Herkunftszusammenhang, noch kein isolierter
Kausalnachweis. COMPACT_ADAPTER_V3 verschiebt diese unverändert verfügbaren
Normalisierungshilfen in einen ausdrücklich bezeichneten Systemblock. Die
User-Nachricht enthält nur request. Schema, Faktentypen, Modellgewichte und
historische V1-/V2-Profile bleiben unverändert. Zusätzliche lokale Anweisungen
präzisieren Referenzzeit vs. Besuchszeit, generisches Essen vs. Mahlzeit,
verbindliche Begleitung vs. Anbieterleistung, explizite OR-Strukturen, Ortswechsel
und unbekannte Budgetbeträge. Keine nachträgliche automatische Umschreibung oder
Entfernung einer Modellantwort; Fehler müssen in den Rohantworten sichtbar bleiben.

Der Vergleichsrunner kann nun ausdrücklich zwei verschiedene Anweisungsprofile
mit demselben Adapter und denselben VALIDATION-Anfragen vergleichen. Er nennt
unterschiedliche Eingaben/Prompts dabei nicht identisch: sameQueriesVerified=true,
sameInputsVerified=false, profileComparison=true. Alte Basismodell-/Adapterläufe
verlangen weiterhin identische Eingaben und Anweisungen. Export und Inferenz
verwenden denselben V3-Builder; bestehende eingefrorene Trainingsdateien werden
nicht umgeschrieben. V3 ist opt-in und nicht produktiv aktiviert.

Erster begrenzter Entwicklungsvergleich: r2-dev-1, 2, 3, 4, 8 und 9, jeweils
V2 und V3 mit dem abgeschlossenen kleinen Adapter. Ausgabe
`comparison-20261109-profile3-development`. Dies sind Entwicklungsbeispiele,
keine neue unabhängige Erfolgsmessung; V3 wurde nicht in die Gewichte trainiert.
Die Änderung kombiniert Eingaberollentrennung und Anweisungspräzisierungen. Ein
beobachteter Effekt darf deshalb nicht allein der Rollentrennung zugeschrieben
werden. Das vollständige längere Training wird nicht ungeprüft wiederholt.


#### Gemessener Entwicklungsvergleich V2 / V3

Zwölf echte lokale Aufrufe sind abgeschlossen: sechs identische VALIDATION-
Anfragen, jeweils mit V2 und V3 auf exakt demselben Adapter. Keine neue
Gewichtsanpassung. Alle Ein-/Ausgaben sind unter dem genannten Vergleichsordner
gesichert. `semantic-review.json` trennt die qualitative Auswertung von der
reinen Schemaauswertung; `runtime-before-rebuild.json` hält die tatsächlich im
Vergleich verwendeten kompilierten Module fest.

Erfundene Besuchstage in strukturierten Fakten sinken in diesen sechs Fällen
von vier auf null. Der Besuch nach Schichtende 00:30 behält die Uhrzeit, lässt
aber den ausdrücklich offenen Tag offen. Das Cousinen-Frühstück behält die
persönliche laktosefreie Option und setzt unter CHF 16 jetzt korrekt als LT;
Besuchstag, angeblicher Morgen und Gruppenbudget werden nicht ergänzt.
Suppe oder Sandwich mit verpflichtendem Tee bleibt als ANY plus zusätzliche
Pflicht erhalten und verliert die unbelegten Zeitdaten. Ausbildungsabschluss,
Partnerbegleitung und besonderer Ort bleiben erhalten; Ramen steht weiterhin
unter der unpassenden Küchen- statt Gerichtsfamilie.

V3 ist **kein allgemein freigegebener Sieger**: Im Dart-Fall bleibt die
Fehlinterpretation nicht nötig -> EXCLUDED; neu wird Getränke fälschlich auf
Kaffee verengt. Dart als Aktivität fehlt in V2 und ist in V3 immerhin wieder
explizit vorhanden. Im Brunch/Billard-Fall entfallen zwar die Zeitdaten, aber
V3 erzeugt die unbekannte Faktreferenz b1 und bindet die Reihenfolge an die
Innenraumeigenschaft. Diese Rohantwort bleibt zu Recht abgelehnt. Sie wird
nicht durch geratenes Ersetzen der Referenz nachträglich als verstanden erklärt.
Die gemessene Zeitverbesserung ist keine umfassende semantische Verbesserung.

#### Separater Softwarefehler: Brunch als Mahlzeit

Der kanonische Katalog kennt BRUNCH. Die Rollenprüfung erlaubte das Konzept
jedoch nur unter experience.activity/offer.kind und der Zuordner behandelte
food.meal/food.option brunch nicht als Angebotsbedarf. Das ist ein Software-
Integrationsfehler und kein Anlass, eine zutreffende Essensinterpretation als
Sprachfehler zu trainieren. Rollenvertrag @12 erlaubt dieselben Essensfamilien
wie für andere Mahlzeiten; der Zuordner nutzt dafür den bereits vorhandenen
Angebotsnachweis. Es werden keine Fakten umgeschrieben und keine Pflichten
abgeschwächt. Brunch benötigt weiterhin einen passenden Angebotsbeleg:
gewöhnliches Frühstück oder Abendessen genügt nicht.

Der Test durch Übersetzungsgrenze und Suche bestätigt für die drei zulässigen
Familien denselben BRUNCH-Treffer ohne Korrekturanruf. Negative Gegenbeispiele
BREAKFAST und DINNER werden nicht akzeptiert. Eine gesonderte Wiedergabe der
unveränderten gespeicherten Modellantworten (`brunch-boundary-replay.json`)
bestätigt: V2-dev-9 wird nach dieser Softwarekorrektur ausführbar, V3-dev-9
bleibt wegen b1 abgelehnt. Das sind keine neuen Modellaufrufe und keine
nachträgliche Änderung der ursprünglichen Vergleichsergebnisse.

Betriebsstand: V3 bleibt explizit wählbarer lokaler Versuch. Keine produktive
Aktivierung, keine Veröffentlichung, kein neues langes Training. Weitere
Trainingsdaten müssen besonders Negation, unveränderte allgemeine Wünsche,
Gericht vs. Küchenrichtung und gültige Faktverknüpfungen abdecken. Bekannte
TEST-Fehler bleiben Diagnosefälle, keine heimlich wieder ungesehenen Tests.


Verifikation dieses Änderungsstands: kanonischer Build und TypeScript-Prüfung,
Betroffenentests für Verständnis/Export, Essenssprache, Bedeutungsrollen und
Produktisolation sowie die vollständige Product-Decision-CI einschliesslich
Hostwächtertests, Single-Route-Invariante und isoliertem App-Web-Browserablauf
bestehen. Der erste eingeschränkte CI-Aufruf konnte die Prozessliste für zwei
Hosttests nicht lesen; der regulär autorisierte erneute Lauf bestand vollständig.
Browser-/RPC-Daten waren synthetisch, keine produktiven Aktionen. Das belegt
Verträglichkeit der Softwareänderung, keine behobenen offenen Modellfehler.


### Beauftragte gezielte Fortsetzung, 9. November 2026

Auf „Perfekt, los gehts“ folgt die vereinbarte nächste Trainingsrunde: 96 neue
synthetische Kontrastbeispiele und 64 unveränderte frühere TRAIN-Interpretations-
beispiele, über Szenariogruppen verteilt. Zwölf neue VALIDATION- und zwölf neue
TEST-Fälle sind getrennt. Die früheren TEST-Fälle werden nicht zu TRAIN
hochgestuft. Die Parent-Daten und externen Bibliotheksbeispiele bleiben erhalten;
externe Klassifikationsübungen werden in dieser fokussierten Fortsetzung nicht
zusätzlich gemischt. Die Assistenzprüfung ist beauftragt, aber keine unabhängige
menschliche Goldprüfung. Die Grundmuster sind bekannt; neue Kombinationen sind
kein Beweis für allgemeines Sprachverständnis.

Quelle: `nuknuk-round3-cases.mjs`, Export über `nuknuk-training-bundle.mjs --round3`,
Opt-in-Profil COMPACT_ADAPTER_V3. Die Autorierung unterstützt explizite Referenzen
pro Fall; vier verschiedene Rechenzeitpunkte umfassen lokale Mitternacht,
Jahreswechsel und Sommerzeitumstellung. Gegenbeispiele behandeln insbesondere
nicht erforderlich vs. verboten, allgemeine Getränke ohne erfundene Sorte,
Alternative vs. gemeinsame Pflicht, Reihenfolge vs. Ortsbindung, LT vs. LTE,
Gruppenkosten ohne erfundene Beträge sowie verbindliche Begleitung als
Besuchsgruppe. Die ausdrücklich genannte Begleitung bleibt erhalten.

Eingefrorener Export: `training-20261109-v3-focused`, 160 TRAIN / 12 VALIDATION /
12 TEST; Manifest-SHA-256
`ce2347b3569b8e3684eaf7dada45b4861653e5a6e0e267c07375385f26cffe0e`.
Die tatsächliche MLX-Datensatzaufbereitung prüfte alle TRAIN-/VALIDATION-Zeilen:
maximal 2.826 bzw. 2.672 Tokens, vollständige Completion-Maskierung, keine
Abschneidung. Frische Auswahl und drei dreifach zu wiederholende TEST-Fälle
(r3-fresh-1, 5, 6) werden vor Trainingsbeginn fixiert.

Startpunkt ist ausdrücklich der abgeschlossene kleine Adapter mit SHA-256
`5d1b3400044f9029c3e6b60e89ffcc6691446db0dfa0693c5d893fbcd1e14feb`,
nicht ein zufällig neu initialisierter Adapter. Das installierte MLX-VLM lädt ihn
über resume_adapter_file. Die vorgeschaltete Prüfung verlangt beendetes Training,
passendes Basismodell, exakt passende LoRA-Module/Rank/Alpha/Dropout und den
vorgegebenen Gewichtshash. Der Optimierer startet neu; dies ist eine Fortsetzung
der Gewichte, kein identischer Optimiererzustand. Basismodell und Parent-Adapter
werden nicht überschrieben. Ein bewachter Null-Schritte-Lade-/Speichertest
(`adapter-20261109-round3-restore-smoke`) bestätigte bytegenau denselben Adapter.

Geplanter Ablauf: separater 20-Schritte-Ressourcenpilot, nur bei regulärem Erfolg
anschliessend eine vollständige 160-Schritte-Runde, wiederum vom festgelegten
Parent statt vom Pilot. Danach alter gegen neuen Adapter mit identischem
V3-Profil auf den zwölf frischen Anfragen. Drei davon jeweils dreimal direkt
nacheinander: 18 Aufrufe pro Adapter, 36 insgesamt. Wiederholungen sind keine
zusätzlichen unabhängigen Fälle. Alle Rohantworten und Identitäten bleiben
pro Aufruf erhalten. Keine Anpassung anhand dieser TEST-Antworten während des
Vergleichs. Kein automatischer Wiederanlauf nach Abbruch, keine Aktivierung.
Ressourcenwächter v5 und unabhängiger Watchdog bleiben unverändert.

### Ergebnis der fokussierten Fortsetzung vom 9. November 2026

**Nicht zur Aktivierung geeignet: einzelne Verbesserungen, aber kein belastbarer
Gesamtfortschritt gegenüber dem bisherigen Adapter.** Der eingefrorene Ablauf
ist vollständig beendet: 20 Schritte Ressourcenpilot, 160 Schritte Fortsetzung,
anschliessend 36 echte lokale Vergleichsaufrufe. Nach Sichtung der frischen
Antworten wurden weder Prompt noch Trainingsdaten geändert. Der bisherige
Adapter und alle drei Basisgewichtsdateien sind unverändert verifiziert.

Die volle Fortsetzung dauerte 5.238 Sekunden (87:18), der Pilot 614 Sekunden
(10:14), der Vergleich 1.915 Sekunden (31:55). Der Modellprozess belegte während
des Trainings maximal 24,44 GiB physischen Speicher; alle Druckmessungen waren
normal, zusätzlicher Swap: null. Der Trainingswächter endete mit FINISHED.
Die Inferenzserver wurden nach ihrem jeweiligen Vergleich planmässig beendet;
ihr Wächterstatus SUPERVISOR_INTERRUPTED ist hier kein Speicherabbruch.

Neuer Adapter-SHA-256:
`cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3`.
Gespeichert unter `.local/nuknuk-understanding/adapter-20261109-round3-focused-epoch1`.
Endvalidierung: loss 0,22255, Tokenübereinstimmung 0,94986 auf zwölf Beispielen.
Diese Tokenmetrik ist **keine** Quote korrekt verstandener Nutzeranfragen.

Beide Adapter erhielten dieselben zwölf neuen Anfragen mit identischem
COMPACT_ADAPTER_V3-Profil. Die drei Wiederholungsfälle erzeugten je Adapter
dreimal identische vollständige Antworten. Sie waren damit wiederholbar, aber
jeweils weiterhin fehlerhaft. Wiederholungen zählen nicht als unabhängige Fälle.

| Fall | Bisheriger Adapter | Neuer Adapter |
| --- | --- | --- |
| Tischtennis mit Schwester; Essen nicht nötig, Getränke schon | Essen fälschlich ausgeschlossen | Essen korrekt nicht erforderlich; dafür Getränke fälschlich zu Kaffee verengt |
| Kartenspielen mit Onkel, kein Alkohol | Fakten korrekt; Zieltext verlangt zusätzlich einen Betrieb ohne Alkoholausschank | Bedeutung erhalten, überzogener Zieltext entfällt |
| Nach Fotokurs trinken, Sorte egal | Allgemeine Getränke und vorheriger Kurs als Kontext korrekt | Gleichwertig korrekt |
| Besonderes Dim Sum zur Beförderung, nicht automatisch teuer | Anlass und Wunsch erhalten; erfundener Nullbetrag als NOT_REQUIRED | Derselbe erfundene Nullbetrag; keine Pflicht zu kostenlos, trotzdem falsche Angabe |
| Kletterkurs, danach woanders Suppe | Ungültiger FACT-Verweis b1 | Derselbe Fehler; woanders im Ziel bleibt korrekt |
| Quiche oder Pasta, zwingend Mineralwasser | ANY verknüpft Essen mit Wasser als Alternative | Derselbe Fehler |
| Sandwich unter 11 CHF, keine Sitzplätze nötig | LT11 korrekt, Sitzplätze fälschlich ausgeschlossen | Derselbe Fehler trotz korrektem Zieltext |
| Gericht für beide zusammen höchstens 32 CHF | Betrag und Gesamtbezug sprachlich erhalten, kanonisches budget.scope fehlt | Gesamtumfang weiter nur Freitext, zusätzliche redundante Preisangabe |
| Nach Training um 20:10 Gnocchi, Tag unbekannt | Reihenfolge/Uhrzeit akzeptabel; zusätzliche Dinner-Pflicht und erfundenes NOT_REQUIRED-Datum | Dieselben Zusatzangaben |
| Morgen mit Nachbarin Tee | Morgen korrekt auf 17.11. normalisiert; doppelte Personenzahl | Wiederholt erfundene Altersgrenzen bis zum Ausgabelimit; unvollständige Antwort |
| Frühstück mit Bruder, nur er vegetarisch | Zuordnung korrekt; zusätzlich unbelegte Altersgrenze 0 | Korrekte Zuordnung ohne erfundene Altersgrenze |
| Kerzen gestalten, danach dort Kakao | Ortsbindung/Reihenfolge korrekt; FACT b1 ungültig | Weiter ungültig, zusätzlich Kaffee erfunden und Kakao als Gericht codiert |

Die Preisbasis ist ein Übergabeproblem: `budget.coverage` mit freiem Text ist
nicht gleich `budget.scope` mit GROUP_TOTAL. Der bestehende Matcher kann ohne
strukturierte Basis keinen Gruppenpreis bestätigen und meldet
BUDGET_BASIS_OR_CURRENCY_UNKNOWN; unstrukturierte Preisbestandteile ergeben
BUDGET_COMPONENT_COVERAGE_NOT_STRUCTURED. Dies ist am Codepfad geprüft, kein
durchgeführter Spot-Suchlauf. Eine formal als EXECUTABLE akzeptierte
Interpretation ist deshalb noch kein Nachweis erfolgreicher Preisprüfung.

Die Tee-Ausgabe endete nach 161,15 Sekunden mit finishReason length bei 2.048
Ausgabetokens. Das war keine Speicherabschaltung und kein HTTP-Zeitlimit:
das Modell wiederholte unbelegte Altersgrenzen 0 und 100 Jahre. Ein höheres
Ausgabelimit wäre keine inhaltliche Korrektur dieser Schleife.

Die Assistenzprüfung unterscheidet vollständige Fälle, kleinere Zusatzfehler,
materielle Bedeutungs-/Codierungsfehler und ungültige Strukturen. Auf den zwölf
einzigartigen Fällen: bisher 1 / 4 / 5 / 2, neu 3 / 1 / 5 / 3. Die zwei
vollständiger gewordenen Fälle rechtfertigen angesichts der Rückschritte keine
Beförderung. Keine pauschale Qualitätsprozentzahl daraus ableiten. Autorierung
und Prüfung erfolgten durch dieselbe beauftragte Assistenz, nicht durch eine
unabhängige menschliche Goldprüfung.

Vollständige Belege liegen lokal unter
`.local/nuknuk-understanding/comparison-20261109-round3-focused-fresh/`:
Rohantworten pro Aufruf, Hash-Abgleich in `comparison.json`, Einzelfallbegründungen
und Wiederholungsprüfung in `semantic-review.json`. Die Ressourcen-/Befehlsfolge
steht in `.local/nuknuk-understanding/round3-execution.json`.

**Folgerung für den nächsten Versuch:** Nicht unverändert länger trainieren.
Zunächst an getrennten Entwicklungsfällen feststellen, ob der kleine Adapter
mit nur q/v im letzten Attention-Block selbst trainierte Kontraste beherrscht
oder schon daran scheitert. Erst danach Lernumfang/Verteilung und gegebenenfalls
Trainingskapazität gezielt ändern, jeweils mit erneutem Ressourcenpilot.
Die hier exponierten TEST-Fälle gelten ab jetzt als bekannt; für eine neue
Qualitätsaussage werden neue, vorher nicht ausgewertete Fälle benötigt.
Dieser Lauf beweist weder allgemeine Unfähigkeit des 27B-Basismodells noch
Produktionsreife. Keine Live-Aktivierung, kein Providerwechsel, kein Release.

### Prüfung der eigenen Trainingsbeispiele: Lernen oder Übertragung?

Die anschliessend beauftragte Diagnose ist abgeschlossen: zwölf tatsächlich
trainierte Eingaben, jeweils einmal mit bisherigem und neuem Adapter, insgesamt
24 Aufrufe. Vor den Aufrufen wurden Systemanweisung, Nutzernachricht und
Referenz für jede Auswahl bytegleich mit der gespeicherten TRAIN-Zeile
abgeglichen. Die Auswahl umfasst sechs Themen: Verneinung, Getränkespezifität,
Verknüpfungen/Ortsbezug, Budget, Begleitperson und Datum. Keine Promptänderung,
kein weiteres Training. Dies ist eine gezielte In-Sample-Stichprobe, kein
unabhängiger Test und keine Prüfung aller 160 Trainingszeilen.

**Befund: Die Probleme bestehen bereits bei den trainierten Eingaben selbst.**
Es handelt sich nicht ausschliesslich um mangelnde Übertragung auf neue
Formulierungen. Der neue Adapter erzeugt zwölf formal gültige Ausgaben gegenüber
zehn beim bisherigen Adapter. Die zusätzlichen gültigen Ausgaben zeigen jedoch
weiterhin nicht unterstützte oder falsche Übergaben an den Bibliothekar.

| Trainierter Fall | Ergebnis des neuen Adapters |
| --- | --- |
| Dart; Abendessen brauche ich nicht; Getränke erforderlich | Abendessen weiter EXCLUDED statt NOT_REQUIRED, zusätzlich Kaffee erfunden |
| Dart; Abendessen ausgeschlossen; Getränke erforderlich | Ausschluss richtig, Getränke weiter zu Kaffee verengt |
| Schach mit Getränken / Schach mit Bier | Beide korrekt; auch bisheriger Adapter beherrscht diese Fälle |
| Museum oder Mittagessen | ANY korrekt; unnötige Rückfrage stellt die klare Alternative erneut infrage |
| Museum, danach Mittagessen an anderem Ort | Ungültiges b1 entfällt; Reihenfolge nun nur als experience.sequence-Freitext, UNSUPPORTED_CAPABILITY statt ausführbarer SEQUENCE |
| Museum, danach dort Mittagessen | SEQUENCE und SAME_PLACE korrekt; zusätzlich REQUIRED location.destination = dort |
| Samosa, nicht unbedingt teuer | Weiter erfundener Betrag 0 CHF NOT_REQUIRED, keine kostenlose Pflicht |
| Samosa, möglichst unter 19 CHF für beide zusammen | Gericht und zwei Personen besser erfasst; GROUP_TOTAL fehlt trotz expliziter Musterantwort, Gesamtbezug nur Freitext |
| Essen mit Bruder, vegetarische Option nur für ihn | Korrekt, ebenso beim bisherigen Adapter |
| Pho, Besuchstag offen | Weiter erfundenes Datum als NOT_REQUIRED; erzwingt keinen Besuchstag |
| Morgen Pho | Datum korrekt auf 17.11. normalisiert; zusätzliche ungenannte Pflicht für vietnamesische Küche |

`location.destination = dort` ist nicht bloss eine andere Schreibweise von
SAME_PLACE: Der aktuelle Ortsmatcher vergleicht destination mit
`location.locality`. Der Fehler ist im Codepfad nachvollzogen; es wurde kein
produktiver Suchlauf dafür ausgeführt. Bei Pho ist nicht das Wissen um die
Herkunft falsch, sondern die zusätzlich erzwungene Küchenrichtung: Ein Anbieter
mit bestätigtem Pho, aber ohne bestätigte vietnamesische Küche könnte dadurch
ausgeschlossen werden. Synonyme, andere Entitäts-IDs und plausible Bindungen
bei „dazu“ wurden ausdrücklich akzeptiert.

Die 24 Aufrufe benötigten zusammen 1.121,33 Sekunden reine Inferenz (18:41),
zuzüglich Laden und Hash-Prüfung. Maximaler physischer Modellspeicher 18,79 GiB,
normaler Speicherdruck, kein zusätzlicher Swap. Die Basisgewichte sind erneut
verifiziert unverändert. Beide Server wurden danach regulär durch den
Vergleichsprozess beendet. Kein automatischer Wiederanlauf, keine Aktivierung.

Lokale Nachweise: `round3-train-fit-plan.json` enthält die Auswahl und Hashes
der passenden TRAIN-Zeilen; `round3-train-fit-selection.json` markiert explizit
split TRAIN. Unter `comparison-20261109-round3-train-fit/` liegen alle 24
Rohantworten, die Identitätsprüfung und `semantic-review.json` mit konkreten
Einzelfallbegründungen. Diese Pfade liegen unter `.local/nuknuk-understanding/`.
Die generische Evaluator-Metadatenzeile ASSISTANT_AUTHORED_HOLDOUT ist für diesen
Aufruf nicht zutreffend; Auswahl, Plan und inhaltlicher Bericht kennzeichnen
ihn ausdrücklich als In-Sample-TRAIN-Diagnose.

**Ursache noch nicht isoliert:** Dieser Befund unterscheidet noch nicht zwischen
zu geringer Lernstärke, begrenzter Adapterkapazität, ungünstiger Tokengewichtung
und Komplexität des Ausgabevertrags. Er beweist keine prinzipielle Unfähigkeit
des Basismodells. Nächster begrenzter Versuch wäre eine kleine feste
Entwicklungsmenge, bei der gezielt die Wahrscheinlichkeit der entscheidenden
Wörter/Felder und die freie Ausgabe vor/nach dem Anpassen gemessen werden.
Erst nach nachweislich gelerntem Muster ist eine neue Prüfung auf unbekannten
Formulierungen aussagekräftig. Nicht unverändert die volle Runde verlängern.

### Kontrollierter Sechs-Fälle-Versuch: 20 Schritte und Entscheidungs-Tokens

Der anschliessend beauftragte kleine Lernversuch ist abgeschlossen. Startpunkt
war der unveränderte Round-3-Adapter mit SHA-256
`cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3`.
Sechs frühere TRAIN-Fälle wurden ohne inhaltliche Änderung aus dem eingefrorenen
Bestand ausgewählt: polarity-1/-2, specificity-1/-2, budget-4, relations-4.
Zwei bestehende VALIDATION-Fälle und ein bereits exponierter TEST-Fall bleiben
in ihren bisherigen Rollen; kein TEST wird trainiert, keine neue Holdout-Aussage.

Der fokussierte Export `training-20261109-tiny-fit` hat Manifest-SHA-256
`2235309e055510c2e6fad042ebede0cfc101a8f7649b1cfcff91b9974a7410b9`.
Nur die Datenmischung wurde auf sechs wiederkehrende Muster eingegrenzt:
20 Optimiererschritte, Batch 1, Lernrate 1e-5, Seed 7, Rank 8/Alpha 16,
weiter nur q/v im letzten Full-Attention-Block. Optimierer neu gestartet,
Parent- und Basisgewichte nicht überschrieben. Der neue Adapter hat SHA-256
`8a7302f5cade18470d018f36cde97cd990b0b5a7922d0d1c675ca7fd2d4957ea`.

Vor und nach dem Training wurden unter dem Ressourcenwächter die identischen
entscheidenden Tokenpositionen der korrekten Musterantwort bewertet. Die
Messung lädt keine fremden Daten, schreibt keine Gewichte und verwendet keine
Gradienten. Sie gibt die korrekten vorherigen Antwort-Tokens vor (teacher
forcing), während die späteren freien Antworten keinerlei Zielantwort erhalten.
Das sind unterschiedliche Aufgaben; diese Tokenwerte sind keine kalibrierte
Sicherheit und keine Quote korrekter Bedeutung. Ein anderes gleichbedeutendes
Wort darf trotz niedriger Wahrscheinlichkeit des Zielworts korrekt sein.

| Markierter Zielwert | Mittlerer Token-NLL vorher | Nachher |
| --- | ---: | ---: |
| NOT_REQUIRED | 0,7974 | 0,6152 |
| EXCLUDED | 0,0297 | 0,0701 |
| Getränke | 0,0756 | 0,0590 |
| beer | 3,5525 | 2,2732 |
| SAME_PLACE | 0,7231 | 0,5902 |
| SEQUENCE | 0,000315 | 0,000286 |
| GROUP_TOTAL | 0,003586 | 0,002997 |
| PREFERRED | 0,1483 | 0,1799 |

Niedriger bedeutet unter diesem vorgegebenen Kontext wahrscheinlicher. Sechs
Spannen verbesserten sich, zwei verschlechterten sich. Bei keiner markierten
Position änderte sich, ob das korrekte Token die stärkste Wahl war. Die Gewichte
reagieren messbar, aber daraus folgt keine beherrschte Regel.

Danach wurden beide Adapter mit identischem V3-Prompt auf den sechs Eingaben
frei abgefragt: zwölf reale Modellantworten. **Keine der vier fehlerhaften
Anfragen wurde vollständig korrigiert.** Die zwei bereits richtigen
Schach-/Getränkefälle bleiben korrekt. Beide Dart-Fälle erfinden weiter Kaffee;
„nicht nötig“ bleibt fälschlich EXCLUDED. Der Gesamtbudgetumfang bleibt Freitext
statt GROUP_TOTAL. Beim Museumsablauf bleiben SEQUENCE/SAME_PLACE richtig,
zusätzlich steht aber weiterhin REQUIRED location.destination = dort. Fünf
meaning-Objekte sind sogar exakt identisch, das sechste unterscheidet nur
gleichbedeutende Entitätsbeschriftungen. Formale Strukturprüfung: je 6/6;
inhaltlich vollständig: je 2/6. Keine Verbesserungsquote daraus ableiten.

#### Zusätzlich nachgewiesener Unterschied zwischen Training und Nutzung

Eine explorative, nach dem eingefrorenen Versuch durchgeführte CPU-Prüfung
reproduziert einen technischen Formatunterschied: Der Export speichert
Musterantworten als kompaktes JSON. Der installierte lokale MLX-Ausgabefilter
verwendet in `mlx_vlm.structured.build_json_schema_logits_processor` dagegen
`JsonCompiler(separators=(", ", ": "), whitespace_pattern="")`.
Die Antworterzeugung erlaubt damit eine andere Tokenfolge als das Training.

Die Prüfung verwendete die tatsächlich installierte llguidance-Version, den
lokalen Tokenizer und das exakte outputSchema **je Anfrage**, ohne Modellgewichte
zu laden. Alle sechs kompakten TRAIN-Antworten werden bereits beim dritten Token
abgewiesen. Dieselben sechs Zielobjekte mit ausschliesslich angepassten
Leerzeichen werden vollständig akzeptiert, ebenso die sechs tatsächlichen
Serverantworten. Eine Änderung der Schlüsselfolge war dafür nicht nötig.
Der erste Einzel-Schema-Versuch ist ausdrücklich durch die per-Anfrage-Prüfung
ersetzt: Die Schemaauswahl ist anfrageabhängig, unter anderem beim Budget.

**Bewiesen ist die Formatabweichung, nicht ihr Anteil an den Bedeutungsfehlern.**
Es wäre falsch, daraus bereits abzuleiten, dass Leerzeichen allein alle Fehler
beheben. Auch die teacher-forced Messwerte wurden unter der kompakten
Trainingsdarstellung ohne Grammatikmaske erhoben und sind deshalb nicht dieselbe
bedingte Verteilung wie die strukturierte freie Ausgabe. Vor weiterer Variation
von Lernrate oder Adapterkapazität muss diese vermeidbare Abweichung angeglichen
und der begrenzte Versuch kontrolliert wiederholt werden. Der aktuelle Versuch
wurde nicht nachträglich verändert und kein zusätzlicher Lauf gestartet.

Ressourcen: Training 616 Sekunden unter dem Wächter (10:16), davor/danach
133/136 Sekunden lesende Tokenmessung; freie Modellantworten zusammen 584 Sekunden
(9:44), zuzüglich Laden und Hash-Prüfungen. Maximaler physischer Modellspeicher
24,31 GiB, Druckmessungen normal, kein zusätzlicher Swap. Alle eigenen Prozesse
regulär beendet, Basis- und Parent-Gewichte unverändert. Keine Aktivierung.

Lokale Nachweise unter `.local/nuknuk-understanding/`:
`tiny-fit-experiment-plan.json`, `tiny-fit-before-scores.json`,
`tiny-fit-after-scores.json`, `tiny-fit-score-comparison.json`,
`tiny-fit-grammar-replay-per-case.json` sowie
`comparison-20261109-tiny-fit-20/semantic-review.json` und zwölf Rohantworten.
Der generische Evaluator kennzeichnet TRAIN-Auswahlen jetzt ausdrücklich als
IN_SAMPLE_TRAIN_DIAGNOSTIC_NOT_HOLDOUT; Eingaben und Ausgabevertrag bleiben
dadurch unverändert. Ausrichtungstests der Tokenmessung und die bestehenden
18 Wächter-/Trainingsgrenztests bestanden vor den echten Läufen.

### Formatkorrektur umgesetzt und derselbe Versuch wiederholt

Die explizit beauftragte Korrektur ist umgesetzt (Quellcommit `e06b54a1`).
Der kanonische `exportUnderstandingDataset` schreibt neue Zielantworten nun mit
Komma-Leerzeichen und Doppelpunkt-Leerzeichen. Die rekursive JSON-Serialisierung
ändert keine Satzzeichen innerhalb von Textwerten und erhält Anführungszeichen,
Backslashes und Unicode. Neue Manifeste kennzeichnen die Darstellung als
`targetSerialization: mlx-llguidance-spaced-json@1`. Historische Exportdateien,
ihre Hashes, Reviews und Adapter bleiben unverändert. Die Tokenmessung liest
beide eingefrorenen Formate und lehnt unbekannte Formatkennungen ab.

Der neue Export `training-20261109-tiny-fit-spaced` enthält exakt dieselben
sechs TRAIN-, zwei VALIDATION- und einen bereits exponierten TEST-Fall.
Jede System-/Nutzernachricht wurde unverändert abgeglichen; alle neun geparsten
Zielobjekte sind identisch zum vorigen Export. Nur deren Schreibweise ändert
sich. Alle neun Ziele wurden vor dem Training mit lokalem Tokenizer, installierter
llguidance-Grammatik und exaktem anfragespezifischem outputSchema vollständig
akzeptiert. Es werden keine TEST-Antworten trainiert oder neu bewertet.
Manifest-SHA-256:
`ae9b4b4e4314205eb4509692548d23ec67f8be27a9034e35924463bd16244969`.

Die Wiederholung startet wieder vom unveränderten Parent `cd0735f6...`, nicht
vom bereits zusätzlich trainierten Kompakt-Adapter. Wieder 20 Schritte, Batch 1,
Lernrate 1e-5, Seed 7, dieselben q/v-Module/Rank/Alpha/Dropout. Der Abgleich der
Trainingskonfigurationen findet ausschliesslich unterschiedliche Daten- und
Ausgabepfade. Neuer Adapter-SHA-256:
`a62ddb4f0b7047d62927571973b0a8244600abf51f54cef158fe84cdca321c12`.

Vor und nach diesem Lauf wurden die entscheidenden Tokens innerhalb der neuen
Schreibweise gemessen. Eingabetokens und Messpositionen sind pro Vorher-/Nachher-
Paar identisch. Die früheren kompakten Prefix-Werte dürfen nicht unmittelbar
als dieselbe bedingte Verteilung daneben gestellt werden.

| Zielwert | Token-NLL vorher (neue Schreibweise) | Nachher |
| --- | ---: | ---: |
| NOT_REQUIRED | 0,5577 | 0,4195 |
| EXCLUDED | 0,0480 | 0,0905 |
| Getränke | 0,1027 | 0,1070 |
| beer | 2,5229 | 1,7728 |
| SAME_PLACE | 0,8718 | 0,7732 |
| SEQUENCE | 0,000084 | 0,000093 |
| GROUP_TOTAL | 0,004174 | 0,005032 |
| PREFERRED | 0,2039 | 0,1835 |

Bei NOT_REQUIRED werden unter der korrekten Musterantwort erstmals beide
Zieltokens zur jeweils stärksten Wahl (zuvor eines von zwei). Das ist ein
begrenztes teacher-forced Signal, keine bestandene freie Interpretation.

Der anschliessende freie Vergleich benutzt den vorherigen 20-Schritte-Adapter
mit kompakten Trainingsantworten als Kontrolle und den neuen 20-Schritte-Adapter
als Behandlung: je dieselben sechs Eingaben, identischer V3-Prompt und identischer
Ausgabefilter, zwölf echte Aufrufe. Damit unterscheidet die Trainingsbehandlung
nur die Zielschreibweise, nicht zusätzliche Schritte oder Lernrate.

**Inhaltliches Ergebnis: weiterhin zwei vollständig richtige Fälle von sechs,
keine Korrektur der vier zuvor fehlerhaften Anfragen.** Allgemeine Getränke bzw.
Bier beim Schach bleiben richtig; die nicht ausdrücklich verlangte zusätzliche
SAME_PLACE-Bindung entfällt und wird nicht als Fehler gezählt. Beide Dart-Fälle
erfinden weiter Kaffee, „nicht nötig“ bleibt EXCLUDED. Gesamtbudget bleibt
`budget.coverage`-Freitext statt GROUP_TOTAL. Beim Museumsablauf entfällt zwar
das falsche geografische „dort“, dafür entsteht eine ungenannte REQUIRED
Indoor-Pflicht unter `location.setting`; die Familienprüfung lehnt diese mit
CONCEPT_FAMILY_MISMATCH ab (erlaubte Familie wäre `offer.area`). Auch die andere
Familie würde die ungenannte Pflicht nicht rechtfertigen. Ortsbindung und
Reihenfolge selbst sind korrekt. Formale Akzeptanz fällt dadurch von 6/6 auf
5/6. Kürzere Antworten und weniger Rückfragen kompensieren das nicht.

**Folgerung:** Die nachgewiesene Formatabweichung ist behoben. Ihre Beseitigung
allein reicht in diesem begrenzten 20-Schritte-Versuch nicht für korrekte freie
Antworten. Weder ist damit eine grundsätzliche Modellunfähigkeit bewiesen noch
der verbleibende Anteil von Lernstärke, Kapazität oder unterschiedlichen
Antwort-Prefixen/Faktenreihenfolgen isoliert. Kein weiterer automatischer Lauf
und keine Aktivierung dieses Adapters.

Training regulär beendet: 627,8 Sekunden unter dem Wächter (10:28), maximal
24,405 GiB physischer Modellspeicher, normaler Druck, zusätzlicher Swap null.
Lesende Messungen vorher/nachher: 135,6/139,5 Sekunden. Freie Inferenz zusammen
556,5 Sekunden (9:17), zuzüglich Laden und Hash-Prüfung. Basis-, Parent- und
Kontrolladapter sind unverändert verifiziert; eigene Server anschliessend
planmässig beendet. Keine Spotdaten oder Produktivsysteme verändert.

Belege unter `.local/nuknuk-understanding/`: `tiny-fit-spaced-experiment-plan.json`,
neuer Export einschliesslich `format-only-verification.json` und
`exact-server-grammar-check.json`, `tiny-fit-spaced-score-comparison.json` sowie
`comparison-20261109-tiny-fit-format/semantic-review.json` und alle Rohantworten.
Build und 34 Verständnis-/Exporttests sowie vier Messausrichtungstests bestanden.

### Runpod-Vorbereitung: Konto und erste GPU-Prüfung

Vorbereitungsstand vom 09.11.2026 (Ergebnis des echten Versuchs siehe unten):
lokal vorbereitet, keine GPU gemietet, keine Dateien hochgeladen, keine
Zahlung ausgeführt. CUDA-Laden, Rückwärtslauf und semantische Parität sind noch
nicht auf echter NVIDIA-Hardware geprüft. Der Paketstatus behauptet deshalb
ausdrücklich keine getestete GPU-Laufzeit.

Der Nutzer erstellt ein normales Konto unter https://console.runpod.io/signup,
lädt für den ersten Versuch 25 USD Guthaben unter Billing auf und lässt Auto-pay
ausgeschaltet. Es wird zunächst nur ein öffentlicher SSH-Schlüssel unter
Credentials → SSH Public Keys → Add SSH Key eingetragen. Lokal erstellt:
`.local/nuknuk-gpu-access/id_ed25519.pub`, Fingerprint
`SHA256:oxpRtfbWaG2O3MBVdMPvL624Ef4F3hKgHbAUgvptxD4`.
Der private Schlüssel bleibt in diesem ignorierten lokalen Verzeichnis. Ein
Runpod-API-Schlüssel und ein kostenpflichtiges Hugging-Face-Konto sind für
diesen manuellen SSH-Weg nicht erforderlich.

Erst unmittelbar vor dem Test einen Pod anlegen: eine H100 PCIe 80 GB, On-Demand,
bevorzugt Secure Cloud, offizielles Runpod-PyTorch-Template, vollständiger
SSH-Zugang mit öffentlicher IP und TCP-Port, 200 GB Speicher unter `/workspace`.
Keine mehreren GPUs oder Serverless-Endpunkte. Die konkrete Region, Verfügbarkeit,
Template-Version und angezeigte Stundenrate werden vor dem Start geprüft.
Die GPU-Grundrate sollte für diesen Plan höchstens 3 USD/Stunde betragen;
Speicher und Steuern sind zusätzlich zu berücksichtigen. Kein automatischer
GPU-Start durch die vorbereiteten Skripte.

Das Paket liegt lokal unter
`.local/nuknuk-understanding/runpod-pilot-package.tar.gz` (714.015 Bytes),
daneben die SHA-256-Prüfsumme. Es enthält genau neun freigegebene Dateien:
Laufprogramm, gepinnte Bibliotheken, Startanweisung, Manifest, drei getrennte
Datendateien und konvertierte Adaptermatrizen samt Übertragungsbeleg. Kein
Repository-Checkout, keine .env, keine Produktionszugänge oder privaten Schlüssel.
Der gesamte Modell-Download erfolgt später auf der GPU-Maschine, nicht auf dem Mac.

`nuknuk-gpu-bundle.mjs` verwendet denselben geprüften Export und kontrolliert
nochmals die sechs TRAIN-/zwei VALIDATION-/einen exponierten TEST-Fälle und ihre
Dateihashes. Der CUDA-Trainer liest ausschliesslich TRAIN. Modell und Revision:
`Qwen/Qwen3.5-27B`, `fc05daec18b0a78c049392ed2e771dde82bdf654`.
Die öffentlichen Modellmetadaten wurden geprüft: nicht privat/nicht zugangsbeschränkt.

Der Parent-Adapter `cd0735f6...` wird per exaktem Gewichtshash übernommen.
MLX-A/B-Matrizen werden nach PEFT transponiert, mit Rank 8 und Skalierung 2
(Alpha 16). Die numerische CPU-Prüfung der tatsächlichen q/v-Projektionszusätze
ergab jeweils absolute Abweichung null. Der CUDA-Lader verlangt danach exakt
vier eindeutige Zielparameter mit passenden Formen und kontrolliert das Kopieren.
Das ist **kein** Nachweis gleichen Gesamtmodellverhaltens: MLX-Affine-4bit und
CUDA-NF4 quantisieren das Basismodell unterschiedlich; auch die Übereinstimmung
der ursprünglichen unquantisierten Modellrevision ist nicht bitweise belegt.
Vor weiterem Training ist deshalb eine inhaltliche Übergabeprüfung nötig.

Die GPU-Umgebung ist als Kandidat gepinnt: PyTorch 2.8.0 aus dem offiziellen
CUDA-12.8-Index, Transformers 5.22.2, PEFT 0.21.2, bitsandbytes 0.50.2,
Accelerate 1.15.0, safetensors 0.8.0, Hugging Face Hub 2.4.0, NumPy 2.2.6.
Öffentliche Paketmetadaten wurden auf offensichtliche Abhängigkeitskonflikte
geprüft. Ein erfolgreicher CUDA-Gesamttest wird erst auf dem Pod belegt; die
vorbereitete Umgebung wird dafür isoliert unter `/workspace/backyrd-gpu-env`
installiert, ohne die Mac-Umgebung umzubauen oder Docker lokal zu starten.

Operator-Befehle nach dem gezielten Upload und Entpacken unter `/workspace`:

```bash
python3 -m venv /workspace/backyrd-gpu-env
/workspace/backyrd-gpu-env/bin/pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cu128
/workspace/backyrd-gpu-env/bin/pip install -r requirements.txt
/workspace/backyrd-gpu-env/bin/python -B nuknuk-gpu.py check --bundle .
timeout --signal=TERM --kill-after=30s 3600 /workspace/backyrd-gpu-env/bin/python -B -u nuknuk-gpu.py train --bundle . --steps 2 --layers 1 --output /workspace/nuknuk-smoke
```

Zuerst nur der Zwei-Schritte-Test: tatsächliche Architekturpfade, Maskierung,
übernommene Parameter, CUDA-Speicher und Rückwärtslauf prüfen. Anschliessend
gesondert freie Antworten auf die gleichen bekannten Fälle auswerten. Erst nach
diesem Nachweis wird ein 20-Schritte-Vergleich gewählt. Der vorbereitete Trainer
erlaubt genau ein oder vier letzte Full-Attention-Blöcke mit q/v, weiterhin Rank 8,
Lernrate 1e-5 und Seed 7. Zusätzliche LoRA-Blöcke starten ohne Projektionsänderung;
die vier Parent-Matrizen werden übernommen. Keine Basisgewichts-Fusion oder
Aktivierung in Product. Keine längeren Läufe oder automatischen Wiederholungen.

Schutz: einzelne 80-GB-GPU erforderlich, 85-Prozent-PyTorch-Allocatorgrenze,
Sequenzen über 4.096 Tokens werden abgewiesen statt abgeschnitten, Labels
ignorieren vollständig den exakt erzeugten Non-Thinking-System-/Nutzerprefix,
Diskreserve, endlicher Ablauf, Zwischenstände und keine automatische Rückkehr
nach Fehlern. Der externe GNU-timeout begrenzt auch Hänger; er stoppt jedoch nur
den Prozess und **nicht** die Runpod-Abrechnung. Nach Ergebnissicherung den Pod
in Runpod stoppen/terminieren; verbliebener Speicher kann weiter Kosten verursachen.
25 USD Prepaid ohne Auto-pay ersetzt keine genaue Gesamtkosten-/Abschaltgarantie.

Lokal geprüft: fünf CPU-Tests für Matrixabbildung, ungültige Formen/NaN,
Dateimanipulation/Pfadausbruch sowie Completion-Maske und Trunkierungsverbot;
die tatsächliche Adapterkonvertierung, Paketdateihashes und Archiv-Allowlist.
Noch ausstehend: Konto-/SSH-Einrichtung beim Anbieter, realer CUDA-Test und
Verhaltensvergleich. Dafür werden keine Passwörter oder API-Schlüssel im Chat benötigt.

Offizielle Betriebsquellen:
https://docs.runpod.io/accounts-billing/billing,
https://docs.runpod.io/get-started/credentials,
https://docs.runpod.io/pods/configuration/use-ssh,
https://docs.runpod.io/pods/templates/overview,
https://huggingface.co/docs/peft/developer_guides/checkpoint,
https://pytorch.org/get-started/previous-versions/.

### Echter Runpod-Funktionstest am 10.11.2026

Der Nutzer genehmigte ausdrücklich einen H100-SXM-Pod für höchstens eine Stunde
und insgesamt höchstens 5 USD. Tatsächlich verwendet: ein H100 SXM 80 GB,
Secure Cloud US-MO-1, 200 GB temporärer Container-Datenträger, kein persistentes
Volume, offizielles PyTorch-2.8.0/CUDA-12.8.1-Template. Angezeigte Rate inklusive
Speicher: rund 4,02 USD/Stunde. Auto-pay blieb ausgeschaltet; der hinterlegte
öffentliche SSH-Schlüssel wurde per Fingerprint abgeglichen.

Start angefordert um 06:13:20 UTC; Stillstand spätestens um 06:24:00 UTC im
Anbieter-UI verifiziert: `Not running`, Compute und Speicher `0.00/hr`.
Damit höchstens 10 Minuten 40 Sekunden statt einer Stunde. Rechnerisch rund
0,72 USD auf Basis der angezeigten Rate; keine Behauptung einer bereits
abschliessend geprüften Rechnung. Installationszeit und Fehlerkorrektur sind
in dieser Gesamtdauer enthalten. Keine neue GPU weiterlaufen lassen.

Der erste Versuch scheiterte nach erfolgreichem Laden und Kopieren aller vier
Parent-Matrizen: Transformers 5 liefert bei `apply_chat_template` standardmässig
ein `BatchEncoding`, der Trainer erwartete eine Tokenliste. Behoben durch das
explizite `return_dict=False` samt Prüfung der unverschachtelten Integerliste.
Der Maskierungstest bildet nun genau diesen abweichenden Standard ab. Ursprüngliches
Upload-Paket und erster Fehlerbericht bleiben erhalten; die Korrektur wurde als
getrenntes Paket v2 mit unveränderten Daten und Parent-Gewichten übertragen.

Der zweite Versuch belegt echtes CUDA-Training:

| Messung | Ergebnis |
| --- | --- |
| Abschluss | Zwei von zwei Schritten, Exit 0, Adapter gespeichert |
| Laufzeit des zweiten Prozesses | 27,52 Sekunden inklusive Laden aus lokalem Cache und Speichern |
| PyTorch-Spitzenspeicher | 32,297 GiB auf der 80-GB-GPU |
| Trainierbare Parameter | 188.416, nur q/v des letzten Full-Attention-Blocks |
| Übernommene Parent-Matrizen | Vier, passende Formen und exaktes Kopieren geprüft |
| Tatsächliche Gewichtsänderung | Bei allen vier Matrizen endlich und ungleich null nachgewiesen |
| Loss Schritt 1 / 2 | 0,15243 / 0,14604; unterschiedliche Beispiele, kein Qualitätsvergleich |
| Neuer Adapter SHA-256 | `f11902745686bb6a870c0b1541da6e1955537a185d104f540c3580a9701fa1bb` |

Die q/v-Übertragung funktioniert somit auch mit der echten HF/PEFT-Architektur.
Die Bibliothekskombination ist für diesen Zweischrittpfad praktisch geprüft.
`causal_conv1d` und `flash-linear-attention` fehlen noch; Transformers verwendete
die funktionale, langsamere PyTorch-Referenz. Keine ungeprüften Optimierungspakete
während dieses Tests hinzugefügt.

Die vollständigen Ergebnisdateien einschliesslich Adapter, Herkunft, Gewichtsvergleich
und beider Versuchslogs wurden vor dem Stopp auf den Mac kopiert. Archiv-Hash auf
Pod und Mac identisch: `887f9f830fdb3002cafa099f4bf972854abd3639837f8fc0b17786376d173527`.
Lokale Belege: `.local/nuknuk-understanding/runpod-20261110-smoke/`, insbesondere
`deployment.json`, `nuknuk-smoke-v2/result.json`, `preflight.json`,
`steps.jsonl` und `weight-update-proof.json`.

Wichtige Grenze: Das beweist den technischen Trainingspfad, keine besseren freien
Antworten, keine MLX/NF4-Verhaltensparität und keine Verbesserung auf unbekannten
Anfragen. Kein längerer Lauf, keine Freigabe für Product. Als Nächstes den
unveränderten Parent auf CUDA gegen die bekannten Mac-Antworten vergleichen und
danach erst einen gezielten Trainingsvergleich mit getrennten Prüfbeispielen wählen.

Abschaltung: Der vorinstallierte `runpodctl` hatte entgegen der allgemeinen
Anbieterbeschreibung keinen eingerichteten Pod-API-Schlüssel. Deshalb war keine
automatische Anbieter-Abschaltung aktiv; der Operator überwachte diesen kurzen
Versuch und stoppte ihn manuell im authentifizierten UI. Für unbeaufsichtigte
Läufe muss zuerst eine unabhängig geprüfte Anbieter-Abschaltung eingerichtet
werden. Prozess-timeout allein genügt dafür nicht. Beim Stoppen wurde ausschliesslich
die bereits lokal gesicherte temporäre Testumgebung verworfen; der gestoppte Pod
bleibt ohne laufende Speicher-/GPU-Kosten im Konto.

### Übergabeprüfung Mac → CUDA: vorbereiteter Vergleich

`nuknuk-gpu-parity.mjs` friert sechs bekannte Diagnosefälle aus demselben geprüften
Datensatz ein. Baseline sind die tatsächlichen gespeicherten Mac-Antworten unter
`comparison-20261109-tiny-fit-20/previous_adapter`, mit Parent-Hash `cd0735f6...`.
Für jeden Fall werden identischer Anfragetext, Systemanweisung, Nutzereingabe,
Parent-Adapter und vollständige beendete Mac-Antwort geprüft. Die Fingerprints
aller sechs Prompts und Eingaben stimmen mit dem kanonischen aktuellen Request-
Builder überein. Die Mac-Antworten werden nicht neu erzeugt; sie sind eine
historische, nachvollziehbare Vergleichsbasis. Kein erneutes grosses Modell auf
dem Mac laden, um diese vorhandenen Antworten bloss zu reproduzieren.

Wichtig für einen fairen Vergleich: Auf dem Mac erzwingt LLGuidance bereits das
Ausgabeschema. Deshalb gibt auch CUDA nicht einfach frei ohne diese Begrenzung
aus. Die Grammatik wird mit derselben installierten Version `llguidance==1.9.1`
und denselben Einstellungen (Komma-Leerzeichen, Doppelpunkt-Leerzeichen, keine
flexiblen Leerzeichen) auf dem Mac kompiliert und als Bestandteil des geprüften
Dateimanifests übertragen. Die CPU-Prüfung hat alle sechs tatsächlichen Mac-
Antworten einschliesslich Endtoken durch diese Grammatik akzeptiert. Das prüft
die Struktur, nicht die semantische Richtigkeit der Antworten.

Der Modus `nuknuk-gpu.py evaluate` lädt nur den ursprünglichen Parent, deaktiviert
Gradientenberechnung und Checkpointing, friert sämtliche Parameter ein und erzeugt
mit Greedy-Decoding (`do_sample=False`), deaktiviertem Thinking und maximal 2.048
Ausgabetokens die Antworten. Keine Musterantwort oder Mac-Antwort wird in den
GPU-Prompt aufgenommen. Die Tokenmaske beginnt erst nach dem Prompt. Antwort,
Laufzeit, Eingabetokenanzahl und Speicher werden pro Fall gespeichert; Endtoken,
Grammatikfehler und abgeschnittene Antworten bleiben überprüfbare Fehler.
Ein Gewichtsdigest vor und nach allen Fällen muss identisch bleiben. Kein
Optimizer, keine Trainingsschritte, keine Aktivierung im Produkt.

Lokaler Plan: `.local/nuknuk-understanding/runpod-20261110-parity/parity-cases.json`,
SHA-256 `c35e90935212882e8eeae808273252dd87593d0d29fa0b7334206f13a26f4877`.
Paket: `.local/nuknuk-understanding/runpod-parity-package-v2.tar.gz`, SHA-256
`97b89c51dbab92d90a61aad9a207de4b07e976bd97dba45dd543b81215b57ded`.
Es enthält nur die bisherige Allowlist plus eingefrorenen Vergleichsplan.
Bekannte Einschränkung bleibt MLX-Affine-4bit gegenüber CUDA-NF4; gleiche
Grammatik und Anfragen machen die beiden Modellrepräsentationen nicht identisch.
Diese sechs bekannten Fälle sind kein unabhängiger Qualitätsnachweis.

Anbieterzustand bei Vorbereitung: Neustart des bereits gestoppten Pods angefordert,
aber nach erneutem Laden weiter `Not running`; die bisherige direkte SSH-Verbindung
wurde abgewiesen. Safari zeigte anschliessend leere Pod-/Deployment-Ansichten.
Eine unabhängige Browseransicht konnte den normalen Login laden, verlangt jedoch
eine neue E-Mail-Bestätigung. Deshalb noch keine CUDA-Vergleichsergebnisse melden.
Der zusätzliche Lauf bleibt auf höchstens 40 GPU-Minuten begrenzt; zusammen mit
dem ersten Test weniger als eine bezahlte GPU-Stunde und höchstens 5 USD.
Die genauen Start-/Stoppbelege und tatsächlichen Antworten müssen nach dem
erneuten Zugang ergänzt werden. Ein Prozess-timeout ersetzt weiterhin keinen
verifizierten Anbieter-Stopp.

### Übergabeprüfung Mac → CUDA: tatsächliches Ergebnis vom 10.11.2026

Der Vergleich ist abgeschlossen. Der alte Pod konnte wegen einer inzwischen
anderweitig vergebenen GPU nicht starten. Ein neuer H100-SXM-Pod führte denselben
eingefrorenen Plan aus. Kein Training, kein Optimizer und keine Produktaktivierung.
Der ursprüngliche Parent-Adapter blieb unverändert; sein Parameterdigest vor und
nach der Auswertung ist identisch:
`4f5373a49e80c185ebff92eaa7e617da93945d2bd0048c43765616cd7e9a8ac5`.
Anfrage-/Prompt-Hashes und Eingabetokenzahlen stimmen für alle sechs Fälle mit
der historischen Mac-Baseline überein. Alle Antworten sind vollständig und bestehen
die kanonische Strukturprüfung. Diese Prüfung erkennt die folgenden inhaltlichen
Fehler jedoch nicht.

| Bekannte Diagnoseanfrage | Mac | CUDA | Inhaltliche Bewertung von CUDA |
| --- | --- | --- | --- |
| Dart; Abendessen brauche ich nicht; Getränke müssen vorhanden sein | Fehler | Fehler | Abendessen fälschlich ausgeschlossen statt nicht erforderlich; allgemeine Getränke auf Kaffee verengt. |
| Dart; Abendessen ausgeschlossen; Getränke müssen vorhanden sein | Fehler | Fehler | Ausschluss korrekt, aber allgemeine Getränke durch eine nicht verlangte Liste `coffee/beer/craft beer` ersetzt. |
| Schach spielen, dazu Getränke | Korrekt | Korrekt | Schach und allgemeine Getränke verpflichtend erhalten. |
| Schach spielen, dazu Bier | Korrekt | Korrekt | Schach und ausdrücklich verlangtes Bier verpflichtend erhalten. |
| Zuerst Museum, danach dort Mittagessen | Fehler | Fehler | Reihenfolge und gleicher Ort korrekt; erfundene geografische Pflicht „dort“ entfällt. Dafür verknüpft `ANY` Museum und Mittagessen als Oder statt beides zu verlangen. |
| Samosa, möglichst unter 19 Franken für uns beide zusammen | Fehler | Fehler | Gericht, weiches Budget und Betrag korrekt; Gesamtbudget nur im Freitext statt `budget.scope=GROUP_TOTAL`. Zwei Personen nicht als `people.count=2`; „zusammen“ fälschlich als Beziehung. |

Bewertung durch den beauftragten Codex-Assistenten, keine unabhängige menschliche
Goldprüfung: auf beiden Systemen zwei von sechs Fällen inhaltlich akzeptabel.
Vertretbare Formulierungs- und Bindungsvarianten werden akzeptiert; keine Forderung
nach wortgleicher Ausgabe. Beim Museumsfall und Gesamtbudget beschreibt das Modell
das Ziel im Klartext richtig, erzeugt aber falsche oder unvollständige strukturierte
Suchregeln. Deshalb ist weder ein Qualitätsgewinn noch exakte Verhaltensparität
nachgewiesen. Befund: `CUDA_RUNTIME_USABLE_BUT_EXACT_BEHAVIOR_PARITY_NOT_ESTABLISHED`.

CUDA benötigte durchschnittlich 32,12 Sekunden pro Antwort; die historischen
Mac-Antworten 48,43 Sekunden. Der gesamte Auswertungsprozess einschliesslich
Modellbeschaffung und Laden dauerte 393,59 Sekunden. Spitzenspeicher laut PyTorch:
23,81 GiB. Kein Speichermangel. Es wurden 2.557 Ausgabetokens auf CUDA gegenüber
2.549 auf dem Mac erzeugt. Dies ist kein zeitgleich kontrollierter Hardwarebenchmark.
MLX-Affine-4bit und CUDA-NF4 sowie numerische Kernel unterscheiden sich; die Ursache
einzelner Antwortänderungen wurde nicht isoliert. Sechs bekannte Trainingsfälle
sind zudem kein Nachweis für unbekannte Anfragen.

Der neue Pod `f6k1wdmvfaazwq` wurde am 10.11.2026 um 07:09:30 UTC angefordert und
war um 07:24:49 UTC nachweislich gestoppt: höchstens 919 Sekunden. Zusammen mit
dem vorherigen Smoke-Test höchstens 1.559 Sekunden, knapp 26 Minuten. Bei
4,018 USD/Stunde rechnerisch etwa 1,74 USD; die finale Anbieterabrechnung ist
nicht geprüft. Beide Pods stehen auf `Not running` und 0 USD/Stunde. Der manuelle
Anbieter-Stopp erfolgte innerhalb der genehmigten Stunde und 5-USD-Grenze.
Eine automatische Anbieter-Abschaltung war weiterhin nicht eingerichtet; vor
unbeaufsichtigtem Training bleibt deren praktische Verifikation erforderlich.

Vollständige lokale Belege unter
`.local/nuknuk-understanding/runpod-20261110-parity/`: `semantic-review.json`,
`contract-comparison.json`, `deployment.json`, sechs Rohantworten unter
`nuknuk-parity-results/` und Ausführungslogs. Das Ergebnisarchiv wurde vor dem
Stopp kopiert; SHA-256 auf Pod und Mac identisch:
`ae77747bb7c472158fc76835b3ee8b7eb992b4429f775c6745da987a529f7e07`.

Nächster fachlicher Schritt ist ein gezielter Trainingsvergleich für Nichtbedarf
gegen Ausschluss, allgemeine gegen erfundene spezifische Wünsche, Und/Oder und
Gesamtbudget. CUDA benötigt eine ausdrücklich versionierte eigene Baseline.
Der vorhandene Mac-Adapter und die bisherigen Lerndaten bleiben erhalten.
Vor einem längeren Lauf getrennte unbekannte Prüffälle und wirksame Abschaltung
festlegen; dieser Vergleich allein rechtfertigt keinen langen Trainingslauf.

### Breites GPU-Verständnisprogramm, freigegeben am 10.11.2026

Der Founder hat den beschriebenen breiten Ausbau und ein Gesamtkostendach von
20 USD mit aktiver Überwachung genehmigt. Vorsichtshalber werden die bisherigen
GPU-Läufe mitgerechnet (vor dem neuen Abschalttest konservativ 1,75 USD).
Der zusätzliche temporäre Runpod-GraphQL-Schlüssel für Status und Stopp wurde
separat ausdrücklich genehmigt. Er liegt ausschliesslich lokal, Git-ignoriert
und mit Dateirechten 0600; keine Übertragung an den Trainingspod. Runpod kann
seine Rechte nicht auf einen einzelnen Pod-Stopp begrenzen. Nach Abschluss
widerrufen. Keine Backyrd-/Supabase-Berechtigungen und keine Produktaktivierung.

Der geprüfte neue Bestand `training-20261110-v4-reviewed` enthält 2.360 TRAIN-
Zeilen (320 bisherige Backyrd-TRAIN, 2.000 neue Interpretationen und 40 bisherige
lizenzierte Zusatzübungen), 100 neue VALIDATION- und 300 neue TEST-Zeilen. Die
neuen Interpretationen stammen aus 50 formulierten TRAIN-Szenariofamilien mit
je 40 Variationen; VALIDATION aus zehn und TEST aus 30 getrennten zusammengesetzten
Familien. Variationen einer Familie bleiben in derselben Partition. Die Anzahl
ist kein Mass für unabhängige semantische Vielfalt oder menschliche Goldprüfung.
Historische VALIDATION/TEST-Antworten bleiben im Elternbestand und werden weder
zu TRAIN noch zu einer neuen unabhängigen Abschlussprüfung umetikettiert.

Themen: Modalität/Negation, Anlass/Besonderheit, Und/Oder/Reihenfolge/gleicher Ort,
Personen/Alter/Begleitung/Einzelbedarfe, Gesamt- und Pro-Person-Budget, Datum/Uhr/
Dauer, Umgebung/Ausstattung, Wetterzweige, explizite Wunschkorrekturen innerhalb
einer Anfrage, Alltagssprache/Sprachwechsel und Nicht-Erfinden. Wunschkorrekturen
im Anfragetext sind noch kein echter mehrstufiger Dialogspeicher. Vorhandene
ASSESS_CANDIDATES-Übungen bleiben erhalten; sie erteilen dem Modell weiterhin
keine Befugnis, harte Eligibility-Grenzen oder die produktive Rangfolge aufzuheben.

Manifest-SHA-256:
`7e785bea94754ebc0fda698a948be15bddd3a8757c15796ecefedba42c36e9ba`.
400 zusätzliche synthetische Präferenzpaare verwenden ausschliesslich TRAIN,
mit gleicher Formatierung von richtiger und gezielt falscher Antwort. Damit
soll nicht lediglich ein Leerzeichenunterschied die bevorzugte Antwort verraten.
Eine tatsächliche Präferenz-Trainingsphase ist erst nach SFT-Auswertung und
innerhalb des verbleibenden Budgets zu wählen, nicht als erfolgt zu behaupten.

Der bestehende CUDA-Trainer wird erweitert, kein zweiter Trainingspfad angelegt:
q/v an vier bzw. 16 Attention-Blöcken oder breitere lineare Module ausschliesslich
im Sprachmodell. Vision bleibt unverändert. Der originale Parent wird hashgeprüft
übernommen, neue LoRA-Erweiterungen beginnen ohne zusätzlichen Ausgangsdelta.
Der bisherige Parent bleibt lokal erhalten. Echte CUDA-Kompatibilität, Speicher
und Geschwindigkeit dieses breiteren Pfads müssen beim kurzen Start gemessen
werden. Grössere Trainingsgrenzen gelten nur für das ausdrücklich gepinnte neue
Curriculum. Alle Antworten bleiben durch denselben kanonischen Vertrag begrenzt.

Der neue Auswerter unterstützt gebündelte Generierung mit getrennten Grammatik-
zuständen pro Antwort. Die Inputs enthalten keine Musterantworten. Lokale
Diskrepanzprüfung vergleicht Pflicht/Wunsch/Verbot, Budgetumfang, Alternativen,
Wetterzweige und Bindungen; Abweichungen bleiben fachlich zu sichten. Weder
Schemaerfolg noch sinkender Loss wird als korrektes Nutzerverständnis gemeldet.
Checkpointwahl nur auf VALIDATION; TEST bleibt Abschlussprüfung.

`nuknuk-runpod-watch.py` kann ausschliesslich Status lesen und einen explizit
gebundenen Pod stoppen, keine Ressourcen erstellen oder starten. Ein separater
lokaler Prozess mit `caffeinate` beobachtet Preis, Laufzeit, Stop-Datei und
unerwartete weitere laufende Pods. Fehler beim Statusabruf lösen Stop-Versuche
aus. Die Budgetberechnung umfasst Vorkosten und mindestens 1,50 USD Reserve.
Das ist unabhängig vom Trainings- und Chatprozess, bleibt aber von Mac, Strom
und Netzwerk abhängig; kein behaupteter anbieterunabhängiger Schutz gegen einen
Ausfall des Macs. Aktive Bedieneraufsicht bleibt erforderlich. Ein echter Start-
zu-Stopp-Test wird vor dem langen Training protokolliert. Fortschritte und
fertig geschriebene Checkpoints werden vor dem Anbieter-Stopp lokal gesichert.

### 10.11.2026: laufender breiter GPU-Lauf, Schutz und Vergleichsgrenzen

Der aktuelle Runpod-Lauf bleibt lokal/experimentell, ohne Produktaktivierung. Das
Gesamtkostendach beträgt USD 20 einschliesslich früherer GPU-Versuche. Ein lokaler
Wächter und ein unabhängig im Container laufender Wächter begrenzen denselben Pod.
Der zusätzliche Container-Zugang wurde ausdrücklich freigegeben; er liest den
vorhandenen Provider-Schlüssel ausschliesslich im Container und kann nur dessen
Pod stoppen. Der eigene lokale Watcher wurde durch tatsächliches Stoppen und
bestätigten Zustand EXITED praktisch geprüft. Fertige Adapter werden mit
Abschlussbeleg und SHA-256 automatisch auf den Mac kopiert; ein Prozess-Timeout
allein beendet keine Pod-Kosten.

Das überprüfte Curriculum umfasst 2360 TRAIN-Zeilen (2320 Backyrd-Fälle, 40
lizenzierte Hilfsübungen), 100 Entwicklungsfälle und 300 abschliessende Testfälle.
Die 2000 neuen TRAIN-Zeilen sind Varianten von 50 Familien, keine 2000 unabhängigen
menschlich bestätigten Situationen. Drei fachliche Curriculum-Korrekturen wurden
vor jeder TEST-Generierung dokumentiert: eine nicht belegte persönliche
Rollstuhlbehauptung im Entwicklungssoll entfernt und zwei zu ähnliche Testfamilien
ersetzt. TRAIN blieb dabei unverändert. Der geprüfte V3-Manifest-SHA lautet
`91f3f3602adb27b4338c7bedced76af7f3df961bef94c3238e8362d61863a6ff`.

Die ersten zwei V3-Piloten verarbeiten jeweils 40 Trainingsbeispiele in 20 Updates:
q/v der letzten vier Attention-Blöcke sowie lineare Sprachmodellprojektionen.
Gemessene Dauer etwa 222 bzw. 249 Sekunden, maximale CUDA-Allokation etwa 44,1 bzw.
44,8 GiB. Das ist kein semantischer Qualitätsnachweis. Der Ausgangsadapter zeigte
in zehn Entwicklungsanfragen sieben deutliche Bedeutungsfehler, zwei akzeptable
Antworten und einen gesondert zu prüfenden Software-Zuordnungsfall. Diese Prüfung
ist assistiert und kein unabhängiger menschlicher Goldstandard.

Eine experimentelle Beschleunigung der Loss-Berechnung scheiterte vor jedem
Optimizer-Update an der numerischen Gradientenvergleichsgrenze. Sie wird nicht im
Training benutzt; der normale Hugging-Face-Loss bleibt massgeblich. Padding maskiert
Prompt- und Auffülltokens mit -100. Nur TRAIN erreicht den Optimizer.

`COMPACT_ADAPTER_V4` ist eine ausdrücklich wählbare **lokale** kürzere
Instruktionsvariante mit unverändertem Schema, Validator und Nutzereingabe. Alte
Profile bleiben reproduzierbar. Der Zweck ist, wiederholte Instruktionstokens zu
reduzieren, ohne Regeln im Produkt zu lockern. Durchschnittliche gesamte
TRAIN-Länge sinkt von etwa 2612 auf 1402 Tokens; keine Zeile wird abgeschnitten.
V4 verlangt einen passenden Ausgangsadapter-Vergleich mit demselben Prompt.
Datensatz `training-20261110-v4-short2` hat identische Fragen, Sollantworten,
Referenzen und Aufteilungen wie das geprüfte Curriculum; Manifest-SHA
`0d9dd34404d34eb31dbb6cd2638af90aa7f2d4cbdb6039144a2019d185978209`.
Abschlussqualität, tatsächlich verarbeitete Beispiele und gesicherte Artefakte
müssen nach dem Lauf ergänzt werden. Vorbereitete Präferenzpaare oder ein sinkender
Loss dürfen nicht als durchgeführtes Präferenztraining bzw. Qualitätsbeweis gelten.

Ein breiter `language-linear`-GPU-Adapter enthält zusätzliche Projektionsmatrizen.
Er ist nicht ohne geprüfte Konvertierung mit dem bisherigen vier-Matrizen-MLX-
Adapter gleichzusetzen. GPU-Auswertung, Mac-Laufzeitkompatibilität und Freigabe für
den Produktbetrieb sind drei getrennte Nachweise; das Training ersetzt sie nicht.

#### Auswahl für den längeren Lauf

Die kürzere V4-Instruktion wurde nach dem 80-Beispiele-Piloten **verworfen**:
Snacks wurden als Getränk, Reservierung als Zugänglichkeit und tatsächliches Alter
als Zutrittsgrenze dargestellt; ein widerrufenes Datum blieb erhalten. Der höhere
Durchsatz rechtfertigt diese Bedeutungsverluste nicht. V4 bleibt ein dokumentierter
Versuch, nicht das ausgewählte Trainings- oder Produktprofil.

Am 10.11. um 08:43 UTC startet deshalb ein längerer SFT-Lauf mit dem unveränderten
V3-Auftrag, dem Original-Ausgangsadapter und `language-linear`, Batch 2,
Lernrate 0.00005, 640 geplanten Updates. Das sind höchstens 1280 eindeutige Beispiele
des durchmischten TRAIN-Korpus; 2360 verfügbare Zeilen bedeuten nicht, dass alle in
diesem Budget verarbeitet werden. Laufzeitgrenze 7336 Sekunden mit separater
3900-Sekunden-Reserve für Entwicklungsprüfung, Abschlussfragen und Sicherung.
Zwischenstände alle 50 Updates. Die Wahl ist ein weiter zu prüfender Lernversuch,
keine Qualitätsfreigabe: V3-linear verbessert im kurzen Vergleich Alternativen,
revidierte Datumsangaben und unnötige Rückfragen, enthält aber weiterhin Fehler.
Die endgültig verarbeiteten Schritte und Ergebnisse werden nach Abschluss ergänzt.

#### SFT-Abschluss und eingefrorene Abschlussauswertung

Der V3-Lauf beendete tatsächlich alle 640 geplanten Updates mit 1280 eindeutigen
TRAIN-Beispielen in 7068,495 Sekunden. Spitzenallokation 45,662 GiB CUDA. Der fertige
Adapter ist lokal gesichert und SHA-256-geprüft:
`63171f1565f50cdc9af0c19930384987964feb9b86c810c5b6dab5db5be6c464`.
Das ist ein Teildurchlauf des 2360-Zeilen-Korpus, kein vollständiger Epochendurchlauf.

Die assistierte Prüfung derselben zehn Entwicklungsfragen ergibt vier akzeptable
primäre Bedeutungsaufträge und sechs materielle Fehler. Positiv: getrennte
Gerichtsalternativen mit personenbezogener veganer Pflicht, tatsächliches Alter,
kanonischer Rollstuhlzugang und einfaches günstiges Mittagessen. Offen: explizite
Ortsbindung verloren, bevorzugtes Budget verhärtet und Ruhe hinzuerfunden,
Gesprächsruhe als Sprachbedarf, Reservationsfreiheit falsch polarisiert,
übergreifende Preisgrenze nur einem Wetterzweig zugeordnet und widerrufenes Datum
beibehalten. Keine Produktfreigabe aus diesem Ergebnis ableiten.

Vor der ersten TEST-Generierung wurde genau dieser SFT-Adapter unveränderlich für
den Abschlussversuch festgelegt; keine weitere Auswahl oder Nachoptimierung aus
TEST-Antworten. Der Vergleich generiert 30 Ausgangsantworten (eine pro Testfamilie)
und 300 Antworten des ausgewählten Adapters. Nur die gemeinsamen 30 erlauben einen
Vorher-nachher-Vergleich. Weitere 270 prüfen zusätzliche Abdeckung. Das optionale
Präferenztraining wurde wegen des verbleibenden Prüf-/Sicherungszeitfensters
**nicht ausgeführt**. Vorbereitete Paare bleiben für einen späteren genehmigten
Lauf verfügbar. Anbieterabschaltung und finale Qualitätsauswertung folgen noch.


#### Abschluss 10.11.2026: Qualität, Sicherung und Abschaltung

Alle 300 Antworten des festgelegten Adapters und 30 Vergleichsantworten des
Ausgangsadapters sind vollständig lokal gesichert. Der SHA-geprüfte Adapter und
alle abgeschlossenen Checkpoints bleiben lokal erhalten; der Ausgangsadapter wurde
nicht überschrieben. Kein weiterer Optimizerlauf und keine neue Adapterauswahl
nach Sichtung der TEST-Antworten. DPO wurde nicht durchgeführt.

Die assistierte Bedeutungsprüfung der 30 gemeinsamen Repräsentanten findet einen
Fehler in der Prüfvorlage: Familie 14 verlangt Rollstuhlzugang, obwohl dies in der
Anfrage fehlt. Alle zehn Varianten dieser Familie werden als ungültiger Benchmark
markiert; die eingefrorenen Rohdaten und Ziele bleiben unverändert. Das ist ein
Fehler unserer Prüfvorlage und darf nicht dem Modell zugerechnet werden.

Für die übrigen 29 gemeinsamen Fragen lautet die vorsichtige Bedeutungsbewertung:

| Bewertung | Ausgangsadapter | trainierter Adapter |
| --- | ---: | ---: |
| Hauptbedeutung erhalten | 9 | 16 |
| Zuordnung oder Mehrdeutigkeit noch prüfen | 6 | 6 |
| Klarer Bedeutungsfehler | 14 | 7 |

Dies ist keine unabhängig menschlich bestätigte Erfolgsquote und keine Aussage,
dass 16 Fälle bereits durchgehend im Bibliothekar funktionieren. Die zusätzlichen
270 Antworten wurden automatisch verglichen, nicht alle einzeln semantisch
abgenommen. Automatische Literalabweichungen wie glutenfrei/glutenfree sowie
Gesprächsmöglichkeit/Ruhe sind keine belastbare Modellfehlerquote. Der Testkorpus
enthält 30 Familien mit je zehn Varianten; die TRAIN-Erweiterung enthält ebenfalls
viele Vorlagenvarianten, nicht tausende unabhängige menschliche Beispiele.

Verbessert sind insbesondere UND statt ODER, Reihenfolgen, Ortsbindung,
personenbezogene Ernährung sowie Gesamtbudget gegenüber Budget pro Person.
Verbleibende echte Fehler: mitgebrachtes Essen wird zu Lieferdienst, Hund erlaubt
zu Tieraktivität, bevorzugt drinnen zu ruhig, Jahrestag zu zwingender Aktivität und
keine Reservationspflicht zu Spontaneität nicht erforderlich. Teilweise fehlen
weiterhin ausführbare Reihenfolge und Anzahl. Das Modell ist **nicht produktreif**.

Zwei isolierte Aufrufe durch den kanonischen Bibliothekar wurden zusätzlich
protokolliert. Die synthetischen Kandidaten blieben wegen unbestätigter Speisen-/
Zeit-/Eigenschaftszuordnung im Fallback. Das beweist keinen erfolgreichen
Ende-zu-Ende-Abgleich und isoliert die Reservationsregel noch nicht. Es ist ein
weiterer Grund, Bedeutungsqualität und ausführbare Suchregeln getrennt zu prüfen.
Keine Produktionsdaten oder Lernprofile wurden verändert.

Runpod bestätigte am 10.11.2026 um 11:44:02 UTC den eigenen Pod als EXITED mit
runtime=null; auch die beiden früheren bekannten Pods waren EXITED. Der temporäre
Wächterschlüssel wurde über die reguläre Runpod-Oberfläche deaktiviert. Alle
benötigten Ergebnisse lagen zuvor lokal vor. Konservative Gesamtkostenschätzung
inklusive Vorläufen: höchstens etwa **17,68 USD**, keine Anbieterrechnung. Das
20-USD-Dach wurde eingehalten. Keine Produktaktivierung und kein Modell auf dem
Mac geladen; MLX-Kompatibilität des breiteren GPU-Adapters ist noch unbewiesen.

Lokale Nachweise im Verzeichnis
`.local/nuknuk-understanding/runpod-20261110-round4/`:
`final-semantic-review.json`, `canonical-engine-probes.json`,
`provider-stop-verification.json`, `secured-final-artifact-hashes.json`,
`final-selection.json`, `final-evaluation/` und `checkpoints/long-sft/train/adapter/`.
Für die nächste Auswahl braucht es frische, bisher nicht betrachtete Prüffragen.

#### Nächste Korrekturrunde: Daten vorbereitet, noch nicht trainiert

Am 10.11. hat der Founder die vorgeschlagene lokale Datenbereinigung und gezielte
Ergänzung beauftragt. Dies ist FAST_PR / Datenvorbereitung, keine erneute GPU-,
Budget- oder Produktfreigabe. Die Modelle des letzten Laufs bleiben unverändert.

Im neuen Kindbestand wurden 40 TRAIN-Beispiele der Familie
`r4-train-intent-3-*` korrigiert: „gut unterhalten können“ verlangt
`atmosphere.conversation=conversation_possible`, nicht zwingend
`atmosphere.noise=quiet`. Der Bibliothekar unterscheidet Gesprächsmöglichkeit und
Geräuschpegel bereits; die vorherigen Sollantworten haben diese Unterscheidung
verwischt. Das ist ein nachgewiesener Widerspruch unserer Trainingsvorgaben,
kein Nachweis, dass genau er jede beobachtete Verwechslung verursacht hat.
Die geänderten Inhalte erhalten neue Hashes und neue assistierte Prüfvermerke;
alte Freigaben werden nicht auf geänderte Antworten übertragen. Alle übrigen
2280 geerbten TRAIN-Datensätze sind unverändert. Der eingefrorene Elternbestand
und seine Abschlussauswertung werden nicht nachträglich umgeschrieben.

64 einzeln formulierte Gegenbeispiele in acht Themenfamilien ergänzen den Bestand:

- Innen-/Aussenbereich, Ruhe, Gemütlichkeit und Gesprächsmöglichkeit trennen.
- Mitgebrachtes Essen gegenüber Verpflegung vor Ort und Lieferdienst abgrenzen.
- Hundezugang gegenüber Tieraktivität und tatsächlicher Teilnahme abgrenzen.
- Keine Reservationspflicht, optionale Spontaneität und Reservationswunsch trennen.
- Anlass gegenüber gesuchter Aktivität sowie Besonderheit gegenüber Preis trennen.
- UND/ODER, zeitliche Reihenfolge und gemeinsame/verschiedene Orte erhalten.
- Gesamtsumme, Pro-Person-Preis, Preisumfang und bevorzugte/harte Grenze trennen.
- Korrekturen von Anzahl, Bereich, Hundeteilnahme und aufgehobenen Pflichten erhalten.

Diese Beispiele sind keine unabhängigen menschlichen Goldantworten und keine
64 unabhängigen Benchmarks. Es gibt keine automatische lexikalische Vervielfachung.
Die Prüfung umfasst die bestehenden Round-4-Vorlagendefinitionen, gezielt die
bekannten Verwechslungsdimensionen und strukturell alle Kinddatensätze. Sie ist
keine unabhängige neue Bedeutungsannotation sämtlicher geerbter Beispiele.

Der lokale Entwurf enthält 2384 Backyrd-TRAIN-Datensätze. Die bisherigen 100
Entwicklungs- und 300 Abschlussfragen sind vollständig ausgeschlossen und dürfen
nur bekannte Regressionen prüfen. Die 40 externen TRAIN-Übungen bleiben separat
mit ihrer bisherigen Herkunft dokumentiert; sie wurden noch nicht neu exportiert.
Die ungültige alte Testfamilie 14 bleibt im historischen Fehlerverzeichnis.

Der kanonische Export verlangt weiterhin TRAIN, VALIDATION und TEST. Da für den
nächsten Lauf noch frische Entwicklungs-/Abschlussfragen fehlen, erzeugt
`nuknuk-training-bundle.mjs --round5` ausdrücklich nur den geprüften Entwurf und
Nachweise, keine ausführbaren Trainings-JSONL-Dateien. Der Exportschutz wurde
nicht abgeschwächt. Vorbereitung:

```sh
node scripts/decision-diagnostics/nuknuk-training-bundle.mjs \
  .local/nuknuk-understanding/training-20261110-v4-audited/reviewed-backyrd.json \
  .local/nuknuk-understanding/training-20261110-v4-audited/external-lineage.json \
  .local/nuknuk-understanding/training-20261110-round5-prepared --round5
node scripts/decision-diagnostics/test_nuknuk_curriculum.mjs
```

Im Entwurfsverzeichnis liegen `corrections.json`, `excluded-exposed-cases.json`,
`reviewed-backyrd.json`, `manifest.json`, `review-audit.json` und
`preparation-verification.json`. Letzteres bestätigt: genau 40 geerbte Fälle
geändert, 64 ergänzt, kein alter Prüfdatensatz übernommen, keine Trainingsdateien
exportiert. Der Datensatz-SHA-256 des Entwurfs lautet
`c14ef53a5d1e5760836122ce52963a86d54089a84f67b4d44dde3fefc6364443`.

Vor einem neuen Lauf: neue, bisher nicht ausgewertete Kompositionsfamilien für
Entwicklung und Abschluss anlegen, thematisch verwandte Varianten zusammenhalten,
neues Kostenlimit festlegen. Nach Training zuerst auf Entwicklungsfragen wählen,
Adapter einfrieren, dann neue Abschlussfragen auswerten. Bedeutungsantwort,
ausführbare Suchregeln und positive/negative Kandidaten müssen jeweils geprüft
werden. Pflicht erfinden, Negation verkehren oder Bereich/Person/Reihenfolge
verlieren sind echte Fehler; gleichwertige Formulierungen alleine nicht.

Die Vorbereitung hat keine neuen GPU-Kosten verursacht. Ob diese Korrekturen
das Modell verbessern, ist erst mit dem nächsten tatsächlichen Lauf messbar.
