from pathlib import Path

explore_file = Path.cwd() / "mobile/app/(tabs)/explore.tsx"

if not explore_file.exists():
    raise SystemExit("Bitte im Projektstamm ~/dev/backyrd ausführen.")

original = explore_file.read_text(encoding="utf-8")
text = original

if 'import { searchMobileTaxonomySpots } from "../../lib/taxonomy-search";' not in text:
    anchor = 'import { ensureProfile } from "../../lib/profile";'
    if anchor not in text:
        raise SystemExit("Anker nicht gefunden: Import")
    text = text.replace(
        anchor,
        anchor + '\nimport { searchMobileTaxonomySpots } from "../../lib/taxonomy-search";',
        1,
    )

start = text.find('      const { data: reviews } = await supabase')
end_marker = '      setGrouped({ fromName: (spotsA as Spot[]) || [], fromMood: spotsB });'
end = text.find(end_marker, start)

if 'const [{ data: reviews }, taxonomyMatches]' not in text:
    if start == -1 or end == -1:
        raise SystemExit("Anker nicht gefunden: runSearch")
    end += len(end_marker)
    replacement = """      const [{ data: reviews }, taxonomyMatches] = await Promise.all([
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
      });"""
    text = text[:start] + replacement + text[end:]

text = text.replace(
    '<SectionHeader title="Passend nach Stimmung" />',
    '<SectionHeader title="Passend zu deiner Suche" />',
    1,
)

backup = explore_file.with_suffix(".tsx.before-taxonomy-search-v1")
if not backup.exists():
    backup.write_text(original, encoding="utf-8")

explore_file.write_text(text, encoding="utf-8")
print("✓ Taxonomie-Suche eingebaut")
print("✓ Labels, Slugs und Synonyme werden durchsucht")
print("✓ Doppelte Treffer werden entfernt")
print(f"✓ Backup: {backup}")
