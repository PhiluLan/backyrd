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
Quellennutzung. Die Datei dokumentiert eine lokale Menschenentscheidung; sie
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
erfolgte lokale Menschenprüfung. Beide verlangen ebenfalls den eingefrorenen
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
