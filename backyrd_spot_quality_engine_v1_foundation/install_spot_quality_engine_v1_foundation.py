from pathlib import Path
import shutil

root = Path.cwd()

migration_source = (
    root
    / "backyrd_spot_quality_engine_v1_foundation"
    / "supabase/migrations/20260728_spot_quality_engine_v1_foundation.sql"
)
page_source = (
    root
    / "backyrd_spot_quality_engine_v1_foundation"
    / "admin-dashboard/app/spot-quality/page.tsx"
)
styles_source = (
    root
    / "backyrd_spot_quality_engine_v1_foundation"
    / "spot-quality-styles.css"
)

migration_target = (
    root
    / "supabase/migrations/20260728_spot_quality_engine_v1_foundation.sql"
)
page_target = root / "admin-dashboard/app/spot-quality/page.tsx"
sidebar_file = root / "admin-dashboard/components/intelligence/Sidebar.tsx"
globals_file = root / "admin-dashboard/app/globals.css"

for required in [
    migration_source,
    page_source,
    styles_source,
    sidebar_file,
    globals_file,
]:
    if not required.exists():
        raise SystemExit(f"Datei nicht gefunden: {required}")

migration_target.parent.mkdir(parents=True, exist_ok=True)
page_target.parent.mkdir(parents=True, exist_ok=True)

shutil.copy2(migration_source, migration_target)
shutil.copy2(page_source, page_target)

sidebar_backup = sidebar_file.with_name(
    sidebar_file.name + ".before-spot-quality-v1"
)
if not sidebar_backup.exists():
    shutil.copy2(sidebar_file, sidebar_backup)

sidebar = sidebar_file.read_text(encoding="utf-8")

old_link = '["/spots","Spots","⌖"],["/taxonomy","Taxonomy","◆"]'
new_link = (
    '["/spots","Spots","⌖"],'
    '["/spot-quality","Spot Quality","◈"],'
    '["/taxonomy","Taxonomy","◆"]'
)

if new_link not in sidebar:
    if old_link not in sidebar:
        raise SystemExit("Sidebar-Anker wurde nicht gefunden.")
    sidebar = sidebar.replace(old_link, new_link, 1)

sidebar_file.write_text(sidebar, encoding="utf-8")

globals_backup = globals_file.with_name(
    globals_file.name + ".before-spot-quality-v1"
)
if not globals_backup.exists():
    shutil.copy2(globals_file, globals_backup)

globals_text = globals_file.read_text(encoding="utf-8")
styles_text = styles_source.read_text(encoding="utf-8")

if "BACKYRD SPOT QUALITY ENGINE V1" not in globals_text:
    globals_text = globals_text.rstrip() + "\n\n" + styles_text

globals_file.write_text(globals_text, encoding="utf-8")

print("✓ SQL-RPC für Spot Quality Engine installiert")
print("✓ Founder-Seite /spot-quality erstellt")
print("✓ Sidebar um Spot Quality ergänzt")
print("✓ Responsive Quality-Styles ergänzt")
print(f"✓ Migration: {migration_target}")
print(f"✓ Dashboard: {page_target}")
