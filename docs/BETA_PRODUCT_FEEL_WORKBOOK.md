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

### Home-Momente: persönliche Einblicke statt weiterer Ortskarten

Auf Founder-Wunsch wird ausschliesslich die Home-Momentsektion neu gestaltet.
«Neu auf backyrd», Eventkarten und die enge Typografie bleiben unverändert.
Die Überschrift lautet «Hier erlebt», mit ehrlicher Ortszeile statt einer
Aktualitätsbehauptung für ältere Beiträge.

- Foto über die Kartenbreite im Format 4:3, Ortsname dezent im Bild.
- Persönlicher Text darunter; reine Textmomente als Zitat. Moods erscheinen
  einmal. Kleine Quellenzeile mit Person und tatsächlichem Datum/Zeitabstand.
- Antippen öffnet den konkreten Moment über die bestehende sichere Detailroute,
  wo vollständiger Text, Ortszugang und Meldefunktion vorhanden sind.
- Reine Mood-Einträge und als Caption wiederholte Mood-Listen erscheinen nicht.
  Bei fehlgeschlagenen Bildern bleibt ein vorhandener Text sichtbar; ohne
  verbleibenden Inhalt entfällt die Karte. Ohne geeignete Beiträge entfällt die
  Sektion vollständig. Initialbereitschaft wird auch dann korrekt signalisiert.
- Die bestehende sicherheitsgefilterte Feed-Abfrage lädt begrenzt 18 statt 6
  Kandidaten, davon maximal 4 Vorschauen. Keine zusätzliche Anfrage oder neue
  Datenquelle, keine Änderung an Sichtbarkeits- oder Moderationsregeln.
- Ladefehler bieten eine lokale Wiederholung; Account, Stadt, Revision und
  Wiederholungsversuch isolieren verspätete Antworten. Kein automatisches Blättern.

Typecheck, gezieltes ESLint, vollständige Mobile-Vertragstests, Discovery-Tests
und Hermes-Prüfung bestanden. Inhaltsprüfungen decken reine Moods, wiederholte
Mood-Captions, persönliche Texte, Fotos, Videoausschluss und fehlgeschlagene
Bilder ab. Native visuelle Founder-Abnahme steht aus.

### Home-Momente vorerst ausgeblendet; Entwurf aufbewahrt

Founder-Entscheidung: Die gesamte Momentsektion entfällt vorerst auf Home.
Der Entwurf soll erhalten bleiben. Seine kanonische Implementierung liegt
weiter in `mobile/components/HomeMomentsSection.tsx`, der vollständige
Entwurfsstand ist zusätzlich durch Git-Commit `e6fd66c3` nachvollziehbar.
Keine zweite Entwurfs- oder Backup-Datei angelegt.

Home mountet die Komponente nicht mehr, lädt dort keinen Moments-Feed und wartet
beim Start nicht mehr auf deren Ready-Callback. Der zugehörige Refresh-Zähler
ist entfernt. Es bleibt auch kein leerer Abschnitt oder Abstand dafür zurück.
Der eigene Momente-Tab, Moment-Details und die abgenommene Spot-Profilseite
bleiben erhalten. Eine spätere Reaktivierung erfordert eine explizite
Produktentscheidung und die erneute Einbindung in Home samt Start-/Refresh-
Lebenszyklus; der Entwurf ist aktuell nicht zur Anzeige freigegeben.

### Startseite vorerst abgeschlossen

Der Founder ist mit dem aktuellen Stand zufrieden und hat Dark sowie Light
anhand eigener Geräteaufnahmen beurteilt. Letzte vereinbarte Korrektur:
Das Fragezeichen der Tageszeitfrage nutzt nun die adaptive primäre Textfarbe
anstelle von festem Weiss. Im Light-Modus ist es dunkel, im Dark-Modus entspricht
es der hellen Textfarbe der Frage. Layout und Typografie bleiben erhalten.

Mit dieser Korrektur ist die Startseite auf ausdrücklichen Founder-Wunsch
vorerst abgeschlossen. Die Momentsektion bleibt ausgeblendet, ihr Entwurf bleibt
aufbewahrt. Das ist eine Abnahme der Startseite, keine vollständige Abnahme
aller App-Oberflächen oder Beta-Freigabe. Eine separate Geräteaufnahme nach
dem letzten Kontrastfix liegt noch nicht vor.

### Nächste Oberfläche: Momente mit Erlebnis- und Ortsfokus

«Wohin» ist auf Founder-Wunsch zurückgestellt, bis das iPhone am Mac angeschlossen
ist und der ganze Ablauf direkt geprüft werden kann. Als Nächstes wird der
Momente-Tab bearbeitet. Der Founder hat ausdrücklich «Erlebnisse und Orte im
Fokus» gewählt; Personen und Austausch bleiben zugänglich.

Erster Entwurf nur im Momente-Tab:

- Klarer Kopf «Momente», kurze Einordnung «Orte, wie sie sich anfühlen.» und
  die bestehenden Filter als «Entdecken»/«Dein Kreis». Personen-Suche und
  Erstellen bleiben erreichbar. Der Kopf bleibt auch bei Ladefehlern sichtbar.
- Grosse Fotos oder persönliche Texte führen die gerundeten, abgesetzten Beiträge.
  Moods werden als ruhige Wortzeile dargestellt; reine Mood-Wiederholungen im
  Caption-Text werden nicht doppelt gerendert. Alle Beiträge bleiben im Feed.
- Ein deutlicher Ortsblock mit Name, Kategorie/Stadt und «Ort entdecken» folgt
  dem Erlebnis. Die vorhandene Suche nach ähnlichen Orten bleibt dezent erreichbar.
- Person, Datum, Folgen, Melden beziehungsweise eigene Optionen sowie Reaktionen,
  Kommentare, Teilen und Speichern stehen darunter. Aktionen und Backend-Pfade
  sind erhalten; ungültige Datumswerte erzeugen im neuen Layout keine Zeitbehauptung.
- Mehrfachfotos werden tatsächlich horizontal geblättert, mit aktuellem Zähler
  und gemessener Kartenbreite. Fehlgeschlagene Bilder entfallen aus der Galerie.
  Bei vollständigem Bildfehler bleiben Text/Moods und eine explizite Wiederholung.
- Die bestehende `PostCard` erhält eine optionale Erlebnisdarstellung. Profile,
  gespeicherte Momente und Einzelansichten verwenden weiterhin die Standardansicht.
  Die Startseite bleibt abgeschlossen und ihre Momentsektion ausgeblendet.

Keine Änderungen an Sichtbarkeitsfiltern, Upload, Ranking, Einwilligung, Moderation,
Schemata oder API-Verträgen. Die gemeinsam genutzten Konsumenten wurden geprüft.
Typecheck, gezieltes ESLint, vollständige Mobile-Vertragstests, Karten-/Discovery-
Tests und Hermes-Prüfung bestanden. Ein Render-Harness prüft die tatsächliche
Komponente auf Reihenfolge, Mehrfachfotos, gemessene Breite, Bildfehler/Wiederholung,
Mood-Duplikate, Orts-/Kommentarzugang und erhaltene Standarddarstellung.
Native visuelle und vollständige Geräte-Interaktionsabnahme bleiben offen.

### Momente: Vollbild-Versuch mit zwei Wischrichtungen

Der Founder möchte die Beitragskarten durch einen testbaren, vollflächigen
Foto-/Story-Feed ersetzen. Der Versuch ist ausschliesslich im Momente-Tab aktiv;
der vorherige Erlebnisentwurf bleibt über Git `4f75a4de` nachvollziehbar.

- Ein Moment belegt die tatsächlich gemessene Bildschirmfläche. Vertikales
  Wischen rastet zum nächsten Beitrag ein; horizontales Wischen blättert die
  Fotos desselben Moments. Kein scrollender Kopf verschiebt die Seitengeometrie.
- Fotos füllen die Fläche; Verlauf und weisse Overlays halten Ort, Person,
  Kurztext und Aktionen lesbar. Kopf, Aktionsspalte und Text berücksichtigen
  Statusbereich und die bestehende schwebende Navigation. Der Statusbar-Stil
  wird nur im fokussierten Feed gesetzt.
- Ohne Foto erscheint ein eigener, flächiger Textmoment mit tatsächlichem Inhalt
  und Moods. Fehlgeschlagene Fotos haben eine ehrliche Rückmeldung und Wiederholung.
- Vollständiger Text, alle Moods, markierte Personen und die bestehende Suche
  nach ähnlichen Orten bleiben über die Momentdetails erreichbar. Beim Navigieren
  daraus wird das Textfenster zuerst geschlossen. Der Ort ist direkt erreichbar.
- Folgen, Reaktionen, Kommentare, Teilen, Speichern, Melden und eigene Optionen
  nutzen dieselben Funktionen und Berechtigungen wie zuvor. Filter und Erstellen
  bleiben im schwebenden Kopf; Lade-/Leer-/Fehlerzustände bleiben eigenständig.
- Weiterhin maximal 30 geladene Beiträge, keine automatische Wiedergabe,
  Fortschaltung oder zusätzliche Endlos-Nachladung. Keine Ranking-, Upload-,
  Moderations-, Datenbank- oder API-Änderung. Startseite und Spot-Profil unverändert.

Typecheck, gezieltes ESLint, volle Mobile-Vertragstests, Karten-/Discovery-Tests
und Hermes-Prüfung bestanden. Der Render-Harness prüft zusätzlich Vollbildhöhe,
gemessene Fotobreite, horizontales Paging/Zähler, Textöffnung/-schliessen,
Bildfehler/Wiederholung und vertikale Item-Offsets ohne Kopfversatz.
Native Gesten-, visuelle und grosse-Schrift-Abnahme auf dem iPhone sind offen.
Der Entwurf ist ein Versuch und keine finale Abnahme der Momente-Seite.

### Wohin: persönliches Erlebnis und durchgehender Plan

Auftrag vom 19. November 2026 nach dem Geräte-Audit: Wohin visuell und sprachlich
an Startseite und Spotprofil anschliessen. Leitgedanke: «NukNuk versteht mich als
Person». Die Entscheidungslogik bleibt unverändert. Taskklasse `PRODUCT_RELEASE`
wegen des aktiven Mobile-Einstiegs; diese Änderung aktiviert keinen Product-
Runtime und veröffentlicht kein OTA.

Betroffene Pfade: Mobile-Wohin-Screen, seine vorhandene Präsentationslogik,
Wartekomponente und der nur aus einer Decision sichtbare Kontext im Spotprofil.
Web, Admin, Owner, Backend, Datenbankschema, Prompt, Matching, Eligibility und
Ranking bleiben unverändert. Request-Erstellung, serverseitige Reihenfolge,
sichtbares Kandidatenfenster, Rückfrage-Zusammensetzung, Auth-Gate und
consentgebundene Interaktionen bleiben auf dem bestehenden Pfad.

- Sans-Serif-Hierarchie, ruhige neutrale Flächen und die etablierten Hell-/Dunkel-
  Farben ersetzen die Serif-/Pfirsich-/Violett-Mischung. Alte iOS-Runtime mit
  fester dunkler Darstellung bleibt berücksichtigt.
- NukNuk lädt persönlich zum Erzählen ein; unfertige Wünsche sind ausdrücklich
  willkommen. Einstiegshilfen werden erst nach dem Profil-/Verlaufslesen gemeinsam
  freigegeben. Die Stadt hat einen reservierten, beschrifteten Platz.
- Während der Suche erscheint der Wunsch einmal. Die vorhandene NukNuk-Figur
  blinzelt unter Beachtung von Reduce Motion und App-Hintergrundzustand.
  Wechselnde Gedanken begleiten die Wartezeit, ohne Backend-Phasen, Prozentwerte
  oder eine garantierte Restzeit vorzutäuschen. Nach längerer Wartezeit wird dies
  ausdrücklich benannt. «Wunsch anpassen» verwirft die lokale Zustellung; eine
  bereits gesendete Serveranfrage kann weiterlaufen. Generationen verhindern,
  dass eine verspätete Antwort den bearbeiteten Wunsch überschreibt.
- Die Vorschlagsliste zeigt den ursprünglichen Plan samt Ergänzungen, Stadt,
  Anzahl und klare Wege zum Anpassen oder Neustarten. Karten verwenden kurze,
  belegte Beschreibungen; Unsicherheit und weitere Besuchshinweise werden markiert
  und bleiben unter «Vor deinem Besuch» vollständig erreichbar.
- Öffnungsangaben beziehen sich ausdrücklich auf die gewünschte Besuchszeit.
  Nicht genauer benannte Backend-Lücken bleiben ehrlich unbestimmt. Die UI
  erfindet weder die fehlende Einzelheit noch persönliche Passung.
- Der weitere Dialog bietet eine verständliche Einladung zur Verfeinerung.
  Die Diagnoseansicht samt Rohdaten und «Übergabe & Reihenfolge» entfällt aus
  dem Consumer-Ablauf; Fehlerdiagnostik bleibt bestehen. Neue Suche setzt auch
  vorherige Rückfragen, Hinweise und Dialogzustände zurück.
- Die Datenschutzinformation ist direkt in der App und offline lesbar. Ihr Text
  entspricht unverändert der bestehenden öffentlichen Erklärung. Ein Paritätstest
  verhindert stilles Auseinanderlaufen; es wird keine Zustimmung verändert.
- Der actor-/spot-/origingebundene, zeitlich begrenzte Plan steht bei einem
  Decision-Einstieg direkt unter dem Spotbild. Details sind aufklappbar;
  Ergänzungen erscheinen ohne technische Request-Präfixe. Direkte Spotbesuche
  erhalten weiterhin keinen persönlichen Suchkontext.

Abnahme: TypeScript, gezieltes ESLint, vollständige Mobile-Vertragstests,
Hermes-Verbrauchertextprüfung, Single-Route-Prüfung sowie Web- und iOS-Export.
Zusätzliche Regressionen sichern kurze Karten bei vollständig erhaltenen
Unsicherheitshinweisen, Zeitbezug und Datenschutztext-Parität.
Ein isolierter Browserlauf im tatsächlich exportierten Expo-Bundle prüft die
drei gewünschten Eingaben mit synthetischen, vertragsgültigen Antworten:
Wartezeit über zehn Sekunden, spätes Ergebnis nach Verlassen, unveränderte
Serverreihenfolge, Weiterfragen, Spotübergang, 320/390/430-Pixel-Ansichten in
Hell und Dunkel, offene Familienangaben, Eingabehilfe, sauberer Neustart und
eine serverseitige Rückfrage mit Antwort. Keine Production-Aktionen und keine
Bewertung der vorgeschlagenen Orte. Testskript und Screenshots liegen lokal
unter `/tmp/backyrd-wohin-personal-e2e.mjs` und
`/tmp/backyrd-wohin-personal-shots/`; keine generierten Artefakte im Git.
Native visuelle Abnahme auf dem iPhone, VoiceOver und grosse Systemschrift
sowie OTA-Veröffentlichung sind noch offen.


## Folgeüberarbeitung: Wohin als durchgehendes Gespräch

Founder-Rückmeldung vom 19. November: Die erste Wohin-Überarbeitung wurde
visuell abgelehnt. Einstiegskarten, hochspringendes Eingabefeld, plötzlich
auftauchende Ganzkörperfigur, kleine Ergebnisfotos und separater Chat wirkten
unzusammenhängend. Die Entscheidungslogik bleibt ausdrücklich unverändert.

Der lokale Folgeentwurf verwendet einen einzigen Verlauf und ein dauerhaft
montiertes Eingabefeld. NukNuk bleibt als Outline im Kopf sichtbar. Die Suche
antwortet inline mit einer zurückhaltenden, abschaltbaren Punktanimation;
keine simulierten Suchschritte und keine erfundene Fortschrittsanzeige.
Ergebnisbilder sind grossflächig, Rückfragen und Ergänzungen bleiben direkt
in derselben Ansicht. Datenschutz und Besuchshinweise bleiben als bewusste,
untergeordnete Dialoge erreichbar. Die iOS-Tastaturbehandlung reserviert bei
sichtbarer Tastatur keinen zusätzlichen Platz für die ausgeblendete Tabbar.

Eine gemeinsame vertikale FlatList bewahrt die tatsächliche Sichtbarkeit der
Ergebnisse für Impressionen. Serverreihenfolge, Aufnahmebedingungen, Request-
Vertrag, Ranking, Transport, Datenschutz und Grounding bleiben unverändert.
Abgebrochene Requests können den bearbeitbaren Entwurf nicht überschreiben;
beim Abbruch einer Ergänzung bleibt diese als Entwurf erhalten.

Lokale Prüfung mit dem exportierten Expo-Bundle und ausschliesslich
synthetischem Transport: die drei Founder-Szenarien, Rückfragen, Ergänzung,
Abbruch/späte Antwort, Entwurfserhalt, erneuter Versuch, Spot-Übergabe,
Besuchshinweise, keine Offscreen-Impressionen, grosse Bilder und kein
horizontaler Überlauf bei 320/390/430 Punkten in Hell/Dunkel bestanden.
Mobile-Typecheck, Vertragsprüfungen und Lint bestanden (zwei bestehende
Warnungen ausserhalb der geänderten Dateien). Die native Tastaturprüfung
ist noch offen: der isolierte Simulator gelangt beim Deep Link zum Login.
Dieser Stand ist noch nicht veröffentlicht oder visuell abgenommen.

## Appweiter UI/UX-Auftrag

Der Founder hat am 19. November die Prüfung und Umsetzung einer gemeinsamen
Design- und Besuchersprache für die gesamte Consumer-App einschliesslich
Live-Tests und Veröffentlichung freigegeben. Bereits abgenommene Start- und
Spot-Seiten bilden die Referenz. Bewertet werden Darstellung, Verständlichkeit,
Bedienung und Übergänge; die Entscheidungslogik bleibt ausserhalb dieses Auftrags.

Prüfumfang: Entdecken, Wohin, Orte/Liste/Karte/Filter, Spot und Events, Momente
und Erstellen, Profil und Gespeichertes, Suche, Nachrichten, Account-Einstieg,
Einstellungen, Privatsphäre und Sicherheit sowie Lade-/Leer-/Fehlerzustände.
Native Funktionen werden am Gerät geprüft; isolierte Fixtures ergänzen seltene
Zustände. Keine echten Momente, Meldungen, Nachrichten oder Kontoveränderungen
als Testdaten veröffentlichen. Die iPhone-Synchronisierung wurde nach dem Sperren verbunden.


### Umsetzung der gemeinsamen Gestaltung

Task-Klasse: `PRODUCT_RELEASE`. Betroffen sind Mobile-Präsentation,
Mobile-Theme, Produkt-Browsertest und dieses Arbeitsbuch. Keine Änderung an
Datenmodell, RPCs, Ranking, Interpretation, Empfehlungstext-Adapter,
Transport, Berechtigungsprüfung oder Einwilligungsregeln.

Beobachtet am verbundenen iPhone: Startseite, Profil, Einstellungen,
Sichtbarkeit, Ortsliste, Filter, native Karte und Ortsvorschau,
Moment-Aufnahme/Abbruch/Entwurf, Feed, Kreis, Personensuche, Kommentare,
Mitteilungen sowie ein temporärer Legal-Verbindungsfehler mit erfolgreichem
Retry. Keine Testbeiträge, Nachrichten oder Meldungen veröffentlicht.
Ergänzend wurden 22 App-Routen in Hell/Dunkel mit synthetischen Daten als
Screenshot geprüft. Leere Zustände sind ausdrücklich Testfixtures und keine
Aussage über den Produktionsbestand.

- Gemeinsame Display-Schrift nun Libre Franklin Bold. Bereits abgenommene
  iOS-Startseiten-Typografie und Spot-Seite bleiben die Referenz. Die nicht mehr
  verwendete Serifenschrift wird beim Start nicht zusätzlich geladen.
- Einstellungen mit sichtbarer Rücknavigation, klareren Beschreibungen und
  serifenlosem Titel. Sichtbarkeit ohne Versalien und fremden grünen Akzent.
- Ortsliste mit bildfüllenden, ruhigeren Karten, kleinerem Namen, bestehender
  MoodSignature statt „0 Moods“, lesbarer Adresse und vorhandenem Öffnungsstatus.
  Filter-, Such-, Reihenfolge- und Kartenlogik unverändert.
- Momente verwenden denselben Kopfbereich beim Laden, ohne Inhalte und mit
  Beiträgen. Die bisherige zweite Header-Variante und ihre Styles entfallen.
  Fototext erhält einen stärkeren unteren Verlauf. Paging und Aktionen bleiben.
- Ladehinweise als ruhige, rahmenlose Hinweise. Fehler-, Leer-, Offline- und
  Zugriffs-Zustände behalten ihre eigenen Aussagen und Wiederherstellungsaktionen.
- „Deine Entdeckungen“, „Eindruck festhalten“, „Datenschutz“ und „Ort
  vorschlagen“ ersetzen technische bzw. uneinheitliche Oberflächenbegriffe.
  Lange Überschriften erhalten Platz statt mitten im Wort umzubrechen.
- Fotoangaben in Besuchersprache, Event-Leerzustand ohne internen
  Bestätigungsbegriff. Kein Fotoersatz durch erfundene Ortsaufnahmen.
- Statische native Styles und Web-Styles nutzen dieselben semantischen
  Farbtokens. Web-CSS-Variablen folgen der Systemdarstellung; native dynamische
  Farben und die bewusst dunkle iOS-Runtime 1.1.0 bleiben erhalten.
- Kontraste von Datenschutz-/Sicherheitsseiten, Eingaben, Zurück-Pfeilen und
  Aktionen verbessert. Rohinhalte von Sicherheitsmitteilungen bleiben erhalten;
  bekannte CTA-Beschriftung und Datum werden für die Oberfläche formatiert.
- Wohin-Datenschutzlink führt zum Datenschutzbereich. Die Fehleransicht des
  Legal-Gates erhält Safe Area und den gemeinsamen Bildschirmrahmen; dieselbe
  fehlgeschlagene Prüfung blockiert den geschützten Inhalt weiterhin.

Prüfung: Mobile-Typecheck, Mobile-Verträge, Map/Discovery und Lint bestanden;
Lint meldet zwei bestehende Hook-Warnungen in WeatherContext/SpotEventsSection.
Die bisherige vollständige Produkt-Browserprüfung bestand. Neue Regressionen
prüfen zusätzlich Farbdarstellung bei 320/430 Punkten, ganze Titelwörter,
einen stabilen Momente-Kopf und Legal-Fehler mit gesperrtem Inhalt/Retry.
Der neue Datumstext wurde im tatsächlichen Hermes-Runner ausgeführt.

Gerätegrenzen: Die iPhone-Synchronisierung unterstützt die Kamera nicht und
verwendet die Mac-Tastatur. Aufnahme und Software-Tastatur sind damit nicht
vollständig prüfbar. Der isolierte native Simulator startet am Login; die
native Tastaturprüfung des ausgelieferten Stands bleibt Teil des Nachtests.
Eine Prüfung aller seltenen Moderations-/Accountzustände erfolgt mit Fixtures,
nicht durch echte Kontoeingriffe.

Status: lokaler, noch unveröffentlichter Release-Kandidat. Kein allgemeines
Beta-Sicherheitsurteil und keine Behauptung, jede denkbare Gerätekonfiguration
bereits geprüft zu haben.


### Veröffentlichungsbeleg: gemeinsames App-UI und Wohin

Am 19. November 2026 auf dem bestehenden Production-Kanal für beide iPhone-
Runtimes veröffentlicht. Quelle: Main `c756914a6bae22abbd097cd9e58ad0c458205f40`,
[PR #767](https://github.com/PhiluLan/backyrd/pull/767). Alle erforderlichen
PR-Gates einschliesslich Risk-based merge gate bestanden. Separate exakte
Main-Zertifizierungen für `IOS_OTA`: [1.1.1](https://github.com/PhiluLan/backyrd/actions/runs/44576084530)
und [1.1.0](https://github.com/PhiluLan/backyrd/actions/runs/44576172268), beide erfolgreich.
Keine lokalen Bundle-Neubauten zur Veröffentlichung; `--skip-bundler` verwendet.

Runtime **1.1.1**:

- Update: `01a1f4d9-bf17-7941-9e8d-db46da9dcd9e`
- Gruppe: `c4839fd3-9329-4d42-bb6d-0e51a29ecef9`
- Manifest SHA-256: `bd44fd63afcf690795fe7f6cfa4ad30e897fce6edf92d0a07302b10f6ccdb8ce`
- Tatsächlich ausgeliefertes Bundle SHA-256: `c229a03ec411a47c697b09b4cbd222bebbe062c677a2c51511fa4cb2e576c13a`
- Vorherige Gruppe als Rückfallpunkt: `0572a63c-1baf-4c4a-81cf-cf5e52d445bf`

Runtime **1.1.0**:

- Update: `01a1f4da-a8ed-7ca8-8243-3230c2788e00`
- Gruppe: `a108f329-592c-4e55-9a85-7e940579d635`
- Manifest SHA-256: `928194aa46996ee6282f0337b7666b3ecbd4770acd7d8c1f0d079e5b05e4d88a`
- Tatsächlich ausgeliefertes Bundle SHA-256: `0c17e553874b2b956eae8fd56333f1cd9838c811d5621efd87c6ba8b828c8d53`
- Vorherige Gruppe als Rückfallpunkt: `25d8d1d0-a5a9-49a8-8f5b-60c6c1e4f78a`

Nach Veröffentlichung wurde je Runtime die aktuelle Production-Manifest-ID,
Runtime, Production-Konfiguration, deklarierte Launch-Asset-Prüfsumme und die
SHA-256-Prüfsumme der tatsächlich heruntergeladenen CDN-Bytes mit dem
zertifizierten Artefakt verglichen. Beide Prüfungen bestanden.

Die ergänzten UI-Regressionen bestanden in der CI auch als Teil der vollständigen
Produktprüfung: schmale/breite Seiten in Hell/Dunkel, ganze Titelwörter,
ein stabiler Feed-Kopf sowie Legal-Fehler ohne zugänglichen geschützten Inhalt
und erfolgreicher Wiederherstellung. Native Kamera und Software-Tastatur sind
keine durch die Browserprüfung belegten Fähigkeiten.

**Geräte-Nachtest, 19. November 2026:** Die interne Release-Diagnose auf dem
angeschlossenen iPhone bestätigt Runtime `1.1.1`, Kanal `production`, Startquelle
OTA und exakt Update `01a1f4d9-bf17-7941-9e8d-db46da9dcd9e`; Emergency Launch
ist `NEIN`. Die grossen Ergebnisbilder, der gemeinsame Gesprächskopf und das
durchgängige Eingabefeld sind damit auch im installierten Release nachgewiesen.

Live geprüft: neuer Getränkewunsch, Ergänzung im selben Verlauf, Wechsel ins
Volta-Bräu-Profil und Rückkehr, neuer Familienwunsch mit vierjährigem Kind und
Indoor-Wunsch sowie `xyz haha asdfasdfasdf`. Bei den ersten beiden per
Mac-Tastatur automatisierten Eingaben wurden Zeichen vertauscht; diese belegen
den UI-Verlauf, nicht die exakte semantische Eingabe. Getrenntes Fokussieren und
anschliessendes Tippen lieferte danach den Familien- und Unsinn-Wunsch korrekt.
Die Auswahl bzw. Relevanz der Orte wurde nicht bewertet. Der Familienwunsch
zeigte einmal den ehrlichen Fehlerzustand; derselbe Wunsch gelang nach dem
angebotenen erneuten Versuch. Die Unsinn-Eingabe zeigte eine verständliche
Bitte um Präzisierung. Home, Profil und die neuen Einstellungen wurden erneut
visuell kontrolliert. Es wurden keine Momente, Kommentare oder Meldungen
veröffentlicht; normale Entscheidungs- und Ansichtsereignisse können entstehen.

**Gerätefund:** Bei einem längeren Wunsch scrollte das native Eingabefeld zu
früh intern. Die Korrektur in [PR #769](https://github.com/PhiluLan/backyrd/pull/769)
wurde nach erneuter Mac-Entsperrung mit der echten iOS-Software-Tastatur geprüft;
Details folgen im Nachtrag. Die visuelle Founder-Abnahme bleibt davon getrennt.
Dies ist keine vollständige Beta- oder Sicherheitsabnahme.


### Native Wohin-Eingabe: gezielter Nachtrag

Arbeitsklasse `PRODUCT_RELEASE`; betroffene Implementierung nur
`mobile/app/(tabs)/wohin.tsx`, dazu der bestehende kanonische Browser-Test.
Die native Zeilenbegrenzung wird entfernt. Statt der Scrollhöhe eines bereits
bemessenen Eingabefelds misst ein für Bedienung und Screenreader ausgeblendeter
Text denselben Inhalt mit derselben Schrift und Breite. Dadurch kann die Höhe
zwischen 44 und 120 Punkten wachsen und wieder schrumpfen. Erst an der Grenze
scrollt das Eingabefeld intern; dasselbe Feld bleibt durch alle Zustände bestehen.
Keine Änderungen an Requests, Interpretation, Ranking oder Serverantworten.

Lokale Validierung des Kandidaten: Typprüfung, gezielter Lint ohne Fehler,
betroffene Mobile-Produktverträge und vollständige kanonische App-Journey gegen
den exportierten tatsächlichen App-Code bestanden. Die Journey prüft zusätzlich
mehrzeiliges Wachsen, die Höhenbegrenzung sowie Rückkehr auf 44 Punkte nach
Kürzen und Leeren. Alle Antworten sind synthetisch, ohne Produktionsaktionen.
Nach erneuter Mac-Entsperrung bestand der native Nachtest auf dem iPhone-16e-
Simulator mit iOS 18.3: ein vierzeiliger Wunsch vollständig lesbar über der
Software-Tastatur, zusätzliche Zeile mit begrenzter Höhe und sichtbarem Cursor,
Kürzen und vollständiges Leeren zurück auf kompakte Höhe, direktes Tippen über
die Bildschirmtasten, Absenden, zehn Sekunden synthetischer Wartezustand,
Ergebnisdarstellung und mehrzeilige Ergänzung im selben Verlauf. Kopf und
Senden-Button bleiben erreichbar; die Tab-Navigation ist bei offener Tastatur
ausgeblendet. Hellmodus, Ergebnisdarstellung und erneutes Öffnen der Tastatur
wurden ebenfalls nativ visuell geprüft.

Der Native-Test nutzte den exakt gleichen Wohin-Dateiinhalt wie der PR
(SHA-256 `cc5440776b5bdcc65b740083d40544e3afe6f1e698a4fc04d7fe19f81a781e9d`). Nur im temporären,
nicht veröffentlichten Testverzeichnis simuliert ein vorgeschalteter Transport
die reservierte Adresse `https://example.invalid` über den lokalen Fixture-
Server. Die bestehende HTTPS-Konfigurationsprüfung und SecureStore bleiben
unverändert. Der lokale Simulator-Client wurde regulär mit Simulator-
Entitlements signiert; fehlende Entitlements des ersten unsignierten
Test-Builds wurden nicht durch einen Auth- oder Speicher-Bypass umgangen.
Keine echten Zugangsdaten oder Produktionsverbindungen im Simulator-Test.

Die erforderlichen CI-Gates für den Implementierungsstand `7f864df0` bestanden:
[Risk Gate](https://github.com/PhiluLan/backyrd/actions/runs/44608289690).
Dieser Nachtrag ist noch kein Veröffentlichungsbeleg; die neue Main-
Zertifizierung und der OTA-Nachweis werden separat festgehalten.


### Veröffentlichungsbeleg: native Wohin-Eingabe

Am 19. November 2026 für beide unterstützten iPhone-Runtimes auf dem bestehenden
Production-Kanal veröffentlicht. Quelle: Main `5d8f45072aced952fc39670ba82f98f7e6a09546`,
[PR #769](https://github.com/PhiluLan/backyrd/pull/769). Alle erforderlichen
Merge-Gates erfolgreich, einschliesslich des finalen dokumentierten
[PR-Stands](https://github.com/PhiluLan/backyrd/actions/runs/44610850964).
Separate exakte `POST_MERGE_MAIN` / `IOS_OTA`-Zertifizierungen:
[1.1.1](https://github.com/PhiluLan/backyrd/actions/runs/44612126628) und
[1.1.0](https://github.com/PhiluLan/backyrd/actions/runs/44612126613), beide erfolgreich.
Die über die GitHub-Anbindung heruntergeladenen ZIP-Dateien stimmten mit den
GitHub-Archivprüfsummen überein. Veröffentlichung ausschliesslich aus diesen
zertifizierten Artefakten mit `--skip-bundler`; kein lokaler Bundle-Neubau.
Die öffentlichen Clientwerte in EAS und CI stimmten vor Veröffentlichung überein.

Runtime **1.1.1**:

- Update: `01a1f599-8408-7ee1-a4e8-b1e1e6f1d5fb`
- Gruppe: `1c380cf2-6320-42a8-928a-e1f1b1f8acc4`
- Manifest SHA-256: `dd1016f529eed60267327cd8f4c7a8f63a3249f87c7dd94b37c696428435fccf`
- Ausgeliefertes Bundle SHA-256: `a0d7454c531eeffa2e537c0556e82561323aae1f59c2c21b6a9a3f03bd57ddd1`
- Vorherige Gruppe als Rückfallpunkt: `c4839fd3-9329-4d42-bb6d-0e51a29ecef9`

Runtime **1.1.0**:

- Update: `01a1f59a-ddd9-75ce-83a6-d90cd1e68b10`
- Gruppe: `f4fa05c4-1200-456f-845c-664958e10bba`
- Manifest SHA-256: `956f9f00e9f45636f6b09137a147a4bbe24504c249afd01d35a4b2dc69337121`
- Ausgeliefertes Bundle SHA-256: `c4044cd5c338960308077a1e99708f5d3297eb9417f9b036b668b6c637bbae0e`
- Vorherige Gruppe als Rückfallpunkt: `a108f329-592c-4e55-9a85-7e940579d635`

Nach beiden Veröffentlichungen wurden die Production-Manifeste beider Runtimes
und die tatsächlichen CDN-Bundle-Bytes erneut gegen die jeweiligen zertifizierten
Artefakte geprüft. Beide Prüfungen bestanden; die Updates bestehen gleichzeitig
auf demselben Kanal für ihre jeweilige Runtime. Keine Backend- oder
Datenbankveröffentlichung, keine Änderung der Entscheidungslogik.

Die native Abnahme des exakt gleichen Wohin-Quellcodes ist oben dokumentiert.
Die Aktivierung dieses letzten OTA auf dem physischen iPhone wurde nach der
Veröffentlichung nicht erneut beobachtet. Beim nächsten vollständigen App-Start
wird gemäss bestehendem `ON_LOAD`-Verhalten nach Updates gesucht; ein geladener
Stand wird beim anschliessenden Start aktiv. Die visuelle Founder-Abnahme bleibt
ein eigener Schritt.

### Wohin: persönlicher Einstieg und lokaler Anfragenverlauf

Task-Klasse **PRODUCT_RELEASE**. Betroffen sind ausschliesslich die mobile
Wohin-Oberfläche, der bestehende lokale Letzte-Suche-Speicher und dessen Tests.
Ranking, Interpretation, Decision-Anfragen und Backend-Verträge bleiben gleich.

Der Einstieg begrüsst nach Tageszeit und vorhandenem Profilnamen. NukNuk ist
bereits hier präsent; drei konkrete Beispiele werden zum Bearbeiten übernommen.
„Zuletzt mit NukNuk“ zeigt bis zu fünf Anfragen, „Verlauf“ die letzten 20
unterschiedlichen Anfragen innerhalb von 30 Tagen. Wiederaufnahme füllt nur das
bestehende Eingabefeld. Eine neue Suche erfordert ausdrücklich Senden; alte
Ergebnisse werden nicht als aktuell wiederhergestellt. Auch fehlgeschlagene
Anfragen und Rückfragen bleiben wiederauffindbar.

Der Verlauf bleibt gerätegebunden: auf iOS in verschlüsseltem SecureStore,
im Web weiterhin nur im aktuellen Tab. Keine neue Cloud-Speicherung, Telemetrie
oder Verwendung für KI-Lernen. Abmelden und Kontowechsel entfernen den lokalen
Verlauf. Einzelnes Löschen und Leeren erfordern eine ausdrückliche Bestätigung;
Fehler bleiben sichtbar und wiederholbar. Die bestehende Home-Rail verwendet
weiterhin die letzte erfolgreich beantwortete Anfrage und deren Spotreihenfolge.

Der bisherige v1-Schlüssel bleibt atomarer Commit-Zeiger für begrenzte v2-
Speicherstücke. Dadurch entfernt auch das Abmelden in einer alten OTA-Version
den lesbaren Zeiger; ein neuer Client kann den Verlauf danach nicht wieder
aufleben lassen. Jedes native Speicherstück bleibt unter der SecureStore-
Grössengrenze. Geschriebene Revisionen werden erst nach vollständig gespeicherten
Stücken sichtbar. Konto-/Logout-Rennen und Speicherfehler sind getestet.

Validierung am 19. November 2026: bestehender Product-Browserdurchlauf erfolgreich,
einschliesslich fehlgeschlagener/unklarer Anfragen, Wiederaufnahme ohne Absenden,
Einzellöschung, Abbrechen, vollständigem Leeren und Neuladen. Speicher-Vertragstests
prüfen Migration, Unicode, 20er-Grenze, persistente Ablaufentfernung nach 30 Tagen,
Schreibfehler/Retry, Home-Kompatibilität und Kontowechsel. Browser-Sichtprüfung bei
320/390/430 Pixeln in Light und Dark ohne horizontalen Überlauf.

Native Sichtprüfung im regulär signierten iPhone-16e-Simulator mit identischem
Wohin-, Verlauf- und Speicherquellcode: Light/Dark, Begrüssung, Beispielübernahme,
mehrzeilige Softwaretastatur, zwei Anfragen, Wiederaufnahme ohne automatische
Tastatur/Absenden, Löschabfrage mit Abbrechen und Erhalt beider Anfragen nach
vollständigem JS-Neuladen über echten SecureStore. Nur synthetische Daten am
lokalen Fixture-Transport; keine Produktionsverbindung und kein Auth- oder
Speicher-Bypass. Der Test-Harness ist temporär und wird nicht veröffentlicht.

Dieser Eintrag dokumentiert Umsetzung und Prüfung; ein OTA-Veröffentlichungsbeleg
folgt separat nach erfolgreicher Main-Zertifizierung.


### Veröffentlichungsbeleg: Wohin-Begrüssung und Anfragenverlauf

Am 19. November 2026 für beide unterstützten iPhone-Runtimes auf Production
veröffentlicht. Quelle: Main `b8c9f47148d21d448a53b4c77a39bf19e9b644da`,
[PR #771](https://github.com/PhiluLan/backyrd/pull/771). Sämtliche erforderlichen
[PR-Gates](https://github.com/PhiluLan/backyrd/actions/runs/44624272039) erfolgreich.
Der gemeinsame KI-Datenschutzhinweis bleibt identisch zur öffentlichen Fassung;
der lokale Verlauf wird in einem separaten Abschnitt erklärt. Der zunächst
gefundene Konsistenzfehler wurde an dieser Ursache behoben; danach bestanden
auch die vollständigen mobilen Vertragstests.

Exakte Main-Zertifizierungen mit Ziel `IOS_OTA`:
[1.1.1](https://github.com/PhiluLan/backyrd/actions/runs/44625446233) und
[1.1.0](https://github.com/PhiluLan/backyrd/actions/runs/44625446636), beide erfolgreich.
Die über die GitHub-Anbindung heruntergeladenen Archive stimmten mit den
GitHub-Archivprüfsummen überein. Upload mit `--skip-bundler` ausschliesslich aus
diesen zertifizierten Artefakten. Öffentliche EAS- und CI-Clientkonfiguration
vorab abgeglichen. Keine Backend-, Schema- oder Decision-Logik-Veröffentlichung.

Runtime **1.1.1**:

- Update: `01a1f5e0-364c-73ac-acb6-6e86a0aeac9e`
- Gruppe: `7af9ba28-c53f-4d2f-a221-06e097d001cf`
- Manifest SHA-256: `62632115edf78d7cb1c9ee9869f5fa9355f7a311454d2b1f98ada5e0f97d48ea`
- Ausgeliefertes Bundle SHA-256: `95e3b2cae6af65b3bae6aded9ae280271ed06ff835981da56cb2bf0b34cd0006`
- Vorherige Gruppe als Rückfallpunkt: `1c380cf2-6320-42a8-928a-e1f1b1f8acc4`

Runtime **1.1.0**:

- Update: `01a1f5e1-5eb8-7543-90e4-fecc7e4c5357`
- Gruppe: `6568a1d0-ba2d-4b9e-8eac-73c80c7e38e0`
- Manifest SHA-256: `ec26d5754f97c3edae4c532538045f24e878f8eca57d866bf2c64b87efd3c1fd`
- Ausgeliefertes Bundle SHA-256: `f515a62771bc489f19c1239dcdce7670a011814740a96cb754bef63b7fb8f07e`
- Vorherige Gruppe als Rückfallpunkt: `f4fa05c4-1200-456f-845c-664958e10bba`

Nach beiden Uploads wurden beide Production-Manifeste und die tatsächlichen
CDN-Bundle-Bytes erneut gegen die jeweiligen zertifizierten Artefakte geprüft.
Beide Updates werden gleichzeitig für ihre jeweilige Runtime ausgeliefert.
Die native Funktions-/Sichtprüfung ist oben dokumentiert; die Aktivierung des
veröffentlichten OTA auf dem physischen iPhone wurde danach nicht beobachtet.
Gemäss bestehendem ON_LOAD-Verhalten wird beim vollständigen Start nachgeladen
und beim anschliessenden Start aktiviert. Die visuelle Founder-Abnahme bleibt
ein eigener Schritt.

### Wohin: KI-Hinweis ausblenden; natürliche Charakteranimation beauftragt

Auf ausdrücklichen Founder-Wunsch entfällt das KI-Info-Symbol samt zusätzlichem
Hinweisdialog in Wohin vollständig. Der inzwischen unzugängliche Dialog, sein
State und der doppelte Hinweistext werden entfernt. Die zugehörige Prüfung
auf identische doppelte Texte entfällt damit; der bestehende Product-Browsertest
prüft stattdessen, dass Wohin keinen KI-Info-Button anbietet. Datenschutzbereiche,
öffentliche Rechtsinformationen, Einwilligungen und die Freigaben vor einer
Decision bleiben unverändert. Keine Backend- oder Rankingänderung.

Separat wurde der vom Founder benannte Animations-Dev im Thread
`01a1d1ab-ed6e-7720-a77e-b3d900e57c25` direkt beauftragt. Die aktuelle Wiedergabe
schaltet wenige Ganzkörperbilder als Blinzler; die Bilder variieren aber auch
Konturen und Körperdetails. Ziel ist eine kohärente, bodengebundene Figur:
kurze Begrüssung, dezentes Atmen/Blinzeln mit Ruhephasen, kleines bestätigendes
Nicken beim Absenden und sanfte Zustandsübergänge. Identität und Kleidung bleiben
erhalten. Keine schwebende/skalierende PNG-Schleife und kein Identitäts-Morphing.
Gefordert sind eine getestete Light-/Dark-Vorschau im 156-dp-Wohin-Kontext,
Reduced-Motion-Fallback, Quellen/Runtime-Assets, Trigger und klare technische
Kompatibilität. Die neue Animation ist mit diesem Eintrag nur beauftragt,
noch nicht abgenommen oder veröffentlicht.


### Veröffentlichungsbeleg: Wohin ohne KI-Infodialog

Am 19. November 2026 auf Production für beide iOS-Runtimes veröffentlicht.
Quelle Main `1a1ed466add8b4dde41b9d971edbb33e2ff51bb4`,
[PR #773](https://github.com/PhiluLan/backyrd/pull/773), sämtliche erforderlichen
[PR-Gates erfolgreich](https://github.com/PhiluLan/backyrd/actions/runs/44630828441).
Exakte Main- / IOS_OTA-Zertifizierungen erfolgreich:
[1.1.1](https://github.com/PhiluLan/backyrd/actions/runs/44631795608),
[1.1.0](https://github.com/PhiluLan/backyrd/actions/runs/44631795708).
GitHub-Archivprüfsummen und öffentliche EAS-/CI-Konfiguration abgeglichen;
Upload ausschliesslich aus den zertifizierten Artefakten mit `--skip-bundler`.

Runtime **1.1.1**:

- Update: `01a1f604-c619-7b3c-8e15-135137aef9e8`
- Gruppe: `a5fe774b-4c5c-4496-91a4-ba0426be183b`
- Manifest SHA-256: `1af65944d7ca9a0c06a39b0729bc359997f733e2f6676a0c66e9835caf822ff1`
- Ausgeliefertes Bundle SHA-256: `ee4e5b28895a050cd82bd82a59240452abf0b8cb9a9082b81fe3a66ef59415e7`
- Vorherige Gruppe als Rückfallpunkt: `7af9ba28-c53f-4d2f-a221-06e097d001cf`

Runtime **1.1.0**:

- Update: `01a1f605-afcd-75d5-bce6-1c8d33e8a6b5`
- Gruppe: `34eef31e-eab3-459c-a5be-905692a627fc`
- Manifest SHA-256: `b97fde5a81d5cdff79780c84a9bc17f047f05a728591438cf5aeeaf0f76e90fe`
- Ausgeliefertes Bundle SHA-256: `4331e5ffe01768f209b2404d3c06ba50c613e7a836d3e17375b3cb5f7d787f76`
- Vorherige Gruppe als Rückfallpunkt: `6568a1d0-ba2d-4b9e-8eac-73c80c7e38e0`

Nach beiden Uploads beide Production-Manifeste und tatsächliche CDN-Bundle-Bytes
gegen die zertifizierten Artefakte geprüft: erfolgreich, beide Runtimes parallel
verfügbar. Physische OTA-Aktivierung auf dem Founder-iPhone danach nicht beobachtet.
Die grafische NukNuk-Animation wurde mit diesem OTA nicht verändert.

Der Animations-Dev hat inzwischen eine isolierte erste Layer-Rig-Vorschau mit
22-Sekunden-Ablauf, Light/Dark, Zeitlupe und statischem Fallback geliefert.
Die Vorschau ist noch keine native Integration oder visuelle Founder-Abnahme;
native Performance-/Batterieprüfung bleibt vor einer Integration erforderlich.

### NukNuk: freigegebenes Originalgesicht nativ integriert

Taskklasse `PRODUCT_RELEASE`; Scope: `NuknukAvatar`, reine Motion-Steuerung,
Wohin-Präsentation, freigegebene Raster-Layer und zugehörige Lifecycle-Tests.
Keine Änderungen an Decision-Anfragen, Interpretation, Eignung, Ranking,
Einwilligungen oder Backend. Keine neuen Abhängigkeiten.

Die am 20. November isoliert abgenommene v3-Vorschau ersetzt den bisherigen
Ganzkörper-Bildstreifen. Zehn bereinigte Original-Layer werden auf einer
520×800-Bühne zusammengesetzt. Gesicht, Nase, ursprüngliches Lächeln, Haare,
Kleidung und Proportionen bleiben erhalten; keine künstlichen Mund-/Iris-Patches.
Füsse und Becken bleiben fest. Kopf, Schultern und Ellbogen reagieren sparsam;
Atmung läuft über 5,8 Sekunden, Blinzeln mit 55/65/95 ms und zufälligen Pausen.
Interpolation erfolgt nativ durch das bereits vorhandene Reanimated.

Wohin hält eine einzelne illustrierte Präsenz über Einstieg, echte laufende
Anfrage, Rückfrage und sichtbare Vorschläge. Die Hero-Gesamtkörperhöhe bleibt
156 dp. Für die neu ergänzte Gesprächspräsenz sind bewusst die isoliert geprüften
66 dp gewählt; die vorhandenen Outline-Marken in Header/Startseite bleiben.
Containerposition und Grösse gehen über 420 ms ineinander über. Begrüssung ist
pro angemeldetem App-Prozess gated, Nicken folgt dem lokalen Request-Start,
Orientierung dem echten Pending-Zustand und die Ergebnisgeste echten Vorschlägen.
Keine erfundenen Fortschrittsstufen oder Aussagen über verstandene Präferenzen.

App-Hintergrund, Tab-Fokusverlust, Scrollen aus dem sichtbaren Bereich und offene
Sheets stoppen die Figur unabhängig. Reduced Motion setzt die exakte Ruhepose
mit offenen Augen. Pausen invalidieren Timer; bei Rückkehr werden alte Begrüssungs-
oder Ergebnisgesten nicht nachgespielt. Entsorgung stoppt Timer und UI-Animationen.

Validierung: gezielte TypeScript-/Lint-Prüfung und Mobile-Contracts erfolgreich.
Fünf Motion-Tests prüfen echte Scheduler-Ausführung, unterbrochene Gesten,
18-Sekunden-Pausen, Reduced Motion und Entsorgung. Der Founder hat ausdrücklich
angewiesen, direkt per OTA zu veröffentlichen und die native Sichtprüfung selbst
zu übernehmen. Deshalb keine behauptete native Sicht-, Frame-Pacing-, Batterie-
oder Android-Abnahme; diese bleibt offen für die Geräteprüfung. Dies ersetzt die
frühere Forderung, diese Sichtprüfung vor der Integration abzuschliessen.

### Veröffentlichungsbeleg: native NukNuk-Layeranimation

Am 20. November 2026 auf Production für beide iOS-Runtimes veröffentlicht.
Quelle Main `fdba822a1e01f866a8279d79fb9e9075766439af`,
[PR #775](https://github.com/PhiluLan/backyrd/pull/775),
[alle erforderlichen PR-Gates erfolgreich](https://github.com/PhiluLan/backyrd/actions/runs/44701825881).
Exakte Main-/IOS_OTA-Zertifizierungen erfolgreich:
[1.1.1](https://github.com/PhiluLan/backyrd/actions/runs/44702803117),
[1.1.0](https://github.com/PhiluLan/backyrd/actions/runs/44702807372).
ZIP-Prüfsummen gegen GitHub abgeglichen; öffentliche EAS-/CI-Konfiguration
identisch; Upload ausschliesslich aus den versiegelten Artefakten mit
`--skip-bundler`, ohne lokalen Neubuild.

Runtime **1.1.1**:

- Update: `01a1f819-e842-7f54-baaf-5fab8df52590`
- Gruppe: `6d6816c6-e329-4645-903c-b20958bec0f5`
- Manifest SHA-256: `79a7d19823f8761d716bceeb783a8e7a36c3c4721a9a98a948c638f036fc3a8a`
- Ausgeliefertes Bundle SHA-256: `bbff9cce832103f7b5db182fbb3e6d592d601c33b24f04eecec115449e09aa6b`
- Vorherige Gruppe als Rückfallpunkt: `a5fe774b-4c5c-4496-91a4-ba0426be183b`

Runtime **1.1.0**:

- Update: `01a1f818-a332-794b-9327-f6920a632c66`
- Gruppe: `dbc3b030-d33a-4b77-b83a-d3431e82bc80`
- Manifest SHA-256: `f90c16a22e33d254869ccac26febfd3769b8953367d0e0706eb61938d06ba207`
- Ausgeliefertes Bundle SHA-256: `2f848730afa4b6d3f71e46fe524257b3c24b65aa2d37bd6a0adbb417e93b82a8`
- Vorherige Gruppe als Rückfallpunkt: `34eef31e-eab3-459c-a5be-905692a627fc`

Nach beiden Uploads beide Production-Manifeste und die tatsächlichen
CDN-Bundle-Bytes erneut geprüft: erfolgreich, beide Runtimes parallel verfügbar.
Keine Backend-, Datenbank- oder Decision-Aktivierung. Native Sicht-/Bewegungs-
und Performance-Abnahme auf dem physischen iPhone übernimmt wie ausdrücklich
gewünscht der Founder; eine bereits beobachtete OTA-Aktivierung auf seinem
Gerät wird nicht behauptet.

### Beta: NukNuk-Grafik vorerst ausgeblendet

Founder-Entscheidung vom 21. November: Darstellung und Bewegung der Figur sind
für die Beta noch nicht überzeugend. Die illustrierte Figur und die kleinen
Gesichtssymbole werden deshalb über den zentralen Präsentationsschalter
`backyrdTheme.nuknuk.showCharacter = false` ausgeblendet. Komponente, Original-
Layer, Motion-Steuerung und Lifecycle-Tests bleiben unverändert erhalten und
können nach einer späteren gestalterischen Abnahme wieder aktiviert werden.
Die Figur wird nicht gemountet; es laufen keine Charakteranimationen im Hintergrund.

Wohin nutzt die volle Textbreite für die persönliche Begrüssung. Figurenspalte,
Glow, feste Hero-Mindesthöhe und die reservierten Einzüge/Mindesthöhen neben
Gespräch, Ladezustand, Rückfragen, Fehlern und Ergebnissen entfallen. Die
Einstiegssektionen erhalten 32 dp Abstand. Der Header beginnt direkt mit Wohin;
der Startseiten-Profilbutton bleibt mit einem schlichten Profilsymbol bedienbar.
NukNuk als Name und Gesprächspartner, Anfrageverlauf, Wartehinweise, Composer und
sämtliche Decision-/Sicherheits-/Einwilligungslogik bleiben unverändert.

Taskklasse `PRODUCT_RELEASE`; ausschliesslich Mobile-Präsentation, bestehende
Browser-Regression und dieser Arbeitsbucheintrag. Keine neuen Abhängigkeiten,
API-, Schema-, Backend- oder Rankingänderungen. Native visuelle Founder-Abnahme
folgt über OTA; keine behauptete native Bewegungs- oder Performance-Abnahme.

### Veröffentlichungsbeleg: Beta ohne NukNuk-Grafik

Am 21. November 2026 auf Production für beide iOS-Runtimes veröffentlicht.
Quelle Main `a27bc85d8b4d71a01cf0741d0868b8d25d96f8b8`,
[PR #777](https://github.com/PhiluLan/backyrd/pull/777),
[alle erforderlichen PR-Gates erfolgreich](https://github.com/PhiluLan/backyrd/actions/runs/44845370406).
Exakte Main-/IOS_OTA-Zertifizierungen erfolgreich:
[1.1.1](https://github.com/PhiluLan/backyrd/actions/runs/44846187459),
[1.1.0](https://github.com/PhiluLan/backyrd/actions/runs/44846189903).
GitHub-ZIP-Prüfsummen und öffentliche EAS-/CI-Konfiguration abgeglichen.
Upload ausschliesslich aus den zertifizierten Artefakten mit `--skip-bundler`.

Runtime **1.1.1**:

- Update: `01a1fb9a-4ba4-7254-b513-c69ea9f0f1d1`
- Gruppe: `8991539a-71cc-47e7-ab65-f13284c93578`
- Manifest SHA-256: `3b3fe83982088448d428a0165b12db411be2cf5c0b2a9950f79fe2bfff71fd6a`
- Ausgeliefertes Bundle SHA-256: `fe445b60af20bb8e9024a6ea9e018daabaf66d308c1dfbcc56543dcbbf88c1b4`
- Vorherige Gruppe als Rückfallpunkt: `6d6816c6-e329-4645-903c-b20958bec0f5`

Runtime **1.1.0**:

- Update: `01a1fb99-083c-7c40-aa65-f486a89331e9`
- Gruppe: `199f5e56-fb2b-42c7-a9ef-5bdd0e7fcf2a`
- Manifest SHA-256: `d8f23036268872a12404ed9439323849dc27ff8802002c672e6e01b59b4a9e98`
- Ausgeliefertes Bundle SHA-256: `7664618fb544d50ca5349090779f28f7c7fcf07d10a401b71f45c2279d102d5e`
- Vorherige Gruppe als Rückfallpunkt: `dbc3b030-d33a-4b77-b83a-d3431e82bc80`

Nach beiden Uploads beide Production-Manifeste und tatsächliche CDN-Bundle-Bytes
erneut gegen die zertifizierten Artefakte geprüft: erfolgreich, beide Runtimes
parallel verfügbar. Lokaler Product-Browserablauf erfolgreich; Light-/Dark-
Vorschauen der neuen Begrüssung visuell geprüft. Native Aktivierung und visuelle
Founder-Abnahme auf dem physischen iPhone werden nicht behauptet. Die bisherigen
zehn Raster-Layer, Motion-Steuerung und Lifecycle-Tests sind gegenüber der
vorherigen Main-Version unverändert erhalten. Keine Backend-/Decision-Aktivierung.

### Wohin: Einladung mit mehr Persönlichkeit

Der Founder empfindet die Beta-Oberfläche weiterhin als steif und hat die
Richtung «mutig, urban und lässig» ausdrücklich gewählt. Der neue Einstieg setzt
auf «Zeit für was Gutes.» in grosser, enger Typografie, gezieltes Pink und einen
kräftigeren, statischen Farbverlauf. Eine kleine persönliche Begrüssung bleibt;
der grosse formelle Tageszeit-Gruss entfällt. Kurze Inspirationskarten lassen
sich horizontal entdecken. Sie zeigen eine Stimmung statt ausgeschriebener
Beispielfragen; Antippen füllt weiterhin nur den bearbeitbaren Entwurf.
Die vorhandenen Suchtexte, Tageszeit- und Stadtbindung bleiben unverändert.

NukNuk spricht in den UI-eigenen Warte-, Bearbeitungs- und Ergebnistexten direkter.
Es gibt keine simulierten Fortschrittsstufen, neue Interpretation oder erfundene
persönliche Gewissheit. Das bestehende Eingabefeld bleibt dieselbe Instanz über
Suche und Folgefragen; es bekommt einen klaren Fokusrahmen. Verlauf und Speicherung
bleiben erhalten. Auf dem Einstieg wird ein vollständig leerer Verlauf nicht als
zusätzlicher Inhaltsblock angezeigt; er bleibt über den Header erreichbar.
Die Figur bleibt für die Beta deaktiviert, die bestehende Motion-Arbeit erhalten.

Taskklasse `PRODUCT_RELEASE`; Scope: Mobile-Wohin-Präsentation, Warte-/Verlauf-UI,
bestehende Browser-Regression und Arbeitsbuch. Keine neuen Abhängigkeiten,
Backend-, Schema-, Auth-, Consent-, Ranking- oder Decision-Request-Änderungen.
Light-/Dark-Ansichten bei 390 px und die nach Layoutabschluss erfasste kleine
320-px-Ansicht visuell geprüft; kein horizontaler Seitenüberlauf. Native visuelle
Abnahme bleibt beim Founder über OTA; eine physische iPhone-Prüfung wird nicht
behauptet. Die bestehende Product-Regression prüft weiterhin echte Entwurfs-
übernahme, Gespräch, Speicherung, Fehlerfälle und unveränderte Request-Inhalte.

### Veröffentlichungsbeleg: Wohin als Einladung

Am 21. November 2026 auf Production für beide iOS-Runtimes veröffentlicht.
Quelle Main `5e363058870008484f41531a42e3ca2a48a4fa08`,
[PR #779](https://github.com/PhiluLan/backyrd/pull/779),
[alle erforderlichen PR-Gates erfolgreich](https://github.com/PhiluLan/backyrd/actions/runs/44849058216).
Exakte Main-/IOS_OTA-Zertifizierungen erfolgreich:
[1.1.1](https://github.com/PhiluLan/backyrd/actions/runs/44849741936),
[1.1.0](https://github.com/PhiluLan/backyrd/actions/runs/44849746348).
GitHub-ZIP-Prüfsummen und öffentliche EAS-/CI-Konfiguration abgeglichen.
Upload ausschliesslich aus versiegelten Artefakten mit `--skip-bundler`.

Runtime **1.1.1**:

- Update: `01a1fbb9-b05a-7e4d-86c0-8b5461a90d07`
- Gruppe: `b126f2fd-6ad1-450c-b5ab-2dafc52e013b`
- Manifest SHA-256: `da2cb7c723c2aae0875b715f60738b43a4dce0919bf884b3e12f1637a5445f6b`
- Ausgeliefertes Bundle SHA-256: `6f0060479204aa766245a36853ab39ba110fbd966857b9e94c183ca4d2cd0656`
- Vorherige Gruppe als Rückfallpunkt: `8991539a-71cc-47e7-ab65-f13284c93578`

Runtime **1.1.0**:

- Update: `01a1fbb9-1751-7609-b068-65564375e561`
- Gruppe: `5288fe86-d95f-4da2-ab93-29be784cb5f4`
- Manifest SHA-256: `0748cb4bbe78609c5afb4b77635fa4f3b66d4554f1b792a6860ab982c19a482c`
- Ausgeliefertes Bundle SHA-256: `65643ff027e3946191cfa5e1064b34ed97167dde87255f4be2c5e4c524b33501`
- Vorherige Gruppe als Rückfallpunkt: `199f5e56-fb2b-42c7-a9ef-5bdd0e7fcf2a`

Nach beiden Uploads beide Production-Manifeste und tatsächliche CDN-Bundle-Bytes
erneut geprüft: erfolgreich, beide Runtimes parallel verfügbar. Lokaler finaler
Product-Browserablauf erfolgreich, einschliesslich Gespräch, unveränderter
Request-Inhalte, persistenter Composer-Instanz und gelöschtem Verlauf nach Reload.
Light/Dark bei 390 px und die abgeschlossene 320-px-Darstellung visuell geprüft.
Die physische OTA-Aktivierung und visuelle Founder-Abnahme bleiben offen. Keine
Backend-/Decision-Aktivierung; die Figur bleibt für die Beta deaktiviert.

### Versteckte Consumer-Seiten: Konto, Datenschutz und Support

Der Founder hat die Hauptseiten vorerst akzeptiert und beauftragt nun die
Nebenwege auf dasselbe Backyrd-Niveau zu bringen. Taskklasse `PRODUCT_RELEASE`.
Scope ist die Mobile-Präsentation, keine neue Backend-/Decision-Funktion.

- Gemeinsamer Kopfbereich mit sicherer Zurücknavigation, vollbreiten Sans-serif-
  Überschriften, lesbaren Erklärungen und konsistentem Abstand für Einstellungen,
  Sichtbarkeit, Entdeckungsverlauf, Datenschutz, Freigaben, Entscheidungsverlauf,
  Dokumente, Datenrechte, Support, Mitteilungen, Meldungsdetails, Konto-Status,
  Personensuche, Nachrichten und Erfolge.
- Einstellungen bündeln bestehende Wege; Passwort-Hilfe, Mitteilungen und
  Konto-Status sind direkt erreichbar. Keine neuen Berechtigungen.
- Profilbearbeitung verwendet dauerhafte Feldnamen und Hilfen statt nur
  Platzhalter. Namen bleiben vollständig lesbar; ein fehlender Wohnort wird
  nicht als Basel ausgegeben. Avatar-Sofortspeicherung und Entwurfsverwerfen
  bleiben explizit. Im Browser funktioniert nun auch die Verwerfbestätigung;
  native Bestätigungen bleiben erhalten.
- Datenschutzschalter erhalten vollbreite Erklärungen und klare Zustände.
  Zeitangaben unterscheiden tatsächliche Freigabe und Widerruf. Rechtstexte
  werden konservativ als Überschriften, Absätze, Listen und Hervorhebungen
  dargestellt; HTTP(S)-Links zeigen ihr Ziel. Inhalt, Version, Hash und
  Annahmestatus werden weder zusammengefasst noch verändert.
- Fehler bei Profilinhalten, Erfolgen und Konto-Status werden nicht als leere
  oder gesunde Daten ausgegeben. Unbekannte Zähler zeigen einen Strich;
  Wiederholen lädt den Zustand neu. Interne Safety-Enums erhalten neutrale
  deutsche Anzeigenamen, ohne Moderationsentscheidungen zu verändern.

Vorhandene RPCs, Eigentümerprüfung, RLS, verpflichtende Dokumentannahme,
optionale Consent-Zwecke, Betriebssystemfreigaben, private Profilbestätigung,
Entfolgen-Warnung, Entsperren, Einspruch und Datenlöschfristen bleiben erhalten.
Keine Migration, Provider-, Abhängigkeits-, Ranking- oder Backend-Aktivierung.
Home, Spotprofil, Wohin und die ausgeblendete NukNuk-Figur bleiben unangetastet.

Validierung: TypeScript, Mobile-Lint (keine Fehler; zwei bestehende Warnungen
in WeatherContext und SpotEventsSection) und Mobile-Vertragstests. Die erweiterte
Product-Browserregression nutzt ausschliesslich abgefangene synthetische Daten:
14 Nebenwege bei 320/430 px in Light/Dark, Überschriftenkontrast und Überlauf,
beschriftete Profilfelder, Entwurf behalten/verwerfen, Rechtstextdarstellung
sowie fünf Ladefehler mit Wiederholen. Keine echten Einwilligungs-, Lösch-,
Entsperr- oder Moderationsaktionen für Testzwecke. Visuelle Browserprüfung der
Einstellungen, Sichtbarkeit, Freigaben, Datenrechte und Profilbearbeitung.
Physische iPhone-/Tastatur- und VoiceOver-Abnahme werden nicht behauptet und
bleiben bei der Founder-Abnahme über OTA. Dies ist keine RLS-/Sicherheitsrevision.
Der Veröffentlichungsbeleg wird nach exakter Main-Zertifizierung ergänzt.
