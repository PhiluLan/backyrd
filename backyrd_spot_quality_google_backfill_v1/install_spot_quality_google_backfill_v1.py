from pathlib import Path
import shutil

root=Path.cwd(); pkg=root/'backyrd_spot_quality_google_backfill_v1'
items={
'migration':pkg/'supabase/migrations/20260728_spot_quality_google_backfill_v1.sql',
'function':pkg/'supabase/functions/spot-google-backfill/index.ts',
'page':pkg/'admin-dashboard/app/spot-quality/backfill/[id]/page.tsx',
'styles':pkg/'spot-quality-google-backfill.css'}
for p in items.values():
    if not p.exists(): raise SystemExit(f'Quelldatei fehlt: {p}')

targets={
'migration':root/'supabase/migrations/20260728_spot_quality_google_backfill_v1.sql',
'function':root/'supabase/functions/spot-google-backfill/index.ts',
'page':root/'admin-dashboard/app/spot-quality/backfill/[id]/page.tsx'}
for k,t in targets.items(): t.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(items[k],t)

quality=root/'admin-dashboard/app/spot-quality/page.tsx'
if not quality.exists(): raise SystemExit(f'Datei fehlt: {quality}')
backup=quality.with_name(quality.name+'.before-google-backfill-v1')
if not backup.exists(): shutil.copy2(quality,backup)
text=quality.read_text(encoding='utf-8')
old='''                    <div className="sq-spotActions">\n                      <Link\n                        className="bi-primaryButton"'''
new='''                    <div className="sq-spotActions">\n                      {!spot.google_place_id ? (\n                        <Link\n                          className="bi-primaryButton"\n                          href={`/spot-quality/backfill/${spot.spot_id}`}\n                        >\n                          Google finden\n                        </Link>\n                      ) : null}\n\n                      <Link\n                        className={spot.google_place_id ? "bi-primaryButton" : "bi-actionButton"}'''
if 'href={`/spot-quality/backfill/${spot.spot_id}`}' not in text:
    if old not in text: raise SystemExit('Quality-Page-Anker nicht gefunden.')
    text=text.replace(old,new,1)
quality.write_text(text,encoding='utf-8')

globals_file=root/'admin-dashboard/app/globals.css'
if not globals_file.exists(): raise SystemExit(f'Datei fehlt: {globals_file}')
gb=globals_file.with_name(globals_file.name+'.before-google-backfill-v1')
if not gb.exists(): shutil.copy2(globals_file,gb)
g=globals_file.read_text(encoding='utf-8'); s=items['styles'].read_text(encoding='utf-8')
if 'SPOT QUALITY GOOGLE BACKFILL V1' not in g: globals_file.write_text(g.rstrip()+'\n\n'+s,encoding='utf-8')
print('✓ Rejection-Tabelle vorbereitet')
print('✓ Edge Function spot-google-backfill installiert')
print('✓ Backfill-Detailseite erstellt')
print('✓ Google-finden-Button in Quality Queue ergänzt')
print('✓ Styles ergänzt')
