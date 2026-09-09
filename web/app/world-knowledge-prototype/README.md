# Philipps Casa – World Knowledge Prototype

Lokales UX- und Contract-Labor. Es verwendet synthetische Daten, `localStorage` und keinerlei Production- oder Supabase-Verbindung.

## Start

```bash
npm --workspace web run prototype:world-knowledge
```

Danach `http://127.0.0.1:3217/world-knowledge-prototype` in einem aktuellen Chrome-, Safari-, Firefox- oder Edge-Browser öffnen. Die Dummy-Variablen erfüllen nur die bestehende globale Web-Shell beim Modul-Laden; die Prototype-Route überspringt deren Auth-Initialisierung und sendet keine Anfrage.

## Bedienung

- Rolle oben zwischen Admin, Verified Owner Basic und Verified Owner Pro wechseln.
- Kategorien und Eigenschaftsgruppe wählen oder alle 727 Parameter durchsuchen.
- Einen Parameter öffnen, Wissensstatus, Wert und Evidence als neuen Claim speichern.
- In `Resolved`, `Data Quality` und `Engine Snapshot` die Live-Auflösung prüfen.
- `Analyse starten` erzeugt den deterministischen Bericht.
- `Speichern` schreibt unter `backyrd:world-knowledge-prototype:philipps-casa:v1` in `localStorage`.
- `Export` lädt das komplette Analysepaket als JSON; `Import` nimmt denselben Export wieder an.
- `Reset` löscht den lokalen Stand erst nach Browser-Bestätigung.

Die Admin/Basic/Pro-Grenzen und Confidence-Zahlen sind deutlich markierte Simulationen, keine Preis-, Trust- oder Production-Entscheidung.
