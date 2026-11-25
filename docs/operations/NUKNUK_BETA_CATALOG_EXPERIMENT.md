# NukNuk – technische Überarbeitung nach Mike

Einordnung: Offline-Katalog und Experimentvorbereitung sind FAST_PR. Der eng begrenzte Budgetkorrektur-Guard im Decision-Core ist nicht ausgerollt; eine spätere Übernahme in die installierte Route benötigt die betroffenen PRODUCT_RELEASE-Gates. Dieses Dokument ersetzt keine frühere Ausführungsfreigabe.

Dieses Paket bereitet ein überprüfbares Training vor. Es enthält keine Behauptung einer bereits gemessenen Modellverbesserung. Es startet keine GPU, überträgt keine Daten, verändert keinen Live-Dienst und aktiviert kein Modell.

## Was Tobi und Philipp bereits geprüft haben

Die beiden KI-Rollen prüften Alltagssprache, Verständlichkeit und gewünschte Bedeutungen in fünf Runden pro Rolle. Ihre unveränderten Berichte liegen unter reviews/historical-personas/. Die frühere versiegelte Fassung und deren Hash stehen in historical-persona-context.json. Diese Berichte sind historische Evidenz und keine angebliche Abnahme der neuen technischen Bytes. Eine menschliche Beta-Studie ersetzen sie nicht.

## Mikes technische Korrekturen

| Punkt | Umsetzung |
| --- | --- |
| Passender Trainer | Der Katalog erweitert den bestehenden aktiven Product-Qwen-3.6-Trainingspfad. Experimentmanifest bindet Quellcode, Daten, Parameter, Tokenizer, Image und Adapterdateien über SHA-256. |
| Parent | Exakte lokale HF-/MLX-Referenzpaarung, Rang16/Alpha32 und sämtliche80 Adaptertensors über40 Hybrid-Attention-Projektionen geprüft. Keine aktuelle Live-Gesundheitsprüfung, keine numerische Gleichheit der unterschiedlich quantisierten Basismodelle behauptet. |
| Wire-Format | Optionale leere Listen und null-Logik werden entsprechend dem vorhandenen Serving-Prompt ausgelassen. Die frühere R5-Erklärung, alle sieben Meaning-Felder seien zwingend, war falsch: facts ist erforderlich; optionale Felder folgen dem jeweiligen Schema. Live-Prompt und Schemas wurden dafür nicht geändert. |
| Maskierung | Grammar-/Template-Grenzprüfung aller3478 Fälle wird getrennt von tatsächlicher HF-Vorverarbeitung und DataCollator-Prüfung aller2888 TRAIN-/DEV-Fälle ausgewiesen. Prompt und Padding tragen Labels−100; Antwort einschließlich EOS ist beaufsichtigt. Keine Kürzung. |
| Auswertung | Ein gebundener Parent-/Candidate-Scorer erhält rohe erste Antworten, vergleicht Semantik und Host-Projektion getrennt, prüft Dialogerhalt und führt offene Unterschiede in eine Prüfwarteschlange. Gruppen-/Familien-, Themen-, Sprach- und Herkunftsauswertungen, schlechteste Gruppenvariante, Interaktionsverwechslungen, p50/p95 und paarweise Rückschritte sind vorgesehen. |
| Gewichtung | Eine vollständige Epoche ohne künstliche Duplikate:5% Begriffe,25% kontrollierte Vorlagen,35% individuell verfasste Situationen,35% Dialoge. Innerhalb jedes Bestands werden Szenariogruppen gleich gewichtet. Das ist eine eingefrorene Hypothese, keine bewiesene optimale Nutzerverteilung oder exakte Adam-Gradientenanteilszusage. |
| Vollständige Akkumulation |2350 Beispiele, Batch1, Akkumulation5, exakt470 Updates. Kein partielles Restfenster. Das tatsächliche Inventar wird als Multimenge von Input-/Label-/Attention-Hashes geprüft; bekannte Duplikate statt fehlender Zeilen werden abgelehnt. |
| Fristen |50 USD vorgeschlagene Gesamtgrenze,5 USD Reserve, keine unabhängige Laufzeitobergrenze; die Frist wird ausschließlich aus dem verbleibenden Kostenbudget abgeleitet. Die Frist wird vom festen Startzeitpunkt berechnet. Heartbeat90s deckt30s Pollintervall, bis20s Statusabfrage und Jitter ab; die harte Kosten-/Zeitfrist gilt unabhängig davon. Keine automatische Neuanlage oder Aufladung. |

Drei schon vorhandene Budget-Zielgraphen haben jetzt explizite Bezüge zu ihren jeweiligen Angeboten. Die Zahlen und Wünsche wurden nicht verändert. Bei einer ausdrücklichen späteren Budgetkorrektur bindet der schmale Quelltext-Hinweis das Modell nicht mehr fälschlich an die erste Aussage. Dieser kleine Core-Fix ist im Quellbranch getestet, aber nicht live veröffentlicht.

## Ausgeführte und offene Prüfungen

Die ausgeführten Belege liegen unter evidence/, in preflight.json, quality-report.json und experiment/native-tokenization.json. Ein Soll-Antworten-Selbsttest prüft den Auswerter, nicht NukNuk. Mutationstests prüfen, ob falsche Ziele, Eingaben, Wiederholungen und Inventare erkannt werden.

**Noch nicht ausgeführt:** gepinnter Axolotl-Image-Smoke, Parent-/Candidate-Modellinferenz, GPU-Training, native Mac-Modellprüfung und echte Empfehlungskette. Das Paket ist deshalb ein vorbereitetes Offline-Experiment mit zwingenden Ausführungsgates, keine Freigabe eines beta-tauglichen Modells.

Vor jedem NukNuk-Gewichtsdownload erzwingt der Runner zusätzlich `product-smoke`: echter PluginManager, echter HF-Trainer und CPU-Autograd mit einem synthetischen Skalar prüfen sämtliche2350 tatsächlichen Lerninputs und deren Akkumulationsskalierung. Dabei wird kein NukNuk-Modell geladen oder trainiert. Der Smoke-Beleg muss zum exakten Bundle und nativen Vorverarbeitungsbeleg passen. Der spätere reale Trainer prüft sein vollständiges Eingabeinventar, den Collator und jeden eintreffenden Batch erneut. Dataset-/Collator-Prüfung wird nicht fälschlich als bereits vollständiger DataLoader-Lauf ausgegeben.

## Gebundener Ablauf

1. `python PRUEFEN.py` prüft die entpackten Dateien ohne Netz oder Modell.
2. Die Quellen im angegebenen Git-Commit auschecken und die betroffenen Pakete gemäß README bauen. Der Katalog kann mit `node scripts/decision-diagnostics/nuknuk-curriculum/beta-catalog.mjs verify PAKETORDNER` gegen den Quellstand geprüft werden.
3. Bei einem später autorisierten Lauf: Guthaben, Auto-Pay, alleinige Pod-Zuordnung, exaktes Image und tatsächlichen Gesamttarif prüfen. Den bestehenden Eigentums-/Kostenwächter vorab scharf stellen. Ausführungsbeleg an Pod-ID, Bundle-Hash, Parent, feste Frist, beobachtete Vorkosten und Gesamttarif binden. Kein Schlüssel gehört ins Paket oder Chat.
4. Nur `experiment/` ist für den TRAIN-/DEV-GPU-Job vorgesehen, unter `/workspace/backyrd-product-training/job`. **Nicht das Gesamtpaket hochladen:** Der lokale Katalog enthält TEST-Sollantworten.
5. Auf dem Zielruntime `python job/nuknuk-gpu.py product-prepare --bundle job` erneut ausführen; die drei vorhandenen lokalen Vorverarbeitungsartefakte vorher kontrolliert aus dem frischen Jobtransfer ausnehmen. Es entstehen train-tokenized.jsonl, valid-tokenized.jsonl und native-tokenization.json. Keine NukNuk-Gewichte werden geladen.
6. `python job/nuknuk-gpu.py product-smoke --bundle job --output framework-smoke --execution-approval APPROVAL.json`. Zwingendes Paketversions-/PluginManager-/HF-Trainer-Toy-Autograd-Gate vor NukNuk-Gewichten. Es beweist weder selbst die laufende OCI-Identität noch den vollständigen Axolotl-CLI-Assembly-Pfad; der Image-Digest ist beim Ressourcenstart separat zu belegen. Erst danach `product-evaluate` für den Parent auf allen538 DEV-Eingaben mit Adapterpfad/-hash und demselben Ausführungsbeleg; Ausgabe nach parent-development/.
7. `product-train --bundle job --output training-receipts --execution-approval APPROVAL.json`. Nach10 Updates wird der Durchsatz dokumentiert. Die Prognose allein darf den Lauf nicht abbrechen; die harte Preisgrenze und technische Korrektheits-/Healthprüfungen gelten weiterhin. Ein fehlgeschlagener Lauf ist kein erfolgreicher Kandidat. Kein automatischer zweiter Versuch oder zweites Training.
8. `product-evaluate` für den exakt gesicherten Kandidaten auf DEV. Lokal im Quellcheckout `node scripts/decision-diagnostics/nuknuk-curriculum/beta-evaluation.mjs paired PAKETORDNER JOBORDNER PARENT_RESULT CANDIDATE_RESULT DEV_REPORT.json` ausführen. Nur ein bestandener DEV-Vergleich erzeugt DEV_REPORT.json.selection.json.
9. Erst nach eingefrorener DEV-Auswahl die lokale target-freie test-inference-inputs.json übertragen. Für beide Adapter `product-evaluate --split TEST --requests DATEI --selection-receipt DEV_REPORT.json.selection.json` verwenden. Derselbe lokale paired-Scorer benötigt für TEST den eingefrorenen Beleg als letztes Argument. TEST wird weder trainiert noch zur Kandidatenauswahl verwendet.
10. Adapter und Belege lokal sichern, Hashes prüfen, bezahlte Ressource und Speicher löschen und providerseitige Abrechnung bestätigen. Der Trainingsrunner behauptet ausdrücklich keine schon erfolgte Kostenbeendigung.
11. `convert-product-candidate` bindet das abgeschlossene Ergebnis, exakten HF-Adapter und bisherigen MLX-Parent. Die Konvertierung ist eine Tensorprüfung und aktiviert nichts. Native Mac-Auswertung und reale Empfehlungstests bleiben nötig. Wartungsfenster und Wiederherstellung des bisherigen Dienstes bleiben getrennte kontrollierte Schritte.

Ein erfolgreiches synthetisches TEST-Ergebnis belegt Regressionstreue auf sichtbaren kuratierten Daten. Es ersetzt keine unabhängige Studie, native Latenzmessung, passende Ortsdaten oder sicherheitsgerechte Empfehlungen. Nach Einsicht in Kandidatenfehler wird TEST in der nächsten Version Entwicklungsevidenz; eine neue unabhängige Abschlussmenge ist erforderlich.

Technische Referenzen: [Axolotl-Plugin-Schnittstellen](https://github.com/axolotl-ai-cloud/axolotl/blob/main/src/axolotl/integrations/base.py), [Transformers-Akkumulationsvertrag](https://github.com/huggingface/transformers/blob/main/docs/source/en/grad_accumulation.md). Die tatsächlichen Runtime-Versionen werden vor Ausführung geprüft; verlinkter Main-Quellcode allein beweist keine Laufzeitkompatibilität.

## Wiederaufnahme und Ausfallschutz des GPU-Laufs

Klasse: FAST_PR; betroffen sind ausschließlich der bestehende GPU-Runner,
Owned-Pod-Controller, deren CPU-Tests und dieses Runbook. Kein App-Release,
keine Datenbankänderung und keine automatische Modellaktivierung.

Der lokale und der native Wächter verwenden dieselbe Entscheidungsfunktion.
Ein einzelner Transportfehler, HTTP429 oder HTTP5xx beendet den Pod nicht.
Ohne verifizierte Provider-Beobachtung endet die Gesundheitsfrist nach90s;
Authentifizierungsfehler, ungültige Identität und unzulässiger Tarif bleiben
sofortige Stopgründe. Die unveränderte, aus dem Gesamtbudget abgeleitete
Kostenfrist wird vor jeder Abfrage geprüft und niemals durch Wiederholungen
verschoben. Der lokale Controller darf300s ohne Heartbeat bleiben, um die
begrenzten Status-/SSH-Leseversuche und eine Ergebnissicherung zuzulassen.
Das ist keine zusätzliche Trainingslaufzeitgrenze. Mutierende Create-/Launch-
Operationen werden nicht automatisch wiederholt. Native Stopgründe werden
zusätzlich per SSH laufend auf den Mac gestreamt; periodische Snapshots und
eine begrenzte Sicherung im Fehlerpfad bewahren weitere Diagnosebelege.

`catalog_prepare_resume` im bestehenden Controller erzeugt aus dem bisherigen
Bundle und einem vollständig hashgeprüften Snapshot ein target-freies
Wiederaufnahmepaket. Daten, Parent, Tokenizer, Rezept, Image und unveränderter
Inferenzcode müssen übereinstimmen. Alle vorhandenen Erstausgaben einschließlich
Fehlschlägen bleiben erhalten. Kein selektiver Retry, keine Testlabels und
keine Kandidatenantworten werden importiert. Eine ausdrückliche SHA-256-Bindung
in der Ausführungsfreigabe ist vor Allokation erforderlich. GPU-Typ und die sechs
aufgezeichneten Runtime-Versionen werden vor neuer Modellinferenz erneut geprüft.
Bei abweichenden geschützten Eingaben wird die Wiederaufnahme abgelehnt.

Fortsetzungen tragen dieselbe Kampagnen-ID, den ursprünglichen Kontostand und
die hashgebundenen Abschlussbelege aller vorherigen Versuche. Tatsächliche und
konservativ berechnete bisherige Kosten werden übernommen, nie auf null gesetzt.
Die50-USD-Gesamtgrenze einschließlich5USD Abschlussreserve bleibt unverändert.
Ein neuer Versuch ist eine bewusste Fortsetzung und keine automatische Neuanlage.

Gezielte Annahmeprüfungen: einzelner und dauerhafter API-Ausfall, Auth-Fehler,
Tarif-/Identitätswechsel, ursprüngliche Kostenfrist, fehlende Runtime-Angabe,
veränderte Eingaben/Antworten, doppelte Fälle und Erhalt fehlgeschlagener
Erstausgaben. CPU-Tests belegen diese Steuerungsregeln, keine Modellqualität.
