# Beta: Sicherheits-Ausgangsstand

Stand: 1. November 2026. Basis: `d53cd3bca508c5803395d967d32286ab106672cf`.
Dies ist die Bestandsaufnahme und erste Härtung aus Paket 1, keine vollständige
Sicherheitsabnahme der Beta. Die abschliessende Ablauf- und Sicherheitsabnahme
bleibt Paket 6. Unveröffentlichte Korrekturen schützen Produktion noch nicht.

## Gesicherter Ausgangspunkt

- Vollständiger AWS-Backup-Lauf [41335894428](https://github.com/PhiluLan/backyrd/actions/runs/41335894428)
  im Modus `weekly`: am 1. November um 18:26 UTC erfolgreich. Datenbank und
  140 Storage-Dateien, bestehende private KMS-verschlüsselte Ablage geprüft.
- Der Backup-Quellstand ist `b7d263fb39ed9b9bb16290b7dc565c737d82cb35`.
  Ein frischer Wiederherstellungstest dieses Exports steht aus. Frühere
  Wiederherstellungsnachweise sind kein Nachweis für genau diesen Export.
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
| Mobile einschliesslich Expo-/Metro-Werkzeugen | 36: hoch 0, kritisch 0, mittel 35, niedrig 1 | Mehrfachzählung transitiver Eltern; vier verbleibende Ursachen unten. |
| Root einschliesslich EAS/Entwicklungswerkzeugen | 40: hoch 0, kritisch 0, mittel 38, niedrig 2 | Kein produktiver Web-Befund; Werkzeugrisiken bleiben getrennt sichtbar. |
| Admin einschliesslich Entwicklungswerkzeugen | 17 mittel, hoch/kritisch 0 | Nicht mit dem produktiven Admin-Baum verwechseln. |

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
nicht aufgrund eines beliebigen Fehlers. Die Konfiguration des echten
Passwortschutzes ist weiterhin **nicht aktiviert**. Der vorbereitete Deployer
kann genau `password_hibp_enabled=true` setzen, ohne SMTP-Zugangsdaten,
E-Mail-Vorlagen oder Weiterleitungen anzufassen. Die Aktivierung braucht den
konkreten begrenzten Produktionsplan und anschliessende Verifikation.

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
Fehler. Dieser Vorabtest ersetzt ausdrücklich nicht den ausstehenden
Nachweis für das echte aktuelle AWS-Archiv.

## Weitere Supabase-Hinweise

Produktionsprojekt beim Abgleich: `ACTIVE_HEALTHY`. Die Bestandsaufnahme vom
1. November meldet weiterhin folgende Gruppen; sie sind keine pauschal
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
Keine Auth-Konfiguration, Edge Function, Nutzerinteressen oder echten Spotdaten
wurden durch diese Arbeit verändert. Eine Veröffentlichung der neuen SQL-Datei
braucht den konkreten begrenzten Releaseplan und dessen bestehende Risikofreigabe.
