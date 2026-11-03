# Paket 3: Moments, Moods und soziale Nutzung

Stand: 3. November 2026. Entwicklung auf `codex/beta-moments-social`.
Dieser Stand ist noch nicht veröffentlicht und noch nicht auf dem iPhone
abgenommen. Der bestehende TestFlight-Build 60 gehört zu Paket 2.

## Produktverhalten

- Ein Moment hält ein echtes Erlebnis fest: Foto oder Text, optionaler Ort,
  bis zu zwei freiwillige Moods und optional beteiligte Personen. App und Web
  verwenden dieselben bestehenden Mood-Kataloge und dieselbe qualitative Sprache.
  Die Auswahl beginnt mit sechs Vorschlägen; weitere lassen sich öffnen oder suchen.
- Ein allgemeiner Moment erzeugt keine zusätzliche Ortsbewertung oder Mood-Stimme.
  Ein Ortseindruck nutzt weiterhin den kanonischen Review-/Mood-Vertrag.
  Beim Bearbeiten eines daraus entstandenen Moments werden Text und Moods an
  beiden Stellen gemeinsam aktualisiert. Eine veraltete Eingabe überschreibt
  keine inzwischen gespeicherte Änderung.
- Beim Entfernen aus dem Feed bleibt ein separat gespeicherter Ortseindruck
  erhalten. Das wird vor der Bestätigung erklärt. Entfernte oder moderierte
  Beiträge verschwinden auch aus älteren Feed-RPCs und geteilten Links.
- Gespeicherte Moments sind im eigenen Profil unter „Gespeichert“ wiederzufinden,
  getrennt von gespeicherten Orten. Sichtbarkeitsänderungen gelten auch dort.
  Die aktuelle Liste lädt höchstens die 200 zuletzt gespeicherten Moments.
- Teilen verwendet einen Link zum konkreten Moment. Der Link gibt keine
  zusätzliche Berechtigung und enthält keine private Bild-URL oder Textkopie.
  Web hat eine eigene geschützte Detailansicht, Mobile eine entsprechende Route.
  Die Apple-Website-Zuordnung bleibt unverändert, solange Build 60 aktiv ist;
  neue Universal-Link-Ziele dürfen nicht vor einem passenden nativen Build
  veröffentlicht werden. Ein Web-Link bleibt der sichere Browser-Einstieg.
- Angemeldete Konten dürfen einander ohne Folgen oder Freundschaft schreiben.
  Privatmodus allein verhindert keine Nachricht. Private Konten sind in der
  Nachrichtensuche nur über ihren vollständigen Nutzernamen auffindbar; eine
  allgemeine Namenssuche öffnet keine privaten Profile.
- Blockieren ist direkt im Chat erreichbar. Weitere Nachrichten werden
  serverseitig verhindert. Die eigene Blockierliste und das Aufheben einer
  Blockierung befinden sich in den Privatsphäre-Einstellungen.
- Personenmarkierungen sind strukturierte Kontoverknüpfungen, keine aus freiem
  Text geratenen Namen. Öffentliche Zielkonten sind ohne Follow-Voraussetzung
  markierbar, private oder blockierte Zielkonten nicht. Ein privater Autor darf
  öffentliche Konten markieren. Der Server prüft beim Speichern erneut;
  nachträgliche Privat-/Blockieränderungen verbergen bestehende Markierungen.
  Eine Markierung erweitert niemals die Sichtbarkeit des Moments.
- Versand, Likes, Speichern und Folgen schützen gegen parallele Wiederholungen.
  Ein fehlender Speicherbeleg wird nicht als Erfolg ausgegeben. Texte und
  ausgewählte Dateien bleiben bei einem nicht bestätigten Versand erhalten.
  Dialoge erhalten den Eingabefokus und werden ausserhalb beschneidender Karten
  dargestellt; die mobile Web-Navigation verdeckt den Senden-Button nicht.

## Daten, Moderation und Datenschutz

Die Migration `20261103182149_beta_social_contact_and_mentions_v1.sql` ergänzt
Personenmarkierungen mit RLS und schreibgeschütztem Clientzugriff. Die Anlage
von Moment, Markierungen und Moderationsbeleg erfolgt gemeinsam im neuen
`create_social_post_v3`. Der ausgelieferte Build 60 kann seinen bisherigen v2-Schreibvertrag weiter nutzen.
Der nicht mehr verwendete v1-Schreibvertrag ohne Medienbesitzprüfung sowie
direkte Tabellenänderungen durch Clients sind gesperrt. Änderungen und
Moderation erfolgen weiterhin über die berechtigten RPCs.

Die bestehende Sperrprüfung bleibt aktiv. Gleichzeitiges Blockieren und Senden
werden pro Kontopaar serialisiert. Neue öffentliche Lesewege verwenden eine
zentrale Prüfung von Veröffentlichung, Kontosichtbarkeit, Follow-Sichtbarkeit,
Blockierungen und vorhandenen Safety-Massnahmen. Auch die private
Storage-Leseregel verwendet diese Prüfung; ein öffentlicher Autor muss sein
Profil dafür nicht für direkte Tabellenabfragen öffnen. Neue Web-Fotos werden
unveränderlich pro Versandversuch hochgeladen; ein Wiederholungsversuch kann
kein bereits gespeichertes Foto überschreiben.

Der Moderationsbeleg enthält den tatsächlichen Text, die Moods und die
kanonischen Bildreferenzen. Ein Client kann Bilder nicht durch eine leere
Snapshot-Liste aus der Prüfung entfernen. Die bestehende Snapshot-/Medienverwaltung
bleibt unverändert in einer ausschliesslich intern aufrufbaren Funktion; der
bestehende öffentliche Vertrag erhält eine vorgeschaltete Quellenprüfung. Private Bildpfade werden vom
Safety-Dienst in kurz gültige Links umgewandelt. Fremde Ursprünge, andere
Kontoverzeichnisse und nicht zugehörige Review-Pfade werden abgewiesen.
Bei nicht auflösbaren Bildern bleibt ein begründeter menschlicher Prüffall;
es wird keine Verletzung unterstellt. Entfernte Quellen werden nicht an einen
Bildanbieter geschickt. Abgeschlossene Fälle und Einsprüche werden nicht durch
einen Modell-Wiederholungsaufruf geöffnet.

Melden verknüpft einen Bericht mit dem Beleg. Angaben eines Meldenden dürfen
den gespeicherten Inhalt oder dessen Autor nicht überschreiben. Die Oberfläche
bestätigt eine Meldung erst mit einer gespeicherten Meldungs-ID. Markierungen
werden im eigenen Datenexport mit minimalen Verknüpfungsdaten berücksichtigt;
fremde private Texte oder Profile werden dafür nicht zusätzlich exportiert.
Löschbeziehungen verwenden die bestehenden Konto-/Moment-Lebenszyklen.

An User-Taste-, Decision-Ranking-, Mood-Aggregations- oder Einwilligungsregeln
wird nichts geändert. Es gibt keine neue Punktewährung und keine automatische
Umdeutung von Likes, Saves oder allgemeinen Moments zu Mood-Stimmen.

## Prüfung und Abnahme

Die Entwicklung wird in einer isolierten Supabase-Umgebung mit synthetischen
Konten geprüft. Produktionskonten und Spotdaten werden nicht als Testdaten
verändert. Die SQL-Prüfung ist im bestehenden Datenbank-Gate registriert.

Prüfquellen:

- `supabase/tests/beta_social_contact_and_mentions_v1.sql`: Anlage/Wiederholung,
  Kontowechsel, private/blockierte Ziele, direkte Schreibversuche, fremde Chats,
  veraltete Bearbeitungen, kanonische Review-Synchronisierung, geschützte Links,
  gespeicherte Moments, Meldungsbelege und unverfälschte private Foto-Snapshots.
- Bestehende Social-Integritäts-, Moment-Medien- und Produktverträge.
- `web/tests/social-identities.test.mjs` und `web/tests/moment-media-safety.test.mjs`:
  untrusted Daten, private Medienpfade, fremde Ursprünge, begrenzte Signierung und
  endgültige Moderationszustände.
- Typecheck und Lint der betroffenen Oberflächen sowie Kompilierung der beiden
  geänderten Edge Functions. Web-Build und native Hermes-Exporte sind erforderlich.
- Browserablauf mit getrennten Konten: Erstellen, Moods und Markierung,
  Wiederfinden, Likes, Speichern, Kommentare, Bearbeiten, Melden, private Chats,
  private Fotos, Blockieren, Aufheben und Entfernen. Kleine/grosse Darstellung
  sowie vergrösserter Text und Vorher-/Nachher-Ansichten gehören zur Übergabe.

Noch erforderlich vor „Paket 3 grün“: tatsächliche Abnahme des neuen nativen
Stands mit zwei Konten, Kamera/Galerie, Betriebssystem-Teilen, Tastatur,
Berechtigungs-/Offline-Verhalten und den sozialen Schutzregeln. Die tatsächliche
Provider-Ausführung der geänderten privaten Fotoprüfung muss im freigegebenen
Serverstand geprüft werden; lokale Tests verwenden keine Produktionsschlüssel
und behaupten keinen bestandenen externen Modelllauf.

Freundschaft wird nicht neu definiert oder als Voraussetzung eingeführt.
Personenmarkierungen erzeugen in diesem Stand keine zusätzliche Push-Art.
Moderationszuständigkeit und die vollständige übergreifende Einspruchsabnahme
bleiben Teil der Beta-Verantwortung und von Paket 6.

## Lokaler Prüfstand am 3. November

Der vollständige Zwei-Konten-Browserlauf ist bestanden: Foto-Moment mit Mood
und Markierung, gespeicherter Moment, Kommentar mit richtigem Autor,
Bearbeitung, gespeicherte Meldung, Direktnachricht an ein privates Konto,
Live-Empfang eines Fotos ohne Neuladen, verweigerte Bildfreigabe an ein fremdes
Konto, blockierter Versand mit erhaltenem Entwurf, Aufheben, erneuter Versand,
nachträgliche Privatstellung eines Markierungsziels und Entfernen des Moments.


- Web-Produktionsbuild und iOS-/Android-Hermes-Exporte erstellt. Die nativen
  Exporte verwenden die vorhandene öffentliche Produktionskonfiguration;
  keine Übertragung zu Expo, Apple oder Google und keine Verteilung.
- TypeScript, betroffener Lint, Web-/Mobile-Verträge und Deno-Prüfung der beiden
  Funktionen ausgeführt. Web-Lint enthält bestehende Bildoptimierungswarnungen.
- Die SQL-Fälle und bestehende Social-Integritätsprüfung laufen in einer
  separaten lokalen Datenbank. Datenbank-Lint meldet keine Probleme in den
  geänderten Funktionen; sieben bestehende Befunde betreffen sechs PostGIS-
  Funktionen und `upsert_my_owned_spot_content_v1` ausserhalb dieses Pakets.
- Bei erneutem Aufbau des Chatkanals werden Nachrichten nachgeladen. Der
  Scroll-Effekt gibt keinen Browser-Rückgabewert als React-Aufräumfunktion
  zurück; dadurch stürzt die Ansicht beim Eintreffen weiterer Nachrichten
  nicht ab. Versandentwürfe bleiben bei Fehlern erhalten.
- Screenshots und lokales Ablaufprotokoll liegen in der Aufgabenablage
  `beta-moments-social`. Die Bildschirmbreiten 390, 430 und 1440 sowie
  Web-Schriftvergrösserung auf 125 Prozent sind Teil der lokalen Prüfung.

Diese lokalen Nachweise ersetzen weder Geräteabnahme noch den echten
serverseitigen Modelllauf. Das ist kein abgeschlossener Beta-Release.

## Veröffentlichung

Noch keine Migration, Edge Function, Web-Version oder native Version aus diesem
Paket ist live. Für den Release gilt: exakt zertifizierter Commit, die neue
Migration und die beiden geänderten Funktionen, anschliessend Web und der
passende native Teststand. Die vier zurückgestellten Booking-Migrationen sowie
Auth- und Decision-Änderungen gehören nicht zu diesem Paket. Der bestehende
Releaseweg und seine erforderlichen Freigaben werden nicht umgangen.
