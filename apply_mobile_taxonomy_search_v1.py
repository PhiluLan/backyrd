from pathlib import Path

explore_file = Path.cwd() / "mobile/app/(tabs)/explore.tsx"

if not explore_file.exists():
    raise SystemExit("Bitte im Projektstamm ~/dev/backyrd ausführen.")

original = explore_file.read_text(encoding="utf-8")
text = original

def replace_once(anchor, replacement, already, label):
    global text
    if already in text:
        return
    if anchor not in text:
        raise SystemExit(f"Anker nicht gefunden: {label}")
    text = text.replace(anchor, replacement, 1)

replace_once(
    'import { ensureProfile } from "../../lib/profile";',
    'import { ensureProfile } from "../../lib/profile";\n'
    'import { searchMobileTaxonomySpots } from "../../lib/taxonomy-search";',
    'searchMobileTaxonomySpots',
    'Import',
)

old_block = '''      const { data: reviews } = await supabase
        .from("reviews")
        .select("spot_id")
        .or(`mood_a.ilike.${pattern},mood_b.ilike.${pattern}`)
        .limit(200);

      const moodSpotIds = Array.from(
        new Set((reviews || []).map((r) => r.spot_id as string))
      );
      let spotsB: Spot[] = [];
      if (moodSpotIds.length) {
        const { data } = await supabase
          .from("spots")
          .select(
            "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status"
          )
          .eq("status", "approved")
          .in("id", moodSpotIds);
        spotsB = (data || []) as Spot[];
      }

      setGrouped({ fromName: (spotsA as Spot[]) || [], fromMood: spotsB });'''

new_block = '''      const [{ data: reviews }, taxonomyMatches] = await Promise.all([
        supabase
          .from("reviews")
          .select("spot_id")
          .or(`mood_a.ilike.${pattern},mood_b.ilike.${pattern}`)
          .limit(200),
        searchMobileTaxonomySpots(searchTerm, "de", 100).catch((error) => {
          console.warn("Taxonomy search:", error.message);
          return [];
        }),
      ]);

      const contextualSpotIds = Array.from(
        new Set([
          ...(reviews || []).map((r) => r.spot_id as string),
          ...taxonomyMatches.map((match) => match.spot_id),
        ])
      );

      let spotsB: Spot[] = [];
      if (contextualSpotIds.length) {
        const { data } = await supabase
          .from("spots")
          .select(
            "id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status"
          )
          .eq("status", "approved")
          .in("id", contextualSpotIds);

        const taxonomyScore = new Map(
          taxonomyMatches.map((match) => [match.spot_id, match.match_score])
        );

        spotsB = ((data || []) as Spot[]).sort(
          (a, b) =>
            (taxonomyScore.get(b.id) || 0) -
            (taxonomyScore.get(a.id) || 0)
        );
      }

      const directSpots = ((spotsA as Spot[]) || []);
      const directIds = new Set(directSpots.map((spot) => spot.id));
      const contextualSpots = spotsB.filter((spot) => !directIds.has(spot.id));

      setGrouped({
        fromName: directSpots,
        fromMood: contextualSpots,
      });'''

replace_once(
    old_block,
    new_block,
    'taxonomyMatches',
    'runSearch',
)

replace_once(
    '<SectionHeader title="Passend nach Stimmung" />',
    '<SectionHeader title="Passend zu deiner Suche" />',
    'title="Passend zu deiner Suche"',
    'Überschrift',
)

replace_once(
    'Nichts gefunden. Versuch’s mit „gemütlich“, „rooftop“ oder\n'
    '                       „modern“.',
    'Nichts gefunden. Versuch’s mit „gemütlich“, „Terrasse“,\n'
    '                       „Craft Beer“ oder „rollstuhlgerecht“.',
    '„Craft Beer“ oder „rollstuhlgerecht“',
    'Empty State',
)

backup = explore_file.with_suffix(".tsx.before-taxonomy-search-v1")
if not backup.exists():
    backup.write_text(original, encoding="utf-8")

explore_file.write_text(text, encoding="utf-8")

print("✓ Taxonomie-Suche eingebaut")
print("✓ Labels, Slugs und Synonyme werden durchsucht")
print("✓ Doppelte Treffer werden entfernt")
print(f"✓ Backup: {backup}")
