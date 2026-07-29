# Backyrd Spot Quality – Google Backfill V1

## Installation

```bash
cd ~/dev/backyrd
cp -R ~/Downloads/backyrd_spot_quality_google_backfill_v1 .
python3 backyrd_spot_quality_google_backfill_v1/install_spot_quality_google_backfill_v1.py
```

SQL im Supabase SQL Editor ausführen:

```text
supabase/migrations/20260728_spot_quality_google_backfill_v1.sql
```

Edge Function deployen:

```bash
cd ~/dev/backyrd
supabase functions deploy spot-google-backfill --no-verify-jwt
```

Dashboard starten:

```bash
cd ~/dev/backyrd/admin-dashboard
npm run dev
```

Unter `/spot-quality` den Filter **Ohne Google Place ID** öffnen und bei einem Spot auf **Google finden** klicken.

Confidence:
- 90–100 %: sehr starker Treffer
- 75–89 %: guter Treffer
- 55–74 %: genau prüfen
- unter 55 %: eher nicht übernehmen
