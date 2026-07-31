# MoBu

MoBu ist eine mobile Dokumenten- und Finanzzentrale für iOS und Android. Diese erste Produktscheibe enthält:

- Dashboard für offene Rechnungen und erkannte Ausgaben
- Dokumentensuche und Statusfilter
- Foto-, Bild- und PDF-Import
- austauschbare Dokumentanalyse mit Prüfmaske
- lokale, persistente Dokumentdaten
- Finanzübersicht nach Kategorien

## Lokal starten

```bash
npm install
npm run start
```

Danach kann die App mit Expo Go, einem iOS-Simulator, Android-Emulator oder im Browser geöffnet werden.

## Analyse-Service

`services/document-analysis.ts` liefert aktuell kontrollierte Demo-Ergebnisse. Die Service-Grenze ist bewusst so angelegt, dass später eine geschützte Backend-Funktion für OCR und KI-Extraktion angeschlossen werden kann. API-Schlüssel gehören nicht in die Smartphone-App.

## Nächste Produktionsschritte

1. Authentifizierung und verschlüsselter Cloud-Speicher
2. geschützte OCR-/KI-Pipeline im Backend
3. echte Dokumentvorschau und Erinnerungen
4. Datenschutz-, Lösch- und Exportfunktionen
5. automatisierte Tests und Store-Builds
