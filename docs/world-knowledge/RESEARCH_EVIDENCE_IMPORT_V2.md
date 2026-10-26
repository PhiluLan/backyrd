# Recherche mit belegter Übernahme v2

Die Admin-Pipeline bearbeitet den gesamten kanonischen Spot-Feldkatalog. Sie
ändert weder Decision-Regeln noch Community-Moods. Die Freigabe gilt für eine
vom Admin beauftragte Recherche, nicht für beliebige öffentliche Uploads.

## Verbindliche Entscheidung

- NONE oder MINOR: nach erneuter Quellen-, Identitäts-, Schema- und Kontextprüfung
  speichern; geringe sprachliche oder fachliche Restunsicherheit allein blockiert
  nicht. Mittag, Mittagsmenü, Business Lunch und Mittagessen sind gleichwertig.
- MAJOR: unverändert als Vorschlag mit konkretem Grund und Beleg zur Prüfung.
- Fehlender Beleg, unlesbare Quelle, nicht darstellbarer Kontext oder nicht
  bestätigte Zuordnung: Prüfung, niemals erfundene erfolgreiche Übernahme.
- Ohne Rechercheergebnis: offen lassen. Fehlend bedeutet weder Nein noch
  Ablehnung. Ein vollständig abgearbeiteter Auftrag darf bekannte Wissenslücken
  haben; diese allein halten ihn nicht in der offenen Auftragsliste.

`research.assessments` enthält je Claim den Schlüssel, NONE/MINOR/MAJOR, einen
konkreten fachlichen Grund und bei zusammengesetzten Profilen Belegbindungen.
Bindings beziehen JSON-Pfade auf den Index in `[source, ...supportingSources]`.
Die fachliche Einordnung ist ein protokolliertes Rechercheurteil, kein Beweis
oder automatischer Vertrauensscore. Software prüft sie zusätzlich gegen die
frisch gelesenen Originalquellen. Nicht implementierte Zuordnungen werden mit
konkretem technischen Grund zur Prüfung gehalten, nicht als Quellenwiderspruch
umgedeutet.

## Quellen und Kontext

Nur die serverseitig gelesene kanonische Website und deren beobachtete offizielle
Verlinkungen/Weiterleitungen werden verwendet. PDFs werden serverseitig als
Text gelesen, mit Grössen-, Seiten- und Zeitbegrenzung. Eine reine Bild-PDF oder
nicht eindeutig auslesbare grafische Zuordnung verlangt zusätzliche Prüfung.
AGB und Datenschutz werden nicht gelesen. Individuelle Menüpreise bleiben mit
Angebot, Preisbasis und Gültigkeit verbunden. Raumkapazitäten werden nicht
addiert oder aus einer Bestuhlungsvariante verallgemeinert. Fremdangebote und
Catering werden nicht als reguläres Angebot vor Ort ausgegeben. Gleichwertige
beobachtete Website-Weiterleitungen erzeugen keine Änderung oder Prüfschleife.

Eine eindeutige Adresssuche darf Koordinaten liefern; sie belegt einen
Gebäudepunkt, nicht automatisch den barrierefreien Eingang. Private Angaben
und ausdrücklich als unbekannt gesetzte Angaben bleiben geschützt. Bestehende
Angebotsprofile werden nicht still um bislang gespeicherte Einträge gekürzt.

## Speichern und Abschluss

Autorisierte Admin-Sitzung, Feature-Schalter, actor- und inputgebundenes Journal,
Lease, Beleg-Checkpoint vor dem Schreiben, bestehender transaktionaler Import,
Manifest-Abgleich, exakte `supersedesClaimId`, Projektion neu aufbauen und
Feldwerte zurücklesen. Erst dann lautet der Zustand gespeichert und bestätigt.
Unbestätigte Schreibversuche sind wiederaufnehmbar und werden nicht als Erfolg
ausgegeben. Ein erneuter identischer abgeschlossener Auftrag erzeugt keine
zweite Speicherung. Alte Kontakt-Recherchen ohne assessments bleiben unter v1
lesbar; ihre Regeln werden nicht rückwirkend erweitert.

Im Journal stehen Outcome, Softwaregrund, fachliche Erklärung, Restunsicherheit,
Quell-URL und Quellenhash. Originalzitate und Abrufzeiten bleiben im kanonischen
Claim erhalten. `reviewed: true` bei einem Angebotsprofil bedeutet hier die
explizit delegierte fachliche Admin-Übernahme nach diesen Prüfungen; es wird
keine persönliche Prüfung eines Menschen erfunden.

Bei mehreren Quellen bewahrt `sourceProofs` im Entscheidungsjournal für jede
frisch gelesene Primär- und Zusatzquelle URL, Rohdaten-Hash und Abrufzeit auf.
Eine Raumdokumentation bleibt auch mit einer schlichten Linkbeschriftung wie
„Räume“ eine beobachtete Quelle; ihre Auffindbarkeit hängt nicht vom
Themenklassifikator des Recherchemodells ab. Zahlen in Textdetails müssen
zusätzlich im gebundenen Beleg vorkommen. Bestuhlungsabhängige Plätze bleiben
am konkreten Raum, ohne eine allgemeine Gesamtkapazität daraus abzuleiten.
