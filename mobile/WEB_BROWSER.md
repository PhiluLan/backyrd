# Backyrd Web Browser Start

Diese Web-Variante läuft parallel zur nativen Expo-App.
Bestehende Native-Dateien wurden nicht umgebaut.

## Start

```bash
cd mobile
./scripts/start-web-browser.sh
```

Optional anderer Port:

```bash
./scripts/start-web-browser.sh 5000
```

Dann im Browser öffnen:

- http://localhost:4173 (oder dein gewählter Port)

## Hinweise

- Der Build nutzt `expo export --platform web`.
- Tiefe Routes (z. B. `/spot/<id>`) funktionieren über SPA-Fallback.
- Die Karten-Route hat auf Web eine browserfähige Ersatzansicht (`map.web.tsx`), damit die App vollständig bundlen und starten kann.
