# Backyrd Spot Quality – Google Enrichment V1

## Installation
```bash
cd ~/dev/backyrd
cp -R ~/Downloads/backyrd_spot_quality_google_enrichment_v1 .
python3 backyrd_spot_quality_google_enrichment_v1/install_spot_google_enrichment_v1.py
```

## SQL
Im Supabase SQL Editor ausführen:
`supabase/migrations/20260728_spot_google_enrichment_v1.sql`

## Deploy
```bash
cd ~/dev/backyrd
supabase functions deploy spot-google-enrichment --no-verify-jwt
```

Danach im Spot Quality Dashboard bei einem verknüpften Spot auf `Google-Daten` klicken.
