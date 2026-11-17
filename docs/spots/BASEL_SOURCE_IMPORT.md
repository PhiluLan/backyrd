# Ortsimporte aus Basel-Stadt

Unter **Admin → Spots → Ortsimporte** zeigt Backyrd den zuletzt erfolgreich
geprüften Stand des öffentlichen Basler Spielplatzverzeichnisses. «Jetzt
abrufen» fragt dieselbe Quelle sofort ab. Nach Anwenden der Migration läuft
der Abruf montags um 03:15 UTC. Der Sammler verarbeitet die Antworten im
Zwei-Minuten-Takt. Der Job läuft in Supabase über pg_cron und pg_net.

Die Quelle ist der Datensatz [100462](https://data.bs.ch/explore/dataset/100462/)
der Stadtgärtnerei Basel-Stadt, lizenziert unter
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Der erste Abruf
braucht kein externes Konto. Der Job übernimmt Name, Koordinaten,
Öffnungszeiten im Wortlaut und die Ausstattung. Der Quelle fehlen
Strassenadressen, Telefon, E-Mail und Preise. Diese Felder bleiben offen.

## Prüfen und übernehmen

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
Minuten in der Vorschau geprüft werden. Die wöchentliche Abfrage beginnt
nach Installation der Migration. Zur Fehlerdiagnose dienen die letzten
Abrufe im Admin und die beiden gleichnamigen Cron-Jobs im Supabase Dashboard.

Die SQL-Prüfung läuft in einer Transaktion gegen eine isolierte
Supabase-Instanz und rollt alle Testzeilen zurück.

```sh
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/basel_spot_source_import_v1.sql
```
