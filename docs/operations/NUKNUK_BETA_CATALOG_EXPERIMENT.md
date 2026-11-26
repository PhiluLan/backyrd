# NukNuk – technische Überarbeitung nach Mike

## Begrenzte Speicherdiagnose nach technischem Pilotabbruch

Der neue Plan `NATIVE_MLX_GATED_DELTA_DIAGNOSTIC_V1` erweitert ausschließlich
den vorhandenen Memory-Probe und nutzt Ownership, Ressourcenwächter und Restore
des nativen Controllers. Er startet kein Modelltraining: keine Modellgewichte,
kein Optimizer, kein neuer Kandidat. Alte Pilotbelege bleiben unverändert.
Zuerst wird der installierte Chunk-Scan bei64 Tokens in FP32 gegen den
Referenzscan einschließlich tatsächlich ausgewerteter VJPs geprüft
(rtol1e-3/atol1e-4). Nur danach folgen jeweils frische Forward-/Gradientenprozesse
für64,512,4134 Tokens mit9B-Headformen, BF16-q/k/v/beta und FP32-Gates/Zustand.
Jedes Kind hat300 Sekunden Diagnosebudget und bleibt in der bewachten
Prozessgruppe. Fehler oder fehlende Belege stoppen die Größenfolge.
Kein Heraufsetzen von Limits, automatischer Modellversuch oder Cloudlauf.

Messungen, Synchronisation und Peakreset erfolgen außerhalb transformierter
Funktionen. Absolute Allocatorwerte, Eingabebaseline, Buffergrößen und externes
OS-Sampling werden getrennt berichtet. Python-Graphaufbau ist kein gemessener
GPU-Operatorzeitpunkt. Ein einzelner erfolgreicher Scan belegt keine
Trainierbarkeit des vollständigen Modells; ein gescheiterter Scan grenzt nur
diesen isolierten Pfad ein. Die SSD-Kapazität ist vom RAM getrennt.

Der separate Plan `NATIVE_MLX_GATED_DELTA_VJP_COMPARE_V1` erlaubt genau einen
Reparaturkandidaten: unveränderte Vorwärtssubstitution der unit-lower-Inverse
mit analytischer Ableitung `-Yᵀ·dY·Yᵀ`, auf strikt untere Eingabeeinträge
beschränkt. Die Transposition betrifft die letzten beiden Achsen. Ein
prozesslokaler Contextmanager setzt nur diesen Aufruf um und stellt ihn im
finally wieder her; installierte Runtime-Dateien bleiben unverändert.
64 FP32-Tokens prüfen Ausgabe/VJP gegen die Referenz. Danach laufen Original-
und Kandidatenableitung bei4134 BF16-Tokens jeweils in einem frischen Kind.
Eine höchstens256MiB große synthetische Referenzdatei bindet Output, Endzustand,
Loss und alle fünf Gradienten per SHA an denselben Plan. Ihre spätere
Validierung erfolgt nach dem bereits gesicherten primären Messpeak.
Numerische Toleranzen bleiben1e-3/1e-4; zusätzlich sind mindestens20% geringerer
MLX-Primärpeak nötig. Scheitert diese Paarprüfung, erfolgt kein weiterer
Kandidat oder automatischer Modell-/Trainingslauf aus diesem Plan.

## Nativer Lernpilot auf der tatsächlichen Live-Basis

FAST_PR; betroffen sind nur der bestehende Trainings-Einstieg, dessen nativer
Worker, die minimale Modulzulassung des Ressourcenwächters und CPU-Tests.
Kein neues Gate, keine Datenbankänderung oder automatische Modellaktivierung.

`nuknuk-train.py --native-plan PLAN --manifest-sha256 HASH` prüft zunächst nur
die eingefrorenen Eingaben. `--execute --recipe A` führt den ausdrücklich
autorisierten Wartungslauf aus. Ein unabhängiger Recovery-Prozess stellt den
ursprünglichen Live-Dienst wieder her. Der Worker erhält die Modellfreigabe
erst über eine Pipe, nachdem seine Ownershipdatei gespeichert wurde; stirbt
der Controller davor, beendet EOF den noch modellfreien Child-Prozess.

Beide möglichen Rezepte starten von derselben kopierten Live-LoRA-Datei,
derselben quantisierten MLX-Basis und derselben installierten, gehashten
Laufzeit. A: Lernrate2e-6; B:1e-5; je80 echte Mikrobatch1-Updates auf40
vorhandenen Suchbeispielen. Seed7, AdamW ohne WeightDecay, Clipping1,
fünf Warmupsteps und feste Reihenfolge. Keine Fusion oder Trunkierung.
Die Antwortpositionen einschließlich EOS werden vor der Vokabularprojektion
ausgewählt; der native LanguageModel-/RoPE-Pfad bleibt erhalten.

Der Operationsplan bindet Nachrichten, Schema, Labels, Provenienz,
Tokenisierung, Modell-/Adapterdateien, Runtime und ausgeführte Quellen.
Produktive Callerquellen werden lesend gesichert. Reine lokale Aufrufe mit
gemocktem Transport erfassen die zusätzlichen aktivierten R15-Anweisungen;
es werden keine echten Nutzeranfragen aufgezeichnet. Alte Zielkonflikte
werden mit Alt-/Neu-Begründung korrigiert oder quarantänisiert.

12 TRAIN-Recall- und24 bekannte, szenariogetrennte DEV-Fälle werden vor/nach
dem Training frei generiert. Tatsächliche Modellpräfixe, Stopstatus,80
Faktoren und40 Modulskalen werden geprüft. Ein frisches Reload des gespeicherten
Adapters ist Pflicht. Ein fester teacher-forced Recall-Loss wird separat
gemessen und nie als Verständnisquote ausgegeben.

Pipeline-, Verständnis- und Graphfehler bleiben getrennt. Die unabhängige
Root-/Mike-Bewertung und die Fortsetzen-/Verwerfen-Grenzen werden vor den
ersten Ausgaben eingefroren. B ist nur nach dokumentierter Ablehnung von A,
gebundenem Ergebnis-/Reviewhash und bestätigter Live-Wiederherstellung zulässig.
Bei technischem Fehlschlag ohne vollständiges A-Ergebnis ist eine andere
Lernrate kein automatischer Reparaturversuch. Kein drittes Rezept oder
Großtraining aus diesem Pilotplan. Ein späterer unabhängiger Abschlusstest
und ein eigener Freigabeentscheid bleiben erforderlich.

Nach einem belegten Speicherabbruch ohne gesicherten Kandidaten darf der
explizite `NATIVE_MLX_MODEL_CHOICE_9B_V1`-Plan genau die bereits ausgewählte
lokale Qwen3.5-9B-4bit-Revision8b2b98... verwenden. Der vorherige Abbruch und
der wiederhergestellte ursprüngliche Livezustand sind Pflichtbelege.
Die Live-Wiederherstellungsidentität bleibt35B; die experimentelle9B-Basis
erhält einen frischen Seed7-LoRA mit32 gebundenen q/k/v/o-Modulen und64
F32-Faktoren. Alle B-Faktoren sind vor Training exakt null; kein35B-Adapter
wird übertragen. Keys, Shapes, Quantisierung, Null-Delta und Metadaten sind
vor Wartung überprüfbar. Die bestehenden Ressourcenlimits bleiben unverändert.

Originale35B-Liveantworten,9B-Startantworten und9B-Kandidatenantworten sind
drei getrennte Vergleichszellen. Lerneffekt innerhalb9B und Nutzbarkeit gegen
die eingefrorene Live-Referenz werden getrennt beurteilt. Ein Unterschied
zwischen Modellgrößen allein ist kein Lernerfolg. Auch dieser Plan erlaubt
maximal die zwei festgelegten Lernraten und keine automatische Aktivierung.
Atomare Phasenbelege unterscheiden Graphaufbau, Gradienten-Auswertung,
Update-Auswertung und tatsächlich journalisierte Optimizerschritte.

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

Die Wiederaufnahme-Fingerprints verwenden eine eigene kanonische AST-Darstellung,
keine versionsabhängigen `ast.dump`-Defaults. Vor einem kostenpflichtigen Start
muss der vollständige Resume-Vertrag mit Python3.12 (GPU-Version) und3.13
(Mac-Vorbereitung) bestehen. Der Cross-Version-Test verlangt beide tatsächlich
ausgeführten Versionen; ein einzelner vorhandener Interpreter gilt nicht als
Cross-Version-PASS. Fehlende Interpreter sind ein Testfehler. Alte und neue
Inferenzquellen müssen denselben Hash ergeben, semantische Mutationen dagegen
unterschiedliche. Die Runtime verweigert weiterhin jede echte Abweichung.

## Lokale 40-Fälle-Prüfung nach abgeschlossenem DEV-Lauf

Klasse FAST_PR: ausschließlich Diagnoseausgaben und Offline-Reviewwerkzeuge;
keine Änderung an Product-Ranking, Parser, Datenbank, Modell oder Live-Konfiguration.
`beta-evaluation.mjs` trennt Generation, Vertrag, Graphvergleich, Rückfrage,
Routing und aufgezeichnete Host-Projektion. Ein bestandener Rückfragenteilcheck
darf niemals als Fehlergrund PASS erscheinen. Der historische Gesamtstatus und
die historischen Ergebnisdateien bleiben unverändert.

Nach Build des vorhandenen Decision-Core:

```sh
node scripts/decision-diagnostics/nuknuk-curriculum/beta-local-review.mjs prepare OPERATION_ROOT NEW_REVIEW_DIRECTORY
node scripts/decision-diagnostics/nuknuk-curriculum/beta-local-review.mjs run NEW_REVIEW_DIRECTORY
```

Die Auswahl wird vor dem Replay eingefroren: alle zehn Rückschritte, zehn
familiengemischte Verbesserungen, zehn zusätzliche Kompositions- und zehn
zusätzliche Dialogfälle. Alle40 IDs sind eindeutig und stammen ausschließlich
aus vorhandenen DEV-Ausgaben. TEST bleibt unangetastet. Originaldateien,
tatsächlich geladene kompilierte Host-/Abhängigkeitsmodule, Testfixtures,
Runner und Node-Version sind hashgebunden. Änderungen vor oder während des
Replays machen den Nachweis ungültig. Ein erneuter Lauf benötigt dann ein
neues gebundenes Manifest; die Fallauswahl wird nicht ergebnisabhängig geändert.

Gespeicherte Parent-/Kandidatenantworten und Gold laufen durch die vorhandene
Validierung, den Dialog-Merge und den bestehenden Product-HTTP-Handler. Nur
Auth-, RPC-, Welt- und Persistenzports stammen aus dessen synthetischem
Testfixture. Alle Vergleichswelten müssen zuvor den kanonischen Weltvertrag
bestehen. Globales fetch wird während des Replays verworfen; bekannte Ports sind synthetisch.
Das ist keine betriebssystemweite Netzwerksperre. Es wird kein
Modell aufgerufen und keine echte Datenbank oder Nutzerinformation gelesen.

Die Beobachtung vergleicht Auswahl, Zulässigkeit, Angebot/Bereich, bedingte
Pläne sowie angezeigte Zeit-, Personen- und Budgetkontexte. Ein endlicher
synthetischer Katalog beweist keine allgemeine semantische Gleichwertigkeit.
Gleiche leere Ergebnisse werden NO_POSITIVE_WITNESS; gleiche positive
Beobachtungen heißen ausschließlich SAME_ON_SYNTHETIC_PROBES. Vertragsfehler
und unterschiedliche Host-Ausgaben bleiben sichtbar. Ein HTTP-Fehler ist
kein gültiges leeres Ergebnis.

Insbesondere stammen vorherige Bedeutungen der Dialogfälle aus dem
eingefrorenen DEV-Eingang; dies ist kein Nachweis einer vollständigen
Live-Unterhaltung. Fachliche KI-Annotationen werden von menschlicher
Gold-Abnahme unterschieden. Kein Diagnoseergebnis ändert automatisch Gold,
Trainingssplit, ursprüngliche Scores oder Aktivierungsfreigaben. Neue
Trainingsdaten dürfen nicht heimlich aus den geprüften DEV-/TEST-Fällen
entstehen. Korrekturvorschläge sind gesonderte, nicht trainierbare
Spezifikationen bis zur fachlichen Freigabe einer neuen Datenversion.

Der Importgraph der tatsächlich genutzten Diagnosemodule wird mit dem bereits
installierten TypeScript-Parser erfasst (statische sowie literale dynamische
Imports). Nichtliterale dynamische und unbekannte externe Imports werden
abgelehnt. Parserbytes, Paketauflösung und tatsächliche Distdateien sind
gebunden. Eine Änderung einer transitiven Quelle muss den Nachweis verwerfen.

Die Probeabdeckung wird außerdem pro Dimension ausgewiesen: Ein positiver
Tee-Treffer beweist keine Atmosphärenpräferenz. Datum, Geld, Alter, Zugang,
Modalität, Personenbezug und logische Bindungen bleiben mit Kontrastbelegen
oder ausdrücklicher Abdeckungslücke sichtbar. Separate synthetische
Host-Gegenbeispiele prüfen Preisgrenze, Altersgrenze, Besuchstag und Pflicht
gegenüber Präferenz; sie sind Harness-Tests und keine zusätzlichen
Modell-Leistungsfälle. Gold-, Kandidaten- und Hostfehler werden getrennt.

Ein Abschlussmanifest bindet Manifest, alle40 Einzelbelege, abgeleitete
Diagnosen, Annotationen und Berichte. Die spätere Review-Präzisierung
verändert keine Originaldaten. Der integrierte Prüfer verwirft veränderte
Ergebnis- oder Annotationsdateien.

## Gezielte Verständniskorrektur (2026-11-25)

Die Variante `understanding-correction-v1` ergänzt denselben Katalog-/GPU-Pfad.
Build: `beta-catalog.mjs build-corrections AUSGABE QUELLSPECS.json`; anschließend
`verify AUSGABE` und der vorhandene Offline-Token-/Grammatikpreflight.
Sie enthält 1.000 TRAIN-Formulierungen aus 500 kontrollierten Instanzen sowie
je 100 separat verfasste DEV-/TEST-Formulierungen. Sprach-, Slot- und
Wrappervarianten sind keine unabhängigen Situationen. Überschneidungen führen
zur Ablehnung; Prüffälle werden niemals automatisch ins Training verschoben.
Die konkrete Rezeptur umfasst eine Epoche und 200 vollständige Fünferupdates.
Der Zehn-Update-Pilot ist Bestandteil dieser Epoche, kein weiterer Trainingslauf.

Für diese Variante ersetzt `correction-evaluation.mjs` den strikten Graphscore
als Entscheidungsgrundlage. Technische Graphdiagnosen bleiben erhalten, sind
aber keine Verständnisquote. Alle Antworten beginnen als ungeprüft. Zwei
getrennte, dateigebundene KI-Reviewer bewerten jeden vorab geschriebenen
Prüfsatz einschließlich sämtlicher Teilklauseln anhand der Originalantworten;
zusätzlich prüfen sie weitere relevante erfundene Aussagen. Evidenz und beide
Ersturteile bleiben erhalten. Unterschiede werden als unklar ausgewiesen,
nicht automatisch aufgelöst. Das ersetzt keine unabhängige menschliche Studie.

Ein bestätigter Gruppenfehler und vollständige Gruppenabdeckung sind getrennt:
Ein Fehler einer Sprachvariante genügt für einen Fehlerbefund. Für den gemeinsamen
Reduktionsnenner müssen hingegen alle erwarteten Sprachvarianten beider Adapter
schlüssig beurteilt sein. Unvollständige oder unklare Varianten zählen nicht als
verstanden. Vorgeschlagen sind mindestens 90 % vollständige Gruppenabdeckung,
30 % relative Reduktion der materiellen Gruppenfehler, höchstens 10 % unklare
und 2 % unvollständige Antworten sowie keine neue kritische Regression.
Ohne Parentfehler ist die Reduktion nicht anwendbar. DEV und TEST bleiben getrennt.
Diese internen Diagnosegrenzen bedeuten keine allgemeine Beta- oder Livefreigabe.

Genau ein vorregistrierter finaler Checkpoint wird nach DEV mit dem Status
`CANDIDATE_FROZEN_FOR_DIAGNOSTIC_TEST` gebunden. Er darf einmal diagnostisch
auf TEST geprüft werden, ohne vorzutäuschen, DEV habe eine Qualitätsgrenze
bestanden. Dataset, Bundle, beide Adapter und Auswahlpolicy bleiben gebunden;
TEST beeinflusst weder Auswahl noch Optimierung. Nach Verwendung ist dieser
TEST für weitere Iterationen verbraucht. Der allgemeine Katalogpfad behält
seine bisherigen strengeren Auswahlvoraussetzungen.

Eigene Nichtteilnahme, redundanter Kinderwagenkontext bei erhaltenem
Zugangswunsch und nicht abbildbare Ausstellungsgröße sind keine Korrekturziele.
Bekannte frühere 538 Fälle sind nur Regression, kein frischer Test. Das bisherige
heuristische Nachscoring liefert keine validierte Verständnisquote.

Alle Vorversuche bleiben Teil derselben kumulativen 50-USD-Grenze mit 5 USD
Abschlussreserve. Der Ausführungsbeleg muss die gesicherten, entfernten
Vorversuche und den aktuellen Bundlehash binden. Guthaben allein erhöht die
Grenze nicht. Kein zweiter Pod, keine Aufladung, keine automatische Aktivierung.
Native Mac-Prüfungen erfolgen isoliert unter dem bestehenden Speicherwächter;
bei autorisierter Livepause sichert ein unabhängiger Wächter die Wiederherstellung.

### Fortsetzung ohne erneutes Training

`--evaluate-only` bindet den gesicherten Endadapter, seine Konfiguration, den
ursprünglichen Trainingsbeleg und die vorregistrierte Checkpoint-Identität.
Beide DEV-Resume-Pakete erhalten sämtliche gespeicherten Erstantworten, auch
fehlgeschlagene. Der neue Orchestrierungsbundle ersetzt den ursprünglichen
Trainingsbeleg nicht. Daten, Lade-/Generierungsfingerprint, Tokenizer und Runtime
bleiben identisch. GPU-Training verweigert Evaluate-only bereits bei Admission.

Der Katalogcontroller verwendet REST v2 für Konto, Ressourcen und Löschung.
DELETE eigener gebundener IDs steht vor der Inventur. Controller und lokaler
Guard teilen ein flock-geschütztes Quota-/Cooldown-Ledger. Fehlende Header
löschen keine Einschränkung; jede weitere reguläre Anfrage einschließlich
Pagination prüft die 40-Anfragen-Cleanupreserve. Cleanup darf die Reserve nutzen,
aber keinen bekannten Retry-After umgehen. Der native Guard gleicht seine
Einschränkungen über das bestehende SSH alle 30 Sekunden konservativ mit dem
Controller ab (separater Worker: 15 Sekunden Pause, höchstens zweimal 15 Sekunden
SSH; native Sperre nach 60 Sekunden ohne Abgleich); acht weitere Anfragen bleiben für zwischenzeitliche Beobachtungen
reserviert.

Nach 90 Sekunden ohne Providerbeobachtung bleibt Modelladmission gesperrt.
Der native Guard beendet lokale Produktprozesse, markiert den Ausfall und wartet
mit DELETE auf einen bekannten Retry-After. Prozessstopp beendet keine
GPU-Abrechnung und beweist keine Ressourcenlöschung. Die gebundene Kostengrenze
wird nicht verlängert. Bei unerreichbarer Providerverwaltung ist sofortige
Löschung nicht garantiert; der Zustand bleibt offen, bis DELETE-/404- und
Inventurbelege vorliegen. Keine neue Allokation bei unbestätigter Bereinigung.

### Lokale Abruf- und Übertragungsdiagnose

Vor weiterem Training kann der bestehende Mac-Controller einen ausdrücklich
als `TRAIN_RECALL_AND_TRANSFER` / `RECALL_TRANSFER` markierten Diagnoseplan
ausführen. 20 tatsächlich trainierte Nachrichtenpaare werden unverändert ohne
Assistant-Ziel wiederverwendet. Je eine neue bedeutungsgleiche Formulierung und
ein gezielter Bedeutungskontrast ergeben 60 Eingaben je Adapter. Die vollständigen
neuen Eingaben dürfen nicht bereits in der gebundenen Trainingsdatei vorkommen;
dies beweist keine Themenneuheit. Systemprompt und Referenz bleiben je Tripel
unverändert. Bekannte Beispiele, Paraphrasen und Kontraste werden getrennt beurteilt.

Der Plan und die zieldatenfreien Requests sind separat gehasht; lokale native
Prefixbelege binden genau diese Requests. Alte Trainings-, DEV- und TEST-Belege
bleiben unverändert. Die 20 abhängigen Tripel sind kein neuer Holdout und keine
allgemeine Verständnisquote. Historische Assistant-Ziele sind überprüfbare
Trainingsevidenz, kein automatisch richtiges semantisches Gold. Feld-/ID- und
Mergefehler werden getrennt von materiellen Bedeutungsfehlern dokumentiert.

Der autorisierte lokale Vergleich verwendet nacheinander dieselbe gebundene
Mac-Basis und beide Adapter ausschließlich auf localhost:8089, mit 35 Minuten
Wartungsfenster und 7 Minuten Wiederherstellungsreserve. Watchdog, Speicherwächter
und Finally-Wiederherstellung bleiben aktiv. Die öffentliche Wiederherstellung
protokolliert jeden Probe-Status und wartet begrenzt auf den unverändert geforderten
401-Status. Keine Cloud-Allokation, kein Training, keine Candidate-Aktivierung.
Mac-Ergebnisse beweisen keine numerische HF-/MLX-Parität oder Ursache eines
früheren GPU-Lernfehlers. Ein unvollständiger Lauf bleibt ausdrücklich unvollständig.

Die lokalen HTTP-Diagnoseclients setzen den von der installierten MLX-VLM-API
unterstützten Top-Level-Schalter `enable_thinking: false` ausdrücklich. Die dort
ignorierte verschachtelte Option `chat_template_kwargs` ist keine Absicherung
gegen einen geänderten Serverdefault. Historische False-Prefixe bleiben eigene
Ausführungsbelege; die Korrektur begründet keinen nachträglichen Modell-Erfolgsnachweis.

### Paired HF runtime recall diagnostic (2026-11-26)

FAST_PR, offline tooling only. An explicit `--evaluate-only --paired-diagnostic`
mode reuses the existing cost/account/ownership/watchdog/removal controller.
It generates exactly seven frozen, previously failed TRAIN-recall inputs on
both secured HF adapters (14 first attempts). The packet remains
`RECALL_TRANSFER`: it is neither fresh holdout evidence nor a general accuracy
estimate. No optimizer invocation, DEV/TEST suite, model selection, production
activation, or Mac Live interruption is permitted. The original cumulative
USD50 campaign ceiling and USD5 closing reserve remain binding.

The evaluator records actual generation prefix token IDs and validates all 80
loaded adapter tensors against the uploaded safetensors plus effective rank,
alpha, scale, activation and merge state for all 40 LoRA modules. Observation
adds no changes to the existing NF4 loading or constrained greedy generation.
Historical Mac outputs and training-origin receipts remain immutable.

### Common-base compatibility pilot

FAST_PR, offline diagnostics only. An explicit common-base pilot exports the
represented values of the frozen MLX affine base into the HF text-model
layout. It performs no re-quantization. CPU reconstruction is checked against
MLX for every quantized matrix; expert gate/up ordering, convolution axes and
zero-centered norm offsets have separate conversion checks. Norm offsets stay
FP32 so their reconstructed scale remains exact.

GPU execution is separately hash-bound to the converter, runtime helper, source
files and exact locally produced shard hashes. All 693 effective base tensors
and all 80 translated LoRA tensors are verified before generation. The existing
paired controller retains the original cumulative USD50 ceiling, USD5 reserve,
prior-attempt accounting and independent cleanup guards. Only the explicit
pilot may select H200 for the 65-GiB dequantized text base.

The optional candidate feasibility check computes gradients for one already
known TRAIN example, with activation checkpointing and CPU activation offload.
It invokes no optimizer, performs zero updates and verifies all adapter bytes
unchanged afterward. Finite gradients and measured memory establish only the
bounded backward-path check; they are neither a full training run nor evidence
of semantic improvement. Known recall inputs remain labeled RECALL_TRANSFER.
