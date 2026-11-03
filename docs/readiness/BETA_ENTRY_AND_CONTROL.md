# Paket 2: Einstieg und Kontrolle

Stand: 2. November 2026. Ausgangspunkt: Main `664509f7bf165caff3bdc1b67eb1de0f0d0c718a`.

**Noch nicht vollständig grün.** Die Änderungen und die lokale Ablaufprüfung sind
vorbereitet. Die native Geräteabnahme und der produktive Release dieses Pakets
sind noch offen. Paket 1 bleibt unverändert abgeschlossen. Weitere Beta-Pakete
wurden hier nicht begonnen.

## Was sich für Menschen ändert

- Anmeldung und Registrierung können auch durch schnelles Tippen oder die
  Tastatur keinen zweiten parallelen Versuch starten. Passwortfelder bieten
  passende Hinweise für Passwortmanager; Passwörter werden weder gekürzt noch
  automatisch grossgeschrieben oder korrigiert. Eine fehlende gespeicherte Sitzung
  führt zur Anmeldung und wird nicht als Verbindungsstörung behandelt. Das
  Abmelden im Browser beendet wie beschriftet nur diese Browser-Sitzung. Bereits vorhandene Konten,
  offene Bestätigungen und nicht bestätigte Registrierungen bleiben getrennt.
- Der vollständige sechsstellige E-Mail-Code wird nach Einfügen automatisch
  genau einmal versucht. Nach einem Fehler bleiben Korrektur und ausdrückliche
  Wiederholung möglich. Erneuter Versand hat Rückmeldung und eine sichtbare
  Wartezeit. Es gibt nun auch im Browser ein Codefeld; bestehende Links und der
  Einstieg in die App bleiben erhalten. Eine Versandanforderung behauptet keine
  tatsächliche Zustellung.
- Ein fehlender/abgelaufener Passwortlink bietet einen neuen Link an, bevor ein
  neues Passwort eingegeben wird. Ein gespeichertes Passwort und eine eventuell
  fehlgeschlagene anschliessende Abmeldung werden unterschiedlich gemeldet.
  Die Rückleitung bleibt auf dem ursprünglichen Browser-Host; ein Wechsel von
  `127.0.0.1` zu `localhost` hatte im echten lokalen Ablauf die Sitzung verloren.
  Externe Rücksprungziele über `next` und Backslash-/Encoding-Varianten werden
  nicht akzeptiert.
- Onboarding lädt vorhandene Angaben. Ein fehlgeschlagener Abruf zeigt eine
  Wiederholung statt eines scheinbar leeren neuen Profils. Namensvorschläge für
  den Benutzernamen folgen dem vollständigen Namen, bis der Benutzername selbst
  bearbeitet wurde. Die bestehenden Servergrenzen gelten: Name 2–60 Zeichen,
  Benutzername 3–24, Alter als ganze Zahl 13–120, Stadt/Land höchstens 80 Zeichen.
  Die Stadt kann ohne Standortfreigabe selbst eingegeben werden.
- Die App respektiert eine dauerhaft abgelehnte Geräteberechtigung ohne weitere
  OS-Anfrage. Passive Entdeckung fordert bereits vorher keine Berechtigung an;
  dieser bestehende Weg ist mitgeprüft. Nicht erteilte Einwilligung verhindert
  Geräte-/Positionsabfragen. GPS-Ausfälle werden nicht als echte Distanz ausgegeben.
- Profilentwürfe sind vom angezeigten gespeicherten App-Profil getrennt.
  Abbrechen kann Änderungen verwerfen oder weiter bearbeiten. Browserformulare
  und das App-Onboarding schützen vor versehentlichem Verlassen. Bei Fehlern
  bleiben Eingaben im Formular; sie werden nicht in ungeschützten Browserspeicher
  geschrieben. Kontowechsel verwerfen den vorherigen privaten Entwurf; verspätete
  Antworten eines vorherigen Kontos dürfen das neue Profil nicht überschreiben.
  Ein App-Prozessabbruch ist keine zugesicherte Entwurfssicherung.
- Profil- und Foto-Erfolg verlangt eine tatsächlich zurückgegebene eigene Zeile.
  Eine leere erfolgreiche HTTP-Antwort ist kein Speicherbeleg. Neue Profilfotos
  werden ausdrücklich sofort gespeichert. App und Web verwenden den bestehenden
  erlaubten Schlüssel `avatar_<eigene UUID>_<eindeutiger Zusatz>`; der bisherige
  App-Schlüssel `<UUID>/avatar` wurde von der vorhandenen Storage-Regel abgelehnt.
  Der öffentliche Name kann auf beiden Oberflächen gepflegt werden. Sicherheits-
  snapshots enthalten auch diesen Namen; der Web-Snapshot wird tatsächlich
  ausgeführt und nicht nur als nicht gestartetes Query-Objekt erzeugt.
- Einwilligungen melden Erfolg oder Fehler und prüfen die Speicherantwort.
  Gleichzeitige Änderungen überschreiben keinen laufenden Zustand. Erforderliche
  Grundlagen werden nicht als erteilte optionale Einwilligung erfunden.
  Entscheidungen und Dokumente sind direkt erreichbar; Verlaufsereignisse haben
  verständliche Beschriftungen. Widerruf bleibt möglich.
- Die bestehende Privat-Regel entfernt Follower **und** eigene Folge-Verbindungen.
  Das wird jetzt vor dem Umschalten erklärt. Öffentlichstellen stellt diese
  Verbindungen nicht wieder her. Die Regel selbst wurde nicht geändert.
- Der Browser bietet den bestehenden erforderlichen Dokumenten einen echten
  Bestätigungsablauf. Ohne bestätigte Antwort und erneute Prüfung des Gate-Status
  geht es nicht weiter. Optionale Zwecke werden nicht damit gebündelt. Auch in der
  App darf eine falsche/fehlende Bestätigungsantwort nicht als Erfolg weiterleiten.

## Technische Grenzen

Die vorhandenen RPCs bleiben kanonisch: `complete_profile_onboarding_v2`,
`get_my_legal_gate_status_v1`, `get_my_pending_legal_documents_v1`,
`accept_legal_document_v1`, `get_my_consent_state_v1`, `set_my_consent_v1`,
`set_my_profile_privacy_v1` sowie die Safety-Snapshots. Profiländerungen und Fotos
bleiben in den bisherigen eigenen Zeilen bzw. im bisherigen Bucket. Es gibt
keine neue Migration, keine geänderte RLS-/Storage-Regel, keine Auth-Konfigurations-
änderung und keine Änderungen an Decision, Ranking, Booking oder Owner-Regeln.

Die produktiven Profilfoto-Regeln und Bucket-Grenzen wurden ausschliesslich
lesend geprüft: öffentliches Profilfoto-Bucket, 8 MiB, JPG/PNG/WebP/HEIC/HEIF/AVIF,
und der oben genannte eigene Dateinamen-Präfix. Es wurden keine produktiven
Testkonten, Profile, Fotos, Einwilligungen oder SMTP-Nachrichten angelegt.

## Tatsächliche lokale Ablaufprüfung

[Browserfälle](../../web/e2e/account-entry.spec.ts) laufen gegen ein eigenes
lokales Supabase Auth/PostgREST/Storage und Mailpit. Testkonten benutzen
`@backyrd.test`. Eine bestehende synthetische Backyrd-Schemafixture aus Paket 1,
der reguläre Auth-Profiltrigger und die bestehenden Trust-/Safety-Referenzregeln
sind geladen. Die fehlenden Referenzdaten wurden ergänzt; es wurden weder Trigger
noch Safety/RLS zur Erzeugung eines Erfolgs abgeschaltet. Nur die ausdrücklich
benannten Fehlerfälle ersetzen einzelne Transportantworten.

Bestanden:

1. echte Registrierung → E-Mail im lokalen Postfach → eingefügter Code →
   erforderliches Dokument → Onboarding → gespeichertes Profil;
2. abgelaufener Code: ein automatischer Versuch, verständlicher Fehler,
   ausdrückliche Wiederholung;
3. erneuter Codeversand mit Rückmeldung und Wartezeit;
4. vorhandenes Onboarding-Profil und Ablehnung von `13abc` vor einem Schreibaufruf;
5. Profilantwort ohne Zeile: kein Erfolg; Entwurf bleibt; echter erneuter Versuch
   und Neuladen zeigen den gespeicherten Namen;
6. persönliche Vorschläge aktivieren, neuladen, widerrufen, neuladen; andere
   optionale Zwecke bleiben aus;
7. Privat-Umschaltung mit erklärter Folge, Abbrechen und bestätigtem Speichern;
8. Passwort-Rücksetzen ohne Sitzung bietet einen neuen Link;
9. Code-Seite auf 320 px mit vergrösserter Schrift, ohne horizontales Überlaufen
   und ohne schwere/kritische Axe-Befunde;
10. echte Wiederherstellung über den E-Mail-Link, Passwort speichern, Rückkehr
    zur Anmeldung; neues Passwort funktioniert, altes nicht;
11. verweigerter Einwilligungsschreibaufruf behauptet keinen aktivierten Zustand;
12. abgebrochenes Verlassen lässt den Profilentwurf stehen;
13. angemeldetes Konto kann eine fremde rohe Profilzeile weder lesen noch ändern;
14. echtes synthetisches Profilfoto durch Storage-Regel, Profil-Update und Neuladen;
15. nicht bestätigte Dokumentenübernahme bleibt stehen; erfolgreicher erneuter
    Versuch führt erst danach weiter;
16. fehlgeschlagener Profilabruf zeigt Wiederholung statt leeres Formular;
17. Login, Registrierung, Passwortanforderung, Rücksetzen und Code-Eingabe auf
    320 und 430 px mit 200 % Grundschrift ohne horizontales Überlaufen;
18. Browser abmelden → erneuter privater Aufruf führt zur Anmeldung; eine
    getrennte Sitzung kann weiterhin erfolgreich ihr Token erneuern;
19. Kontowechsel in einem zweiten Browser-Tab entfernt den privaten Entwurf des
    vorherigen Kontos, ohne ihn in dessen Profil zu speichern.

Zusätzlich prüfen die App-Fälle die tatsächliche Standort-Hilfsfunktion:
kein Gerätezugriff ohne Einwilligung, keine neue OS-Anfrage bei dauerhafter
Ablehnung, keine OS-Anfrage bei passiver Entdeckung und eine zulässige erste
Anfrage nach ausdrücklicher Aktion. Bestehende Start-/Deep-Link-, Moment-
Entwurfs- und Produktverträge bleiben mitgeprüft. Typprüfungen und native
Hermes-Exporte sind technische Belege, kein Ersatz für die folgenden Gerätefälle.

Die 19 Abläufe bestehen auch gegen den gebauten Next.js-Produktionsmodus.
Vier bestehende Browserregressionen für Anmeldung, langsame Antwort, Sitzung/
Logout und Momente bestehen ebenfalls. Web-/App-Typprüfungen, die relevanten
Verträge, vierzehn App-Einstiegs-/Datenschutzfälle und beide Hermes-Exporte bestehen.
Der lokale Produktionsbuild besteht mit dem unterstützten Webpack-Bundler.
Turbopack scheitert hier am Start seines lokalen CSS-Workers mit einer
Port-Berechtigung; diese Umgebungsgrenze wird nicht als erfolgreicher
lokaler Turbopack-Build ausgegeben. Der reguläre Turbopack-Build und alle
erforderlichen Prüfungen für Commit `f4a3896b` bestehen auf GitHub:
[CI 41428077766](https://github.com/PhiluLan/backyrd/actions/runs/41428077766).
[PR #683](https://github.com/PhiluLan/backyrd/pull/683) bleibt ein Entwurf.

Die lokalen Audit-Daten verhindern teilweise eine beliebige Admin-Löschung der
Testkonten. Deshalb wurde die ganze disposable Umgebung einschliesslich ihrer
Datenvolumes nach der Prüfung entfernt; verbleibende Testcontainer/-volumes: 0.
Diese Suite verwendet niemals Produktion. Statusdateien enthalten ausschliesslich lokale Testschlüssel und
gehören nicht ins Repository oder in Screenshots/Logs.

## Passwortmanager: nativer Build erforderlich

Zusätzlich zu Feldhinweisen benötigt Password AutoFill die gemeinsame Website-/
App-Verknüpfung. In der bestehenden Konfiguration war nur `applinks` vorhanden.
Jetzt sind `webcredentials:www.backyrd.ch` und der gleichnamige AASA-Dienst für
**ausschliesslich** `7B3B8TL6J9.com.philipplanger.backyrd` vorbereitet. Bestehende
Universal-Link-Pfade bleiben unverändert; Development-Builds beanspruchen die
produktive Domain weiterhin nicht.

Die AASA-Datei muss auf der produktiven Domain ausgeliefert werden und ein neu
signierter iOS-Build muss die zusätzliche Associated-Domains-Angabe enthalten.
Ein OTA-Update kann diese native Angabe nicht ergänzen. Die vorgeschlagenen
JS-Änderungen bleiben mit dem bisherigen Runtime kompatibel; vollständiges
Passwort-Autofill wird aber erst nach neuem Build, Domainprüfung und echtem
Gerät abgenommen. Dies ist kein Wechsel auf Passkeys und keine Ausweitung der
vertrauenswürdigen App-Identitäten. Die nativen Kamera-/Foto-Hinweise verwenden
verständlich „Moment“ und erklären auch die Verwendung ausgewählter Profilfotos.

Referenzen: [Apple: Password AutoFill workflow](https://developer.apple.com/documentation/security/about-the-password-autofill-workflow),
[Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains).

## Noch erforderliche Geräteabnahme

Auf einem echten iPhone mit dem **neuen** Stand prüfen:

- Passwortmanager: vorhandene Zugangsdaten anbieten, neuen Zugang speichern,
  Passwort ohne Grossschreibung/Korrektur übernehmen;
- vollständigen E-Mail-Code aus der System-/Zwischenablage übernehmen, ohne
  doppelten Versuch; korrekter Eintritt und klare abgelaufene Bestätigung;
- Apple-Anmeldung erfolgreich abschliessen und Abbrechen ohne Fehlermeldung;
- erforderliche Dokumente, Profilanlage, Sitzung nach Hintergrund/Neustart;
- Standort ablehnen, Stadt manuell weiter verwenden und kein wiederholter Prompt;
- Foto wählen/abbrechen/speichern, Profilentwurf abbrechen/erneut versuchen;
- grosse Systemschrift und kleine/grosse Bildschirmdarstellung im nativen UI.

Am 3. November ist das iPhone 16 verbunden; die App lässt sich über die
iPhone-Synchronisierung öffnen. Installiert ist Version 1.1.0, Build 59, aus dem
EAS-Build vom 29. September (Commit `52286323`). Das ist kein Abnahmebeleg für
Paket 2. Der Founder hat die Übertragung des geprüften Codes an das bestehende
Expo-Projekt und die Erstellung des Cloud-Builds ausdrücklich freigegeben.
Build **60** ist als Store-Artefakt ohne Auto-Submit erfolgreich fertiggestellt:
[Expo-Build 654e347e](https://expo.dev/accounts/philipplanger/projects/backyrd/builds/654e347e-25d5-4173-9ebe-afc54ae6a9fe).
Der Auftrag verwendet `--freeze-credentials`; keine neue Signierung, kein OTA
und keine App-Store-Veröffentlichung sind beauftragt. Das heruntergeladene IPA besteht die bestehende Bundle-/Provisioning-Prüfung
und `codesign --verify --deep --strict`. App-ID, Team, Version 1.1.0/Build 60,
`get-task-allow=false`, beide Associated Domains und die neuen Kamera-/Foto-Texte
sind am erzeugten Paket geprüft. IPA-SHA-256:
`df37d898957d42fd6832e81968ae086324b1cbcfdfcb40315a7903379a0b2051`.

Das Paket wurde nicht an Apple/TestFlight übermittelt und nicht auf dem Gerät
installiert. Als Store-signiertes Paket benötigt es den TestFlight-Weg für die
Geräteabnahme. Die öffentliche Website liefert die neue Password-AutoFill-
Zuordnung noch nicht aus (am 3. November lesend geprüft). Diese Veröffentlichung
und der TestFlight-Transfer sind von der reinen Build-Freigabe getrennte Schritte.
Die eigentlichen nativen Abnahmefälle bleiben offen. Ein neuer Release oder Preview muss
eindeutig auf den hier geprüften Stand zeigen; die bisherige produktive App
beweist diese Änderungen nicht. Keine destruktive Privat-Umschaltung an einem echten Konto mit
Folge-Verbindungen als Test verwenden. Die entsprechende Verhaltensprüfung bleibt
auf isolierten Konten.

Android-Hermes-Export und gemeinsame Eingabelogik werden in Paket 2 mitgeprüft.
Die native Google-Anmeldung und vollständige Android-Verteilung bleiben als
Geräte-/Store-Abnahme in Paket 7 und der gemeinsamen Beta-Abnahme in Paket 6 offen.
