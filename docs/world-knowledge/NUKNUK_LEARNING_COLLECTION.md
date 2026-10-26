# Nuknuk-Lernsammlung: verbindlicher Qualitätsstandard

Stand: 21. Oktober 2026. Version des Intake-Vertrags:
`backyrd.nuknuk-learning-intake@1.0`.

**Status: Eingangsprüfung implementiert. Kein Trainingsbestand freigegeben,
kein Trainingsexport und kein Training aktiviert.** Es wurden keine alten
Rechercheläufe automatisch übernommen. Vollständige fachliche Korrektheit wird
nicht durch Softwaretests oder Modell-Selbstbewertung behauptet.

## Zweck und Grenzen

Die Sammlung soll Nuknuk die Backyrd-Methode und richtige Aufgabenbearbeitung
vermitteln, nicht veränderliche Ortsdaten auswendig lernen lassen. Sie unterstützt
nur geprüfte Lernziele. Automatisches Lernen aus Eigenantworten ist ausgeschlossen.
Gute Einzelteile eines fehlerhaften Laufs können nach gesonderter Prüfung als
kleine Beispiele dienen; ein teilweise richtiger Lauf ist kein positives Ganzes.

Die fachliche Grundlage ist [NUKNUK_RESEARCH_METHOD.md](NUKNUK_RESEARCH_METHOD.md).
Die Eingangsprüfung liegt in
`packages/spot-research-runtime/src/nuknuk-learning-intake.ts`.
Sie prüft Herkunftsbindung und strukturelle Integrität. Sie beweist weder die
Wahrheit einer Aussage noch die Identität eines angegebenen Prüfers.

## Lebenszyklus

1. **Quarantäne:** Originalquelle und ursprünglichen Fehlerlauf getrennt erfassen.
   Quellenidentität, konkreten Standort und Abrufumfang überprüfen. Kein Export.
2. **Kuratieren:** Kleine Aufgabe und richtige Zielantwort erstellen. Originale
   Modellantwort bleibt als Fehlerbeleg getrennt, nie implizite Lernantwort.
3. **Belegen:** Jede positive Zielaussage erhält Beleg, Scope, Subjekt und Bedingungen.
   Jede Enthaltung nennt die tatsächlich geprüften Quellen und ihren begrenzten
   Aussageumfang. Keine unbelegte Negation und keine erfundene Vollständigkeit.
4. **Fachlich prüfen:** Korrektheit, Relevanz, Vollständigkeit der gestellten Aufgabe,
   Feld-/Scopezuordnung, Zeiten, Preise, Ausnahmen und richtige Enthaltungen prüfen.
   Eine zweite Antwort desselben Modells ist keine unabhängige Freigabe.
5. **Datennutzung prüfen:** Private/kundenbezogene Daten ausschliessen, sensible
   Informationen minimieren, zulässige Quellennutzung und Speicherung prüfen.
   Öffentlich abrufbar bedeutet nicht automatisch zum Training freigegeben.
6. **Version einfrieren:** Aufgabe, Methode, Katalog, Quelle und korrigiertes Ziel
   gemeinsam versionieren. Jede Änderung macht die frühere Freigabe unbrauchbar.
7. **Veröffentlichten Datensatz prüfen:** Erst ein gesonderter, geschützter
   Freigabeprozess darf einen konkreten Datensatz für ein Training zulassen.
   Dieser Prozess und das aufgabenspezifische Zielvalidieren fehlen noch;
   deshalb bleibt der Export technisch gesperrt.
8. **Nachverfolgen:** Später pro Adapterversion Modellrevision, Datensatzmanifest,
   Trainingskonfiguration und Tests festhalten. Zurückgezogene Beispiele aus
   künftigen Datensätzen entfernen und betroffene Adapter identifizieren.

Eine Freigabe in einer editierbaren JSON-Datei ist keine Authentifizierung.
Reviewer-IDs in den Intake-Daten sind Metadaten, keine wirksamen Rechte. Vor jedem
späteren Export müssen geschützte Freigaben an exakt diesen Inhalt gebunden sein.
Keine Beispielantwort oder Prüferidentität wird von einem Agenten erfunden, um
ein notwendiges menschliches Review zu ersetzen.

## Mindestinhalt eines Kandidaten

- Eindeutige Kandidaten-ID und kuratierte Ortsgruppe, inklusive erkannter Aliasnamen.
- Aufgaben-, Methoden- und Katalogversion sowie eingefrorene Datengruppenzuordnung.
- Öffentliche Quelladresse ohne Zugangsdaten/Parameter, Originaltext, Abrufzeit,
  SHA-256-Prüfsumme. Kein Neufetch während eines eingefrorenen Vergleichs.
- Aufgabeninput und korrigierte Zielantwort; keine unbearbeitete Eigenantwort
  allein deshalb, weil sie plausibel wirkt oder bereits in einem Profil steht.
- Einzelne erwartete Aussagen mit Subjekt, Scope, Bedingungen, exaktem Beleg und
  Zeichenposition; Enthaltungen mit geprüften Quellen und Begründung.
- Inhaltsgebundene fachliche und Datennutzungs-Prüfmetadaten mit Ergebnis und Notiz.

Die korrigierte Zielantwort ist im Intake noch Text. Ihre aufgabenspezifische
Semantik und ihr Format sind damit **nicht** validiert. Ein nachgelagerter Validator
muss den endgültigen Aufgabenvertrag sowie jede darin enthaltene Behauptung
prüfen; die jetzige technische Sperre darf dabei nicht einfach entfernt werden.

## Training, Validierung und unangetasteter Test

Die Ortsgruppen werden vorab in einem separaten Plan zugeordnet und dessen Hash
festgehalten. Ein Ort und seine Aliasnamen dürfen nicht über verschiedene Splits
verteilt werden. Gleiche Quelldateien oder identische Aufgabeninputs dürfen keine
Splitgrenze überqueren. Der Intake erkennt diese exakten Überschneidungen.

Ähnliche Textkopien, unbekannte Aliasnamen und semantisch verwandte Dokumente
werden dadurch nicht vollständig erkannt. Sie brauchen zusätzlich eine
Dublettensuche und die Prüfung der Ortsgruppen. Dieser weitere Schritt fehlt noch
und bleibt vor einer Trainingsfreigabe verpflichtend.

- **TRAIN:** freigegebene Lernbeispiele.
- **VALIDATION:** Entwicklung von Training/Adapterkonfiguration, keine Zielantworten
  in den Trainingsbestand übernehmen.
- **TEST:** unangetastete Qualitätsprüfung. Sobald anhand dieser Fälle verbessert
  oder korrigiert wurde, sind sie Entwicklungswissen und nicht mehr blind.

Der bekannte Isaak-Fall ist Entwicklungswissen. Er darf nicht als unabhängiger
Abschlusstest verkauft werden. Ein leerer Bestand oder viele gleiche Restaurants
sind kein fachlich ausgewogener Datensatz. Erforderlich sind verschiedene
Ortstypen, Quellformate, korrekte positive/negative Belege, Bedingungen,
Widersprüche und berechtigte Enthaltungen; künstlich vervielfachte Fälle zählen
nicht als zusätzliche unabhängige Erfahrung.

## Was die Technik jetzt blockiert

Die lesende Eingangsprüfung verwirft insbesondere:

- veränderte Quellen oder korrigierte Ziele ohne neue Inhaltsbindung;
- veraltete Reviews nach einer Inhaltsänderung;
- positive Aussagen ohne exakt auffindbaren Beleg;
- Enthaltungen ohne benannte geprüfte Quelle;
- leere Referenzen, doppelte IDs und unerwartete Metadaten;
- nicht zum eingefrorenen Plan passende Orts-/Splitzuordnung;
- identische Quelltexte oder Aufgabeninputs über Splitgrenzen;
- Quelladressen mit Zugangsdaten, URL-Parametern oder ohne HTTPS;
- Reviews vor dem Quellenabruf und doppelte Prüfkategorien.

Fehlende/ablehnende Reviews werden als Blocker ausgewiesen. Auch vollständig
konsistente Metadaten ergeben immer `readyForTraining:false` und
`trainingExportEnabled:false`. Die Prüfung lädt keine Modelle, ruft keine Quellen
ab, schreibt keine Spotdaten und erstellt keine Trainingsdatei.

Ein wortwörtlicher Beleg kann die behauptete Aussage trotzdem nicht tragen.
Genau dafür bleibt die fachliche Prüfung notwendig. Ebenso kann ein korrektes
Einzelbeispiel unvollständig zur gestellten Aufgabe sein. Keine uneingeschränkte
Datenschutz-, Nutzungsrechts- oder Qualitätsgarantie wird aus Hashes abgeleitet.

## Speicherung und Änderungen

Rohquellen, personenbezogene Review-Metadaten und echte Lernkandidaten bleiben
in einem zugriffsbeschränkten lokalen Arbeitsbereich, nicht im Git-Repository,
öffentlichen Reports oder Konsolenlogs. Git enthält Vertrag, Software, Dokumentation
und eindeutig synthetische Tests. Aufbewahrung und Löschung sind vor einer
Sammlung mit echten Daten festzulegen; notwendige Löschungen werden nicht durch
einen Anspruch auf ewige Beispielspeicherung verhindert.

Es existiert noch kein authentifizierter Review-/Exportdienst. Dieser Standard
beschreibt seine verpflichtenden Eigenschaften, ersetzt ihn aber nicht.
Der nächste begrenzte Schritt ist die Umsetzung dieses Review-Prozesses und der
aufgabenspezifischen Zielprüfung; erst danach können echte Kandidaten zu einem
freigegebenen Trainingsdatensatz werden.


## Erster fachlich bestätigter Entwicklungsfall

Die 16 bereinigten Antworten des Volta-Bräu-Laufs wurden im Chat fachlich vom
Nutzer bestätigt. Ein separater lokaler Beleg bindet die tatsächliche Nachricht,
den SHA-256 des unveränderten kuratierten Dokuments und die Hashes der 16
Antworten. Der ursprüngliche Entwurf mit ausstehendem Review und der originale
Modelllauf bleiben historische Momentaufnahmen; der separate Beleg dokumentiert
die nachfolgende fachliche Bestätigung. Nutzerrolle wird nicht zu einer
verifizierten Betreiberidentität erweitert.

Dieser Beleg ist keine neue Authentifizierungs- oder Trainingsschnittstelle.
Quellennutzung/Datenschutz, aufgabenspezifische Zielvalidierung, unabhängige
Testfälle und geschützter Export bleiben ausstehend. Keine Lernkandidaten wurden
allein aufgrund dieser Bestätigung als exportierbarer Datensatz übernommen.
Echte Quellen und Freigaben bleiben im eingeschränkten lokalen Arbeitsbereich,
nicht in Git. Volta Bräu bleibt Entwicklungswissen, kein blinder Testfall.
