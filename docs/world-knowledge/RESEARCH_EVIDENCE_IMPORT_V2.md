# Recherche mit belegter Übernahme v2

Die Admin-Pipeline bearbeitet den gesamten kanonischen Spot-Feldkatalog. Sie
ändert weder Decision-Regeln noch Community-Moods. Die Freigabe gilt für eine
vom Admin beauftragte Recherche, nicht für beliebige öffentliche Uploads.

## Verbindliche Entscheidung

- NONE oder MINOR: nach erneuter Quellen-, Identitäts-, Schema- und Kontextprüfung
  speichern; geringe sprachliche oder fachliche Restunsicherheit allein blockiert
  nicht. Mittag, Mittagsmenü, Business Lunch und Mittagessen sind gleichwertig.
- MAJOR: unverändert als Vorschlag mit konkretem Grund und Beleg zur Prüfung.
- Fehlender Beleg, unlesbare Quelle, nicht darstellbarer Kontext oder nicht
  bestätigte Zuordnung: Prüfung, niemals erfundene erfolgreiche Übernahme.
- Ohne Rechercheergebnis: offen lassen. Fehlend bedeutet weder Nein noch
  Ablehnung. Ein vollständig abgearbeiteter Auftrag darf bekannte Wissenslücken
  haben; diese allein halten ihn nicht in der offenen Auftragsliste.

`research.assessments` enthält je Claim den Schlüssel, NONE/MINOR/MAJOR, einen
konkreten fachlichen Grund und bei zusammengesetzten Profilen Belegbindungen.
Bindings beziehen JSON-Pfade auf den Index in `[source, ...supportingSources]`.
Die fachliche Einordnung ist ein protokolliertes Rechercheurteil, kein Beweis
oder automatischer Vertrauensscore. Software prüft sie zusätzlich gegen die
frisch gelesenen Originalquellen. Nicht implementierte Zuordnungen werden mit
konkretem technischen Grund zur Prüfung gehalten, nicht als Quellenwiderspruch
umgedeutet.

## Quellen und Kontext

Nur die serverseitig gelesene kanonische Website und deren beobachtete offizielle
Verlinkungen/Weiterleitungen werden verwendet. PDFs werden serverseitig als
Text gelesen, mit Grössen-, Seiten- und Zeitbegrenzung. Eine reine Bild-PDF oder
nicht eindeutig auslesbare grafische Zuordnung verlangt zusätzliche Prüfung.
AGB und Datenschutz werden nicht gelesen. Individuelle Menüpreise bleiben mit
Angebot, Preisbasis und Gültigkeit verbunden. Raumkapazitäten werden nicht
addiert oder aus einer Bestuhlungsvariante verallgemeinert. Fremdangebote und
Catering werden nicht als reguläres Angebot vor Ort ausgegeben. Gleichwertige
beobachtete Website-Weiterleitungen erzeugen keine Änderung oder Prüfschleife.

Eine eindeutige Adresssuche darf Koordinaten liefern; sie belegt einen
Gebäudepunkt, nicht automatisch den barrierefreien Eingang. Private Angaben
und ausdrücklich als unbekannt gesetzte Angaben bleiben geschützt. Bestehende
Angebotsprofile werden nicht still um bislang gespeicherte Einträge gekürzt.

## Speichern und Abschluss

Autorisierte Admin-Sitzung, Feature-Schalter, actor- und inputgebundenes Journal,
Lease, Beleg-Checkpoint vor dem Schreiben, bestehender transaktionaler Import,
Manifest-Abgleich, exakte `supersedesClaimId`, Projektion neu aufbauen und
Feldwerte zurücklesen. Erst dann lautet der Zustand gespeichert und bestätigt.
Unbestätigte Schreibversuche sind wiederaufnehmbar und werden nicht als Erfolg
ausgegeben. Ein erneuter identischer abgeschlossener Auftrag erzeugt keine
zweite Speicherung. Alte Kontakt-Recherchen ohne assessments bleiben unter v1
lesbar; ihre Regeln werden nicht rückwirkend erweitert.

Im Journal stehen Outcome, Softwaregrund, fachliche Erklärung, Restunsicherheit,
Quell-URL und Quellenhash. Originalzitate und Abrufzeiten bleiben im kanonischen
Claim erhalten. `reviewed: true` bei einem Angebotsprofil bedeutet hier die
explizit delegierte fachliche Admin-Übernahme nach diesen Prüfungen; es wird
keine persönliche Prüfung eines Menschen erfunden.

Bei mehreren Quellen bewahrt `sourceProofs` im Entscheidungsjournal für jede
frisch gelesene Primär- und Zusatzquelle URL, Rohdaten-Hash und Abrufzeit auf.
Eine Raumdokumentation bleibt auch mit einer schlichten Linkbeschriftung wie
„Räume“ eine beobachtete Quelle; ihre Auffindbarkeit hängt nicht vom
Themenklassifikator des Recherchemodells ab. Zahlen in Textdetails müssen
zusätzlich im gebundenen Beleg vorkommen. Bestuhlungsabhängige Plätze bleiben
am konkreten Raum, ohne eine allgemeine Gesamtkapazität daraus abzuleiten.

## Bestehende Angebotsprofile ergänzen

Die Belegprüfung untersucht geänderte und neue Details. Unverändert übernommene
Details, auch bestehende unbekannte Angaben, bleiben mit ihrem bisherigen
Kontext erhalten und verlangen keinen erfundenen neuen Beleg. IDs bestehender
Angebote und Bereiche müssen wiederverwendet werden. Eine neue belegte
Raumzuordnung oder eine belegte Korrektur innerhalb eines bestehenden
Detailfelds ist keine Löschung. Entfernte Angebote, Bereiche, Detailfelder,
Preispositionen oder Zuordnungen bleiben dagegen zur Prüfung zurückgehalten.

Beim manuellen Abschluss bleiben unterschiedlich benannte freie Raumdetails
getrennt: etwa Bestuhlung, Bildschirm und Stehtische. Der gemeinsame technische
Schlüssel `custom.detail` macht daraus keinen Widerspruch. Derselbe Detailname
mit abweichendem Wert bleibt dagegen prüfpflichtig. Ein identischer vorhandener
Stand muss ohne erneute Profiländerung abgeschlossen werden können.

## Sicherheitsprüfung und wiederaufnehmbare Projektion

`SHADOW_HELD` bedeutet: im geschützten Speicher vorhanden, aber nicht öffentlich.
Die Pipeline zeigt dafür eine konkrete Sicherheitsprüfung, keinen erfolgreichen
Profilimport und keinen unspezifischen Rücklesefehler. Frühere öffentliche Werte
bleiben erhalten. Die Sicherheitsentscheidung wird nicht übergangen.

Der Zeitpunkt eines Projektionsauftrags wird vor dessen Ausführung im Journal
festgehalten. Wiederholungen verwenden denselben Zeitpunkt und dieselbe
versionierte Auftragskennung; sonst würde der kanonische Rebuild eine andere
Anfrage unter derselben Kennung zu Recht ablehnen. Bereits geschriebene öffentliche
oder gehaltene Angaben werden bei der Wiederaufnahme nicht doppelt angelegt.

Die Migration `20261026215735_world_research_text_safety_word_boundary_v1.sql`
behebt ausschliesslich den nachgewiesenen Teilwort-Fehlalarm: „hate“ innerhalb
von „Chateaubriand“/„Chateau“. Explizite hate-Wortformen und die übrigen bisherigen
Schutzbegriffe bleiben wirksam. Bestehende gehaltene Angaben werden dadurch nicht
automatisch freigegeben; ihre Veröffentlichung verlangt die explizite Adminprüfung.

## Automatische Kontextprüfung 2.1

Die versionierte Belegprüfung erkennt gängige Restaurantbegriffe wie italienische
Küche, Pasta, Entrecôte, Calamari, Desserts, Garten und Boulevardfläche als
Katalogbedeutungen. Verneinungen bleiben wirksam. Explizite Belegbindungen von
Auswahllisten werden pro Wert geprüft; ein anderer Listeneintrag ersetzt keinen
fehlenden Beleg.

Mehrzeilige Wochenpläne mit Tagesbereich als Überschrift und Mittag-/Abendfenster
in Folgezeilen werden gemeinsam ausgewertet. Unterschiedliche Zeitfenster dürfen
nicht zu einer durchgehenden Öffnung zusammengezogen werden. Ruhetag bedeutet
für den genannten Tag geschlossen. Ein Konflikt wird weiterhin zur Prüfung
gehalten und darf nicht durch Zusammenkleben zweier Quellen aufgelöst werden.

Für Küchenzeiten gilt die freigegebene Ersatzregel: Ohne abweichenden Küchenplan
auf den frisch gelesenen Quellen können die belegten regulären Zeitfenster
übernommen werden. Ein konkret veröffentlichter Küchenplan verhindert diesen
Fallback; generelle Texte über das Küchenteam sind kein abweichender Plan. Die
Ableitung ist im fachlichen Grund ausdrücklich zu nennen.

Recherchedateien müssen vollständige wörtliche Belegpassagen liefern, nicht nur
Überschriften: Für Preise gehören Beträge, Währung, Preisbasis und gegebenenfalls
Gültigkeit in die zugeordneten Belege, für Zeiten Tagesbereich und Zeitfenster.
Die Währung kann einmalig auf einer verifizierten offiziellen Karte desselben
Restaurants belegt sein; eine ausdrücklich andere Währung im zugeordneten
Preisausschnitt darf dadurch nicht umgedeutet werden. Der Kartenkontext derselben
Seite belegt die Preisbasis, die konkreten Beträge bleiben am einzelnen
Ausschnitt gebunden. Jeder Beleg bleibt ein zusammenhängender Quellenausschnitt. Zusätzliche Ausschnitte
werden als supportingSources mit eigenen JSON-Pfadbindungen geliefert; keine
zusammengesetzten angeblichen Originalzitate. Technisch unzureichende Belege
werden korrigiert und erneut eingereicht, nicht manuell als sichere Werte am
Prüfer vorbei bestätigt. Bereits gespeicherte identische Angaben werden nicht
für einen Live-Test umgeschrieben; der vollständige Import wird zusätzlich gegen
einen isolierten Ausgangszustand geprüft.
