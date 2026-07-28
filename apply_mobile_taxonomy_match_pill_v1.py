from pathlib import Path

explore_file = Path.cwd() / "mobile/app/(tabs)/explore.tsx"

if not explore_file.exists():
    raise SystemExit("Bitte im Projektstamm ~/dev/backyrd ausführen.")

original = explore_file.read_text(encoding="utf-8")
text = original

old_search_call = 'searchMobileTaxonomySpots(searchTerm, "de", 100).catch((error) => {'
new_search_call = '''(
          searchTerm.length >= 4
            ? searchMobileTaxonomySpots(searchTerm, "de", 100)
            : Promise.resolve([])
        ).catch((error) => {'''

if old_search_call in text:
    text = text.replace(old_search_call, new_search_call, 1)
elif "searchTerm.length >= 4" not in text:
    raise SystemExit("Taxonomie-Suchaufruf wurde nicht gefunden.")

old_map = '''        const taxonomyScore = new Map(
          taxonomyMatches.map((match) => [match.spot_id, match.match_score])
        );

        spotsB = ((data || []) as Spot[]).sort(
          (a, b) =>
            (taxonomyScore.get(b.id) || 0) -
            (taxonomyScore.get(a.id) || 0)
        );'''

new_map = '''        const taxonomyMatchBySpot = new Map(
          taxonomyMatches.map((match) => [match.spot_id, match])
        );

        spotsB = ((data || []) as Spot[])
          .map((spot) => {
            const taxonomyMatch = taxonomyMatchBySpot.get(spot.id);

            return {
              ...spot,
              search_match_label:
                taxonomyMatch?.matched_labels?.[0] ?? null,
            } as Spot;
          })
          .sort(
            (a, b) =>
              (taxonomyMatchBySpot.get(b.id)?.match_score || 0) -
              (taxonomyMatchBySpot.get(a.id)?.match_score || 0)
          );'''

if old_map in text:
    text = text.replace(old_map, new_map, 1)
elif "search_match_label:" not in text:
    raise SystemExit("Taxonomie-Sortierung wurde nicht gefunden.")

result_card_anchor = '''function ResultCard({ spot }: { spot: Spot }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [moods, setMoods] = useState<string[]>([]);'''

result_card_replacement = '''function ResultCard({ spot }: { spot: Spot }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const searchMatchLabel =
    ((spot as any).search_match_label as string | null | undefined) ?? null;'''

if result_card_anchor in text:
    text = text.replace(result_card_anchor, result_card_replacement, 1)
elif "const searchMatchLabel" not in text:
    raise SystemExit("ResultCard wurde nicht gefunden.")

media_anchor = '''      <View style={styles.cardMedia}>
        <SpotVisual'''

media_replacement = '''      <View style={styles.cardMedia}>
        {searchMatchLabel ? (
          <View style={styles.searchMatchPill}>
            <Ionicons name="sparkles-outline" size={13} color="#171214" />
            <Text style={styles.searchMatchPillText} numberOfLines={1}>
              {searchMatchLabel}
            </Text>
          </View>
        ) : null}

        <SpotVisual'''

if media_anchor in text:
    text = text.replace(media_anchor, media_replacement, 1)
elif "styles.searchMatchPill" not in text:
    raise SystemExit("ResultCard-Medienbereich wurde nicht gefunden.")

if "searchMatchPill:" not in text:
    final_close = text.rfind("});")
    if final_close == -1:
        raise SystemExit("StyleSheet-Abschluss wurde nicht gefunden.")

    style_block = '''  searchMatchPill: {
    position: "absolute",
    top: 14,
    left: 14,
    zIndex: 12,
    elevation: 12,
    maxWidth: "78%",
    minHeight: 34,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF9ABA",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },

  searchMatchPillText: {
    flexShrink: 1,
    color: "#171214",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },

'''
    text = text[:final_close] + style_block + text[final_close:]

backup = explore_file.with_suffix(".tsx.before-taxonomy-match-pill-v1")
if not backup.exists():
    backup.write_text(original, encoding="utf-8")

explore_file.write_text(text, encoding="utf-8")

print("✓ Taxonomie-Suche startet erst ab 4 Zeichen")
print("✓ Match-Label wird am Spot gespeichert")
print("✓ Match-Pille auf der Trefferkarte ergänzt")
print(f"✓ Backup: {backup}")
