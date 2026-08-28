import { useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import type { Spot } from "../lib/types";
import { useRouter } from "expo-router";
import { filterDistributedSpots } from "../lib/distributionTrust";
import { AppText } from "../components/foundation/AppText";
import { Button } from "../components/foundation/Button";
import { Screen } from "../components/foundation/Screen";
import { StateView } from "../components/foundation/StateView";
import { backyrdTheme as theme } from "../theme/backyrd";
import { userFacingError } from "../lib/userFacingError";

export default function Search() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Spot[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const router = useRouter();

  async function runSearch() {
    if (!q.trim()) return;
    setLoading(true);
    setErrorText(null);
    try {
      const pattern = `%${q.trim()}%`;

      // 1) Direkte Spots (Name/Adresse/Kategorie)
      const { data: spotsA, error: errA } = await supabase
        .from("spots")
        .select("id,name,address,lat,lng,category,status")
        .eq("status", "approved")
        .or(`name.ilike.${pattern},address.ilike.${pattern},category.ilike.${pattern}`)
        .limit(100);
      if (errA) throw errA;

      // 2) Spots über Moods (Reviews)
      // Hole passende Reviews, dann Spot-IDs -> dann Spots ziehen
      const { data: reviews, error: errR } = await supabase
        .from("reviews")
        .select("spot_id")
        .or(`mood_a.ilike.${pattern},mood_b.ilike.${pattern}`)
        .limit(200);
      if (errR) throw errR;

      const moodSpotIds = Array.from(new Set((reviews || []).map(r => r.spot_id as string)));
      let spotsB: Spot[] = [];
      if (moodSpotIds.length) {
        const { data, error } = await supabase
          .from("spots")
          .select("id,name,address,lat,lng,category,status")
          .eq("status", "approved")
          .in("id", moodSpotIds);
        if (error) throw error;
        spotsB = (data || []) as Spot[];
      }

      // Merge & Dedupe
      const map = new Map<string, Spot>();
      for (const s of (spotsA || []) as Spot[]) map.set(s.id, s);
      for (const s of spotsB) map.set(s.id, s);
      const distributed = await filterDistributedSpots(Array.from(map.values()), "search");

      // If a real query matched only temporarily unavailable Distribution
      // candidates, keep Search useful with neutral trusted alternatives. Do
      // not expose why the original candidates were unavailable.
      if (distributed.length === 0 && map.size > 0) {
        const { data: alternatives, error: alternativesError } = await supabase.rpc(
          "distribution_trust_spot_catalog_v1",
          { p_query: null, p_city: null, p_limit: 20, p_surface: "search" },
        );
        if (alternativesError) throw alternativesError;
        setResults(((alternatives ?? []) as Spot[]).map((spot) => ({
          id: spot.id,
          name: spot.name,
          address: spot.address,
          lat: spot.lat,
          lng: spot.lng,
          category: spot.category,
          status: spot.status,
        })));
      } else {
        setResults(distributed);
      }

    } catch (e: any) {
      setResults([]);
      setErrorText(userFacingError(e, "Die Suche ist gerade nicht erreichbar. Bitte versuche es noch einmal."));
    } finally {
      setSearched(true);
      setLoading(false);
    }
  }

  function openOnMap(s: Spot) {
    router.push({ pathname: "/(tabs)/map", params: { lat: String(s.lat), lng: String(s.lng), view: "map" } });
  }

  return (
    <Screen padded>
      <View style={styles.header}>
        <AppText role="caption" tone="lime" style={styles.kicker}>ORTE / BASEL</AppText>
        <AppText role="displayM">SUCHEN.</AppText>
        <AppText tone="secondary">Finde einen Ort nach Name, Kategorie oder Stimmung.</AppText>
      </View>
      <View style={styles.form}>
        <TextInput accessibilityLabel="Orte durchsuchen" autoCapitalize="none" returnKeyType="search" placeholder="Zum Beispiel Pizza, gemütlich, Rhein …" placeholderTextColor={theme.color.textMuted} value={q} onChangeText={setQ} onSubmitEditing={() => void runSearch()} style={styles.input} />
        <Button label="Suchen" loading={loading} disabled={!q.trim()} onPress={() => void runSearch()} />
      </View>
      {errorText ? <StateView kind="error" title="Suche gerade nicht erreichbar" message={errorText} actionLabel="Erneut versuchen" onAction={() => void runSearch()} /> : null}
      {!errorText ? (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={results}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Pressable accessibilityLabel={`${item.name} auf der Karte öffnen`} onPress={() => openOnMap(item)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
              <AppText role="bodyStrong">{item.name}</AppText>
              <AppText role="meta" tone="secondary" style={styles.resultMeta}>{item.address || item.category || "Basel"}</AppText>
              {item.category ? <AppText role="caption" tone="lime" style={styles.category}>{item.category}</AppText> : null}
            </Pressable>
          )}
          ListEmptyComponent={!loading && searched ? <StateView kind="empty" title="Noch nichts Passendes" message="Versuche einen anderen Namen, eine Kategorie oder eine Stimmung." /> : null}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing.lg, gap: theme.spacing.xs },
  kicker: { letterSpacing: 1.8 },
  form: { marginTop: theme.spacing.xl, marginBottom: theme.spacing.lg, gap: theme.spacing.sm },
  input: { minHeight: theme.control.standard, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 16, paddingHorizontal: theme.spacing.lg },
  list: { flex: 1 },
  listContent: { paddingBottom: theme.spacing.xxl },
  separator: { height: theme.spacing.sm },
  result: { minHeight: 82, justifyContent: "center", padding: theme.spacing.lg, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  resultMeta: { marginTop: theme.spacing.xxs },
  category: { marginTop: theme.spacing.xs, textTransform: "uppercase", letterSpacing: 1 },
  pressed: { opacity: 0.82, transform: [{ scale: theme.motion.pressScale }] },
});
