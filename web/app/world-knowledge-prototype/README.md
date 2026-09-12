# Philipps Casa – World Knowledge Prototype

Lokales UX- und Contract-Labor. Es verwendet synthetische Daten, `localStorage` und keinerlei Production- oder Supabase-Verbindung.

## Start

```bash
npm --workspace web run prototype:world-knowledge
```

Danach `http://127.0.0.1:3217/world-knowledge-prototype` in einem aktuellen Chrome-, Safari-, Firefox- oder Edge-Browser öffnen. Die Dummy-Variablen erfüllen nur die bestehende globale Web-Shell beim Modul-Laden; die Prototype-Route überspringt deren Auth-Initialisierung und sendet keine Anfrage.

## Bedienung

- Die Standardansicht führt in neun verständlichen Schritten durch den Spot.
- In „Art des Ortes“ können beispielsweise Restaurant, Brasserie und Bistro direkt mehrfach ausgewählt werden.
- Nicht ausgewählte Begriffe erzeugen keine negative Aussage und zählen nicht als unerledigte Pflichtaufgabe.
- „Später ausfüllen“ überspringt jeden optionalen Abschnitt ohne Datenverlust.
- Rolle oben zwischen Admin, Verified Owner Basic und Verified Owner Pro wechseln.
- „Erweiterte Angaben und Quellen“ öffnet den vollständigen Katalog mit Claims, Evidence, Konflikten, Historie und Rohvorschau.
- `Analyse starten` zeigt zuerst eine verständliche deutsche Zusammenfassung; technische Details bleiben optional.
- `Speichern` schreibt unter `backyrd:world-knowledge-prototype:philipps-casa:v1` in `localStorage`.
- `Export` lädt das komplette Analysepaket als JSON; `Import` nimmt denselben Export wieder an.
- `Reset` löscht den lokalen Stand erst nach Browser-Bestätigung.

Die Admin/Basic/Pro-Grenzen und Confidence-Zahlen sind deutlich markierte Simulationen, keine Preis-, Trust- oder Production-Entscheidung.
