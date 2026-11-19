import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "./foundation/AppText";
import { NuknukAvatar } from "./NuknukAvatar";
import { useBackyrdTheme } from "../theme/backyrd";

/** Conversation while waiting, not a claim about backend stages or progress. */
export function WohinWaitCard({ isReply, onLeave }: { isReply: boolean; onLeave: () => void }) {
  const { color } = useBackyrdTheme();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const thought = seconds < 6
    ? "Ein guter Plan darf sich ganz nach dir anfühlen."
    : seconds < 12
      ? "Manchmal braucht es nur den richtigen Ort für einen richtig guten Moment."
      : seconds < 20
        ? "Dein Wunsch gibt die Richtung vor. Auch die kleinen Details zählen."
        : "Das dauert gerade etwas länger. Ich bin noch dran – du kannst deinen Wunsch auch anpassen.";

  return <View style={[styles.card, { backgroundColor: color.surface, borderColor: color.border }]}>
    <View style={styles.character}><NuknukAvatar height={148} animate /></View>
    <View style={styles.status} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={color.pink} />
      <AppText role="label" tone="pink">NukNuk sucht für dich</AppText>
    </View>
    <AppText role="sectionTitle" style={styles.center}>{isReply ? "Gut, das nehme ich mit." : "Dein Wunsch ist bei mir."}</AppText>
    <AppText role="body" tone="secondary" style={styles.thought}>{thought}</AppText>
    <Pressable accessibilityRole="button" onPress={onLeave} style={styles.action}>
      <AppText role="label" tone="pink">Wunsch anpassen</AppText>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, gap: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 28 },
  character: { alignItems: "center" },
  status: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 8 },
  center: { textAlign: "center" },
  thought: { textAlign: "center", minHeight: 72 },
  action: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
