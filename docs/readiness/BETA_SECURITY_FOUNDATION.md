# Beta: Sicherheits-Ausgangsstand

Stand: 2. November 2026. Basis: `d53cd3bca508c5803395d967d32286ab106672cf`.
Dies ist die Bestandsaufnahme und erste Härtung aus Paket 1, keine vollständige
Sicherheitsabnahme der Beta. Die abschliessende Ablauf- und Sicherheitsabnahme
bleibt Paket 6. Unveröffentlichte Korrekturen schützen Produktion noch nicht.

## Gesicherter Ausgangspunkt

- Vollständiger AWS-Backup-Lauf [41335894428](https://github.com/PhiluLan/backyrd/actions/runs/41335894428)
  im Modus `weekly`: am 1. November um 18:26 UTC erfolgreich. Datenbank und
  140 Storage-Dateien, bestehende private KMS-verschlüsselte Ablage geprüft.
- Der Backup-Quellstand ist `b7d263fb39ed9b9bb16290b7dc565c737d82cb35`.
  Der echte Export wurde im isolierten Lauf 41348866544 wiederhergestellt:
  376 Tabellen, 226190 Zeilen, 40 Sequenzen und alle 140 Mediendateien wurden
  abgeglichen. Die Quelle enthält 37 alte ungültige Profilverknüpfungen; deren
  exakt begrenzte Korrektur wurde nur auf der Kopie erprobt. Das ist noch keine
  saubere Produktionsdatenbank und keine geprobte Notfall-Umschaltung.
- Release-Identität und tatsächliche Decision-Verarbeitung sind in
  [CURRENT_PRODUCT_RUNTIME.md](../decision-vnext/CURRENT_PRODUCT_RUNTIME.md)
  dokumentiert. Die aktuelle Arbeit ändert weder Ranking noch Interpretation.

## Bestätigte Schwächen und Korrekturen

### Web und Admin

Beide Oberflächen verwendeten Next.js 16.3.3. Aktualisiert auf exakt 16.4.3,
einschliesslich Sharp 0.35.5 und kompatibler Transitiver. Die produktiven
npm-Audits zeigen danach jeweils **0 gemeldete betroffene Pakete**; zuvor jeweils
vier (kritisch 1, hoch 2, mittel 1). Das ist kein Beweis allgemeiner Unangreifbarkeit.

Die relevanten Primärhinweise betreffen insbesondere
[Image-Optimierung](https://github.com/advisories/GHSA-2464-fhr4-w9xw) und
[Cache-Verarbeitung](https://github.com/advisories/GHSA-673q-mjm6-r5xr).
Die betroffenen optionalen Anwendungswege wurden im kanonischen App-Code nicht
gefunden. Die Aktualisierung beseitigt die betroffenen Bibliotheksversionen,
ohne einen erfolgreichen Angriff zu behaupten.

Die Lieferkettenprüfung ordnet deklarierte npm-Workspaces nun dem tatsächlichen
Root-Lockfile zu. Zuvor verlangte sie für Web fälschlich ein separates Lockfile,
obwohl CI die Root-Workspace-Installation verwendet. Getrennte Admin-/Mobile-
Installationen behalten ihre eigenen Lockfiles. Änderungen an der Workspace-
Zuordnung selbst benötigen ebenfalls ein aktualisiertes Root-Lockfile.
Das nicht verwendete separate Web-Lockfile ist entfernt; README und CI verwenden
bereits die Root-Workspace-Installation. Historische Sicherheitsmeldungen dieses
alten Lockfiles dürfen nicht mit dem jetzt installierten Web-Baum verwechselt werden.

### Datenbank: interne Hintergrundaufträge

Zehn ältere Definer-Funktionen waren über die API auch für `anon` und
`authenticated` ausführbar. Darunter sind Job-Übernahme, Job-Abschluss,
globale Lern-Backfills und Taxonomie-Veränderungen ohne eigenen Actor-Check.
Die Definitionen und effektiven Rechte wurden auch in Produktion gelesen;
zur Prüfung wurde dort kein verändernder Aufruf ausgeführt.

Die Migration `20261101183602_beta_security_boundaries_v1.sql` entzieht für
genau diese zehn Signaturen die Client-/PUBLIC-Ausführung und erhält sie für
`service_role`. Der bestehende Embedding-Worker verwendet diese Serverrolle.
Es gibt keine kanonischen Mobile-/Web-/Admin-Aufrufer dieser zehn Endpunkte.
Die von Admin und Ortsanlage verwendeten Einzelort-RPCs werden nicht pauschal
gesperrt; ihre Actor-Prüfung bleibt ein eigener Prüfpunkt.

### Datenbank: Namensauflösung

46 Anwendungsfunktionen hatten keinen festen Suchpfad. Alle laufen mit den
Rechten des Aufrufers, nicht mit erhöhten Definer-Rechten. Die Migration setzt
explizit `pg_catalog, public, extensions, pg_temp`, ohne Funktionskörper oder
Invoker-Eigenschaft zu ändern. Vorher wird geprüft, dass nicht vertrauenswürdige
Rollen in `public` und `extensions` keine Objekte anlegen dürfen. Ein Test mit
gleichnamigen temporären Tabellen prüft die tatsächliche Auflösung.

### Datenbank: öffentliche Mood-Anzeige

Die öffentliche Mood-View maskiert kleine Beitragszahlen absichtlich, wurde
aber bisher nicht auf freigegebene, echte und zur Verteilung zugelassene Orte
begrenzt. Die Migration ergänzt dieselbe Ortsgrenze wie die öffentlichen
Mood-Zähler. Nicht freigegebene Orte, Testdaten und gesperrte Orte fallen heraus.

Die bestehende Owner-Auswertung mit `security_barrier` bleibt bewusst erhalten:
Clients erhalten nur die eingeschränkte Projektion. Rohaggregate bleiben für
normale Konten und anonyme Nutzer geschützt. Eine Umstellung auf Invoker mit
breiteren Rohdatenrechten würde diese Datenschutzgrenze aufheben. Der Advisor-
Hinweis zur Definer-View bleibt deshalb eine dokumentierte Ausnahme, deren
erlaubte und verbotene Zugriffe getestet werden. Die öffentliche Zwei-Personen-
Schwelle und die davon getrennte interne Decision-Schwelle bleiben erhalten.

## App-Abhängigkeiten und verbleibende Werkzeughinweise

Die nativen SDKs bleiben auf ihrem bisherigen Stand. Zusätzlich zu kompatiblen
Transitiven sind `decode-uri-component` 0.5.1, PostCSS 8.5.32 und image-size
2.0.3 gebunden. Zwei versionierte `patch-package`-Patches erhalten die
Aufrufverträge von query-string 7 und Metro 0.83: ESM-Decoder laden sowie
Bilddaten als Buffer an den neuen Parser übergeben. Eine frische `npm ci`
wendet beide Patches mit `--error-on-fail` an; Versionsabweichungen dürfen
nicht stillschweigend ohne Patch weiterlaufen.

UTF-8-/Mehrfachparameter, ein langer ungültiger Linkparameter, ein beschädigter
ICNS-Eintrag, Bilddaten von Datei und Buffer sowie unerlaubtes Lesen einer
lokalen CSS-Source-Map sind gezielt geprüft. Vollständige iOS- und Android-
Hermes-Exporte mit Source-Maps sind bestanden. Der tatsächlich ausgelieferte
Decoder ist gepatcht. Die verbleibenden unten genannten Werkzeugursachen
enthalten beide nativen Bundles nicht.

| Bereich | Aktueller Audit | Einordnung |
| --- | --- | --- |
| Web/Admin produktive Pakete | jeweils 0 | Betroffene Serverbibliotheken aktualisiert. |
| Mobile einschliesslich Expo-/Metro-Werkzeugen | 50: hoch 0, kritisch 0, mittel 49, niedrig 1 | Mehrfachzählung transitiver Eltern; vier verbleibende Ursachen unten. |
| Root einschliesslich EAS/Entwicklungswerkzeugen | 40: hoch 0, kritisch 0, mittel 38, niedrig 2 | Kein produktiver Web-Befund; Werkzeugrisiken bleiben getrennt sichtbar. |
| Admin einschliesslich Entwicklungswerkzeugen | 16 mittel, hoch/kritisch 0 | Nicht mit dem produktiven Admin-Baum verwechseln. |

Triage der verbleibenden Ursachen für Paket 1:

- **glob/minimatch:** Datei-/Mustersuche in Expo-, EAS-, Prüf- und Buildketten.
  Keine Module dieser Pakete in den vollständigen iOS-/Android-Source-Maps;
  kein entsprechender produktiver Web-/Admin-Befund. Keine fremden Projekte,
  Archive oder Muster als Build-Eingabe ausführen. Keine ungeprüften Major-
  Overrides über inkompatible alte APIs.
- **uuid:** xcode-Buildwerkzeug, nicht im nativen Bundle. Der tatsächliche
  Aufruf ist `uuid.v4()`; die gemeldeten anderen Erzeugungs-/Bufferwege sind
  dort nicht verwendet. Weitere transitive Werkzeugketten bleiben im Audit.
- **deepmerge:** Expo-Konfiguration/Entwicklungswerkzeuge, nicht im nativen
  Bundle. Die Konfiguration ist versionierter Betreiber-Code; keine fremden
  Konfigurationsobjekte als Code oder privilegierte Build-Eingabe akzeptieren.
- **ajv, diff, ts-deepmerge, yaml:** verbleibende Root-Prüf-/CLI-Ketten,
  nicht produktive Web-/Admin-Abhängigkeiten. Daten aus einem PR sind keine
  vertrauenswürdige Berechtigung zur Verwendung von Produktions-Secrets.

Diese Einordnung schliesst die Ausgangs-Triage ab, nicht jede spätere
Sicherheitsprüfung. Die Advisory-Einträge werden nicht unterdrückt. Die
abschliessende Prüfung neuer Laufzeit-/Upload-/Deep-Link-Wege bleibt Paket 6.
Keine Aussage allgemeiner Unangreifbarkeit und kein `npm audit fix --force`.

Die EAS-CLI ist auf 27.2.0 aktualisiert; Tar 7.5.22, Forge 1.4.2, Joi 17.13.9,
Nanoid 3.3.20 und Minimatch 5.1.9 sind in ihren kompatiblen Werkzeugketten
gebunden. Die für SQL-Negativtests festgelegte Supabase-CLI bleibt 2.80.0.
EAS-Archivierung und Signaturprüfung wurden mit synthetischen Daten geprüft.
Der GitHub-Ausgangsstand mit 311 Meldungen umfasst auch das entfernte, nie
verwendete Web-Lockfile und das historische `mobu/`; er ist kein aktueller
Audit des tatsächlich installierten produktiven Baums.

## Passwortschutz und Wiederherstellungsnachweis

Eine kompromittierte-Passwort-Ablehnung bekommt in App und Web einen klaren
Text. Er erscheint ausschliesslich bei `weak_password` mit Grund `pwned`,
nicht aufgrund eines beliebigen Fehlers. Der echte Passwortschutz ist seit dem 2. November **aktiviert und durch einen
anschliessenden GET des Auth-Dienstes verifiziert**. Geändert wurde ausschliesslich
`password_hibp_enabled=true`. SMTP-Zugangsdaten, E-Mail-Vorlagen und Weiterleitungen
wurden nicht angefasst. Der versiegelte Produktionsnachweis nennt genau diesen
einen geänderten Schlüssel und `smtpCredentialApplied:false`.

Der AWS-Workflow bekommt einen manuellen Modus `restore-drill`. Er verwendet
nur den bisherigen Main/OIDC-/KMS-Zugang und liest das neueste vollständige
Datenbank-/Medienarchiv. SHA-256 und sichere Archivstruktur werden vor der
Wiederherstellung geprüft. Daten und Geheimnisse bleiben im kurzlebigen
Runner; als Artefakt bleibt nur der nicht sensible Ergebnisbeleg.

Zwei unabhängige Wegwerfziele entsprechen dem Recovery-Runbook:

1. Datenbank einschliesslich Auth-/Storage-Metadaten und Migrationshistorie:
   Tabelleninhalte, Schema/Rechte, Sequenzen und Fremdschlüssel vergleichen.
2. Medien in einem leeren Storage-Dienst: jede Datei hochladen, zurücklesen,
   SHA-256 vergleichen und die ursprünglichen Bucket-Regeln wiederherstellen.

Alle Dienste werden vor dem Einspielen auf ein internes Docker-Netz ohne
externen Netzweg begrenzt; Cron-Ausführung ist deaktiviert. Beide Ziele werden
anschliessend entfernt. Der Test schaltet keine Produktionsverbindung um und
prüft keine Wiederherstellung externer Provider-/Signierschlüssel.
Der synthetische Vorabtest ist bestanden: 391 Tabellen, 3370 Zeilen,
39 Sequenzen und eine Mediendatei. Zehn CHECK-Ausdrücke unterscheiden sich
nur durch PostgreSQL-normalisierte AND-Klammerung; der Parser hat die
Gleichheit bestätigt. ACL-/Funktions-/Standardwert-Unterschiede bleiben
Fehler. Der echte AWS-Nachweis ist unten mit seiner ehrlichen Abgrenzung dokumentiert.

## Weitere Supabase-Hinweise

Produktionsprojekt beim Abgleich: `ACTIVE_HEALTHY`. Die Bestandsaufnahme vom
1. November meldete folgende Gruppen; sie sind keine pauschal
bestätigten Datenlecks:

| Hinweis | Einordnung und offene Prüfung |
| --- | --- |
| RLS aktiv, keine Policy: 173 | Häufig absichtlich geschlossene interne Tabellen. Keine Freigaben nur zum Entfernen einer Meldung hinzufügen. |
| GraphQL-Sichtbarkeit: anon 79, authenticated 131 | SELECT-Grants machen Tabellen im Schema auffindbar; Zeilenzugriff hängt zusätzlich von RLS ab. Sensible Tabellen und fremde Datensätze in Paket 2/3 sowie Paket 6 explizit negativ prüfen. |
| Definer ausführbar: anon 115, authenticated 410 | Umfasst beabsichtigte Produkt-RPCs, Triggerfunktionen und tatsächliche interne Endpunkte. Zehn bestätigte interne Endpunkte werden mit dieser Migration geschlossen; die restliche Liste ist damit nicht vollständig freigegeben. |
| Extensions in public: 5 | Nicht ungeprüft verschieben: gespeicherte Typen, Operatoren und Abhängigkeiten benötigen eine eigene kompatible Migration. |
| Schutz gegen kompromittierte Passwörter | Laut Advisor noch nicht aktiv. Vor Abschluss von Paket 1 aktivieren und serverseitig verifizieren; verständliche Ablehnung ist vorbereitet. |

## Validierung und Releasegrenze

- Web/Admin: Typecheck, bestehende Ablaufverträge und Produktionsbuild mit lokalen
  Platzhaltern für öffentliche Build-Konfiguration. Kein Produktionsschlüssel
  wurde in den Build kopiert.
- Mobile: Typecheck und bestehende Vertrags-/Deep-Link-Prüfungen; iOS-/Android-Hermes-Build und gezielte manipulierte Eingaben geprüft. Die
  vollständige Geräteabnahme bleibt Paket 6.
- Client-Secret-Grenze und kanonischer Secret-Scan bestanden.
- Web-Lint: keine Fehler, 13 bestehende Warnungen; Mobile-Lint: keine Fehler,
  eine bestehende Warnung. Admin-Gesamtlint meldet 81 Fehler und 24 Warnungen
  in unveränderten Anwendungs-/Testdateien. Diese technische Altlast wird nicht
  als bestanden ausgegeben oder durch Regelabschaltung verborgen.
- Datenbank: synthetische Fixtures, erlaubte/abgewiesene Zugriffe, unveränderte
  Zwei-Personen-Anzeige, keine Rohdatenfreigabe, temporäre Tabellen können die
  kanonischen Tabellen nicht überschatten, Serverrolle behält Worker-Zugriff.
  Reproduzierbarer vollständiger Datenbank-Neuaufbau gehört zum PR-Nachweis.

Die vier zurückgestellten Booking-Migrationen bleiben ausserhalb dieses Umfangs.
Der am 2. November freigegebene und veröffentlichte Umfang enthält nur die beiden
SQL-Dateien und den einzelnen Passwortschutz-Schalter. Edge Functions,
Nutzerinteressen und echte Spotdaten bleiben unverändert. Der Live-Abgleich
bestätigt 46 feste Suchpfade, zehn geschützte interne Worker, null ungültige
Profilreferenzen sowie null unzulässige öffentliche Mood-Zeilen. Der vorhandene
SELECT-Grant für `authenticated` auf dem rohen Mood-Aggregat hebt dessen RLS nicht
auf: die Prüfung unter dieser Rolle ohne Admin-Berechtigung liefert null Zeilen.
Alle 584 geprüften Quell-Fremdschlüssel haben im anschliessenden Live-Abgleich
null verwaiste Referenzen.

## Konkreter Produktionsplan zur Freigabe

Status: **am 2. November 2026 freigegeben, veröffentlicht und live geprüft**.
Produktionslauf [41404437996](https://github.com/PhiluLan/backyrd/actions/runs/41404437996),
Quellstand `81f25c6b6ee147b4f97ac66498343c5f7030976f`, Zertifizierung 41403791795,
Manifest `070ac17a5ed28aa699d89f90c40d2f98bc9bbd29e7ee8b80521ebf10eac65a44`.
Paket 1 bleibt bis zum neuen sauberen Wiederherstellungsnachweis offen; Paket 2
wurde nicht begonnen.
PR [679](https://github.com/PhiluLan/backyrd/pull/679) enthält den begrenzten Weg.
Web und Admin sind veröffentlicht. Das iOS-Sicherheitsupdate ist veröffentlicht
und am Produktionsendpunkt bytegenau als zertifiziertes Paket geprüft:
Update `01a198c8-d127-7a47-88a0-1e59ded947ea`, Gruppe
`4dea6585-ac77-4b43-9435-015029d05341`, Runtime 1.1.0,
Quellstand `9b04fd2651c185de26694d5a1763b6398e84f91b`.
Eine physische Geräteabnahme wird daraus nicht abgeleitet.

Der beantragte Umfang besteht ausschliesslich aus:

1. `20261101183602_beta_security_boundaries_v1.sql`, SHA-256
   `60269b6aca93a5fee2091d736978b85dc5ca64670efc7afe52cfb220449bdd3a`:
   zehn interne Aufträge für normale API-Konten sperren, 46 Suchpfade festlegen
   und die öffentliche Mood-Anzeige auf zugelassene echte Orte begrenzen.
2. `20261101203100_analytics_privacy_reference_cleanup_v1.sql`, SHA-256
   `c4e2dade77e617da3204d4a7833d573d46d2b75fcd32a6806353284d4bb2d7df`:
   das alleinige Entfernen einer Nutzerverknüpfung auch ohne optionale
   Analytik-Einwilligung erlauben. Neue Ereignisse und Inhaltsänderungen bleiben
   gesperrt. Die exakt ermittelten 37 Ereignisse aus Juli verlieren nur ihre
   ungültige Verknüpfung zu einem sowohl aus Profilen als auch Auth verschwundenen
   Konto. Kein Ereignis, Inhalt oder aktuelles Konto wird gelöscht. Ein anderer
   Zieldatensatz bricht ab; alle übrigen Felder werden vor/nachher gehasht.
3. Ausschliesslich `password_hibp_enabled=true` im bestehenden Auth-Dienst.
   SMTP, E-Mail-Texte, Weiterleitungen, bestehende Sitzungen und Anmeldearten
   werden nicht geändert.

Die vier Booking-Migrationen bleiben ausgeschlossen; keine Edge Function wird
neu veröffentlicht. Der aktuelle Decision-Code bleibt unverändert. Das Schema
und die Zugriffsrechte beider SQL-Dateien sind durch vollständigen Neuaufbau und
positive/negative SQL-Prüfungen abgesichert. Die historische Entstehung der
37 ungültigen Verknüpfungen ist nicht belegt. Reproduziert ist, dass der alte
Einwilligungstrigger eine echte FK-Bereinigung ohne Einwilligung blockiert.

Der [echte AWS-Probelauf](https://github.com/PhiluLan/backyrd/actions/runs/41348866544)
hat zunächst sämtliche Originaldaten, Schema/Rechte, Sequenzen und Medien
abgeglichen und erst danach genau die vorgeschlagene Korrektur auf der
Wegwerfkopie angewandt. Danach bestehen sämtliche geprüften Fremdschlüssel.
Der versiegelte [Beleg](../../delivery/recovery/beta-security-rehearsal-v1.json)
behauptet ausdrücklich **nicht**, die Originalquelle sei bereits fehlerfrei:
`foreignKeysValidated:false`, getrennt davon
`foreignKeysAfterRehearsedRepairValidated:true`. Produktionsschreibzugriffe: 0.
Beleg-SHA-256:
`221c12c857be67bd0e6f90ec624a700ad48c3c527dc80062e2e99b231c44c7f6`.

Freigabe, Zertifizierung, genau dieser SQL/Auth-Umfang sowie die Live-Prüfung
sind abgeschlossen. Als letzter Schritt wird das frische vollständige AWS-Backup
41404678473 erstellt und anschliessend ohne Korrekturmodus wiederhergestellt.
Der abschliessende Lauf muss zusätzlich die vollständige Übereinstimmung
zwischen Storage-Metadateneinträgen und gesicherten Dateipfaden bestätigen
(`storageInventoryMatches:true`); fehlende, zusätzliche und doppelte Dateien
werden abgewiesen.
**Erst der saubere anschliessende Lauf und die Live-Prüfungen schliessen Paket 1 ab.**
Eine Notfall-Umschaltung der echten Produktion und externe Provider-/Signierschlüssel
sind nicht geprobt; ein garantierter vollständiger Rollback wird nicht zugesichert.

Nach Übernahme von PR 674 sind GitHubs verbleibende hohen/kritischen Meldungen
auf das historische, nicht ausgelieferte `mobu/package-lock.json` begrenzt.
Die tatsächlich verwendeten Lockfiles haben diese Schweregrade nicht mehr.
Die Meldungen werden nicht pauschal geschlossen oder verborgen.

## Werkzeugabgleich vom 2. November

Der frische Abgleich meldete zusätzlich das ESLint-Dateiwerkzeug `@humanfs/node`
0.16.7 in den separaten Mobile-/Admin-Lockfiles. Es ist eine Entwicklungsabhängigkeit,
kein App- oder Server-Laufzeitmodul. Beide Lockfiles sind innerhalb des erlaubten
Patchbereichs auf 0.16.8 aktualisiert; Root verwendete diese Version bereits.
Frische Installationen, Typprüfungen und ein gezielter synthetischer Symlink-Test
bestätigen, dass `copyAll()` externe Dateiinhalte nicht mehr als reguläre Dateien
in die Kopie übernimmt. Die verbleibenden Links sind keine freigegebenen Uploads;
der Backup-Importer weist Links weiterhin ab. Quelle:
[Hersteller-Advisory](https://github.com/advisories/GHSA-p498-v437-472g).
Keine App-Funktion, SDK-Version, Rankingregel oder SQL-Datei wurde dafür geändert.
Die produktiven Web-/Admin-Audits vom 2. November bleiben jeweils bei null.
Die übrigen mittleren/niedrigen Werkzeugbefunde bleiben sichtbar und getrennt
von der späteren vollständigen Beta-Sicherheitsabnahme.

## Gefundene Archivpfad-Abweichung

Der neue vollständige Export 41404678473 ist in AWS gesichert. Der anschliessende
Lauf 41406973392 wurde jedoch mit `backup_storage_inventory_mismatch` abgewiesen.
Der Export erstellte das lokale Bucket-Ziel vorab; die gepinnte CLI 2.116.0 hängt
bei existierendem Ziel den Bucket-Namen nochmals an. Das frühere Medien-Rehearsal
prüfte Bytes und Bucket-Regeln, aber noch nicht die ursprünglichen Objektschlüssel.
Sein unveränderter historischer Beleg ist deshalb kein vollständiger Nachweis
korrekter Dateischlüssel.

Neue Exporte erzeugen das Ziel erst beim Kopieren und kennzeichnen ihre Struktur
explizit. Ältere v2-Archive der exakt betroffenen CLI können ohne Änderung am
Archiv gelesen werden: Nur eine vollständige, eindeutige Zuordnung von
`bucket/bucket/key` zu sämtlichen ursprünglichen Datenbankschlüsseln ist erlaubt.
Keine Datei darf fehlen, zusätzlich sein oder zweimal verwendet werden. Neue,
explizit kanonische Archive erhalten diese Kompatibilitätsbehandlung nicht.
Der eigentliche Medien-Replay liest die unveränderten archivierten Bytes und
schreibt sie unter den verifizierten **Originalschlüsseln**, inklusive SHA-256-
Rückleseprüfung. Das verändert keine Produktionsdaten und repariert keine
Datenbankzeilen. Paket 1 bleibt bis zum vollständigen echten Nachweis offen.
