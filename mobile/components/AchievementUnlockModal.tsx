// mobile/components/AchievementUnlockModal.tsx
import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Image,
  Animated,
  Easing,
  AccessibilityInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NewlyUnlockedAchievement } from "../lib/achievementEngine";
import { backyrdTheme as theme } from "../theme/backyrd";
import { AppText } from "./foundation/AppText";
import { Button } from "./foundation/Button";

export function AchievementUnlockModal({ achievements, onClose }: { achievements: NewlyUnlockedAchievement[]; onClose: () => void }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      if (reduced) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    });
    return () => { active = false; };
  }, [opacity, scale]);

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[styles.container, { opacity, transform: [{ scale }] }]}>
          <AppText role="caption" tone="lime" style={styles.kicker}>DEIN BACKYRD</AppText>
          <AppText role="sectionTitle" style={styles.title}>Neuer Erfolg</AppText>

          {achievements.map((a) => (
            <View key={a.id} style={styles.row}>
              {a.public_icon_url ? (
                <Image source={{ uri: a.public_icon_url }} style={styles.icon} />
              ) : (
                <View style={styles.iconPlaceholder}><Ionicons name="ribbon-outline" size={25} color={theme.color.lime} /></View>
              )}

              <View style={{ flex: 1 }}>
                <AppText role="bodyStrong">{a.name}</AppText>
                {a.description ? <AppText role="meta" tone="secondary" style={styles.desc}>{a.description}</AppText> : null}
              </View>
            </View>
          ))}

          <Button label="Weiter" onPress={onClose} style={styles.button} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: 20,
  },
  container: {
    backgroundColor: theme.color.surfaceElevated,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    borderColor: theme.color.borderStrong,
    borderWidth: 1,
  },
  kicker: { textAlign: "center", letterSpacing: 1.8 },
  title: { textAlign: "center", marginTop: theme.spacing.xxs, marginBottom: theme.spacing.lg },
  row: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  iconPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.color.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  desc: { marginTop: theme.spacing.xxs },
  button: {
    marginTop: theme.spacing.lg,
  },
});
