# Paket 4: WeatherKit-Grundlage

Stand: 7. November 2026. Implementiert zur Prüfung, noch nicht veröffentlicht.
Der ausdrücklich freigegebene WeatherKit-Schlüssel und die Service-ID sind
angelegt; die fünf Konfigurationswerte liegen als Supabase-Server-Secrets vor.
Der echte Abruf für Basel aktuell und 24 Stunden später bestand am
6. November um 23:48 UTC (7. November, 00:48 Schweizer Zeit): Wetter und
Attribution HTTP 200, beide Ergebnisse validiert, zweiter Abruf aus dem Cache.
Der von Apple gelieferte offizielle Quellenpfad auf developer.apple.com wird
gezielt akzeptiert. Beliebige andere Entwicklerseiten bleiben ausgeschlossen.
Die Geräteabnahme ist weiterhin offen.

## Umfang und Grundeinstellungen

- Ein serverseitiger WeatherKit-REST-Zugang für Mobile und Web; kein privater
  Apple-Schlüssel im Client. Auch Android kann denselben Zugang verwenden.
- Wetter für das Stadtzentrum des ausgewählten, unterstützten Ortes. Keine
  Weitergabe der genauen Nutzerposition oder der Konto-ID an Apple.
- Deutsch, Celsius, Wind in km/h, Zeitzone Europe/Zurich. Aktuelles Wetter und
  stündliche Vorhersage für maximal sieben Tage. Die erste Oberfläche zeigt das
  aktuelle Wetter; ein Datum kann bereits im Serververtrag übergeben werden.
- Temporärer Arbeitsspeicher-Cache höchstens zehn Minuten, niemals länger als
  Apples Gültigkeit. Kein Aufbau einer dauerhaften Wetterdatenbank.
- Apple Weather mit Original-Logo und Quellenlink; Abrufzeit sichtbar.
- Aktualisierung bei erneutem Öffnen und Rückkehr in die App sowie nach Ablauf.
  Unbekannte Orte, abgelaufene Daten, fehlende Konfiguration oder Ausfälle bleiben
  unbekannt. Die Suche bleibt weiterhin benutzbar.
- Noch keine automatische Wetter-Gewichtung der Decision. Ausdrückliche Wünsche
  dürfen später nicht von einer Wetterprognose überschrieben werden.

## Betrieb

Die neue Funktion heisst `weather-context`, verlangt eine reguläre Anmeldung und
verifiziert das Konto serverseitig. Bestehende Kostenbegrenzung: je Konto zehn
Abrufe pro Minute und 120 pro Tag; global 120 pro Minute und 6'000 pro Tag.
Ein Cache-Neuladen benötigt höchstens zwei Apple-Anfragen. Diese Anfangswerte
sind nach realer Nutzung zu prüfen; sie sind kein neues kostenpflichtiges Abo.

Benötigte Server-Secrets: `WEATHERKIT_ENABLED=true`, `WEATHERKIT_TEAM_ID`,
`WEATHERKIT_KEY_ID`, `WEATHERKIT_SERVICE_ID`, `WEATHERKIT_PRIVATE_KEY`.
Vorgesehene Service-ID: `com.philipplanger.backyrd.weather`.
Der Schlüssel wird ausschliesslich für WeatherKit angelegt und nur als
Server-Secret gespeichert. Keine Schlüssel in Git, Screenshots oder Logs.

Der vorbereitete Releaseplan darf ausschliesslich die exakt gebundene neue
Weather-Funktion auswählen. Keine SQL-Migration, keine Auth-Konfiguration und
keine Änderung bestehender Decision- oder Social-Funktionen. Die vier offenen
Booking-Migrationen bleiben ausgeschlossen. Die Planung ist keine Freigabe
einer produktiven Ausführung.

## Prüfung und offene Abnahme

`node --test scripts/ci/weather-context.test.mjs` prüft die JWT-Signatur,
Stadt-/Datumsbindung, Sommerzeit, Cache-Ablauf, Apple-Fehler, Attribution,
ungültige Antworten, Anmeldung, Kontobindung und Kostenbegrenzung mit isolierten
Fixtures. Das ersetzt keine echte Apple-Anfrage.

Offen: manuelle mobile und Web-Abnahme einschliesslich Darstellung des
Quellenlogos/-links, Produktionsfreigabe und neuer App-Build. Paket 4 bleibt offen.

## ÖV als nächster separater Entscheid

Empfehlung: offizielle schweizweite OJP-2.0-Schnittstelle von
[opentransportdata.swiss](https://data.opentransportdata.swiss/en/dataset/ojp2-0).
Zunächst Haltestellen, Verbindungen und Reisezeit zum Spot; Echtzeit nur dort
ausweisen, wo vorhanden. BVB/BLT-Abdeckung vor einer Zusage konkret prüfen.
Keine Ticketbuchung und keine eigenständige Verkehrs-App.
Die öffentliche Community-API transport.opendata.ch bietet einen einfacheren
JSON-Einstieg, ist aber eine andere Betriebsentscheidung als die offizielle API.

Quellen: [WeatherKit](https://developer.apple.com/weatherkit/),
[Authentifizierung](https://developer.apple.com/documentation/weatherkitrestapi/request-authentication-for-weatherkit-rest-api),
[ÖV-Limits](https://opentransportdata.swiss/en/limits-and-costs/),
[Transport-API](https://transport.opendata.ch/docs.html).
