from pathlib import Path

spot_file = Path.cwd() / "mobile/app/spot/[id].tsx"

if not spot_file.exists():
    raise SystemExit("Bitte im Projektstamm ~/dev/backyrd ausführen.")

original = spot_file.read_text(encoding="utf-8")
text = original

old_import = 'import SpotTaxonomyHighlights from "../../components/spot/SpotTaxonomyHighlights";'
new_import = (
    'import {\n'
    '  SpotTaxonomyChips,\n'
    '  SpotTaxonomyDetails,\n'
    '} from "../../components/spot/SpotTaxonomyHighlights";'
)

if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif "SpotTaxonomyChips" not in text:
    raise SystemExit("Taxonomy-Komponenten-Import wurde nicht gefunden.")

old_render = '<SpotTaxonomyHighlights items={taxonomyItems} />'
new_render = '<SpotTaxonomyChips items={taxonomyItems} />'

if old_render in text:
    text = text.replace(old_render, new_render, 1)
elif new_render not in text:
    raise SystemExit("Bisherige Taxonomy-Darstellung wurde nicht gefunden.")

if '<SpotTaxonomyDetails items={taxonomyItems} />' not in text:
    hours_start = text.find('          {Object.keys(hours).length > 0 && (')
    if hours_start == -1:
        raise SystemExit("Öffnungszeiten-Sektion wurde nicht gefunden.")

    reviews_start = text.find(
        '\n          {reviews.length > 0 && (',
        hours_start,
    )
    if reviews_start == -1:
        raise SystemExit("Position nach Öffnungszeiten wurde nicht gefunden.")

    text = (
        text[:reviews_start]
        + '\n\n          <SpotTaxonomyDetails items={taxonomyItems} />'
        + text[reviews_start:]
    )

backup = spot_file.with_suffix(".tsx.before-taxonomy-layout-fix-v1")
if not backup.exists():
    backup.write_text(original, encoding="utf-8")

spot_file.write_text(text, encoding="utf-8")

print("✓ Chips bleiben oben")
print("✓ Emojis aus Chips entfernt")
print("✓ „Das erwartet dich“ unter Öffnungszeiten verschoben")
print(f"✓ Backup: {backup}")
