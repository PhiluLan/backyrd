from pathlib import Path
import shutil
root=Path.cwd(); pkg=root/'backyrd_spot_quality_google_enrichment_v1'
page=root/'admin-dashboard/app/spot-quality/page.tsx'
for p in [pkg/'supabase/functions/spot-google-enrichment/index.ts',pkg/'supabase/migrations/20260728_spot_google_enrichment_v1.sql',pkg/'admin-dashboard/app/spot-quality/[id]/enrichment/page.tsx',page]:
    if not p.exists(): raise SystemExit(f'Datei nicht gefunden: {p}')
for src,dst in [(pkg/'supabase/functions/spot-google-enrichment/index.ts',root/'supabase/functions/spot-google-enrichment/index.ts'),(pkg/'supabase/migrations/20260728_spot_google_enrichment_v1.sql',root/'supabase/migrations/20260728_spot_google_enrichment_v1.sql'),(pkg/'admin-dashboard/app/spot-quality/[id]/enrichment/page.tsx',root/'admin-dashboard/app/spot-quality/[id]/enrichment/page.tsx')]:
    dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(src,dst)
backup=page.with_name(page.name+'.before-google-enrichment-v1')
if not backup.exists(): shutil.copy2(page,backup)
text=page.read_text()
old='''                      {!spot.google_place_id ? (\n                        <button\n                          type="button"\n                          className="bi-primaryButton"\n                          onClick={() => void openBackfill(spot)}\n                        >\n                          Google finden\n                        </button>\n                      ) : null}'''
new='''                      {!spot.google_place_id ? (\n                        <button type="button" className="bi-primaryButton" onClick={() => void openBackfill(spot)}>Google finden</button>\n                      ) : (\n                        <Link className="bi-primaryButton" href={`/spot-quality/${spot.spot_id}/enrichment`}>Google-Daten</Link>\n                      )}'''
if '/enrichment`}' not in text:
    if old not in text: raise SystemExit('Button-Anker nicht gefunden.')
    text=text.replace(old,new,1)
page.write_text(text)
print('✓ Edge Function installiert')
print('✓ Enrichment-Seite erstellt')
print('✓ Google-Daten-Link ergänzt')
print(f'✓ Backup: {backup}')
