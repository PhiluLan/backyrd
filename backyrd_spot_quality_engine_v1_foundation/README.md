# Backyrd Spot Quality Engine V1 – Foundation

## Enthalten

- Quality Score von 0 bis 100 pro Spot
- konkrete Issues und verlorene Punkte
- Founder-Arbeitsliste
- Filter nach Problemtyp
- Duplikaterkennung über:
  - identische Google Place ID
  - identischen normalisierten Namen + Adresse
- direkte Links zur Spot-Bearbeitung
- Sidebar-Eintrag `Spot Quality`

## Score-Gewichtung

| Bereich | Punkte |
|---|---:|
| Name | 5 |
| Adresse | 10 |
| Koordinaten | 10 |
| Kategorie | 5 |
| Google Place ID | 10 |
| Eigenes Bild | 15 |
| Google-Fallback statt eigenem Bild | 8 |
| Beschreibung | 10 |
| Öffnungszeiten | 10 |
| Website | 5 |
| Telefon | 3 |
| Taxonomien | bis 12 |
| Approved-Status | 5 |

Maximal: 100 Punkte.

## Installation

Da dein Browser ZIP-Dateien automatisch entpackt:

```bash
cd ~/dev/backyrd

python3 \
  ~/Downloads/backyrd_spot_quality_engine_v1_foundation/install_spot_quality_engine_v1_foundation.py
```

Falls der Browser das Paket in einen abweichenden Ordner entpackt, kopiere
den Ordner zuerst in den Projektstamm:

```bash
cd ~/dev/backyrd

cp -R \
  ~/Downloads/backyrd_spot_quality_engine_v1_foundation \
  .
```

Danach:

```bash
python3 \
  backyrd_spot_quality_engine_v1_foundation/install_spot_quality_engine_v1_foundation.py
```

## SQL ausführen

Im Supabase SQL Editor:

```text
supabase/migrations/20260728_spot_quality_engine_v1_foundation.sql
```

## Admin Dashboard starten

```bash
cd ~/dev/backyrd/admin-dashboard
npm run dev
```

Dann öffnen:

```text
http://localhost:3000/spot-quality
```

## Nächster Teil derselben V1

Auf dieser Foundation bauen wir anschließend:

- Google-Place-ID-Backfill-Vorschläge
- Treffer-Vorschau mit Name, Adresse und Match Confidence
- `Übernehmen` / `Ablehnen`
- Google-Daten-Vorschau für Öffnungszeiten, Website und Telefon
