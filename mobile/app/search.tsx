import { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert } from "react-native";
import { Screen, Container, Title, Input, Button } from "../components/ui";
import { supabase } from "../lib/supabase";
import type { Spot } from "../lib/types";
import { useRouter } from "expo-router";

export default function Search() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Spot[]>([]);
  const router = useRouter();

  async function runSearch() {
    if (!q.trim()) return;
    setLoading(true);
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
      setResults(Array.from(map.values()));

    } catch (e: any) {
      Alert.alert("Suche fehlgeschlagen", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function openOnMap(s: Spot) {
    router.push({ pathname: "/map", params: { lat: String(s.lat), lng: String(s.lng) } });
  }

  return (
    <Screen>
      <Container>
        <Title>Suche</Title>
        <Input placeholder="z. B. cozy, pizza, river…" value={q} onChangeText={setQ} onSubmitEditing={runSearch} />
        <Button title={loading ? "Suche…" : "Suchen"} onPress={runSearch} />
        {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
        <FlatList
          style={{ marginTop: 8 }}
          data={results}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => openOnMap(item)} style={{ backgroundColor: "#141417", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#1F1F23" }}>
              <Text style={{ color: "#EDEDED", fontWeight: "700" }}>{item.name}</Text>
              <Text style={{ color: "#B8B8B8" }}>{item.address || "–"}</Text>
              {!!item.category && <Text style={{ color: "#8E8E93", marginTop: 4 }}>#{item.category}</Text>}
            </Pressable>
          )}
          ListEmptyComponent={!loading ? () => <Text style={{ color: "#8E8E93", marginTop: 16 }}>Keine Ergebnisse</Text> : null}
        />
      </Container>
    </Screen>
  );
}
