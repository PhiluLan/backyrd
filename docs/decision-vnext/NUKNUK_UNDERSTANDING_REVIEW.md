# Erste Lernbeispiele für NukNuk: fachliche Prüfung

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
