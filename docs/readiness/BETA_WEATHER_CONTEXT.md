# Paket 4: WeatherKit-Grundlage

Stand: 7. November 2026. Server, Web und iOS-Update veröffentlicht.

## Live-Release

- Quellstand: `422803e03b910db1770b7a44be1ea78f09a3e0bd`, [PR #691](https://github.com/PhiluLan/backyrd/pull/691).
- [Server-Zertifizierung 42384778227](https://github.com/PhiluLan/backyrd/actions/runs/42384778227)
  und [Produktionsrelease 42385325625](https://github.com/PhiluLan/backyrd/actions/runs/42385325625)
  erfolgreich. Nur `weather-context` Version 1 wurde veröffentlicht; alle
  bestehenden Funktionen blieben unverändert. Keine SQL- oder Auth-Änderung.
- [iOS-Zertifizierung 42384758639](https://github.com/PhiluLan/backyrd/actions/runs/42384758639)
  erfolgreich. Das versiegelte Paket wurde ohne Neubau auf den bestehenden
  Produktionskanal veröffentlicht: Gruppe `54ca444b-7810-442f-b63f-32ebe60a95e8`,
  Update `01a1b694-5648-71c1-bf14-735994076976`, Runtime `1.1.0`.
  Native Konfiguration und Abhängigkeiten gegenüber Build 61 sind unverändert;
  ein neuer TestFlight-Build ist für diese Änderung nicht nötig.
- Expos ausgeliefertes Produktionsmanifest benennt genau dieses Update. Sein
  SHA-256 für das App-Paket stimmt mit dem zertifizierten Paket überein.
  Der direkte Kontrollabruf der Paketdatei am Expo-CDN wurde durch Cloudflare
  mit HTTP 403 abgewiesen. Eine Installation auf dem echten iPhone ist deshalb
  ausdrücklich noch nicht als bestanden dokumentiert; Founder-Prüfung angefragt.
- Authentifizierte Live-Web-Prüfung bestanden: echte Temperatur, Wetterlage,
  Aktualisierungszeit und originales Apple-Logo mit Quellenlink sichtbar.
  Der Live-Endpunkt beantwortet OPTIONS mit 200 und verweigert einen nicht
  angemeldeten POST mit 401.

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

Offen: Bestätigung des Updates auf dem echten iPhone. Die manuelle Live-Web-
Abnahme einschliesslich Quellenlogo/-link ist bestanden. Die Wettergrundlage
ändert noch keine Decision-Empfehlungen; ÖV und weitere Kontextintegration
bleiben separate Arbeit. Paket 4 ist insgesamt noch nicht abgeschlossen.

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
