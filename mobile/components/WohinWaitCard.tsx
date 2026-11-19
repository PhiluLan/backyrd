import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "./foundation/AppText";
import { useBackyrdTheme } from "../theme/backyrd";

/** An inline reply from the already-present NukNuk, with no simulated progress. */
export function WohinWaitCard({ isReply, onLeave }: { isReply: boolean; onLeave: () => void }) {
  const { color } = useBackyrdTheme();
  const [seconds, setSeconds] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const dots = useRef([new Animated.Value(0.4), new Animated.Value(0.4), new Animated.Value(0.4)]).current;
  useEffect(() => {
    let active = true;
    const started = Date.now();
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const app = AppState.addEventListener("change", state => setForeground(state === "active"));
    const timer = setInterval(() => { if (AppState.currentState === "active") setSeconds(Math.floor((Date.now() - started) / 1000)); }, 1000);
    return () => { active = false; clearInterval(timer); motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion || !foreground) { dots.forEach(dot => dot.setValue(0.65)); return; }
    dots.forEach(dot => dot.setValue(0.4));
    const animation = Animated.loop(Animated.sequence([
      Animated.stagger(160, dots.map(dot => Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.4, duration: 300, useNativeDriver: true }),
      ]))),
      Animated.delay(180),
    ]));
    animation.start();
    return () => animation.stop();
  }, [dots, foreground, reduceMotion]);

  return <View style={styles.reply}>
    <View style={styles.status} accessibilityLabel="NukNuk sucht" accessibilityRole="progressbar">
      {dots.map((dot, index) => <Animated.View key={index} accessible={false} style={[styles.dot, { backgroundColor: color.pink, opacity: dot }]} />)}
      <AppText role="caption" tone="pink">NukNuk</AppText>
    </View>
    <AppText role="body">{isReply ? "Alles klar, ich schaue noch einmal." : "Ich schaue, was zu deinem Plan passt."}</AppText>
    {seconds >= 12 ? <AppText role="meta" tone="secondary" accessibilityLiveRegion="polite">{seconds >= 24 ? "Das dauert gerade länger. Ich bin noch dran. Du kannst deinen Wunsch jederzeit anpassen." : "Noch einen Moment …"}</AppText> : null}
    <Pressable accessibilityRole="button" onPress={onLeave} style={styles.action}><AppText role="caption" tone="secondary">Wunsch anpassen</AppText></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  reply: { gap: 12, paddingVertical: 6 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  action: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" },
});
