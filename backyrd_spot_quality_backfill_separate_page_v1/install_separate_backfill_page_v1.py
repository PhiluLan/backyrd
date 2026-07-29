from pathlib import Path
import shutil

root = Path.cwd()
package = root / "backyrd_spot_quality_backfill_separate_page_v1"

source_page = (
    package
    / "admin-dashboard/app/spot-quality/[id]/google-backfill/page.tsx"
)
target_page = (
    root
    / "admin-dashboard/app/spot-quality/[id]/google-backfill/page.tsx"
)
quality_page = root / "admin-dashboard/app/spot-quality/page.tsx"
globals_file = root / "admin-dashboard/app/globals.css"
styles_file = package / "spot-quality-backfill-separate-page.css"

for path in [source_page, quality_page, globals_file, styles_file]:
    if not path.exists():
        raise SystemExit(f"Datei nicht gefunden: {path}")

target_page.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source_page, target_page)

backup = quality_page.with_name(
    quality_page.name + ".before-separate-backfill-page-v1"
)
if not backup.exists():
    shutil.copy2(quality_page, backup)

text = quality_page.read_text(encoding="utf-8")

old = """<GoogleBackfillButton
                          spot={spot}
                          onCompleted={() =>
                            setRefreshKey((value) => value + 1)
                          }
                        />"""

new = """<Link
                          className="bi-primaryButton"
                          href={`/spot-quality/${spot.spot_id}/google-backfill`}
                        >
                          Google finden
                        </Link>"""

if old in text:
    text = text.replace(old, new, 1)
elif "/google-backfill" not in text:
    raise SystemExit(
        "GoogleBackfillButton-Block wurde nicht gefunden."
    )

component_import = (
    'import { GoogleBackfillButton } '
    'from "@/components/spot-quality/GoogleBackfillButton";\n'
)
text = text.replace(component_import, "")
quality_page.write_text(text, encoding="utf-8")

globals = globals_file.read_text(encoding="utf-8")
styles = styles_file.read_text(encoding="utf-8")

if "SPOT QUALITY BACKFILL SEPARATE PAGE V1" not in globals:
    globals = globals.rstrip() + "\n\n" + styles

globals_file.write_text(globals, encoding="utf-8")

print("✓ Separate Google-Backfill-Seite erstellt")
print("✓ Google finden öffnet jetzt eine eigene Seite")
print("✓ Gequetschtes Top-up aus dem Workflow entfernt")
print("✓ Spot-Namen im Quality Dashboard auf Weiss gestellt")
print(f"✓ Backup: {backup}")
