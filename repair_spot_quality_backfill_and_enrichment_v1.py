from pathlib import Path
import re
import shutil

root = Path.cwd()
page = root / "admin-dashboard/app/spot-quality/page.tsx"

if not page.exists():
    raise SystemExit("Spot-Quality-Seite wurde nicht gefunden.")

backup_candidates = [
    page.with_name(page.name + ".before-google-enrichment-v1"),
    page.with_name(page.name + ".before-google-enrichment-v1-1"),
    page.with_name(page.name + ".before-google-backfill-v1"),
    page.with_name(page.name + ".before-spot-quality-v1"),
]

valid_backup = None
for candidate in backup_candidates:
    if not candidate.exists():
        continue
    content = candidate.read_text(encoding="utf-8")
    if (
        "openBackfill" in content
        and "Google finden" in content
        and "spot-google-backfill" in content
    ):
        valid_backup = candidate
        break

if valid_backup is None:
    available = "\n".join(
        str(candidate)
        for candidate in backup_candidates
        if candidate.exists()
    )
    raise SystemExit(
        "Keine funktionierende Backfill-Backup-Datei gefunden.\n"
        f"Gefundene Backups:\n{available or 'keine'}"
    )

broken_backup = page.with_name(page.name + ".broken-before-backfill-repair-v1")
if not broken_backup.exists():
    shutil.copy2(page, broken_backup)

shutil.copy2(valid_backup, page)
text = page.read_text(encoding="utf-8")

if "openBackfill" not in text:
    raise SystemExit("Die wiederhergestellte Datei enthält openBackfill nicht.")

if "Google-Daten" not in text:
    marker = "Google finden"
    marker_pos = text.find(marker)
    if marker_pos == -1:
        raise SystemExit("Der Button ‚Google finden‘ wurde nicht gefunden.")

    start = text.rfind("{!spot.google_place_id", 0, marker_pos)
    if start == -1:
        raise SystemExit("Der Conditional-Block vor ‚Google finden‘ wurde nicht gefunden.")

    end_match = re.search(r"\)\s*:\s*null\s*\}", text[marker_pos:])
    if not end_match:
        raise SystemExit("Das Ende des Google-finden-Blocks wurde nicht gefunden.")

    end = marker_pos + end_match.end()
    original_block = text[start:end]

    button_match = re.search(r"<button[\s\S]*?Google\s+finden[\s\S]*?</button>", original_block)
    if not button_match:
        raise SystemExit("Der Google-finden-Button konnte nicht extrahiert werden.")

    google_find_button = button_match.group(0)
    replacement = (
        "{!spot.google_place_id ? (\n"
        + google_find_button
        + "\n                      ) : (\n"
        + "                        <Link\n"
        + "                          className=\"bi-primaryButton\"\n"
        + "                          href={`/spot-quality/${spot.spot_id}/enrichment`}\n"
        + "                        >\n"
        + "                          Google-Daten\n"
        + "                        </Link>\n"
        + "                      )}"
    )

    text = text[:start] + replacement + text[end:]

page.write_text(text, encoding="utf-8")

print(f"✓ Funktionierende Backfill-Seite wiederhergestellt aus: {valid_backup}")
print("✓ openBackfill ist wieder vorhanden")
print("✓ Google finden erscheint nur ohne Place ID")
print("✓ Google-Daten erscheint nur mit Place ID")
print(f"✓ Defekte Version gesichert unter: {broken_backup}")
