// app/(tabs)/achievements.tsx
import React from "react";
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { useAchievements } from "../../hooks/useAchievements";
import { Image } from "react-native";

export default function AchievementsScreen() {
  const { achievements, loading, error, refetch } = useAchievements();

  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Deine Badges</Text>
        <TouchableOpacity onPress={refetch} style={styles.reloadBtn}>
          <Text style={styles.reloadText}>Neu laden</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator />}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && (
        <FlatList
          data={[...unlocked, ...locked]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, item.unlocked && styles.cardUnlocked]}>
              <View style={styles.row}>
                {item.icon_url ? (
                  <Image source={{ uri: item.icon_url }} style={styles.icon} />
                ) : (
                  <View style={styles.iconPlaceholder}>
                    <Text style={styles.iconText}>🏅</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.name} {item.unlocked ? "✅" : ""}
                  </Text>
                  <Text style={styles.desc}>{item.description}</Text>
                  {!item.unlocked ? (
                    <View style={styles.progressWrapper}>
                      <View style={[styles.progressBar, { width: `${item.percentage * 100}%` }]} />
                    </View>
                  ) : (
                    <Text style={styles.unlockedText}>Freigeschaltet</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.badgeType}>{item.type}</Text>
                  <Text style={styles.threshold}>
                    {item.progress}/{item.threshold ?? 1}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0f1012" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "white" },
  reloadBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#1f2227", borderRadius: 999 },
  reloadText: { color: "white", fontSize: 12 },
  error: { color: "red" },
  card: {
    backgroundColor: "#17191d",
    borderRadius: 16,
    padding: 14,
  },
  cardUnlocked: {
    borderColor: "#4ade80",
    borderWidth: 1,
  },
  row: { flexDirection: "row", gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 999, backgroundColor: "#222" },
  iconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: { fontSize: 20 },
  name: { color: "white", fontWeight: "600", fontSize: 15 },
  desc: { color: "#b4bbc7", fontSize: 13, marginTop: 2 },
  progressWrapper: {
    marginTop: 8,
    height: 6,
    backgroundColor: "#272a2f",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#4ade80",
  },
  unlockedText: { marginTop: 6, color: "#4ade80", fontSize: 12 },
  badgeType: { color: "#b4bbc7", fontSize: 11, textAlign: "right" },
  threshold: { color: "white", fontWeight: "700", textAlign: "right", marginTop: 4 },
});
