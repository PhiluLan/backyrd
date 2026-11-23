# Erste Lernbeispiele für NukNuk: fachliche Prüfung

## Software- und Datenkorrekturen vor der nächsten Beta-Runde

Änderungsklasse: PRODUCT_RELEASE, Quellenprüfung ohne Veröffentlichung oder neue
Gewichte. Der bisherige Live-Adapter bleibt unverändert. Diese Korrekturen
bereiten die nächste Trainingsrunde vor; sie sind keine Beta-Freigabe.

- Explizite gemeinsame Geldgrenzen erhalten GROUP_TOTAL. Die bestehende
  Quellenprüfung lehnt fehlenden, widersprüchlichen oder einem anderen Angebot
  zugeordneten Budgetumfang ab; sie überschreibt keine Modellantwort.
- Teilgruppen werden durch bestehende GROUP.members-Referenzen mit ihrer
  Gesamtgruppe verbunden. Bei einer einzigen klaren Aktivität kann die
  Preisprüfung deren explizite Gesamtzahl verwenden, ohne die Teilgruppe zu
  addieren. Unverbundene, widersprüchliche, personenbezogene Komponenten oder
  mehrere Aktivitäten bleiben unaufgelöst; die grösste Zahl wird nie geraten.
- Ein Dialogersatz darf einen bereits bekannten Zeitumfang nicht auf
  UNSPECIFIED zurücksetzen. Vollständige Aufhebung und ausdrücklich anderer
  bestimmter Umfang bleiben möglich. Die Anweisung und das Soll zur verfügbaren
  40-Minuten-Zeit wurden korrigiert.
- Die gemeinsame Sprachbasis kennt Kino/movies/cinéma, Billard, Keramik und
  Keramikkurse sowie Spa und Spielautomaten. Ein Keramikkurs kann Keramik oder
  einen Kurs erfüllen, generische Keramik oder ein beliebiger Workshop aber
  keinen Keramikkurs. Spa ist keine Wellnessbehandlung; Spielautomaten werden
  nicht mit dem gesamten Arcade-Angebot gleichgesetzt.
- Dokumentierte Ausstattung wird bei Standortverboten gelesen. Unbekannte oder
  andere Ausstattung beweist keine Abwesenheit. Positive Präsenz blockiert den
  Ausschluss weiterhin.
- Trainingsziele erhalten Geschenk-Anlass und Empfängerrolle, Teilgruppenzahlen
  und ihre Zugehörigkeit. Acht bekannte Teilgruppenvarianten ergänzen TRAIN:
  jetzt 121 TRAIN, 15 ursprüngliche VALIDATION und 16 ursprüngliche TEST.
  evaluationFreshness=KNOWN_REGRESSION_ONLY markiert die bereits beobachteten
  Prüfgruppen ausdrücklich. Neue Blindtests müssen separat entstehen.
- Das neue Product-Trainingsprofil bindet 5'120 Token; die korrigierten Präfixe
  und Antworten benötigen maximal 4'743. Kein Kürzen. Historische Profile
  behalten ihre Grenzen; bereits eingefrorene Manifeste und Antworten bleiben
  unverändert. Native Vorbereitung liest die gebundene Zeilenzahl statt einer
  fest verdrahteten alten 113. Sprach- und Matchingversion sind @28 bzw. @68.

Verifikation: aktuelle TypeScript-Grenze, 436 betroffene kanonische Domain- und
Exportchecks, 377 World-Knowledge-Tests, 19 GPU-Vorbereitungstests ohne GPU,
18 Prozess-/Exportwächtertests, Single-Route und Mobile/Web-Releaseverträge.
Die bestehende synthetische Browserreise besteht auf dem real exportierten
Expo-Webbundle mit sieben Decision-Anfragen und ohne Produktionsaktionen.
Lokale Workspace-Verknüpfungen und Metro-Cache wurden für diesen isolierten
Arbeitsstand korrigiert; keine Dependency- oder App-Konfigurationsänderung.
Nach der zusätzlichen Preisumfang-Absicherung wurde der betroffene
125-Fälle-Reproducer erneut geprüft. Die Daten-/Grammatikvorprüfung umfasst
alle 152 Beispiele, sechs Schemas und reine Antwortlabels ohne Modellladen.

Bekannte Mac-Replays sind keine neue Abnahme: zwölf bekannte Fälle wurden mit
geänderten Anweisungen auf dem unveränderten Modell geprüft; danach drei
Beziehungs-/Dialogfälle erneut mit den finalen Anweisungen. Quellengebundene
Budgetausgabe und Geschenkrolle verbessern sich. Eine stabile korrekte
Beziehung und die verfügbare Gesamtdauer im Dialog sind aber weiterhin nicht
belegt: der finale Replay erzeugt erneut Vater statt uncle und UNSPECIFIED
beim 40-Minuten-Update. Eine frühere Anweisungsvariante hatte uncle erhalten;
dies wird nicht als dauerhafte Verbesserung gezählt. Teilgruppen erscheinen
teils als einzelne Personen statt der gewünschten Mitgliedsstruktur. Diese
Modellfehler bleiben für das nächste Training und neue unabhängige Prüffälle
sichtbar. Es gibt keine Aussage „alle Fehler gelernt“.

Die bekannten Replays und Rohantworten liegen ausserhalb von Git unter
`.local/operations/nuknuk-beta-foundation-fixes-20261123/`. Es wurden keine
Cloud-Ressourcen angelegt, keine Live-Anweisungen oder Gewichte aktiviert und
keine Nutzerdaten für Training verwendet.


## Mac-Prüfung und einmaliger 16er-TEST vom 23. November 2026: keine Aktivierung

Der Founder gab das lokale Wartungsfenster ausdrücklich frei. Der Kandidat wurde
verlustfrei ins vorhandene MLX-Format übertragen: alle 40 Projektionen/80
Tensoren, endliche F32-Werte, exakte Transposition und dieselbe Skalierung 2.
Der kanonische Verifikator prüfte die separate Kandidatenbindung; die
ursprünglichen Daten- und Parent-Manifeste wurden nicht verändert.

Vor dem ersten TEST-Aufruf wurden der ausgewählte HF-/MLX-Kandidat,
Vergleichsadapter, alle Eingaben, Soll-Ziele und Clientbytes gebunden. Genau
16 TEST-Aufrufe je Adapter, ohne Wiederholungen und ohne spätere Anpassung des
Kandidaten. Zusätzlich liefen dieselben 15 Entwicklungsfälle und sechs bekannte
TRAIN-Retentionskontrollen. Die sechs Kontrollen verwenden die volle eingefrorene
Anweisung und sind keine Abnahme des Fast-Route-Routings.

Laufzeit: vorhandener M4 Pro, 48 GB, MLX 0.32.3, mlx-vlm 0.7.8,
llguidance 1.9.1, tokenizers 0.23.3; kein mlx-lm installiert oder benötigt.
Beide Adapter verwendeten dieselbe bereits gepinnte komprimierte Mac-Basis,
Prompts, Schemas, Referenzzeit und den lokalen Katalog (438 Spots/26 Events).
Die Antworten liefen durch kanonische Validierung, zitatgebundenen Dialog-Merge,
Bibliothekar und Product-Ausführung, mit synthetischem Actor und ohne
Produktionsdaten-Writes. Technisch ausführbar: je 37/37, darunter je 16/16 TEST.
Das bedeutet weder vollständiges Verständnis noch belegte passende Angebote.

Assistenzsichtung der eingefrorenen Aufgaben, keine unabhängige menschliche
Gold-Abnahme:

| Aufgaben | Bisheriger Mac-Adapter: vollständig / teilweise / Fehler | Kandidat: vollständig / teilweise / Fehler |
| --- | --- | --- |
| 15 Entwicklung | 7 / 4 / 4 | 10 / 2 / 3 |
| 16 TEST | 14 / 1 / 1 | 14 / 1 / 1 |
| 6 bekannte TRAIN-Kontrollen | 5 / 1 / 0 | 6 / 0 / 0 |

**Keine Freigabe des Kandidaten:** Die gleiche TEST-Gesamtzahl verdeckt eine
neue wesentliche Verschlechterung. „Zu viert essen, zwei von uns brauchen vegane
Optionen“ behält beim Parent die Teilgruppe zwei. Der Kandidat verliert diese
Zahl und hängt vegan an die gesamte Essensaktivität. Damit ist die vorab
festgelegte Bedingung „keine neue wesentliche Regression“ verletzt.
Gleichzeitig verbessert er den Ausstellungsbesuch mit Vater: Der falsche harte
Fakt `people.participation=Vater` entfällt, die Beziehung bleibt. In diesem Fall
wird im lokalen Katalog eine belegte Primärempfehlung möglich. Insgesamt haben
9/16 Parent- und 10/16 Kandidatenfälle eine Primärempfehlung; das ist keine
allgemeine Erfolgsquote und überstimmt die Regression nicht.

Weitere Befunde:

- Entwicklung: 35 verfügbare Minuten statt erfundener Uhrzeit, Erhalt der Tante,
  Aufheben der Günstigkeitspräferenz und die Draussen-Retention verbessern sich.
- `uncle` wird auf dem Mac weiterhin zu Vater, obwohl der HF-GPU-Kandidat hier
  eine passende Beziehung lieferte. Die GPU-Ergebnisse sind keine Mac-Abnahme.
- Gruppenbudget und verfügbare Gesamtdauer nach einer Dialogänderung bleiben
  unvollständig. Keramik erhält nicht eindeutig den gefragten Kurscharakter.
- Die 18-Minuten-Teepause erhält bei beiden `AVAILABLE_TOTAL`, aber nur
  `includes: TRAVEL`; diese zusätzliche Beschränkung ist nicht eindeutig durch
  die Teepause belegt. Deshalb bei beiden nur teilweise erfüllt.
- Die separate Begriffsprobe ergibt für `movies`, `Kino`, `SPA`,
  `Spielautomaten`, `Keramik` und `Keramikkurs` derzeit kein kanonisches Konzept;
  `cinema` wird erkannt. Das sind zusätzliche Normalisierungs-/Matchinglücken.
  Präzisierung zum früheren GPU-Bericht: `offer.kind` allein beweist keinen
  falschen Ausschlussumfang. Der Kandidat erhält „Spielautomaten“ wörtlich;
  das System kann diesen Ausschluss trotzdem nicht belastbar auswerten.
- Beim Geschenk-Museumsfall ist die Geschenk-/Empfängerrolle bereits im
  eingefrorenen Soll unterrepräsentiert. Dessen PASS belegt Museumswunsch,
  Mutter und Alter, keine vollständige Empfängerrollen-Abnahme.
- Die Dialogfälle verwenden identisches vorgegebenes Vorwissen. Vollständiges
  Live-Dialogrouting und eine physische iPhone-Abnahme werden nicht behauptet.

Die mediane reine lokale Generierungsdauer lag bei 6'036 ms für den Parent und
6'520 ms für den Kandidaten; kleine sequenzielle Stichprobe mit nicht kontrolliertem
Warm-/Kaltcache, kein belastbarer Leistungsbenchmark. Peak des eigenen
Modell-Footprints: rund 21.92 GiB, stets normaler Speicherdruck, kein Swap-Zuwachs.
Die Kandidatenbeendigung im Ressourcenbeleg ist der absichtliche Stopp nach den
37 gesicherten Antworten für die Wiederherstellung, kein Speicherabbruch.

Das Wartungsfenster dauerte rund viereinhalb Minuten. Der Testserver war nur
auf 127.0.0.1:8089 erreichbar; der Live-Endpunkt erhielt keine Kandidatengewichte.
Eine unabhängige Lifeline stellte den byte-identischen bisherigen LaunchAgent
und Parent wieder her. Anschliessende authentifizierte synthetische Probe über
den bestehenden öffentlichen NukNuk-Endpunkt: HTTP 200, bisheriger Modellalias,
Kaffee korrekt verstanden. Eine erste Probe mit 512 statt der vom Gateway
vorgeschriebenen 2'048 Ausgabetoken wurde mit HTTP 400 abgewiesen; die korrigierte
Kontrollprobe ist keine TEST-Wiederholung. Keine Cloud-Ressource gestartet,
keine neuen Cloud-Kosten, keine Gewichte veröffentlicht.

Gebundene lokale Belege unter
`.local/operations/nuknuk-product-training-20261123/mac-validation/`:

- HF-Kandidat: `9fa4124fed1c2d3dea1b77a7514aba52e65711b7522f9f889036c07f951363a6`.
- MLX-Kandidat: `8958cf6407e3933d7f150225efaabcd2ea80eb1aa406c793701510ee27968e12`.
- Freeze: `85f252b5e6933670b2eabef5abdf826b33b41f5c92e6dfd84ba7b8bf80dfd272`.
- Vollständige Assistenzsichtung: `27b65f7976688df44571c99a2eda7593c0608e09a084c6b0c2339ada1fe8330c`.
- Artefaktmanifest: `1064c225c326aed411354b9d7e453b9d65df8ef28ffea1446f54deb810865efb`.

Der GPU-Vorschlag ist durch diese native Prüfung als Aktivierungskandidat
abgelehnt. Eine nächste Runde muss Teilgruppen und Beziehungserhalt gezielt
verbessern und Modellfehler von Begriffs-/Wissenslücken trennen. Diese 16
beobachteten TEST-Familien sind künftig bekannte Regressionen, kein erneuter
Blindtest; für weitere Auswahl/Training ist ein neuer unberührter Holdout nötig.


## Product-Training vom 23. November 2026: gesicherter Entwicklungskandidat

Der gezielte Lauf auf dem bestehenden 35B-/rank-16-Parent ist abgeschlossen:
113 TRAIN-Zeilen, zwei Epochen (57 Optimizer-Schritte), LR 0.000006,
4'608 Token ohne Kürzung. Die native Präfix-Tokenisierung aller 128
TRAIN-/VALIDATION-Zeilen stimmte mit dem Mac-Export überein. Die
VALIDATION-Loss sank von 0.08232 auf 0.06521; das ist kein semantischer
Qualitätsnachweis.

Parent und Kandidat wurden mit denselben 15 zieldatenfreien
Entwicklungsanfragen auf derselben HF-/CUDA-Laufzeit verglichen. Anschliessend
wurden beide Antworten durch Validator, Dialog-Merge, kanonischen Bibliothekar
und Product-Ausführung gegen denselben eingefrorenen lokalen Katalog geführt.
Je 15/15 waren technisch ausführbar. Der Katalog enthielt 438 Spot-Profile und
26 Events; synthetischer Actor, keine Produktions-HTTP-Abnahme und keine Writes.
Die Dialogprüfung verwendet identisches vorgegebenes Vorwissen pro Arm; sie
ist kein vollständiger Live-Dialogtest.

Die vor Sichtung des Kandidaten eingefrorene Assistenzrubrik ergab:

| Bewertung | HF-Parent | Kandidat |
| --- | ---: | ---: |
| vollständig erfüllt | 10 | 12 |
| teilweise erfüllt | 3 | 1 |
| nicht erfüllt | 2 | 2 |

Das sind 15 von Assistenz verfasste Entwicklungsfälle, keine unabhängige
menschliche Gold-Abnahme und keine allgemeine Erfolgsquote. Zwei verschiedene
Verbesserungen: Die alkoholfreie Teilgruppe behält jetzt ihre Grösse drei bei
insgesamt sechs Personen; „nicht unbedingt günstig“ wird korrekt als
`NOT_REQUIRED` statt als Preispräferenz abgebildet. Keine neue wesentliche
semantische oder technische Verschlechterung in dieser Stichprobe.

Offen bleiben:

- Beim Brunch zu zweit für zusammen CHF 65 fehlt weiterhin `budget.scope: GROUP_TOTAL`.
- Spielautomaten werden noch als ausgeschlossene Angebotskategorie statt als
  standortweites Ausstattungsverbot abgebildet.
- Der Dialogwechsel von 60 auf 40 verfügbare Minuten bleibt bei
  `measurementScope: UNSPECIFIED` statt `AVAILABLE_TOTAL`.

Die mediane reine Generierungszeit betrug 8'327 ms beim HF-Parent und 9'521 ms
beim Kandidaten. Das ist eine kleine ungebatchte GPU-Stichprobe ohne
Live-Netzwerkzeit. Das bisherige MLX-Modell wurde separat gemessen und zeigte
teils andere Antworten; HF-/MLX-Quantisierung darf nicht als Trainingseffekt
verwechselt werden. Native Kandidatenkonvertierung, Simple-Route-Retention,
vollständige Dialogketten und einmalige TEST-Auswertung stehen noch aus.
TEST wurde weder hochgeladen noch aufgerufen. Keine neuen Gewichte aktiviert.

Gebundene Belege:

- Datenmanifest: `99251f432903f44a02fe08ed6399417c89c2ee114a52ca0421092e9700f93f9b`.
- GPU-Paket: `8f76865b1528ca0f2874fe1b326bb5bc131114714d422be115b12a71e0e0e14b`.
- HF-Parent-Adapter: `9d9eef4a46c8441082002635dc74917a3cf5f29be9c0cbed372d44f7e320a311`.
- Gesicherter Kandidat: `9fa4124fed1c2d3dea1b77a7514aba52e65711b7522f9f889036c07f951363a6`.
- Ergebnisarchiv: `ac28222a32206b77b85a8f5450fc4046d77031f17f510b9f4551477f5f3ce980`.
- Vorab-Rubrik: `244105747a083cc5bfc8f18493f977dbc2ac5952ce18616143a3015958e23430`.
- Gebundene Assistenzsichtung: `3b235dfd3245b902a3f929de92949949895d6b1c59c2eae4996fd1bb77b56cfa`.

Gewichte, Antworten, Laufzeitbelege und Finanzkontrolle bleiben ausserhalb von
Git unter `.local/operations/nuknuk-product-training-20261123/`.
Nach Sicherung wurde der eigene temporäre Pod vollständig gelöscht. Drei
vorherige angelegte Fehlstarts wurden ebenfalls gelöscht; zwei weitere
Anfragen erzeugten keine Ressource. Der Kostenrahmen blieb kumulativ bei
4 USD inklusive 1 USD Schlussreserve, gerechnet mit 3.70 USD/h Oberrate.
Die zusätzliche Finanz-Lease zählt belegte Laufzeiten statt unbezahlter Lücken;
sie erhöht das Geldlimit nicht. Konservative Kostenobergrenze aller Anläufe:
2.43 USD, keine Abrechnungszusage. Abschliessende Anbieterabfrage: 0 USD/h,
keine Netzwerkvolumes, neun zuvor vorhandene gestoppte Pods ohne Volume.


Diese sechs Soll-Antworten hat der Founder am 7. November 2026 im Chat
fachlich bestätigt. Das bestätigt ihre Bedeutung; eine separate Datenschutz- /
Quellennutzungsprüfung und die Trainingsfreigabe sind damit nicht dokumentiert.
Entscheidend ist die Bedeutung, nicht der
technische Datenaufbau. Alle Fälle sind bekannte Entwicklungsbeispiele und
werden nicht als späterer Blindtest verwendet.

| Eingabe | Das muss NukNuk verstehen | Das darf NukNuk nicht dazuerfinden |
| --- | --- | --- |
| Geburtstag von meiner Frau, etwas besonderes mit Abendessen | Ein Abendessen für diesen Geburtstag auswählen. „Besonders“ als wichtiges Ziel erhalten; herausfinden, welche Art davon ihr Freude macht. | Teuer, Fine Dining, Romantik, genau zwei Personen, Datum oder freie Tische. Kein Geburtstags-Paket verlangen. |
| Hochzeitstag, gemütlich essen und ausdrücklich kein Luxus | Essen als Tätigkeit, Gemütlichkeit als Wunsch, Luxus als ausdrücklichen Ausschluss erhalten. | Aus dem Anlass trotzdem ein Luxusrestaurant machen oder den Ausschluss ignorieren. |
| Spielplatz mit meiner 4-jährigen Tochter | Einen Spielplatz finden. Das Alter gehört zur Tochter; die gemeinsame Teilnahme bedeutet erwachsene Begleitung nach Backyrds Regel. | Ein zusätzliches Kinderprogramm verlangen; Wetter, Datum oder weitere Kinder annehmen. |
| Familienausflug irgendwas mit Tieren | Ein gemeinsam nutzbares Tiererlebnis suchen; Familie als Erwachsene mit Kindern verstehen. | Haustier-Mitnahme suchen; Kinderalter, bestimmtes Tier oder ausschliesslich Zoo verlangen. |
| Ich will allein Kaffee trinken und brauche unbedingt Ruhe | Kaffee trinken und notwendige Ruhe erhalten. Hier ist Ruhe verbindlich. | Einen menschenleeren Betrieb oder privat gemieteten Raum verlangen; Ruhe zum nebensächlichen Wunsch abschwächen. |
| Etwas Besonderes für meinen Freund | Es geht um ein besonderes Erlebnis für eine andere Person. Die Richtung ist offen. | Geburtstag, Abendessen, romantische Beziehung oder Sportinteresse erfinden. |

Beim Geburtstagsbeispiel wäre eine hilfreiche Rückfrage:

> Soll es eher vertrauter Genuss oder eine kulinarische Überraschung werden?

Das Datum wird für die konkrete Öffnungsprüfung gebraucht. Fehlendes Datum
oder Budget verhindert aber nicht jede erste Orientierung. Die Rückfrage ist
ein Vorschlag; welche Frage den grössten Nutzen hat, wird ebenfalls bewertet.

Für eine datierte Suche prüft der Bibliothekar den örtlichen Kalendertag
und das gewünschte Besuchsfenster gegen die belegten Öffnungszeiten.
Eine Schlusszeit von 00:00 endet am Vortag. Nur ein Betrieb, der tatsächlich
über Mitternacht hinaus geöffnet ist, liefert ein Intervall für den Folgetag.

Beim offenen Wunsch für den Freund wäre eine sinnvolle erste Orientierung:

> Welche Richtung würde ihm Freude machen: gemeinsam geniessen, etwas erleben
> oder entspannen?

Wichtig für die gemeinsame Produktregel: „Besonders“ bleibt ein Auswahlziel,
das an belegten Ortsmerkmalen und gegebenenfalls Vorlieben beurteilt wird. Es
wird nicht als frei erfundene harte Spot-Eigenschaft behandelt. Konkrete
Vorgaben wie „kein gewöhnliches Restaurant“, eine gewünschte Küche oder ein
ausdrücklicher Ausschluss müssen dagegen vollständig erhalten bleiben.

Eine Bestätigung dieser Beispiele bestätigt deren fachliche Bedeutung.
Sie bestätigt weder alle bisherigen Modellantworten noch eine ausreichende
Modellqualität. Die eigentliche Auswertung des trainierten Adapters bleibt
ein separater Vergleich an anderen, vorher getrennten Fällen.

## Lokaler Adaptervergleich am 7. November 2026

Die 200 Backyrd-Beispiele und 40 kuratierten externen Übungen wurden tatsächlich
einmal trainiert. Anschliessend wurden Basis und Adapter mit denselben 20 vorher
getrennten Aufgaben verglichen. Fachliche Sichtung durch die beauftragte Assistenz,
keine neue persönliche Founder-Abnahme und kein unabhängiger Blindtest.
Die folgenden Urteile lesen die tatsächlichen Antworten; reine Synonym- oder
Schlüsselunterschiede werden nicht als bewiesener Suchfehler gewertet.

| Fall | Basis → Adapter: konkretes Ergebnis |
| --- | --- |
| holdout-01: nach Streit mit Bruder ruhig essen und reden | Basisantwort abgeschnitten; Adapter vollständig, Essen/Ruhe/Gespräch und Anlass erhalten. Verbesserung. |
| holdout-02: Bowling, dort essen nicht nötig | Beide machen aus nicht benötigtem Essen ein ausgeschlossenes Essen. Adapter nennt sogar Abendessen ohne Vorgabe. Klarer Bedeutungsfehler bleibt. |
| holdout-03: Töpfern mit Papa, beide Anfänger | Adapter entfernt erfundene ruhige/gemütliche Präferenzen. Anfänger-Kontext landet weiterhin teilweise in einer Teilnahme-Pflicht. Zuordnung muss präziser werden. |
| holdout-04: nach Dienstende 23 Uhr warm essen | Adapter ergänzt einen Beginn ab 23 Uhr, setzt aber wie die Basis den nicht genannten heutigen Tag als Pflicht. Nicht korrekt abgeschlossen. |
| holdout-05: Ausstellung, 20-jähriger Sohn, Rollstuhl | Beide erhalten Ausstellung, Alter und Zugang. Unterschiedliche Rollen-/Altersschlüssel brauchen Anschlussprüfung; dieser Einzeltest belegt keinen konkreten Suchausschluss. |
| holdout-06: Fisch erlaubt, kein Fleisch | Adapter behebt den ungültigen Beleg. Er nennt Fisch jedoch vegetarisch und verschiebt im Zieltext die persönliche Ernährung zu einem Restaurant, das überhaupt kein Fleisch serviert. Inhaltlich nicht ausreichend. |
| holdout-07: französisch, Freundin danken mit Abendessen, kein Luxus | Beide verstehen den sprachlichen Kern. Dankbarkeit wird weiterhin als harte Ergebnis-Pflicht ausgegeben; die technische Abbildung von Luxus wechselt. Kein belegter vollständiger Übersetzungserfolg. |
| holdout-08: Schweizerdeutsch, mit Kollegen trinken und reden, keine Disco | Beide erhalten die Kernwünsche korrekt. Adapter entfernt zusätzliche exakte Personenzahl, ergänzt dafür unbeauftragten Tages-/Datumskontext. Keine nachgewiesene harte heutige Besuchspflicht. |
| holdout-09: bei Regen Kino, sonst Parkspaziergang | Basis verliert die Wetterbedingung. Adapter gibt zusätzlich Indoor und Outdoor als Pflichten aus und die eigentlichen Aktivitäten nur als Kontext. Verschlechterung; IF-Abdeckung fehlt im kompakten Auftrag/Training. |
| holdout-10: privaten Raum für 30. Geburtstag mieten, kein Luxus | Beide beschreiben den Kern im Zieltext. Beim Adapter fehlt eine eigene Mietservice-Angabe, Raum wird allgemeines Merkmal. Kein Beleg, dass der produktive Bibliothekar dies korrekt abrufen würde. |
| holdout-world-01: Mittag belegt, entspannte Atmosphäre unbekannt | Beide nur POSSIBLE, keine erfundene Bestätigung der Atmosphäre. Adapter argumentiert fokussierter. |
| holdout-world-02: Mittag und entspannte Atmosphäre belegt | Basis bleibt POSSIBLE trotz bestätigter Wünsche; Adapter STRONG mit passenden Belegen und ohne freie Plätze zu versprechen. Sinnvolle Kalibrierungsverbesserung. |
| holdout-world-03: ein belegter vegetarischer Brunch | Beide STRONG und an die bereitgestellten Belege gebunden. Kein Beweis für weltweite Einzigartigkeit des Kandidaten. |
| holdout-world-04: zwei gleich belegte vegetarische Brunches | Beide Kandidaten bei beiden Varianten STRONG; Adapter erfindet keinen Unterschied oder Sieger. |
| transfer-special-mother: besonderer Abend, gutes Essen, keine steifen Restaurants | Adapter entfernt zusätzliche harte Entspanntheit und gemütliche Präferenz. Besonderheit wird nicht automatisch Luxus. Die allgemeine Qualitäts-Pflicht „gut“ bleibt jedoch im Diagnosepfad nicht ausführbar; keine gelöste Übersetzung in belegte Merkmale. |
| transfer-unique-open: einzigartig mit Partner, möglichst unter 30 pro Person | Beide machen den Partner zur harten Teilnahmeeigenschaft und erzeugen dadurch UNSUPPORTED_CAPABILITY. Das ist hier eine falsche Modellzuordnung, kein Beweis einer fehlenden Produktfähigkeit. Adapter formuliert das weiche Budget im Zieltext hart. |
| transfer-special-vegetarian: spezielles Mittagessen, Freunde, kein Luxus, vegetarisch nötig | Beide erfassen den inhaltlichen Kern, verbinden aber getrennte Stellen zu einem angeblich wörtlichen Zitat. Belegvertrag verletzt. |
| transfer-not-special: einfach Kaffee und Kuchen | Kernangebot bei beiden erhalten. Adapter erfindet im Zieltext heute Nachmittag; Rückfragedimension widerspricht der eigenen Lückenliste, daher ungültige Antwort. Regression. |
| transfer-special-quiet: Besonderheit ist Ruhe, ausgefallene Küche egal | Adapter korrigiert Gourmet von EXCLUDED zu NOT_REQUIRED. Trotzdem zusätzliche harte Entspanntheit und Essen nur als Anlass-Kontext statt erforderlichem Angebot. Teilverbesserung, nicht vollständig korrekt. |
| transfer-unique-not-required: Einzigartigkeit nicht nötig, Mittag unter 25 | Beide verbieten Einzigartigkeit statt sie freizustellen; beide verwenden höchstens 25 statt strikt unter 25. Klare Fehler bleiben. |

**Entscheidung: Adapter lokal behalten, keine produktive Aktivierung.**
18/20 formal brauchbare Antworten statt 17/20 sind kein ausreichender
Verständnisnachweis. Besonders die wenigen Wörter „nicht nötig“, „egal“, „unter“
und „wenn … sonst“ können weiterhin die eigentliche Suchabsicht verändern.
Der Versuch zeigt echte, begrenzte Lernwirkung; er beweist weder ausreichende
Produktqualität noch, dass das Modell diese Aufgaben grundsätzlich nicht lernen kann.

Die unveränderten Rohantworten, konkreten Vertragsfehler, Laufzeiten und Hashes
liegen lokal unter `.local/nuknuk-understanding/comparison-20261107-v2/`.
Konfiguration, Grenzen und nächste Evaluationsregeln dokumentiert
`NUKNUK_UNDERSTANDING_TRAINING.md`. Dieser Bericht verändert keine Trainingsziele
und ist keine nachträgliche Anpassung des Adapters an seine Testantworten.

## Entwicklungsprüfung vom 23. November 2026

Der Founder bestätigte 20 synthetische Beispiele im Chat, mit zwei Änderungen:
Fall 3 ist eine Wochenendunternehmung mit Kindern; Fall 11 lautet natürlich
«Morgen Nachmittag schwimmen gehen, keine Sauna.» Die Prüfung verwendet den
aktuellen kompakten Product-Auftrag, nicht die historische Werkstattaufgabe.
Feste Referenz: 23. November 2026, 10:00 Europe/Zurich. Morgen ist der 24.
November. Dieselben 438 kanonischen Ortsprofile und 26 Eventvorkommen sind für
Vergleiche eingefroren. Der echte Inferenzdienst wird aufgerufen; Authentifizierung
des Product-HTTP-Aufrufs, Nutzerpersonalisierung und physisches iPhone werden
dabei nicht getestet. Es erfolgen keine Production-Decision- oder Learning-Writes.

Die fachliche Assistenzsichtung des ersten Durchlaufs ergab neun korrekte, vier
teilweise korrekte und sieben fehlerhafte Übergaben. 22 Modellaufrufe lieferten
HTTP 200; 18 Fälle lieferten eine ausführbare Übergabe, ein Fall eine Rückfrage,
ein Dialog scheiterte an doppelten Fakten-IDs. Keine Zeitüberschreitung.
Das ist kein unabhängiger Blindtest und keine allgemeine Erfolgsquote. Ein
formal ausführbarer Auftrag ist kein Nachweis richtiger Bedeutung oder Auswahl.

### Vorbereitete Korrekturziele

Diese Ziele sind Entwicklungsentwürfe für die nächste fachliche Sichtung.
Sie wurden nicht in einen freigegebenen, gehashten Trainingsbestand aufgenommen;
es wurde kein Modell trainiert oder aktiviert. Vor dem Export sind die Ziele
gegen den dann aktuellen kompakten Vertrag zu materialisieren und zu prüfen.

| Fall | Eingabe | Soll-Ziel und Gegenbeispiel |
| --- | --- | --- |
| 2 | Ich suche einen Spielplatz für mich und meine 4-jährige Tochter. | Alter 4 als Kontext an eine PERSON Tochter, nicht eine leere GROUP. Spielplatz erforderlich; kein zusätzlicher Kinderkurs. |
| 3 | Am Wochenende mit meinen Kindern etwas unternehmen, möglichst draussen. | Familienkontext ohne erfundene Kinderzahl oder Alterswerte. Draussen bevorzugt. Wochenende nicht auf einen willkürlichen Tag verkürzen; bei der festen Referenz den 28.–29. November als Zeitraum erhalten. |
| 6 | Ich möchte vegetarisch essen. Meine Freunde dürfen dort auch Fleisch bestellen. | Vegetarisches Angebot für die anfragende Person; Freunde als Begleitung erhalten. Kein Fleischverbot für den Betrieb oder die ganze Gruppe. |
| 8 | Gemütlich essen, möglichst unter 30 Franken pro Person. | Mahlzeit erforderlich; gemütlich bevorzugt; LT 30 CHF PER_PERSON bevorzugt. Kontrast: «höchstens» ist LTE, «mindestens» GTE; Pflicht nur ohne weichen Zusatz. |
| 10 | Klettern und danach essen. Fürs Klettern maximal 25 Franken pro Person; das Essen geht extra. | Zwei Aktivitäten in Reihenfolge. LTE 25 CHF PER_PERSON nur fürs Klettern; Essen ausserhalb dieser Grenze. Keine Pflicht `budget.payment_mode separate` erfinden, keinen gemeinsamen Standort voraussetzen. |
| 11 | Morgen Nachmittag schwimmen gehen, keine Sauna. | Schwimmen, Datum 24. November und Nachmittag erhalten. Eigene Saunanutzung als ausgeschlossene Tätigkeit. Ein separates Saunaangebot macht den Standort nicht unzulässig. Kontrast: «kein Betrieb mit Sauna» ist ein Standort-/Einrichtungsverbot. |
| 12 | Nach meiner Spätschicht ab 23 Uhr noch warm essen. | Gewünschte warme Mahlzeit und erforderliches Zeitfenster ab einschliesslich 23:00. Datum offen. Wärme ist keine Küchenrichtung; keine erfundene Öffnung oder garantierte warme Küche. |
| 13 | Wenn es regnet, ins Kino; sonst im Park spazieren. | Regen-IF/ELSE samt Parkbezug im Spaziergangzweig erhalten. Keine Wettervorhersage, kein beliebiger Gehweg oder eine Brücke als belegter Park. |
| 16 | Morn mit em Kolleg öppis go trinke, am liebschte dusse, aber kei Disco. | Morgen, Getränke, Kollege, Draussen-Präferenz und Disco-Ausschluss erhalten. «Dusse» ist kein Getränk. |
| 19 | Morgen draussen essen, wir sind vier. → Doch lieber drinnen, und wir sind fünf. Morgen bleibt. | Indoor ersetzt Outdoor, fünf ersetzt vier, Datum bleibt. Jede Änderung verbindet alte Fakten-ID, neuen Wert und Quellenzitat in einem atomaren Eintrag. Keine doppelten IDs und kein Outdoor-Verbot erfinden. |
| 20 | Etwas Besonderes für meinen Freund. Ich weiss noch nicht, was. | Besonderheit als Auswahlwunsch und Empfänger erhalten. Eine hilfreiche Richtungsfrage statt einer harten unbelegbaren «Besonderheit». Kein Geburtstag, Essen oder Geschmack erfinden. |

Für Fall 8 lautet der Geldteil des kompakten Zielauftrags:

```json
{"id":"money","key":"budget.maximum","modality":"PREFERRED","basis":"EXPLICIT","subjectIds":["a1"],"value":{"amount":30,"operator":"LT","currency":"CHF"}}
```

Der zugehörige Budgetumfang ist `PER_PERSON`; er bleibt beim Essensangebot.
Die falsche Modellantwort `REQUIRED GTE 30` wird als Gegenbeispiel erhalten,
nicht als Trainingsziel. Eine korrekte Grenze beweist noch keinen Orts-Preis.

Für Fall 19, mit vorherigem `f2` für Outdoor und `f3` für vier Personen, ist
der minimale Änderungsauftrag:

```json
{
  "changes":[
    {"id":"f2","quote":"Doch lieber drinnen","fact":{"id":"f2","key":"offer.area","modality":"REQUIRED","basis":"EXPLICIT","subjectIds":["a1"],"value":{"text":"indoor"}}},
    {"id":"f3","quote":"wir sind fünf","fact":{"id":"f3","key":"people.count","modality":"REQUIRED","basis":"EXPLICIT","subjectIds":["g1"],"value":{"amount":5,"operator":"EQ","unit":"PEOPLE"}}}
  ]
}
```

Die bestehenden Entitäten und das unveränderte Datum werden vom Host erhalten.
Der Host leitet die belegten Entfernungen aus genau diesen Änderungen ab;
eine getrennte Modellliste kann dadurch nicht unvollständig werden. Unbelegte
Entfernungen bleiben ungültig. Bei Fall 11 ist zusätzlich die
Softwarekorrektur nötig: Ein korrektes Aktivitätsverbot darf im Matching nicht
zu einem Standortverbot werden. Das wird nicht durch ein weicheres Trainingsziel
oder das Entfernen des Ausschlusses kaschiert.

### Grenzen und Bestandspflege

Die 20 Fälle und daraus abgeleitete Varianten sind bekannte Entwicklung, kein
künftiger Blindtest. Weitere Validierungs- und Testfamilien sind vor einer
Trainingsrunde getrennt zurückzuhalten; lexikalische Varianten derselben Familie
zählen nicht als unabhängige Prüfung. Ein Trainingslauf braucht einen eigenen
eingefrorenen Bestand mit Herkunft, Nutzungserlaubnis, Reviews und Split-Bindung.

Bei der strengeren Grenzprüfung fiel der historische Entwurf
`expanded-special-meal-01` auf: «unter 45 Franken» hat dort fälschlich LTE statt
LT. Sein eingefrorener Inhalt wird nicht still geändert oder neu freigegeben.
Dieser Entwurf darf ohne korrigierte, neu geprüfte Revision nicht als Ziel der
nächsten Trainingsrunde dienen. Die historische Full-Meaning-Sicht und die
aktuelle kompakte Product-Prüfung sind unterschiedliche versionierte Aufträge.

Verbleibende Softwarethemen sind insbesondere die fehlende Preisbezugsbasis
bei «ein Mittagessen unter 25 Franken», Familienrelevanz im Ranking und genaue
Erklärungen bei Datenlücken. Ein korrekt verstandener Wunsch mit fehlenden
Ortsbelegen ist kein falsches Sprachtrainingsziel.

### Ergebnis des ersten Korrekturblocks

Die 20 bekannten Entwicklungsfälle wurden mit dem echten Inferenzdienst und
demselben eingefrorenen Katalog erneut geprüft. Die letzten Änderungen am
Budgetauftrag betreffen vier Fälle (7–10); nur diese wurden danach frisch
aufgerufen. Für die anderen 16 Fälle wurden Systemauftrag, Nutzereingabe,
Schema und unveränderte Rohantworten per SHA-256 gebunden und durch den finalen
Provider und Matcher erneut geprüft. Dieser Replay ist keine neue Inferenz
und kein zusätzlicher unabhängiger Test. Frühere Fehlversuche bleiben als
Entwicklungsbelege erhalten, statt durch spätere Antworten ersetzt zu werden.

| Schwerpunkt | Beobachtung im letzten gebundenen Durchlauf |
| --- | --- |
| Fall 7, höchstens CHF 30 pro Person | LTE 30 CHF mit echtem `budget.scope PER_PERSON`; bestätigte Essensangebote, unter anderem Basso und Volta Bräu. Numerische Grenzen und Einheiten werden nicht mehr als freie qualitative Preismerkmale akzeptiert. |
| Fall 8, möglichst unter CHF 30 | PREFERRED LT 30 CHF PER_PERSON, ein Modellaufruf, rund 8,1 Sekunden. Keine Umkehr zu einer verbindlichen Untergrenze. |
| Fall 11, morgen schwimmen ohne eigene Sauna | Aktivitätsausschluss, 24. November am Nachmittag; Hallenbad Rialto im Katalog bestätigt, rund 8,3 Sekunden. Kontrollierte Gegenfälle prüfen separate Sauna, ausdrücklich verbotenes Saunaangebot, kombiniertes Angebot und unbekannte Aktivitätsdaten. |
| Fall 19, drinnen und fünf Personen | Zwei atomare, belegte Änderungen; Datum bleibt korrekt am 24. November, keine doppelten Fakten. Rund 17,5 Sekunden bei den bisherigen drei Modellaufrufen. Ein zuvor beobachtetes unbegründetes Umdatieren wird zusätzlich durch den Retentionsschutz verhindert. |

Das sind gezielte Software-/Auftragskorrekturen, kein Nachweis einer
Trainingswirkung. Die Gewichte wurden nicht verändert. Insbesondere
Wochenend-Zeiträume, saubere Personenrollen, Schweizerdeutsch, Parkbezug und
hilfreiche offene Richtungsfragen brauchen weiterhin fachliche Trainings- und
Produktarbeit. Fall 9 bleibt wegen ungeklärter Preisbezugsbasis vorläufig.
Bei zusammengesetzten Vorhaben wie Fall 10 bleiben echte Preis-, Alters- oder
Reihenfolge-Nachweislücken im Matcher offen; ihre Beseitigung darf nicht durch
das Wegtrainieren richtiger Nutzerbedingungen vorgetäuscht werden.

Der breite Product-Lauf einschließlich Typprüfung, Trainings-/Exportintegrität,
Single-Route, Release-Verträgen und App-Browsertest war grün. Nach der letzten
lokalen Budgetänderung wurden die gezielten Quell-/Vertragstests wiederholt;
die Pflicht-CI prüft den finalen PR-Stand. Veröffentlichung und Modelltraining
sind separate Schritte, nicht Bestandteil dieses Entwicklungsnachweises.

### Ausgangsvergleich vor dem gezielten Product-Training

Auf dem unveränderten Live-Adapter wurden weitere 16 synthetische
Entwicklungsanfragen über den Product-Provider und denselben eingefrorenen
Katalog ausgeführt. Alle 16 beendeten die technische Kette; das ist keine
semantische Erfolgsquote. Der Pizza-/Pasta-Fall gehört zur bekannten Founder-
Familie 14 und wird nach Splitkontrolle ausdrücklich nur als Regression
aufbewahrt. Die frische Validierung umfasst damit 15 Fälle. TEST bleibt vor
Checkpoint-Auswahl unangetastet. Keine Production-/Learning-Writes.

Die Assistenzsichtung findet unter anderem: Bei insgesamt höchstens 35 Minuten
wurde eine unbelegte Enduhrzeit statt der verfügbaren Dauer ausgegeben;
«zusammen höchstens CHF 65» verlor den GROUP_TOTAL-Bezug; Pizza oder Pasta wurde
zu zwei Pflichten; ein Spielautomatenverbot erhielt den unbelegten Ausdruck
SPELLOTER; englisch «uncle» wurde Vater und «tomorrow» ging verloren. In einem
Dialog mit Pizza statt Pasta wurde zusätzlich ein ungenanntes Mittagessen
eingeschränkt. Tante und Keramikkurs wurden nur teilweise strukturiert erhalten.
Dagegen blieben unter anderem die alkoholfreie Teilgruppe, die optionale
Reservation, das explizite Essensdatum, die Reihenfolge Museum vor Essen sowie
die belegte Verkürzung einer Dauer und Aufhebung einer Gemütlichkeitspräferenz
erhalten. Diese Beobachtungen sind Ausgangsevidenz, kein Trainingsergebnis und
kein unabhängiger Goldstandard. Änderungen an Training oder Checkpoint-Auswahl
dürfen VALIDATION nutzen, aber keine spätere unabhängige Erfolgsquote daraus
behaupten. Neue Testziele werden nicht nach Modellantworten angepasst.

Die bestehenden historischen Vokabular-Akzeptanztests melden bereits auf dem
Main-Ausgangspunkt unterschiedliche Hashes: REVIEW_VOCABULARY_HASH
`0cbeb88174184705819afe54b19f736f6156c198582ec0512ef8445528155199`
gegen den aktuellen Vertrag
`04227b2791985da6b6375ec74c263bda55aabdfc27752f862d55d6b126d372d3`.
Diese eingefrorene alte Freigabe wird nicht neu etikettiert oder für den
Product-Trainingsbestand verwendet. Die neuen Ziele werden separat gegen
das aktuelle Vokabular geprüft und mit dessen Hash assistenzgesichtet.
