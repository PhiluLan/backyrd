# Backyrd: Produktgefühl bis zur Basel-Beta

## Punkt 1 – Produktgefühl und Bedienung

### Founder-Reihenfolge und Typografie

Die Hauptseite folgt nun dieser Reihenfolge: Ortsart/Preisniveau, Adresse,
Kontakt, reguläre/Sonderöffnungszeiten, Erlebnisse, Platz vor Ort, Gut zu wissen,
Moods, Mehr Infos, Hier erlebt, umliegende Orte, Betreiberzugang und Kontakt-Hinweis.
Vorhandene Events und persönliche Planhinweise bleiben im Erlebnisbereich.
Fotos, Beschreibung und Quellenangaben sind unter Mehr Infos erreichbar; der
Foto-Viewer ist dort als untergeordnetes Modal eingebettet.

Spotname: dieselbe serifenlose Libre-Franklin-Familie wie die übrige Oberfläche,
38/45 mit dynamisch gemessener Hero-Höhe. Abschnittstitel 26/34; Öffnungszeit-Titel
22/29. Keine globale Typografieänderung auf anderen Screens.

„Stimmt etwas nicht? / Schreibe uns!“ öffnet einen Mail-Entwurf an hello@backyrd.ch
mit URL und Name des Orts. Kein automatischer Versand und keine beigefügten
Kontodaten. Der vorhandene Link-Öffner übernimmt die Fehlerbehandlung.
Betreiber-Verifikation und die bestehenden Claim-Zustände bleiben unverändert.

Regressionsprüfung: Reihenfolge, internes Erlebnis-/Raum-/Hinweis-Layout,
serifenlose Titelrolle und Mail-Link mit Sonderzeichen. Vollständige Mobile-Verträge,
Hermes-Prüfung, Typecheck und gezieltes Lint bestanden. Visuelle Abnahme bleibt offen.

### Abnahme-Folgekorrektur: aufgeklappte Inhalte scannbar machen

Founder: Gesamtgestaltung deutlich besser; Angebote und Räume enthalten noch zu
viel Fliesstext. Die gemeinsamen Präsentationsgruppen liefern daher zusätzlich
strukturierte Einträge: Gerichte, Küche, Ernährung, Getränke, Ausstattung,
Atmosphäre und Sprachen werden als neutrale Tags dargestellt. Andere Hinweise
bleiben einzelne Zeilen in Besuchersprache. Es werden keine weiteren Fakten
ausgeblendet oder zu Verfügbarkeits-/Allergen-Garantien hochgestuft.

Zeitliche Bedingungen bleiben direkt bei der zugehörigen Tag-Gruppe. Raum- und
Angebotsreferenzen werden in Mobile ebenfalls als umbrechende Tags gezeigt.
Die Tags sind reine Information, keine scheinbaren Filter-Buttons.

Mobile-Typecheck, gezieltes Lint, volle Mobile-Verträge, 21 gemeinsame/Web-Tests
und direkte Ausführung im Hermes-Runner bestanden. Die visuelle Founder-Abnahme
dieser Folgekorrektur ist noch offen. Public-Web-Darstellung im Code angeglichen;
eine Web-Veröffentlichung ist nicht Teil dieses OTA.

### Incident: Spot-Absturz nach Besuchersprache-OTA

Am 19. November meldete der Founder einen Renderfehler beim Öffnen eines Spots.
Die vorherige funktionierende Version c5a33a90 wurde zuerst für beide iOS-Runtimes
auf Production wiederveröffentlicht (Rollback-Gruppen
`9df25cc6-9c27-4169-9d0b-bc46e99e2213` für 1.1.1 und
`31a63c93-829e-41d4-944f-b751c3bf2d32` für 1.1.0).

Ursache reproduziert im mit React Native gelieferten Hermes: `Intl.ListFormat`
ist nicht vorhanden und löst bei der neuen Besuchertext-Aufzählung einen TypeError
aus. Node-basierte Tests und Bytecode-Export hatten diese Laufzeitlücke übersehen.
Der Fix verwendet eine einfache deutsche Aufzählung ohne diese optionale API.

Regression: Der gemeinsame Testsatz läuft zusätzlich in einer VM ohne
`Intl.ListFormat`. `npm run test:spot-copy:hermes` führt den tatsächlichen Adapter
mit dem lokalen Hermes-Runner aus (auf dem macOS-Entwicklungsrechner). Er prüft
einzelne und mehrteilige Aufzählungen, Bedingungen und den Tarif des Beispiels.
Native Prüfung, 19 gemeinsame/Web-Tests, volle Mobile-Verträge, Such-/Kartenprüfung,
Typecheck und beide Production-Hermes-Exporte bestanden.

Die Wiederveröffentlichung des Fixes ersetzt nicht die physische iPhone-Abnahme.

Status: OTA auf Production für iOS 1.1.0 und 1.1.1 veröffentlicht; visuelle Founder-Abnahme offen. Referenz: die vom Founder geteilte
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

Founder-Rückmeldung nach dem ersten OTA: visuell nicht abgenommen. Die Satzlisten
wirken weiterhin technisch; der bildlose Hero lässt zu viel leeren Raum.
Folgekorrektur mit Besuchersprache auf Production für beide Runtimes veröffentlicht
(Quelle c350110d; Gruppen siehe Release-Beleg):

- Bildloser Hero kompakter; keine pinke Dekoration unter der Statusleiste.
- Ortsart und Preisniveau als ruhige Zusammenfassung statt technischer Dreispaltentabelle.
- Angebote als Karten mit Preisvorschau und eigenem Tarifbereich. Besuchshinweise
  werden in kurze, zusammenhängende Absätze in Besuchersprache übersetzt.
  Die zwischenzeitliche Key-Value-Darstellung wurde verworfen. Altersregeln, Pflichtkosten und
  zeitliche Bedingungen bleiben explizit sichtbar.
- Wiederholung des Angebotsnamens als Aktivität wird nur ohne Bedingung entfernt.
- 18 gemeinsame Inhalts-/Web-Render-Tests, Mobile-Vertragsprüfung, Typecheck und
  gezieltes Lint bestanden. Visuelle Prüfung der Folgekorrektur noch offen.

Die gemeinsame Präsentation übersetzt bestätigte, bekannte Angaben beispielsweise
in „Reserviere am besten im Voraus“, „Hier bedienst du dich selbst“ und
„Du erreichst den Ort mit dem ÖV, zu Fuss und mit dem Velo“. Auch Public Web nutzt
diese Texte. Freie Hinweise werden nicht umgeschrieben; Bedingungen bleiben an
der jeweiligen Aussage. Es werden keine unbestätigten Eigenschaften ergänzt.

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
  `description.highlight`. Diese Prüfung erfasste nur das kanonische Profil.
  Der öffentliche Owner-Kontext liefert dagegen einen verifizierten Betreibertext;
  siehe Korrektur unten. Keine ungeprüfte Legacy-Kopie einsetzen.
- Home, Wohin, Suche/Karte, Profil-Favoriten und benachbarte Orte verwenden die
  gemeinsame Bildkomponente und erhalten dieselbe neue bildlose Gestaltung.
- Home-/Wohin-/Karten-/Moments-/Profil-Fehlerzustände und vorhandene Recovery-Aktionen
  im Code geprüft; automatisierte kritische Pfade bestanden. Das ist keine
  manuelle Ende-zu-Ende-Abnahme und kein Nachweis eines realen Offline-Gerätetests.
- Die visuelle Gesamtwirkung, grosse Schrift und Erreichbarkeit der Aktionen
  werden mit dem Founder auf dem iPhone abgenommen. Punkt 1 darf erst nach dieser
  Abnahme als vollständig abgeschlossen markiert werden.

Keine Backend-, Rollen-, Ranking- oder Datenbankänderungen in diesem Paket.
OTA-Veröffentlichung zur Abnahme ist mit IDs und Runtime in
`docs/operations/releases/BETA_PRODUCT_FEEL_2026_11_19.json` festgehalten.
Eine Beta-Freigabe ist damit nicht verbunden.

### Folgekorrektur: Abstände und Beschreibung

Founder-Feedback vom 19. November: Kategorien wirken gedrängt; Beschreibung
direkt unter der Adresse gewünscht.

- Hauptabschnitte erhalten 48 Punkte Abstand, Adresse 40 Punkte. Öffnungszeiten
  und Sonderöffnungszeiten bilden eine Gruppe mit grosszügigeren Zeilen und
  eigenem Abstand zum nächsten Abschnitt. Erlebnisüberschriften erhalten 24
  Punkte Abstand zu Karten, aufgeklappte Untergruppen 28 Punkte.
- «Über diesen Ort» steht nach der Adresse und vor Kontakt, mit drei Zeilen
  Vorschau und «Mehr lesen». In «Mehr Infos» wird es nicht doppelt angezeigt.
- Ursache für Volta Bräu: Das kanonische Profil enthält keine Beschreibung,
  der bestehende öffentliche `get_spot_owner_context_v1` liefert aber einen
  347 Zeichen langen Betreibertext. Die Datenbankansicht wählt Betreibertexte
  nur bei `is_verified = true`, danach redaktionelle Texte aus. Mobile nutzt
  diese beiden Quellen als Fallback; Crawl-/AI-Texte werden bei kanonischen
  Profilen weiterhin nicht übernommen. Kanonische Beschreibungen haben Vorrang.
- Keine Datenänderung, Migration, zusätzliche Anfrage oder Berechtigungsänderung.
  Web geprüft: Der dortige Beschreibungspfad bleibt unverändert; diese Iteration
  betrifft die iPhone-Abnahme. Die Oberflächenparität bleibt Roadmap-Punkt 2.
- Typecheck, gezieltes ESLint, volle Mobile-Vertragstests, Karten-/Discovery-Tests,
  Hermes-Ausführung und `git diff --check` bestanden. Der vorhandene Layouttest
  prüft zusätzlich Reihenfolge, Quellenfilter, leere Texte und Vorrang.

Physische iPhone-Abnahme der Abstände und des vollständigen Texts bleibt offen.
Der Simulator-Sichttest war durch den gesperrten Mac blockiert. Der öffentliche
App-RPC wurde zusätzlich ohne privilegierten Zugriff geprüft: HTTP 200,
Quelle `owner`, Beschreibungslänge 347 Zeichen.

### Folgekorrektur: Momente auf der Ortsseite

«Hier erlebt» verwendet statt gerahmter grauer Profilkarten eine ruhige Liste
mit feinen Trennern. Fotos stehen zuerst in voller Inhaltsbreite im Format 4:3;
Moods erscheinen als typografische Zeile, persönliche Texte darunter. Einträge
ohne Foto werden kompakt mit einer pinken Linie dargestellt. Name, Local-Hinweis
und Datum folgen als zurückhaltende Quellenzeile. Die bestehende Suche nach
ähnlichen Orten erhält nur hier eine dezente, kürzere Darstellung. Feed und Home
bleiben in dieser Iteration unverändert.

Melden, Anmeldung, Sichtbarkeitsfilter und Review-Datenquelle bleiben erhalten.
Fehlgeschlagene Fotos werden durch einen ehrlichen kurzen Hinweis ersetzt;
Text und Moods bleiben lesbar. Keine neuen Backend-Anfragen oder Datenänderungen.
Mobile-Typecheck, gezieltes ESLint, vollständige Mobile-Vertragstests und direkte
Hermes-Ausführung bestanden. Visuelle Founder-Abnahme steht aus.

### Abnahme Spot-Profil und nächster Abschnitt: Entdecken

Der Founder hat die Spot-Profilseite einschliesslich der neuen Momente am
19. November ausdrücklich visuell abgenommen. Dieser Teil ist abgeschlossen;
Punkt 1 insgesamt bleibt bis zur Abnahme der übrigen Verbraucheroberflächen offen.

Entdecken erhält nun dieselbe UI-Schrift wie die Profilseite. Eine kleine
Begrüssung, «Dein nächster guter Moment.» und die Wunschsuche bilden den Einstieg.
Die Suchaktion ist dauerhaft sichtbar; die bestehende Eingabeprüfung bleibt
erhalten. Abschnittsüberschriften haben 26/34 Punkte, dürfen umbrechen und werden
nicht mehr durch Textmessung auf eine Zeile verkleinert. Die Hauptabschnitte
erhalten 48 Punkte Abstand.

Die drei Home-Ortsreihen und die Ortsliste verwenden gemeinsam `SpotPreviewCard`:
Bild beziehungsweise vorhandene Backyrd-Grafik, darunter Name, Kategorie und
Stadt/Adresse oder echte Entfernung, Moods und kanonischer Öffnungsstatus.
Der Text liegt auf einer ruhigen Fläche, lange Namen dürfen vollständig umbrechen.
Die Kartenvorschau verwendet ebenfalls die UI-Schrift. Das bisherige Bildsystem
und seine Kosten-/Rechteregeln bleiben erhalten; Google-Fotos bleiben deaktiviert.

Anfragen, Rankings, Standort-/Einwilligungsregeln, Analytics, Navigation und
Fehler-/Leerzustände bleiben erhalten. Die Bild-Ready-Callbacks der ersten beiden
Home-Karten werden durch die gemeinsame Komponente durchgereicht. Der entfallene
Mess-Callback für die frühere einzeilige Begrüssung blockiert den Start nicht mehr.
Web/Owner/Admin und «Wohin» haben keine Vertragsänderung.

Typecheck, gezieltes ESLint, volle Mobile-Vertragstests, Karten-/Discovery-Tests,
Hermes-Ausführung, Production-Validierung und beide geprüften iOS-Exporte bestanden.
Die bestehenden Bild- und Status-Vertragstests prüfen jetzt die gemeinsame Karte.
Der Simulator-Sichttest war wegen des gesperrten Mac nicht möglich. Zur visuellen
Abnahme: Entdecken als Gast/angemeldet, Karten mit/ohne Foto, lange Namen,
grosse Schrift, horizontales Blättern, Ortsliste und Öffnen der Profilseite.

### Rücknahme der Entdecken-Überarbeitung

Der Founder lehnt die neue Entdecken-Gestaltung ab und bevorzugt den bisherigen
Header sowie die grossen Spot-Karten. Die gesamte letzte Entdecken-Iteration
wird zurückgenommen: Home, Ortsliste, Überschriften, Karten und zugehörige
Vertragstests entsprechen wieder dem Stand `2163789e`. Die neue gemeinsame
Preview-Komponente wird entfernt. Die abgenommene Spot-Profilseite und ihre
Moment-Darstellung bleiben erhalten.

Für die Auslieferung werden die bereits geprüften OTA-Gruppen des vorherigen
Stands erneut auf Production veröffentlicht. Dadurch gelangen exakt dieselben
Bundles zurück auf beide iPhone-Runtimes. Eine neue Entdecken-Gestaltung ist
damit nicht freigegeben; der bisherige Header und die Kartengrössen sind die
Grundlage für weitere, gezielte Anpassungen.

### Entdecken: gezielte Founder-Anpassungen nach Wiederherstellung

Die bestehenden grossen Vollbild-Spotkarten und das Eingabefeld bleiben die
Grundlage. Auf ausdrücklichen Wunsch umgesetzt:

- Standortkopf zeigt Stadt plus Quartier, wenn die native Ortsauflösung des
  aktuell freigegebenen Standorts ein Quartier liefert. Ohne diese Daten bleibt
  die Stadt stehen. Keine neue Berechtigungsabfrage, Speicherung oder Logs von
  Koordinaten. Späte Ortsantworten dürfen nach Standortverlust nichts ergänzen.
- Begrüssung kleiner; Tageszeitfrage kleiner und einzeilig, Fragezeichen weiss.
  Wetteranzeige samt ihrer Startbereitschafts-Abhängigkeit vollständig entfernt.
- Keine Kommas hinter den Home-Abschnittstiteln. «backyrd Momente» heisst «Momente».
- Moods auf Home-Spotkarten kleiner und einzeilig; bei bekanntem Nullstand
  «Noch keine Moods». Unbekannte Zählwerte werden weiterhin nicht als null erfunden.
- Momentkarten nutzen dieselbe Standardbreite und 234 Punkte Standardhöhe wie
  Eventkarten. Bei grosser Systemschrift dürfen Momentkarten wachsen.
- Eventbild reicht unter alle Inhalte, mit Verlauf ins Grau. Datum und Zeit
  weiss, Eventart oben links. Bekannte Eintrittspreise beziehungsweise Gratis
  stehen vor dem Pfeil; unbekannte Kostenpflicht wird als «Preis offen» angezeigt.
  Eventkarten-Grundgrösse bleibt erhalten; der bestehende Einzelevent-Fallback
  über die verfügbare Breite bleibt bestehen. Die gemeinsame Mobile-EventCard
  übernimmt diese Darstellung auch ausserhalb von Home.
- «Neu auf backyrd» verwendet weiterhin dieselben grossen Spotkarten wie die
  Orte in der Nähe. Letzte Suchanfrage kleiner und kursiv; ausschliesslich deren
  Ortsreihe erhält eine manuell bewegte 3D-Perspektive. Bei «Bewegung reduzieren»
  bleibt sie flach. Keine automatische Bewegung und keine Rangfolgeänderung.

Typecheck, gezieltes ESLint, volle Mobile-Vertragstests, Karten-/Discovery-Tests
und Hermes-Prüfung bestanden. Neue Preisprüfung deckt Gratis, bekannte Beträge,
fehlende Währung und ungültige/fehlende Preise ab. Der tatsächliche Home-Load-
Callback wird auf Quartieranzeige, fehlende Freigabe und verspätete Geocodes geprüft.
Keine Backend-, Schema- oder Vertragsänderung; keine Änderung der abgenommenen
Spot-Profilseite. Native visuelle Abnahme dieser Iteration steht aus.

### Kleine Header-Nachkorrektur

Auf Founder-Wunsch ist die Tageszeitfrage von 20 auf 22 Punkte vergrössert
(30 Punkte Zeilenhöhe); die einzeilige Anpassung für «Nachmittag» bleibt erhalten.
Das Profilfoto oben rechts wurde durch ein weisses Profil-Symbol im bestehenden
IconButton ersetzt, mit derselben Profilnavigation und zugänglicher Beschriftung.
Home lädt das dafür nicht mehr benötigte Avatarfeld nicht mehr und wartet beim
Start nicht mehr auf dessen Bild-Callback. Das Profil selbst bleibt unverändert.

### Nuknuk-Profilbutton

Der Founder wünscht statt des allgemeinen Profil-Symbols einen kleinen Nuknuk-
Kopf als Zugang zu «Mein Backyrd»: dunkler Kreis, reduzierte pinke Gesichtskontur,
statisch. Die vorhandene `NuknukAvatar`-Komponente erhält dafür eine Outline-
Darstellung, angelehnt an Bob, Haarsträhne, Augen und Lächeln der vorhandenen Figur.
Die Kontur verwendet native Formen ohne neue Bibliothek oder Bilddienst.
Illustration und optionales Blinzeln bleiben für die bestehende Darstellung
erhalten; die Outline wird auch bei gesetztem Animationsparameter nicht animiert.
Der 46-Punkte-Button nutzt die bestehende Profilroute, Beschriftung
«Mein Backyrd – Profil öffnen» und den vorhandenen Press-Zustand.

Typecheck, gezieltes ESLint und vollständige Mobile-Vertragstests bestanden.
Visuelle Founder-Abnahme des neuen Symbols steht aus.
