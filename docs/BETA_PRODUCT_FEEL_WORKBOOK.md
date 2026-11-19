# Backyrd: Produktgefühl bis zur Basel-Beta

## Punkt 1 – Produktgefühl und Bedienung

Status: OTA-Abnahmekandidat vorbereitet; visuelle Founder-Abnahme offen. Referenz: die vom Founder geteilte
Volta-Bräu-Aufnahme vom 19. November 2026. Umsetzung auf `origin/main` d7005c3c
im Branch `codex/beta-product-feel-v1`.

### Umsetzung: Spot-Seite und bildlose Ortskarten

- Besuchsinformationen und Erlebnisse vor der ausführlichen Mood-Auswertung.
- Kontaktaktionen weiter unten, nach den Besuchsdetails.
- Vorhandene Beschreibung als „Über diesen Ort“, Vorschau über drei Zeilen.
  Ohne Beschreibung entfällt die leere Sektion. Das ersetzt keine fehlenden Daten.
- Drei Moods mit ausgeschriebenen Personenzahlen; alle weiteren im bestehenden
  Detaildialog. Relative Balken entfallen, um geringe Datenmengen nicht wie eine
  belastbare Bewertung erscheinen zu lassen.
- Angebotsdetails als einzelne Textzeilen; kompakte, zugänglich beschriftete
  Aufklappsteuerung gibt dem Angebotsnamen mehr Platz.
- Zusammenhängende Tage mit identischen vollständigen Angebotszeiten werden
  zusammengefasst. Getrennte Tage, Mitternachtszeiten, Pausen und Gültigkeiten
  bleiben erhalten. Der Adapter wird auch vom Public Web verwendet.
- Der technische Standardname „Essen (ohne Trennung nach Mahlzeit)“ wird in
  Angeboten und Raumreferenzen als „Essen“ angezeigt; gepflegte Namen bleiben erhalten.
- Gemeinsame Mobile-Bildkomponente zeigt ohne Foto eine abstrakte Grafik statt
  eines Fehlbild-Symbols. Sie suggeriert keine Ortsaufnahme. Bestehende freigegebene
  Bilder und ihre Quellenangaben bleiben erhalten.
- Google-Places-Fotos bleiben über die bestehende zentrale Policy deaktiviert.
- Öffentliche Begriffe ergänzt: Brauerei, Mahlzeiten, Biergarten, Ausschank,
  Weinbar und Cocktailbar. Preisangaben wiederholen identische Tarif-/Inhaltstexte
  nicht mehr; abweichende Inklusivleistungen, Bedingungen und Pflichtkosten bleiben.

### Prüfung und Abnahme

Automatisiert am 19. November 2026:

- Gemeinsame Inhalts- und Web-Render-Tests bestanden.
- Gezieltes ESLint für die geänderten Mobile-Dateien bestanden.
- Vollständiger Mobile-Typecheck und `git diff --check` bestanden.
- Vollständige `test:contracts` und `test:map-discovery` bestanden. Darunter:
  Home-Laden/Refresh, Fehler und späte Antworten, Öffnungszustände, Wohin-Reihenfolge
  und Unsicherheit, Account-Einstieg, Moments/Uploads und Navigation.
- iOS-Export repariert durch Ausführen des vorhandenen `postinstall`-Schritts.
  Die bereits versionierten Metro-/query-string-Patches waren bei der vorherigen
  Installation mit `--ignore-scripts` übersprungen worden. Kein neuer Patch nötig.
- Production-Release-Validierung bestanden (208 Quelldateien); Hermes-Export und
  Prüfung der eingebetteten Production-URL und des öffentlichen Schlüssels bestanden.

Die visuelle Geräteabnahme ist offen. Vor Freigabe prüfen:

1. Volta Bräu: Reihenfolge, Angebotsdetails, ein-/ausklappen, komplette Texte.
2. Ort ohne Foto: Karte, Detail-Hero, Empfehlungen und benachbarte Orte;
   kein Fehlbild-Symbol, keine Google-Fotoanfrage.
3. Große Systemschrift und schmale Displays: keine abgeschnittenen Besuchshinweise,
   erreichbare Route-/Moment-Aktionen und Dialog-Schließen.
4. Light/Dark: Grafik und Bildtitel lesbar; vorhandene Fotos laden weiterhin.
5. Moods: 0, frühe Eindrücke, unbekannte Zählwerte, viele Moods und Ladefehler.

### Prüfung der übrigen Oberflächen und Daten

- Volta-Bräu-Profil am 19. November lesend mit der öffentlichen Schnittstelle
  geprüft: HTTP 200, WORLD_KNOWLEDGE, `publicDescription: null`, kein Feld
  `description.highlight`. Es fehlt öffentlicher Inhalt, keine Darstellung eines
  vorhandenen Beschreibungstexts. Keine ungeprüfte Legacy-Kopie einsetzen.
- Home, Wohin, Suche/Karte, Profil-Favoriten und benachbarte Orte verwenden die
  gemeinsame Bildkomponente und erhalten dieselbe neue bildlose Gestaltung.
- Home-/Wohin-/Karten-/Moments-/Profil-Fehlerzustände und vorhandene Recovery-Aktionen
  im Code geprüft; automatisierte kritische Pfade bestanden. Das ist keine
  manuelle Ende-zu-Ende-Abnahme und kein Nachweis eines realen Offline-Gerätetests.
- Die visuelle Gesamtwirkung, grosse Schrift und Erreichbarkeit der Aktionen
  werden mit dem Founder auf dem iPhone abgenommen. Punkt 1 darf erst nach dieser
  Abnahme als vollständig abgeschlossen markiert werden.

Keine Backend-, Rollen-, Ranking- oder Datenbankänderungen in diesem Paket.
OTA-Veröffentlichung zur Abnahme wird mit IDs und Runtime in einem Release-Beleg
festgehalten. Eine Beta-Freigabe ist damit nicht verbunden.
