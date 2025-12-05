// app/(tabs)/achievements.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";

import { useAchievements } from "../../hooks/useAchievements";
import { awardAchievementsForUser } from "../../lib/achievementEngine";
import { supabase } from "../../lib/supabase";
import { useFocusEffect } from "@react-navigation/native";
import AchievementPopup from "../../components/AchievementPopup";

export default function AchievementsScreen() {
  const { achievements, loading, error, refetch } = useAchievements();
  const [newAchievement, setNewAchievement] = useState(null);

  /**
   * Wird ausgeführt jedes Mal, wenn man den Tab betritt.
   * Vergibt neue Achievements + zeigt das Popup + lädt UI neu.
   */
  useFocusEffect(
    useCallback(() => {
      async function sync() {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const userId = data.session.user.id;

        const newlyUnlocked = await awardAchievementsForUser(userId);

        if (newlyUnlocked.length > 0) {
          setNewAchievement(newlyUnlocked[0]);
        }

        await refetch();
      }

      sync();
    }, [])
  );

  // --------- GROUPING: nur die höchste Stufe pro Typ anzeigen ---------

  function groupAchievements(list) {
    const groups = {};

    list.forEach((a) => {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type].push(a);
    });

    const final = [];

    Object.keys(groups).forEach((type) => {
      const items = groups[type];

      const unlocked = items.filter((a) => a.unlocked);
      const locked = items.filter((a) => !a.unlocked);

      if (unlocked.length > 0) {
        // höchste Stufe → größtes threshold
        final.push(unlocked.sort((a, b) => b.threshold - a.threshold)[0]);
      } else {
        // keine unlocked → nächste Stufe → kleinstes threshold
        final.push(locked.sort((a, b) => a.threshold - b.threshold)[0]);
      }
    });

    return final;
  }

  const grouped = groupAchievements(achievements);

  return (
    <View style={styles.container}>

      {/* ---- ACHIEVEMENT POPUP ---- */}
      {newAchievement && (
        <View style={styles.popupWrapper}>
          <AchievementPopup
            achievement={newAchievement}
            onClose={() => setNewAchievement(null)}
          />
        </View>
      )}

      <View style={styles.headerRow}>
        <Text style={styles.title}>Deine Badges</Text>

        <TouchableOpacity onPress={refetch} style={styles.reloadBtn}>
          <Text style={styles.reloadText}>Neu laden</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color="#fff" />}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* ---- LISTE ---- */}
      {!loading && (
        <FlatList
          data={grouped}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, item.unlocked && styles.cardUnlocked]}>
              <View style={styles.row}>

                {item.public_icon_url ? (
                  <Image
                    source={{ uri: item.public_icon_url }}
                    style={styles.icon}
                  />
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
                      <View
                        style={[
                          styles.progressBar,
                          { width: `${item.percentage * 100}%` },
                        ]}
                      />
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

  // POPUP WRAPPER - immer on top
  popupWrapper: {
    position: "absolute",
    top: 30,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 999,
    alignItems: "center",
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "700", color: "white" },

  reloadBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#1f2227",
    borderRadius: 999,
  },
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
  threshold: {
    color: "white",
    fontWeight: "700",
    textAlign: "right",
    marginTop: 4,
  },
});
