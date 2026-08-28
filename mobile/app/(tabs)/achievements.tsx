// app/(tabs)/achievements.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAchievements } from "../../hooks/useAchievements";
import { awardAchievementsForUser } from "../../lib/achievementEngine";
import type { AchievementWithProgress, NewlyUnlockedAchievement } from "../../lib/achievementEngine";
import { supabase } from "../../lib/supabase";
import { useFocusEffect } from "@react-navigation/native";
import AchievementPopup from "../../components/AchievementPopup";
import { AppText } from "../../components/foundation/AppText";
import { IconButton } from "../../components/foundation/Button";
import { Screen } from "../../components/foundation/Screen";
import { StateView } from "../../components/foundation/StateView";
import { backyrdTheme as theme } from "../../theme/backyrd";

export default function AchievementsScreen() {
  const { achievements, loading, error, refetch } = useAchievements();
  const [newAchievement, setNewAchievement] = useState<NewlyUnlockedAchievement | null>(null);

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
    }, [refetch])
  );

  // --------- GROUPING: nur die höchste Stufe pro Typ anzeigen ---------

  function groupAchievements(list: AchievementWithProgress[]) {
    const groups: Record<string, AchievementWithProgress[]> = {};

    list.forEach((a) => {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type].push(a);
    });

    const final: AchievementWithProgress[] = [];

    Object.keys(groups).forEach((type) => {
      const items = groups[type];

      const unlocked = items.filter((a) => a.unlocked);
      const locked = items.filter((a) => !a.unlocked);

      if (unlocked.length > 0) {
        // höchste Stufe → größtes threshold
        final.push(unlocked.sort((a, b) => (b.threshold ?? 0) - (a.threshold ?? 0))[0]);
      } else {
        // keine unlocked → nächste Stufe → kleinstes threshold
        final.push(locked.sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0))[0]);
      }
    });

    return final;
  }

  const grouped = groupAchievements(achievements);

  return (
    <Screen padded>

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
        <View style={styles.headerCopy}>
          <AppText role="caption" tone="lime" style={styles.kicker}>DEIN BACKYRD</AppText>
          <AppText role="displayM">ERFOLGE.</AppText>
        </View>
        <IconButton accessibilityLabel="Erfolge neu laden" onPress={() => void refetch()} style={styles.reloadBtn}>
          <Ionicons name="refresh" size={21} color={theme.color.textPrimary} />
        </IconButton>
      </View>

      {loading ? <StateView kind="loading" title="Erfolge werden geladen" /> : null}
      {!loading && error ? <StateView kind="error" title="Erfolge gerade nicht erreichbar" message="Bitte versuche es noch einmal." actionLabel="Erneut laden" onAction={() => void refetch()} /> : null}

      {/* ---- LISTE ---- */}
      {!loading && !error && (
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
                    <Ionicons name="ribbon-outline" size={24} color={theme.color.lime} />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}><AppText role="bodyStrong" style={styles.name}>{item.name}</AppText>{item.unlocked ? <Ionicons name="checkmark-circle" size={18} color={theme.color.lime} /> : null}</View>

                  <AppText role="meta" tone="secondary" style={styles.desc}>{item.description}</AppText>

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
                    <AppText role="caption" tone="lime" style={styles.unlockedText}>Freigeschaltet</AppText>
                  )}
                </View>

                <View>
                  <AppText role="caption" tone="muted" style={styles.badgeType}>{item.type}</AppText>
                  <AppText role="caption" style={styles.threshold}>
                    {item.progress}/{item.threshold ?? 1}
                  </AppText>
                </View>

              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // POPUP WRAPPER - immer on top
  popupWrapper: {
    position: "absolute",
    top: theme.spacing.xl,
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
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  headerCopy: { flex: 1, gap: theme.spacing.xxs },
  kicker: { letterSpacing: 1.8 },

  reloadBtn: {
    backgroundColor: theme.color.surfaceElevated,
  },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  cardUnlocked: {
    borderColor: theme.color.borderStrong,
  },
  row: { flexDirection: "row", gap: 12 },

  icon: { width: 48, height: 48, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceElevated },
  iconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  name: { flexShrink: 1 },
  desc: { marginTop: theme.spacing.xxs },

  progressWrapper: {
    marginTop: 8,
    height: 6,
    backgroundColor: theme.color.surfaceElevated,
    borderRadius: theme.radius.pill,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: theme.color.lime,
  },
  unlockedText: { marginTop: theme.spacing.xs },

  badgeType: { textAlign: "right", textTransform: "uppercase" },
  threshold: {
    textAlign: "right",
    marginTop: 4,
  },
});
