import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText, ProductTextInput } from "../../components/foundation/AppText";
import { Button } from "../../components/foundation/Button";
import { StateView } from "../../components/foundation/StateView";
import { useSpotsStore } from "../../lib/useSpotsStore";
import { backyrdTheme as theme } from "../../theme/backyrd";

function normalize(value: string) {
  return value.toLocaleLowerCase("de-CH").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export default function SelectReviewSpotScreen() {
  const router = useRouter();
  const { spots, refresh, loading, error } = useSpotsStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const results = useMemo(() => {
    const needle = normalize(query);
    const ordered = [...spots].sort((a, b) => a.name.localeCompare(b.name, "de-CH"));
    return needle
      ? ordered.filter((spot) => normalize(`${spot.name} ${spot.address ?? ""} ${spot.city ?? ""}`).includes(needle))
      : ordered;
  }, [query, spots]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zurück" hitSlop={10} onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" color={theme.color.textPrimary} size={24} />
        </Pressable>
        <AppText role="screenTitle">Moment erstellen</AppText>
      </View>

      <View style={styles.intro}>
        <AppText role="body" tone="secondary">Wähle den Ort, an dem du deinen Moment erlebt hast.</AppText>
        <Button label="Spot automatisch erkennen" variant="secondary" onPress={() => router.push("/review/smart")} style={styles.smartButton} />
        <AppText role="caption" tone="muted">Optional · benötigt deine Standortfreigabe</AppText>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={20} color={theme.color.textSecondary} />
        <ProductTextInput
          accessibilityLabel="Spot suchen"
          autoCorrect={false}
          placeholder="Spot oder Ort suchen"
          placeholderTextColor={theme.color.textMuted}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? <View style={styles.state}><StateView kind="loading" title="Spots werden geladen" /></View>
        : error ? <View style={styles.state}><StateView kind="error" title="Spots gerade nicht verfügbar" message="Bitte versuche es noch einmal. Dein Moment ist noch nicht verloren." actionLabel="Erneut laden" onAction={() => void refresh()} /></View>
        : <FlatList
            data={results}
            keyExtractor={(spot) => spot.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={<StateView kind="empty" title={query ? "Kein passender Spot" : "Noch keine Spots"} message={query ? "Versuche einen anderen Namen oder Ort." : "Aktuell sind keine Spots verfügbar."} />}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.city ?? item.address ?? "Ort unbekannt"} auswählen`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => router.push({ pathname: "/review/new", params: { spotId: item.id, source: "manual" } })}
              >
                <View style={styles.rowText}>
                  <AppText role="bodyStrong" numberOfLines={1}>{item.name}</AppText>
                  <AppText role="meta" tone="secondary" numberOfLines={1}>{item.address || item.city || "Adresse noch offen"}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.color.textMuted} />
              </Pressable>
            )}
          />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  back: { minHeight: 44, minWidth: 36, justifyContent: "center" },
  intro: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xl, gap: theme.spacing.sm },
  smartButton: { alignSelf: "stretch", marginTop: theme.spacing.sm },
  search: { flexDirection: "row", alignItems: "center", marginHorizontal: theme.spacing.xl, marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.md, minHeight: 52, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  input: { flex: 1, color: theme.color.textPrimary, paddingHorizontal: theme.spacing.sm, fontSize: 16 },
  list: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl, flexGrow: 1 },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  rowText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  state: { marginHorizontal: theme.spacing.xl, marginTop: theme.spacing.xl },
});
