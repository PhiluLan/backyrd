# Backyrd Beta Arbeitsumfang und Abnahme

Stand: 1. November 2026. Ausgangspunkt ist Main `b7d263fb39ed9b9bb16290b7dc565c737d82cb35`.

Die Beta soll den gesamten Weg vom ersten Einstieg bis zum echten Erlebnis und
anschliessenden Moment verständlich und zuverlässig unterstützen. Der Umfang
umfasst App, Consumer Web, Owner und Admin. Vorhandene Bildschirme gelten erst
nach einer vollständigen Ablaufprüfung als abgenommen. Eine grüne technische
Prüfung ersetzt diese Abnahme nicht.

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

Jedes Paket endet mit einer Vorher-Nachher-Darstellung, den tatsächlich
geänderten Abläufen, geprüften Normal-/Fehlerfällen und den verbleibenden
Punkten. Ein Paket wird nicht durch die Anzahl bestandener Unit-Tests abgenommen.

## Konkrete Sicherheitsbefunde vom 1 November

Die erste Inventur ist kein Penetrationstest und kein Nachweis einer Ausnutzung.
Die folgenden Befunde sind vor der Beta zu bearbeiten:

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

- Aktueller Decision-Ablauf: [Decision Runtime](../decision-vnext/CURRENT_PRODUCT_RUNTIME.md).
- Backup: [bestehender AWS-Workflow](../../.github/workflows/production-backup.yml),
  vollständiger manueller Lauf `41335894428`, Modus `weekly`, nach dem
  Herbstmesse-Release gestartet. Der Abschluss wird anhand des Workflow-Ergebnisses
  und der Exportprüfung bestätigt.
- [Wiederherstellungsablauf](../operations/DATABASE_AND_MEDIA_RECOVERY_RUNBOOK.md):
  Ein erfolgreicher Export ist kein frisch bestandener Wiederherstellungstest.
- Die Live-Launch-Übersicht enthält überwiegend August-Einträge. Alte Statuswerte
  nicht als neue Fehler oder aktuelle Abnahme behandeln; nach den tatsächlichen
  Paketprüfungen mit Nachweisen aktualisieren.
- Die Bestandsaufnahme verändert keine Nutzerkonten, Einwilligungen, Profile,
  Lernsignale oder Moderationsentscheidungen. Feature- und Sicherheitskorrekturen
  folgen als eigene überprüfbare Änderungen.
