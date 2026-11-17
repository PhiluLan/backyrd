# Ortsimporte aus Basel-Stadt

Unter **Admin → Spots → Ortsimporte** zeigt Backyrd den zuletzt erfolgreich
geprüften Stand des öffentlichen Basler Spielplatzverzeichnisses. «Jetzt
abrufen» fragt dieselbe Quelle sofort ab. Nach Anwenden der Migration ist die Quelle aktiv und der Abruf für montags
um 03:15 UTC eingestellt. Der Sammler verarbeitet die Antworten im
Zwei-Minuten-Takt. Der Job läuft in Supabase über pg_cron und pg_net.

Die Quelle ist der Datensatz [100462](https://data.bs.ch/explore/dataset/100462/)
der Stadtgärtnerei Basel-Stadt, lizenziert unter
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Der erste Abruf
braucht kein externes Konto. Der Job übernimmt Name, Koordinaten,
Öffnungszeiten im Wortlaut und die Ausstattung. Der Quelle fehlen
Strassenadressen, Telefon, E-Mail und Preise. Diese Felder bleiben offen.

## Quellen und Zeitplan einstellen

Unter **Ortsimporte → Open Data Basel-Stadt** schaltest du die Quelle ein
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
  Hinweis «Stadtgärtnerei Basel-Stadt, CC BY 4.0» bei der Veröffentlichung.
  Die Vorschau selbst schreibt weder
  in den öffentlichen Katalog noch ins Spot-Knowledge.
- Änderungen zeigen die früheren und die aktuellen Angaben der Quelle.
  Fehlende Datensätze werden erst nach einem vollständigen Abruf markiert
  und führen zu keiner Löschung oder Archivierung. Ein fehlgeschlagener
  oder unvollständiger Abruf lässt den letzten vollständigen Stand stehen.
- Der Abruf ist für diese erste Quelle auf 100 Zeilen begrenzt. Überschreitet
  die Quelle diese Grenze, meldet der Job einen unvollständigen Abruf. Vor
  einer Erhöhung müssen Abdeckung und Pagination geprüft werden.

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
