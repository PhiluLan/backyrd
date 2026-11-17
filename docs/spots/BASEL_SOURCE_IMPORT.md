# Ortsimporte aus Basel-Stadt

Unter **Admin → Spots → Ortsimporte** zeigt Backyrd den zuletzt erfolgreich
geprüften Stand der ausgewählten Basler Quelle. «Jetzt abrufen» fragt die
ausgewählte Quelle sofort ab. Bei der Einrichtung sind die Quellen aktiv
und der Abruf steht auf montags um 03:15 UTC. Der Sammler verarbeitet die Antworten im
Zwei-Minuten-Takt. Der Job läuft in Supabase über pg_cron und pg_net.

## Angebundene Quellen

Alle drei Feeds kommen von Open Data Basel-Stadt und stehen unter
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Der Import
legt Vorschläge in der Admin-Arbeitsliste an. Der lokale Test mit
Originaldaten ergab diese Rohzahlen vor dem Abgleich mit Backyrd.

| Quelle | Abdeckung | Kandidaten beim Abruf |
| --- | --- | ---: |
| [Spielplätze](https://data.bs.ch/explore/dataset/100462/) | Spielplätze mit Koordinaten, Öffnungszeiten und Ausstattung | 67 |
| [Basel Info Points of Interest](https://data.bs.ch/explore/dataset/100015/) | Museen und Ausstellungen, Veranstaltungsorte, Hotels, Hostels, Sehenswürdigkeiten, Aussichtspunkte und Picknickplätze | 159 |
| [Sport- und Bewegungsanlagen](https://data.bs.ch/explore/dataset/100151/) | Sporthallen, Schwimmbäder, Eisbahnen, Skateanlagen, Sportplätze und weitere ausgewählte Sportanlagen | 166 |

Die zwei neuen Feeds sind auf Basel, Riehen und Bettingen begrenzt. Sie
liefern, wo vorhanden, zusätzlich Strassenadresse, Ort, Website und
öffentliches Telefon. E-Mail, Eintrittspreise oder Öffnungszeiten werden
nur gezeigt, wenn die Quelle diese Felder liefert. Die Quellengruppe für
Theater, Konzerte und Vorträge wird als Veranstaltungsort vorgeschlagen.
Sie ist keine Bestätigung eines konkreten Programms.

## Quellen für die übrige Abdeckung

| Backyrd-Bereich | Quelle und Aufgabe |
| --- | --- |
| Essen, Bars, Cafés, Nachtleben | [Overture Places](https://docs.overturemaps.org/guides/places/) für flächige Kandidatensuche, danach Betreiber-Websites für Angebot, Betriebsstatus, Küche, Preise, Öffnungszeiten und Tanzangebot. [Guidle Restaurants](https://www.stnet.ch/de/marketing/digital-marketing/daten-export/restaurants/) ist ein zusätzlicher Vertragsfeed. |
| Shopping und Märkte, Wellness, Coworking und Gemeinschaft | Overture Places als Kandidatenquelle, offizielle Webseiten und direkte Owner-Angaben zur Bestätigung. Temporäre Marktstände und Pop-ups benötigen einen belegten Zeitraum. |
| Kultur, Unterhaltung, Unterkunft und Veranstaltungsorte | Basel Info für die erste Abdeckung, Overture für Lücken. Das Programm kommt vom Betreiber oder einem freigegebenen Eventfeed. |
| Aktivitäten, Sport, Natur und Sehenswürdigkeiten | Die drei kantonalen Feeds liefern eine erste Abdeckung. Overture kann gewerbliche Freizeitangebote und weitere Ziele ergänzen. Für Wege, Parks und Flächen sind eigene amtliche Geodaten sinnvoll. |
| Specials und andere temporäre Orte | Offizielle Betreiberprogramme und der bestehende Event-Import für terminierte Angebote. Neue Veranstaltungsfeeds werden erst nach Prüfung der Nutzungsrechte aktiviert. |
| Sonstiges | Kategorisiert geprüfte Ergänzungen über Betreiber und Admin, passend zur Backyrd-Entdeckung. |

Overture ist als nächste breite Quelle identifiziert. Die technische
Anbindung steht noch aus. Seine monatlichen GeoParquet-Veröffentlichungen
benötigen einen regionalen Export und eine Zuordnung der Kategorien.
Primärschlüssel und Quelle sollen aus den Overture-Daten erhalten bleiben.
Der Import braucht eine Kategorie- und Lizenzprüfung sowie einen
Abdeckungsreport gegen den Backyrd-Katalog.

## Quellen und Zeitplan einstellen

Unter **Ortsimporte** wählst du zuerst eine Quelle, schaltest sie ein
oder aus und wählst **Täglich**, **Wöchentlich (Montag)** oder **Nur manuell**.
Automatische Abrufe starten um 03:15 UTC. Wenn du die Quelle ausschaltest,
startet auch «Jetzt abrufen» keinen neuen Lauf. Ein bereits begonnener
Abruf wird zu Ende verarbeitet. Vorschläge und Prüfstatus bleiben
weiterhin sichtbar. Beim erneuten Einschalten gilt der gespeicherte Takt.

Eine neue Anbindung braucht einen stabilen Quellenschlüssel, einen festen
API-Endpunkt, eine dokumentierte Lizenz und eine Zuordnung der gelieferten
Felder zu Backyrd. Die Anbindung und Tests gehören in den Code und die
Datenbankmigration. Im Admin stellen wir die vorhandenen Anbindungen zur
Auswahl. Ein beliebiger Link wird durch die Einstellungen nicht zu einer
neuen Importquelle.

## Prüfen und übernehmen

«Offen» zeigt neue, geänderte und unklare Vorschläge. Ohne Änderung
eindeutig zugeordnete Spots stehen unter «Alle». «Als geprüft markieren»
und «Ausblenden» entfernen den aktuellen Vorschlag aus «Offen». Die
Status bleiben beim nächsten Abruf und auch für andere Admins erhalten.
Ändern sich die Angaben oder die möglichen Zuordnungen, erscheint der
Vorschlag erneut. Mit «In die Arbeitsliste» lässt er sich jederzeit
zurückholen.


- Ein eindeutiger Name innerhalb von 150 Metern ohne weiteren Kandidaten
  wird einem vorhandenen Spot zugeordnet. Andere Namens- oder Nähetreffer
  (bis 45 Meter) werden zur Prüfung angezeigt. Archivierte Kandidaten zählen
  mit, damit dieselben Orte nicht versehentlich neu angelegt werden.
- Ein neuer Vorschlag lässt sich im bestehenden Spot-Editor öffnen. Name,
  Koordinaten und eine eindeutig zuordenbare Kategorie sind vorausgefüllt.
  Vor dem Publizieren bestätigt ein Admin die Angaben im vorhandenen
  Spot- und Spot-Knowledge-Workflow und übernimmt den Quellenlink mit dem
  Hinweis der jeweiligen Quellenangabe und «CC BY 4.0» bei der Veröffentlichung.
  Die Vorschau selbst schreibt weder
  in den öffentlichen Katalog noch ins Spot-Knowledge.
- Änderungen zeigen die früheren und die aktuellen Angaben der Quelle.
  Fehlende Datensätze werden erst nach einem vollständigen Abruf markiert
  und führen zu keiner Löschung oder Archivierung. Ein fehlgeschlagener
  oder unvollständiger Abruf lässt den letzten vollständigen Stand stehen.
- Das Spielplatzverzeichnis ist auf 100 Zeilen begrenzt. Die beiden anderen
  Feeds nutzen einen gefilterten Export mit maximal je 500 Zeilen.
  Basel Info liefert keine Orts-ID. Die abgeleitete Identität kann sich
  bei Umbenennungen, Adressänderungen oder Koordinatenänderungen an
  Picknickplätzen ändern. Solche Einträge werden erneut zur Prüfung
  angezeigt. Automatische Löschungen gibt es keine.

## Inbetriebnahme und Prüfung

Die Migration gehört durch den üblichen Supabase-Releasepfad. Danach ist
der Admin auf derselben Version zu veröffentlichen. Durch «Jetzt abrufen»
kann der erste Lauf sofort ausgelöst und sein Ergebnis binnen weniger
Minuten in der Vorschau geprüft werden. Der eingestellte Zeitplan greift nach Installation der Migration. Zur Fehlerdiagnose dienen die letzten
Abrufe im Admin und die beiden gleichnamigen Cron-Jobs im Supabase Dashboard.

Die SQL-Prüfung läuft in einer Transaktion gegen eine isolierte
Supabase-Instanz und rollt alle Testzeilen zurück.

```sh
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/basel_spot_source_import_v1.sql
```
