# Spot Quality Backfill Component Fix V1

## Installation

```bash
cd ~/dev/backyrd

cp -R   ~/Downloads/backyrd_spot_quality_backfill_component_fix_v1   .

python3   backyrd_spot_quality_backfill_component_fix_v1/install_backfill_component_fix_v1.py
```

Danach:

```bash
cd ~/dev/backyrd/admin-dashboard
npm run dev
```

Erwartetes Verhalten:

- Spot ohne Google Place ID: `Google finden`
- Spot mit Google Place ID: `Google-Daten`
