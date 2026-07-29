from pathlib import Path
import re
import shutil

root = Path.cwd()
page = root / "admin-dashboard/app/spot-quality/page.tsx"
pkg = root / "backyrd_spot_quality_google_enrichment_v1"

required = [
    page,
    pkg / "supabase/functions/spot-google-enrichment/index.ts",
    pkg / "supabase/migrations/20260728_spot_google_enrichment_v1.sql",
    pkg / "admin-dashboard/app/spot-quality/[id]/enrichment/page.tsx",
]

for file in required:
    if not file.exists():
        raise SystemExit(f"Datei nicht gefunden: {file}")

targets = [
    (
        pkg / "supabase/functions/spot-google-enrichment/index.ts",
        root / "supabase/functions/spot-google-enrichment/index.ts",
    ),
    (
        pkg / "supabase/migrations/20260728_spot_google_enrichment_v1.sql",
        root / "supabase/migrations/20260728_spot_google_enrichment_v1.sql",
    ),
    (
        pkg / "admin-dashboard/app/spot-quality/[id]/enrichment/page.tsx",
        root / "admin-dashboard/app/spot-quality/[id]/enrichment/page.tsx",
    ),
]

for source, target in targets:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

backup = page.with_name(page.name + ".before-google-enrichment-v1-1")
if not backup.exists():
    shutil.copy2(page, backup)

text = page.read_text(encoding="utf-8")

if "Google-Daten" in text and "/enrichment" in text:
    print("✓ Google-Daten-Link ist bereits vorhanden")
else:
    replacement = '''{!spot.google_place_id ? (
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

    pattern = re.compile(
        r'''\{\s*!spot\.google_place_id\s*\?\s*\(
            (?:(?!\)\s*:\s*null\s*\}).)*?
            Google\s+finden
            (?:(?!\)\s*:\s*null\s*\}).)*?
            \)\s*:\s*null\s*\}''',
        re.DOTALL | re.VERBOSE,
    )

    updated, count = pattern.subn(replacement, text, count=1)

    if count == 0:
        marker = "Google finden"
        marker_pos = text.find(marker)

        if marker_pos == -1:
            raise SystemExit(
                "Der Button „Google finden“ wurde nicht gefunden. "
                "Bitte sende die Ausgabe von:\n"
                "grep -n \"Google finden\\|google_place_id\\|spotActions\" "
                "'admin-dashboard/app/spot-quality/page.tsx'"
            )

        start = text.rfind("{!spot.google_place_id", 0, marker_pos)
        end_match = re.search(r"\)\s*:\s*null\s*\}", text[marker_pos:])

        if start == -1 or not end_match:
            raise SystemExit(
                "Der Google-Button wurde gefunden, aber der umgebende Block "
                "konnte nicht sicher erkannt werden."
            )

        end = marker_pos + end_match.end()
        updated = text[:start] + replacement + text[end:]

    page.write_text(updated, encoding="utf-8")
    print("✓ Google-Daten-Link robust ergänzt")

print("✓ Edge Function spot-google-enrichment installiert")
print("✓ Enrichment-Seite erstellt")
print("✓ SQL-Migration bereit")
print(f"✓ Backup: {backup}")
