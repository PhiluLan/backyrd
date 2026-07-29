from pathlib import Path
import shutil

root = Path.cwd()
package = root / "backyrd_spot_quality_backfill_component_fix_v1"

page = root / "admin-dashboard/app/spot-quality/page.tsx"
component_source = (
    package
    / "admin-dashboard/components/spot-quality/GoogleBackfillButton.tsx"
)
component_target = (
    root
    / "admin-dashboard/components/spot-quality/GoogleBackfillButton.tsx"
)

for required in [page, component_source]:
    if not required.exists():
        raise SystemExit(f"Datei nicht gefunden: {required}")

component_target.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(component_source, component_target)

backup = page.with_name(page.name + ".before-backfill-component-fix-v1")
if not backup.exists():
    shutil.copy2(page, backup)

text = page.read_text(encoding="utf-8")

import_line = (
    'import { GoogleBackfillButton } '
    'from "@/components/spot-quality/GoogleBackfillButton";'
)

if import_line not in text:
    import_anchor = 'import { supabase } from "@/lib/supabaseClient";'
    if import_anchor not in text:
        raise SystemExit("Supabase-Import wurde nicht gefunden.")
    text = text.replace(
        import_anchor,
        import_anchor + "\n" + import_line,
        1,
    )

old_block = '''{!spot.google_place_id ? (
                        <button
                          type="button"
                          className="bi-primaryButton"
                          onClick={() => void openBackfill(spot)}
                        >
                          Google finden
                        </button>
                      ) : (
                        <Link
                          className="bi-primaryButton"
                          href={`/spot-quality/${spot.spot_id}/enrichment`}
                        >
                          Google-Daten
                        </Link>
                      )}'''

new_block = '''{!spot.google_place_id ? (
                        <GoogleBackfillButton
                          spot={spot}
                          onCompleted={() =>
                            setRefreshKey((value) => value + 1)
                          }
                        />
                      ) : (
                        <Link
                          className="bi-primaryButton"
                          href={`/spot-quality/${spot.spot_id}/enrichment`}
                        >
                          Google-Daten
                        </Link>
                      )}'''

if old_block not in text:
    raise SystemExit(
        "Der aktuell gemeldete Google-Button-Block wurde nicht gefunden."
    )

text = text.replace(old_block, new_block, 1)
page.write_text(text, encoding="utf-8")

print("✓ Eigenständige GoogleBackfillButton-Komponente installiert")
print("✓ Defekten openBackfill-Aufruf entfernt")
print("✓ Google finden funktioniert wieder")
print("✓ Google-Daten bleibt für verknüpfte Spots erhalten")
print(f"✓ Backup: {backup}")
