# Nuknuk: erster Test der Backyrd-Rechercheanleitung

Datum: 21. Oktober 2026 · Methode: `backyrd.research-method@1.0`
Implementierung: Commit `e67be589` auf `codex/nuknuk-research`.

**Ergebnis: fachlich nicht bestanden.** Der verbindliche Rechercheauftrag ist
implementiert. Er reicht allein noch nicht aus, um alle belegten Kernangaben
zuverlässig in das Ortsprofil zu übertragen.

## Durchführung

- Echter Lauf mit dem vorhandenen lokalen 27B-Modell, kein API-Fremdmodell.
- Ort: Restaurant zum Isaak, Basel; offizieller Einstieg:
  [Abendessen-Seite](https://zum-isaak.ch/abendessen/).
- Eine frisch abgerufene Seite, kein vollständiger Website-Crawl; synthetische
  Test-ID, keine Profilimporte oder kanonischen Schreibzugriffe.
- Acht angeforderte Felder: Name, Strasse, Telefon, Angebote/Bereiche,
  Öffnungszeiten, Küchenzeiten, Reservationsregel, stufenloser Eingang.
- Zehn fachliche Erwartungen vor dem Modelllauf gespeichert.
- Jede der drei vorgeschlagenen Aussagen und alle zehn Erwartungen danach gegen
  den erhaltenen Quelltext geprüft; diese Agentenbewertung ist keine unabhängige
  menschliche Qualitätsfreigabe.
- Laufzeit: **267,486 Sekunden (4 Minuten 27 Sekunden)**; sechs Modellaufrufe;
  keine Abruf- oder Modelltransportfehler. Limit: eine Seite, zwölf Modellaufrufe,
  fünfzehn Minuten; Linkverfolgung deaktiviert.
- Gezielter Wiederholungstest, kein Blindtest. Die Quelle hat denselben Hash wie
  im vorigen Lauf. Die abgefragten Felder wurden von vier auf acht erweitert;
  daraus lässt sich kein isolierter kausaler Promptvergleich ableiten.

## Fachliche Ergebnisse

| Vorher festgehaltene Erwartung | Ergebnis | Bewertung |
| --- | --- | --- |
| Abendessen als Besuchsangebot erkennen | Ein `DINNER`-Angebot, belegt durch den Abendservice | Gefunden |
| Vegetarische Optionen des Abendangebots erhalten | Keine entsprechende Eigenschaft oder Kandidat | Fehlt |
| Reguläre Ortsöffnung korrekt übernehmen | Montag bis Sonntag 11:30–22:30 | Gefunden |
| Beginn des Abendservices als eigene zeitliche Aussage erhalten | 18 Uhr nur im Quellenzitat des Angebots, keine eigene Zeitangabe oder Zeitkandidat | Fehlt; Beleg erhalten, Übertragung unvollständig |
| Veröffentlichte Strassenadresse übernehmen | Kein brauchbarer Vorschlag | Fehlt |
| Veröffentlichte Telefonnummer übernehmen | Korrekt normalisiert | Gefunden |
| Ohne Raumbeleg keine Bereiche erfinden | Keine Bereiche erzeugt | Berechtigte Zurückhaltung für diese Seite |
| Reservationslink nicht als Pflicht auslegen | Keine Reservationspflicht behauptet | Berechtigte Zurückhaltung |
| Keine unbelegte Zugänglichkeit behaupten | Keine positive/negative Zugänglichkeitsangabe erzeugt | Berechtigte Zurückhaltung |
| Kein Mahlzeitbudget aus Einzelgerichten berechnen | Kein solches Budget erzeugt | Berechtigte Zurückhaltung |

Drei positive Erwartungen erfüllt, drei verfehlt, vier korrekte Enthaltungen.
Drei ausgegebene Aussagen sind im geprüften Umfang belegt; keine falsche
Zuordnung dieser drei Aussagen gefunden. Daraus folgt ausdrücklich keine
allgemeine Genauigkeitsquote und keine bestandene Ortsrecherche.

Zusätzlich auffällig: Der angeforderte Name bleibt ebenfalls ungelöst. Er war
nicht Teil der zehn vorab definierten Prüfungen und wird deshalb nicht
nachträglich in deren Kennzahl aufgenommen.

## Nachgewiesene Ursachen und offene Fragen

1. **Falsche Priorität bei Eigenschaften:** Alle acht erzeugten
   Eigenschaftskandidaten betreffen einzelne Gerichte. Vegetarische Optionen und
   praktische Besuchsangaben wurden nicht extrahiert. Die Gerichte wurden wegen
   unzureichend zugeordnetem Kontext zurückgehalten; sie wurden nicht als neue
   Besuchsangebote gespeichert. Die Anleitung allein steuert die Auswahl nicht
   zuverlässig genug.
2. **Fehlerhafte Feldrepräsentation:** Allgemeine Feldkandidaten enthalten
   wiederholte Namen bzw. den Ortsnamen statt der Strasse, falsche Belegblöcke und
   nicht korrekt JSON-kodierte Textwerte. Die Validierung hält sie zurück. Sie
   schützt vor falschen Vorschlägen, stellt aber fehlende Informationen nicht her.
3. **Unvollständige Zeitrepräsentation:** Der offene Servicebeginn ist im Zitat
   vorhanden, wird aber nicht als eigene scoped Zeitinformation weitergegeben.
   Der vorhandene Wochenplan erwartet Anfang und Ende. Eine Endzeit zu erfinden
   wäre falsch; die verlustfreie Abbildung bleibt eine gesonderte Aufgabe.
4. **Keine Vollständigkeitsbewertung:** Der technische Endgrund
   `FRONTIER_EXHAUSTED` bedeutet nur, dass die erlaubte Quellenliste abgearbeitet
   ist. Er bedeutet keine vollständige Recherche. Der Bericht setzt weiterhin
   `complete:false`, `readinessCertified:false` und Dimensionen `NOT_ASSESSED`.

## Technische Prüfung und Grenzen

- 491 automatisierte Runtime-Tests bestanden, inklusive Katalogbindung und
  tatsächlicher Übergabe der Methode an die lokalen Extraktions-/Prüfphasen.
- TypeScript-Prüfung und `git diff --check` bestanden.
- Die neue Anleitung ist im Rechercheplan und Bericht versioniert.
- Kein Produktionsrelease, keine Datenbankänderung, kein Decision-Eingriff.
- Der Fehler wird nicht durch weitere Promptversuche in diesem Test verdeckt.

Die nächsten Umsetzungspakete bleiben die zuvor geplante Referenzsuite sowie
getrennte Aussagenextraktion und Feldzuordnung. Besonders die Auswahl praktischer
Angaben, Textwert-Ausgabe und offene Servicezeiten müssen gezielt geprüft werden.
Eine automatische Spot-Pflege bleibt nicht freigegeben.

## Nachvollziehbarkeit

Lokales Laufverzeichnis (ignorierte Forschungsartefakte):
`.local/nuknuk-research/method-v1-2026-10-21T18-49-42-726Z/`.
Darin: Originalquelle, vorab gespeicherte Referenz, vollständiger Laufbericht,
Einzelbewertung und hashgebundener Audit. Keine Rohtraces oder Webseitenkopien
werden in Git aufgenommen.

Quellhash:
`ff644e4343e7b4f1dcb7aebc70af8930465a2f886b802d87c00c4f39ef8a24d6`.
Der Audit bestätigt die vor dem Lauf angelegte Referenz. Wiederverwendung dieses
Falls ist Entwicklungsprüfung und darf nicht als neuer Blindtest bezeichnet werden.
