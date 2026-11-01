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

## App-Abhängigkeiten: behoben und verbleibend

Kompatible Sicherheitsupdates wurden unter anderem für `compression`,
`fast-uri`, `js-yaml`, `node-forge`, `source-map-js`, `undici` und
`brace-expansion` innerhalb der bestehenden SDK-Version aufgelöst.

Der produktive npm-Audit sinkt von 50 betroffenen Paketen (hoch 16, mittel 33,
niedrig 1) auf 42 (hoch 6, mittel 35, niedrig 1). Die Zahl zählt auch
übergeordnete Abhängigkeiten derselben Ursache mehrfach und enthält Expo-/Metro-
Werkzeuge. Sie ist keine Anzahl nachgewiesener Angriffswege.

| Verbleibende Ursache | Betroffenheit und nächster Schritt |
| --- | --- |
| `decode-uri-component` 0.2.2 über `query-string`, Router und Navigation | Potenziell relevant für manipulierte Links. Hohe Priorität bei Paket 2: gepatchte Dekodierung mit Router-/Metro-Kompatibilität prüfen. Version 0.5.1 ist ESM; ein blindes Override aus dem CommonJS-Aufrufer ist kein geprüfter Fix. [Primärhinweis](https://github.com/advisories/GHSA-qr28-fpjm-wq7f). |
| PostCSS 8.4.49 | Vom Expo-Metro-Werkzeug auf die 8.4-Reihe begrenzt. Verarbeitung nicht vertrauenswürdiger CSS-/Source-Map-Dateien ist separat vom nativen Laufzeitcode zu beurteilen; kompatiblen Werkzeug-Patch prüfen. |
| image-size 1.2.1 | Bild-Metadaten im Metro-Buildwerkzeug. Keine ungeprüften fremden Bilddateien in den Build aufnehmen; gepatchten Parser mit Metro-Aufrufvertrag prüfen. Version 2 wechselt den Exportvertrag. |
| glob/minimatch, uuid und deepmerge | Verbleibende mittlere/niedrige Meldungen überwiegend in Build-/CLI-Ketten. Mit der Werkzeugmodernisierung und vor Paket 6 auf Erreichbarkeit und kompatible Patches prüfen. |

Kein `npm audit fix --force`, kein stilles SDK-Major-Upgrade oder Downgrade der
nativen Update-Bibliothek. Die verbleibenden hohen Meldungen gelten ausdrücklich
nicht als erledigt. Eine App-Sicherheitsfreigabe folgt daraus noch nicht.

## Entwicklungswerkzeuge und GitHub-Gesamtmeldungen

Der zusätzliche Voll-Audit einschliesslich Entwicklungswerkzeugen ist vom oben
genannten produktiven Web-/Admin-Audit zu trennen. Weitere kompatible Patches
für Archiv-, YAML-, Browserlisten-, Prüf- und Kryptografie-Werkzeuge wurden
eingespielt. Im Root verbleibt dennoch ein kritischer `tar`-Befund über alte
CLI-Installationsketten sowie hohe Meldungen aus deren fest gebundenen Paketen.
Das ist ein offener Befund, keine abgeschlossene Härtung des Buildrechners.
Keine nicht vertrauenswürdigen Archive oder Projekte mit diesen Werkzeugen
verarbeiten. CLI-Aktualisierung beziehungsweise geprüfter Backport ist vor
der finalen Sicherheitsabnahme erforderlich; die für Datenbank-Negativtests
festgelegte CLI-Version wird nicht ungeprüft ausgetauscht.

Der GitHub-Ausgangsstand meldet 311 offene Einträge über fünf Lockfiles,
einschliesslich des nicht mehr verwendeten Web-Lockfiles und `mobu/`. Das
historische `mobu/` ist keine Implementierungsquelle der kanonischen App.
Die GitHub-Liste wird erst nach Übernahme der Änderungen neu ausgewertet und
ist nicht identisch mit einem aktuellen Audit des tatsächlich installierten
produktiven Baums. Offene Einträge werden dadurch nicht pauschal entkräftet.

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
| Schutz gegen kompromittierte Passwörter | Laut Advisor noch nicht aktiv. In Paket 2 zusammen mit Passwortregeln und verständlicher Ablehnung aktivieren und im echten Registrierungsablauf prüfen. |

## Validierung und Releasegrenze

- Web/Admin: Typecheck, bestehende Ablaufverträge und Produktionsbuild mit lokalen
  Platzhaltern für öffentliche Build-Konfiguration. Kein Produktionsschlüssel
  wurde in den Build kopiert.
- Mobile: Typecheck und bestehende Vertrags-/Deep-Link-Prüfungen; native
  Geräteabnahme und Sicherheitsprüfung manipulierter Links bleiben ausstehend.
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
