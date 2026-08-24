import React, { useEffect, useRef } from "react";
import { Text, Image, StyleSheet, Animated } from "react-native";
import type { NewlyUnlockedAchievement } from "../lib/achievementEngine";

export default function AchievementPopup({ achievement, onClose }: { achievement: NewlyUnlockedAchievement; onClose: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(scale, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose, scale]);

  return (
    <Animated.View style={[styles.popup, { transform: [{ scale }] }]}>
      {achievement.public_icon_url ? (
        <Image source={{ uri: achievement.public_icon_url }} style={styles.icon} />
      ) : null}
      <Text style={styles.title}>Neues Badge!</Text>
      <Text style={styles.name}>{achievement.name}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  popup: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    backgroundColor: "#1a1c1f",
    padding: 20,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4ade80",
  },
  icon: { width: 64, height: 64, marginBottom: 10 },
  title: { color: "#4ade80", fontWeight: "800", fontSize: 16 },
  name: { color: "white", fontSize: 18, fontWeight: "700", marginTop: 4 },
});
