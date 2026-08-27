import React, { useEffect, useRef } from "react";
import { Image, StyleSheet, Animated, AccessibilityInfo, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NewlyUnlockedAchievement } from "../lib/achievementEngine";
import { backyrdTheme as theme } from "../theme/backyrd";
import { AppText } from "./foundation/AppText";

export default function AchievementPopup({ achievement, onClose }: { achievement: NewlyUnlockedAchievement; onClose: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      if (reduced) {
        scale.setValue(1);
        return;
      }
      Animated.sequence([
        Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 220, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(scale, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => onClose());
    });
    return () => { active = false; };
  }, [onClose, scale]);

  return (
    <Animated.View style={[styles.popup, { transform: [{ scale }] }]}>
      {achievement.public_icon_url ? (
        <Image source={{ uri: achievement.public_icon_url }} style={styles.icon} />
      ) : <View style={styles.iconFallback}><Ionicons name="ribbon-outline" size={28} color={theme.color.lime} /></View>}
      <AppText role="caption" tone="lime" style={styles.title}>NEUER ERFOLG</AppText>
      <AppText role="cardTitle" style={styles.name}>{achievement.name}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  popup: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    backgroundColor: theme.color.surfaceElevated,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
  },
  icon: { width: 58, height: 58, marginBottom: theme.spacing.sm, borderRadius: 29 },
  iconFallback: { width: 58, height: 58, marginBottom: theme.spacing.sm, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  title: { letterSpacing: 1.6 },
  name: { marginTop: theme.spacing.xxs, textAlign: "center" },
});
