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

## Overture · Gastro und Nachtleben

Der Export liest einen bestimmten Overture-Monatsstand, beschränkt die
Ergebnisse auf die amtliche Gemeinde Basel und bereitet Restaurants, Cafés,
Bars und Clubs auf. Er übernimmt benannte Orte mit einem Existenzwert ab
0,6. Als geschlossen markierte Orte werden ausgelassen. Werte für
Öffnungszeiten, Preise, Atmosphäre und Veranstaltungsprogramm kommen aus
anderen belegten Quellen. Die GERS-ID und die verfügbaren Quellen- und
Lizenzangaben bleiben pro Eintrag erhalten.

Export in einer separaten Python-Umgebung erstellen:

```sh
python3 -m venv /tmp/backyrd-overture
/tmp/backyrd-overture/bin/pip install overturemaps==2.1.1
PATH="/tmp/backyrd-overture/bin:$PATH" python3 scripts/spot-intelligence/export-basel-overture.py \
  --release 2026-10-21.0 --output /tmp/basel-overture-2026-10-21.0.json
```

Unter **Admin → Spots → Ortsimporte → Overture · Gastro & Nachtleben** die
erzeugte JSON-Datei bei **Overture-Stand importieren** auswählen. Der Stand
wird gemeinsam geprüft und transaktional vorgemerkt. Die Liste zeigt bis zu
50 Einträge pro Seite. Filter beziehen sich auf die angezeigte Seite.
Identische Wiederholungen bleiben ohne Änderungen. Beim Upload älterer,
abweichender gleichversionierter oder auffallend kurzer Folgestände bleibt der
vorherige Stand erhalten. Neue Vorschläge können direkt in der Liste als freigegebene Spots übernommen werden.

Overture veröffentlicht GeoParquet. Der Monatsstand wird für diese
Anbindung manuell erzeugt und eingespielt. Die Abrufzeiten der kantonalen
JSON-Feeds werden separat eingestellt. Die Existenzwahrscheinlichkeit und
die Anbieter-Kategorie sind Hinweise für die Admin-Prüfung.

Der Bibliothekar begrenzt die Kohorte auf 1’000 freigegebene Orte mit
geeigneter Projektion pro Suche. Für Basel umfasst die Suchregion auch
Nachbargemeinden. Die Prüfliste kann auch darüber hinaus Daten aufnehmen.
Vor dem Ausbau einer einzelnen Suchregion über diese Grenze braucht es eine
Vorauswahl, die Suche und Ranking bei grösseren Katalogen erhält.

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

«Offen» zeigt neue, geänderte und unklare Vorschläge. Ein Klick auf den
Eintrag zeigt seine Grunddaten und die Quelle. «On hold» verschiebt ihn
nach «Zum Prüfen», wo er bearbeitet oder nach «Offen» zurückgeholt werden
kann. Bisher als geprüft markierte Vorschläge bleiben dort auffindbar.
Ändern sich Angaben oder mögliche Zuordnungen, erscheint ein
zurückgestellter Vorschlag erneut unter «Offen».

- «Spot anlegen» speichert einen neuen, eindeutigen Vorschlag direkt als
  freigegebenen Spot. Name, vorhandene Adresse, Ort, Koordinaten, Kategorie,
  Website und Telefon werden aus der gespeicherten Quelle übernommen.
  Wenn keine eindeutige Kategorie zugeordnet ist, wählt der Admin sie im
  aufgeklappten Eintrag. Öffnungszeiten als Freitext und Ausstattung bleiben
  als Quellenangaben erhalten. Der Import interpretiert sie nicht als
  bestätigte strukturierte Spot-Knowledge-Angaben.
- Der verwendete Quellenstand und der neue Spot werden gemeinsam
  gespeichert. Wiederholungen geben denselben Spot zurück. Der Link bleibt
  unter «Angelegt» verfügbar. Die öffentlichen Spot-Details zeigen die
  Herkunft der übernommenen Grundangaben und die Lizenz.
- Ein eindeutiger Name innerhalb von 150 Metern ohne weiteren Kandidaten
  wird einem vorhandenen Spot zugeordnet. Andere Namens- oder Nähetreffer
  (bis 45 Meter) werden zur Prüfung angezeigt. Archivierte Kandidaten
  zählen mit. Bestehende Spots lassen sich über die Links bearbeiten.
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
  -f supabase/tests/basel_spot_source_import_v1.sql \
  -f supabase/tests/basel_place_source_create_spot_v1.sql
```

## Backyrd Crawler

**Admin → Backyrd Crawler** startet eine aktive Websuche nach Restaurants,
Cafés, Bars und Clubs im Pilotgebiet Basel. Suchgebiete gewichten die
Suchanfragen. Alle Funde brauchen eine Basler Adresse und Koordinaten.
Die Einstellung 10 bis 50 begrenzt neue Funde pro Lauf. Die effektive
Anzahl hängt von Quellen, Suchbudget und Dubletten ab.

Brave liefert URLs. Der Crawler prüft die Regeln der Betreiberseite in
`robots.txt` und liest die Fakten auf der Seite selbst. Er übernimmt
Name, Typ und Adresse aus den Ortsdaten der Seite. Bei klarer Identität
kann er eine einzelne sichtbare Postadresse ergänzen. Fehlen Koordinaten,
muss die Adresse exakt im amtlichen Gebäudeadressverzeichnis gefunden
werden. Telefon, E-Mail, Öffnungszeiten und Preisangaben werden in der
Vorschau angezeigt, soweit strukturiert vorhanden. Fotos, Such-Snippets
und Beschreibungen werden nicht übernommen.

Funde laufen durch den bestehenden Dublettenabgleich. «Freigeben und
recherchieren» legt den Spot als freigegeben an und reiht die Recherche in
«Aufgaben & Recherche» ein. Treffer am gleichen Standort können nach
ausdrücklicher Bestätigung als eigenständiger Spot übernommen werden.
Namensgleiche Treffer bleiben gesperrt. «Ablehnen» speichert die
Entscheidung und kann über «Wieder öffnen» rückgängig gemacht werden.
Bei einer fehlgeschlagenen Übergabe bleibt der freigegebene Spot sichtbar
und die Recherche kann am selben Eintrag erneut gestartet werden.
Öffnungszeiten und Preise aus der Crawler-Vorschau brauchen die
bestehende Prüfung, bevor sie zu bestätigten Spot-Knowledge-Fakten werden.
Bestehende Spots werden durch die Suche
nicht überschrieben. Kontinuierliche Änderungserkennung und
Veranstaltungsimporte benötigen eigene Quellen- und Abgleichregeln.

### Betrieb

1. Die Migration über den kanonischen Supabase-Release und das Admin
   über seinen regulären Deployment-Weg bereitstellen.
2. Im serverseitigen Admin-Deployment `BRAVE_SEARCH_API_KEY` setzen.
   Die Startschaltfläche bleibt deaktiviert, solange der Schlüssel fehlt.
3. Für geplante Läufe im Admin-Deployment `CRON_SECRET` setzen und
   denselben Wert über die reguläre Vault-Oberfläche unter
   `backyrd_spot_crawler_cron_secret` hinterlegen. Mindestens 32 Zeichen
   verwenden. Supabase prüft den Plan alle 15 Minuten. Die Uhrzeit
   richtet sich nach Europa/Zürich. Die Einstellung «Manuell» startet
   keinen geplanten Auftrag.
4. Im Admin eine manuelle Suche starten und nach dem Abschluss
   Fundliste, Quellen und Spot-Handoff kontrollieren. Bei 0 Funden
   Suchgebiet oder Kategorie ändern.

Der Standardrahmen reserviert USD 0,005 je geplanter Brave-Abfrage und
sperrt weitere Läufe am Monatslimit von USD 10. Auch fehlgeschlagene
Aufträge behalten ihre Reservierung. Für einen Pilotlauf mit zwölf
Abfragen sind das höchstens USD 0,06 nach diesem Rechenmodell.
[Brave-Preise](https://brave.com/search/api/). Der Betrag betrifft
Websuchabfragen. Das Budget der optionalen späteren Spot-Recherche
läuft über den bereits bestehenden Recherchebetrieb.
