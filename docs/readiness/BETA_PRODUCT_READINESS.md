# Backyrd Beta Arbeitsumfang und Abnahme

Stand: 3. November 2026. Ausgangspunkt ist Main `b7d263fb39ed9b9bb16290b7dc565c737d82cb35`.

Die Beta soll den gesamten Weg vom ersten Einstieg bis zum echten Erlebnis und
anschliessenden Moment verständlich und zuverlässig unterstützen. Der Umfang
umfasst App, Consumer Web, Owner und Admin. Vorhandene Bildschirme gelten erst
nach einer vollständigen Ablaufprüfung als abgenommen. Eine grüne technische
Prüfung ersetzt diese Abnahme nicht.

## Paketstatus

**Paket 1 ist abgeschlossen und grün.** Die freigegebenen Sicherheitskorrekturen
sind live. Das frische vollständige AWS-Backup vom 2. November ist auf zwei
isolierten Zielen tatsächlich wiederhergestellt und mit Datenbank, Rechten,
Fremdschlüsseln, Original-Medienschlüsseln und Bytes abgeglichen.
[Abschluss und Belege](BETA_SECURITY_FOUNDATION.md#abschluss-paket-1-grün-am-2-november-2026).
Paket 2: [Einstieg und Kontrolle](BETA_ENTRY_AND_CONTROL.md). Die lokale
Ablaufprüfung ist bestanden. Der Founder hat am 3. November nach Installation
von iOS-Build 60 alle zehn vorgelegten Geräte-Abnahmepunkte als bestanden
bestätigt. Die Website-Zuordnung für Password AutoFill ist über PR #684 live
und auch auf Apples CDN verifiziert. Offen sind deren gezielter Gerätetest und
der produktive Release der übrigen Paket-2-Änderungen. Paket 2 ist noch nicht
vollständig grün.
Die vollständige Beta-Sicherheits-/Geräteabnahme bleibt Paket 6.

## Erfasster Umfang

„Vorhanden“ bedeutet hier im aktuellen Code nachvollzogen, nicht frisch auf
allen Geräten bestanden. „Offen“ bezeichnet eine noch ausstehende Abnahme oder
Implementierung, nicht automatisch einen nachgewiesenen Fehler.

| Arbeitsbereich | Aktueller Befund | Ergebnis für die Beta |
| --- | --- | --- |
| Anmeldung und Registrierung | Gemeinsame Auth-Oberfläche, Registrierung, Login, Bestätigung und Passwortwiederherstellung vorhanden. | Ein neuer Nutzer versteht jeden Schritt; Fehler, abgelaufene Codes, erneutes Senden, Rückkehr aus E-Mail und Sitzungsablauf führen zu einer klaren nächsten Aktion. |
| Passwort und Bestätigungscode | iOS-Feldkennzeichnungen für Passwort, neues Passwort und Einmalcode vorhanden. Die Bestätigungsseite verlangt aktuell eine bewusste Bestätigung; automatisches Absenden ist nicht nachgewiesen. | Passwortmanager und Einfügen des vollständigen Codes auf echten Geräten prüfen; gegebenenfalls einmaliges automatisches Bestätigen mit Schutz gegen doppelte Requests ergänzen. Keine eigene Klartext-Passwortspeicherung. |
| Onboarding | Mobile und Web haben Profil-Onboarding; Namen, Benutzername, Alter und Ort werden verarbeitet. Texte und Übergänge sind nicht gemeinsam frisch abgenommen. | Verständlicher Einstieg, sinnvolle Pflichtfelder, kein Verlust bei Abbruch oder Wiederaufnahme, konsistente Sprache und keine unnötigen Berechtigungsfragen. |
| Standort | Zentrale Verarbeitung unterscheidet fehlende Einwilligung, verweigerte Freigabe, ausgeschaltete Dienste und nicht verfügbare Position. | Jede betroffene Oberfläche bleibt mit manueller Ortswahl nutzbar. Keine erfundene Entfernung oder wiederholte OS-Abfrage nach Ablehnung. |
| Wetter | Decision versteht Wetterangaben und Wetterbedingungen. Daraus folgt keine angebundene aktuelle Wettervorhersage. | Serverintegration mit Datum, Region, Aktualität und Quellenstatus; bei Ausfall ehrlich unbekannt. Wetter darf eine explizite Nutzerabsicht nicht heimlich ersetzen. |
| ÖV Basel | Eine aktuelle produktive Fahrplanintegration ist in dieser Bestandsaufnahme nicht nachgewiesen. | Zunächst Haltestellen, Abfahrten und Übergabe an eine Route prüfen. Anbieter, Nutzungsbedingungen, Kosten und Echtzeitabdeckung entscheiden. Verbindungen, Verspätungen und Reiseplanung sind ein zusätzlicher Umfang. |
| Speichern, Teilen und Empfehlen | Favoriten, soziale Speicherzustände und öffentliche Verweise sind vorhanden; die vollständige Matrix ist offen. | Speichern/Entfernen bleibt nach Neustart korrekt; Teilen öffnet das richtige Ziel auch ohne Anmeldung. Persönliche Empfehlung und öffentliche Veröffentlichung sind verständlich getrennt. |
| Profilbearbeitung | Profil, Einstellungen und öffentliche Nutzeransicht vorhanden. | Änderungen speichern sichtbar und dauerhaft; Avatar, Namen, Benutzername, Sichtbarkeit und Fehlerbehandlung passen auf App und Web zusammen. Versehentliche Datenverluste verhindern. |
| Moods | Kanonische Mood-Verarbeitung, Moment-Angaben und Ortszusammenfassungen vorhanden. | Bedeutung, Auswahl, Änderung und Aggregation sind konsistent. Kein erfundenes Stimmungswissen, keine Sternelogik und keine widersprüchlichen Zählungen. |
| User Learning | Die aktive Decision verarbeitet eine einwilligungsgebundene Nutzerprojektion und kanonische Lernereignisse. | Verständlich zeigen, was gelernt wird, welche Einwilligung gilt und wie Rücksetzen/Widerruf wirken. Neutraler Betrieb ohne Personalisierung bleibt möglich. |
| Moments und Social | Moment-Fluss, Follow/Unfollow, Likes, Feed und Chat mit Text-/Bildversand vorhanden. | Erstellen, Abbrechen, Wiederholen, Bearbeiten, Löschen, Sichtbarkeit, Zähler und Push-Ziele mit zwei getrennten Testkonten durchspielen. Freundschaft ist nicht automatisch dasselbe wie Folgen. |
| Markierungen und Empfehlungen | Ein vollständiger Ablauf für Personenmarkierungen ist noch nicht nachgewiesen. | Festlegen, ob nur Orte oder auch Personen markiert werden. Erwähnung darf keinen privaten Inhalt freigeben und muss Blockierungen respektieren. |
| Chat | Direkte Chats und private Bildpfade mit signierten URLs vorhanden. | Kein fremder Chat-/Bildzugriff; kein Doppelversand; Entwürfe bleiben bei Fehlern erhalten. Sperren, Melden, Benachrichtigungen und erneute Verbindungen zusammen prüfen. |
| Datenschutz und Einwilligungen | Einstellungen, Datenrechte, Rechtstexte, Einwilligungsansichten und Sicherheitsstatus vorhanden. | Anmeldung, Widerruf, Export, Kontolöschung und Folgen für Medien, Learning und Sichtbarkeit vollständig abnehmen. Keine unnötige Bindung der Kernnutzung an Personalisierung. |
| Moderation, Sperren und Einspruch | Admin-Safety und Nutzeransichten für Meldungen/Massnahmen vorhanden. | Melden → verständliche Rückmeldung → menschliche Prüfung → begründete Massnahme → Einspruch → Entscheidung. Zugriff und Schutz müssen auch serverseitig gelten. |
| Owner | Einstieg, Ortszuordnung, Pflege und Einblicke vorhanden. Ohne verbundenen Ort verweist der aktuelle Einstieg auf eine persönliche Zugangsanfrage. | Anspruch anmelden, Identität prüfen, Zuordnung bearbeiten, Ablehnung/erneute Prüfung und erste Profilpflege verständlich abschliessen. Fremde Orte und Ranking bleiben geschützt. |
| Gestaltung und Sprache | Gemeinsame Komponenten existieren; daneben bestehen ältere Texte und unterschiedliche Oberflächen. | Alle Routen mit Typografie, Abständen, Zuständen und Begriffen abgleichen. „Moment“ und „Ort“ konsistent; keine technischen Fehlertexte im normalen Nutzerfluss. |
| Android | Gemeinsame Expo-/React-Native-Basis, Android-Konfiguration und EAS-Produktionsprofil vorhanden. Das beweist keine aktuelle Android-Geräte- oder Store-Abnahme. | Native Android-Version mit korrekter Anmeldung, Berechtigungen, Kamera/Uploads, Tastatur, Zurück-Navigation, Karten, Links, Push und Updates prüfen. Signierung, Testverteilung und Google-Play-Einreichung separat abschliessen. |

## Reihenfolge

1. **Sicherer Ausgangsstand:** frisches vollständiges AWS-Backup, Release-Identität,
   Decision-Dokumentation und Triage bekannter Sicherheitsmeldungen. Sicherheit
   begleitet alle weiteren Pakete.
2. **Einstieg und Kontrolle:** Auth, Autofill, Bestätigungscode, Onboarding,
   Standortablehnung, Profil und Einwilligungen als zusammenhängender Ablauf.
3. **Erleben und soziale Nutzung:** Speichern, Teilen, Moments, Moods, Following,
   Chat und Markierungen einschliesslich Sichtbarkeit und Moderation.
4. **Kontextintegrationen:** Wetter zuerst; ÖV als klar begrenzte Integration mit
   eigener Quelle und Ausfallbehandlung. Keine neue Empfehlungsengine.
5. **Owner und Oberflächen:** Owner-Onboarding und Pflege vereinfachen; App, Web,
   Owner und Admin anhand derselben Gestaltungsregeln abnehmen. Designkorrekturen
   aus den vorherigen Paketen werden bereits dort erledigt.
6. **Beta-Abnahme:** vollständige Geräteprüfung, Berechtigungs-Negativtests,
   aktuelle Last-/Kostenprüfung und abschliessende Sicherheitsprüfung.
7. **Android-Version:** vorhandene gemeinsame App-Basis vervollständigen,
   Android-spezifische Funktionen und Darstellung prüfen, signierten Testbuild
   bereitstellen und die Veröffentlichung über Google Play vorbereiten.

Android wird bei gemeinsamen Komponenten ab Paket 2 mitgeprüft. Paket 7 bündelt
die nativen Restarbeiten und die Verteilung. Die gemeinsame Beta-Freigabe aus
Paket 6 ist erst abgeschlossen, wenn auch die Android-Abnahme bestanden ist.

Jedes Paket endet mit einer Vorher-Nachher-Darstellung, den tatsächlich
geänderten Abläufen, geprüften Normal-/Fehlerfällen und den verbleibenden
Punkten. Ein Paket wird nicht durch die Anzahl bestandener Unit-Tests abgenommen.

## Zusammenarbeit und nötige Entscheidungen

Der Ablauf je Paket ist Bestandsprüfung → konkrete Änderung → Normal- und
Fehlerfälle prüfen → verständliche Vorher-Nachher-Abnahme → Veröffentlichung
nach vereinbartem Releaseumfang. Neue Befunde werden nach Auswirkung eingeordnet;
sie erweitern nicht stillschweigend den Funktionsumfang. Gemeinsame Komponenten,
Sprache und Sicherheitsgrenzen werden bereits im jeweiligen Paket mitgeführt.

Vorhandene Berechtigungen und Zugänge werden weiter genutzt. Passwörter,
Provider-Schlüssel, Signierschlüssel und Zertifikate gehören nicht in den Chat.
Benötigte Anmeldungen erfolgen im regulären Konto; Secrets nur im dafür
vorgesehenen Secret-System. Für jede Entscheidung kommt eine konkrete Vorlage,
keine unvorbereitete Technikfrage.

| Paket | Benötigter Beitrag des Founders |
| --- | --- |
| 1 Sicherheit und Ausgangsstand | Bestehende Betreiberzugänge bei Bedarf erneuern; konkrete sicherheitsrelevante Produktionsänderungen und verbleibende Risiken prüfen. Ein frischer vollständiger AWS-Export und die Decision-Dokumentation sind bereits vorhanden. |
| 2 Einstieg und Kontrolle | Zielgruppe/Mindestalter, sinnvolle Pflichtangaben, gewünschte Anmeldearten und Darstellung öffentlicher Profildaten festlegen. Ein neues Testkonto auf einem echten Gerät durchspielen; notwendige Rechtstexte fachlich verantworten. |
| 3 Moments und Social | Sichtbarkeit, Kontakt-/Nachrichtenregeln, Unterschied Freunde/Folgen und Personenmarkierungen entscheiden. Zwei getrennte Testkonten bereitstellen bzw. deren Anlage autorisieren; Moderationszuständigkeit und Kommunikationsstil festlegen. |
| 4 Wetter und ÖV | Konkreten Nutzernutzen und Budget entscheiden. Neue Providerkonten bei Bedarf selbst eröffnen und Zugänge sicher hinterlegen. ÖV bleibt bis zur Nutzen-/Aufwandsentscheidung optional. |
| 5 Owner und Gestaltung | Zwei reale Owner-Anwendungsfälle und gewünschte Markenwirkung beurteilen. Entscheiden, welche Angaben ein Owner selbst veröffentlichen darf und welche Prüfung brauchen. |
| 6 Beta-Abnahme | Zielgruppe und Verteilungsweg der Beta festlegen, unabhängige Testpersonen organisieren und an der Geräteabnahme teilnehmen. Zuständigkeit für Support und Moderation bestätigen. |
| 7 Android | Vorhandenen Google-Play-Console-Status und Kontoinhaber klären; ein echtes Android-Testgerät und Testpersonen organisieren. Store-Texte, Anbieterangaben und finale Einreichung abnehmen; bestehende Signierung bewahren. |

Entscheidungen werden erst beim betroffenen Paket angefragt. Routinemässige
Entwicklung, Tests und reversible Korrekturen brauchen keine erneute Zustimmung.

## Historische Sicherheitsbefunde der ersten Inventur vom 1. November

Die erste Inventur war kein Penetrationstest und kein Nachweis einer Ausnutzung.
Die folgenden Werte beschreiben den damaligen Ausgangspunkt, nicht den jetzigen
Stand. Bearbeitung und aktuelle Ergebnisse stehen im verlinkten P1-Abschluss:

- `npm audit --omit=dev` meldet im Root/Consumer-Web-Kontext 4 betroffene
  Abhängigkeiten: 1 kritisch, 2 hoch, 1 mittel. Im separaten Admin-Lockfile sind
  es ebenfalls 4; dies sind keine 8 unabhängig nachgewiesenen Sicherheitslücken.
  Next.js ist eine direkte betroffene Abhängigkeit. Der Admin pinnt 16.3.3.
  Die Maintainer beschreiben unter anderem kritische Probleme in
  [Image Optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
  und bestimmten [use cache-Funktionen](https://github.com/advisories/GHSA-673q-mjm6-r5xr).
  Betroffenheit der tatsächlich verwendeten Funktionen prüfen und kompatible
  Sicherheitsupdates mit Builds und Ablaufprüfungen durchführen.
- Der separate Mobile-Audit meldet 50 betroffene Abhängigkeiten: 16 hoch,
  33 mittel, 1 niedrig, keine kritische. Native und serverseitige Angriffswege
  getrennt prüfen; keine unkontrollierten SDK-Major-Upgrades über `audit fix --force`.
- Der Supabase Security Advisor meldet eine View mit Definer-Verhalten,
  46 Funktionen mit veränderlichem Suchpfad sowie weitere Prüfhinweise zu
  GraphQL, Funktionsberechtigungen und Passwortschutz. Absicht, Erreichbarkeit,
  Datenumfang und positive/negative Berechtigungstests pro Befund prüfen.
  Eine Warnung ist weder automatisch eine Datenlücke noch automatisch harmlos.
  Einordnung anhand der Supabase-Hinweise zu
  [Definer-Views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)
  und [veränderlichem Suchpfad](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- Die 173 Hinweise „RLS aktiviert, keine Policy“ sind nicht pauschal fehlender
  Schutz: Bei bewusst geschlossenen internen Tabellen kann genau dies die
  gewünschte Zugriffsverweigerung sein. Keine Policies allein zum Beruhigen des
  Advisors hinzufügen.

Zur Sicherheitsabnahme gehören fremde Profile/Chats/Medien, Owner-Zuordnungen,
Admin-RPCs, API-Schlüssel, Uploads, Deep Links, Missbrauchskosten, Social-Spam,
Manipulation von Moods/Learning und Einsprüche. Tests zunächst mit isolierten
Fixtures; keine Angriffslast und keine veränderten echten Nutzerinteressen in
Produktion. Absolute Unangreifbarkeit wird nicht versprochen.

## Nachweise und Arbeitsgrenzen

- Paket 1: [Sicherheits-Ausgangsstand und erste Korrekturen](BETA_SECURITY_FOUNDATION.md).
  Live-Release und saubere echte Wiederherstellung sind mit unveränderlichen
  Nachweisen abgeschlossen. Verbleibende mittlere/niedrige Werkzeughinweise und
  die spätere vollständige Sicherheitsabnahme bleiben ausdrücklich sichtbar.
- Paket 2: [Einstieg, Profil und Einwilligungen](BETA_ENTRY_AND_CONTROL.md),
  einschliesslich tatsächlich geprüfter Abläufe und noch offener Gerätefälle.
- Aktueller Decision-Ablauf: [Decision Runtime](../decision-vnext/CURRENT_PRODUCT_RUNTIME.md).
- Backup: [bestehender AWS-Workflow](../../.github/workflows/production-backup.yml),
  [vollständiger manueller Lauf 41404678473](https://github.com/PhiluLan/backyrd/actions/runs/41404678473),
  Modus `weekly`, am 2. November um 07:31 UTC erfolgreich abgeschlossen.
  Bestätigt sind Datenbankexport, 140 Storage-Dateien, erfolgreicher AWS-Upload
  und die bestehende KMS-Verschlüsselungsprüfung. Der gesicherte Quellstand ist
  `81f25c6b6ee147b4f97ac66498343c5f7030976f`.
- [Wiederherstellungsablauf](../operations/DATABASE_AND_MEDIA_RECOVERY_RUNBOOK.md):
  Ein erfolgreicher Export allein ist kein Wiederherstellungstest. Der echte
  [Lauf 41408295475](https://github.com/PhiluLan/backyrd/actions/runs/41408295475)
  besteht einschliesslich aller Original-Medienschlüssel und SHA-256-Rückleseprüfungen.
- Die Live-Launch-Übersicht enthält überwiegend August-Einträge. Alte Statuswerte
  nicht als neue Fehler oder aktuelle Abnahme behandeln; nach den tatsächlichen
  Paketprüfungen mit Nachweisen aktualisieren.
- Die Bestandsaufnahme verändert keine Nutzerkonten, Einwilligungen, Profile,
  Lernsignale oder Moderationsentscheidungen. Feature- und Sicherheitskorrekturen
  folgen als eigene überprüfbare Änderungen.
