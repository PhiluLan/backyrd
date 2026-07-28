from pathlib import Path

spot_file = Path.cwd() / "mobile/app/spot/[id].tsx"
if not spot_file.exists():
    raise SystemExit("Bitte im Projektstamm ~/dev/backyrd ausführen.")

original = spot_file.read_text(encoding="utf-8")
text = original

def replace_once(anchor: str, replacement: str, already: str, name: str):
    global text
    if already in text:
        return
    if anchor not in text:
        raise SystemExit(f"Anker nicht gefunden: {name}")
    text = text.replace(anchor, replacement, 1)

replace_once(
    'import { trackAnalyticsEvent } from "../../lib/analytics";',
    'import { trackAnalyticsEvent } from "../../lib/analytics";\n'
    'import SpotTaxonomyHighlights from "../../components/spot/SpotTaxonomyHighlights";\n'
    'import { getMobileSpotTaxonomy, type MobileSpotTaxonomyItem } from "../../lib/taxonomy";',
    'SpotTaxonomyHighlights from "../../components/spot/SpotTaxonomyHighlights"',
    "Imports",
)

replace_once(
    '  const [nearby, setNearby] = useState<any[]>([]);',
    '  const [nearby, setNearby] = useState<any[]>([]);\n'
    '  const [taxonomyItems, setTaxonomyItems] = useState<MobileSpotTaxonomyItem[]>([]);',
    'const [taxonomyItems,',
    "State",
)

replace_once(
    '        { data: hourRows },\n      ] = await Promise.all([',
    '        { data: hourRows },\n        taxonomyRows,\n      ] = await Promise.all([',
    '        taxonomyRows,',
    "Promise-Destructuring",
)

replace_once(
    '        supabase.from("spot_hours").select("*").eq("spot_id", id),\n      ]);',
    '        supabase.from("spot_hours").select("*").eq("spot_id", id),\n'
    '        getMobileSpotTaxonomy(String(id), "de").catch((error) => {\n'
    '          console.log("get_mobile_spot_taxonomy_v1 error", error);\n'
    '          return [];\n'
    '        }),\n'
    '      ]);',
    'getMobileSpotTaxonomy(String(id)',
    "Taxonomy-Abfrage",
)

replace_once(
    '      setReviews(revRows || []);\n\n      await loadOwnerCtx();',
    '      setReviews(revRows || []);\n'
    '      setTaxonomyItems(taxonomyRows || []);\n\n'
    '      await loadOwnerCtx();',
    'setTaxonomyItems(taxonomyRows',
    "Taxonomy-State",
)

replace_once(
    '          {moodSummary.length > 0 && (\n            <View style={styles.section}>',
    '          <SpotTaxonomyHighlights items={taxonomyItems} />\n\n'
    '          {moodSummary.length > 0 && (\n'
    '            <View style={styles.section}>',
    '<SpotTaxonomyHighlights items={taxonomyItems}',
    "Rendering",
)

backup = spot_file.with_suffix(".tsx.before-taxonomy-v1")
if not backup.exists():
    backup.write_text(original, encoding="utf-8")

spot_file.write_text(text, encoding="utf-8")
print("✓ Spot-Detail erweitert")
print(f"✓ Backup: {backup}")
