import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, Image, View } from "react-native";

const idleStrip = require("../assets/characters/nuknuk/idle.webp");
const blinkFrames = [1, 2, 3, 2, 1, 0] as const;

export function NuknukAvatar({ height, animate = false, appearance = "illustrated" }: { height: number; animate?: boolean; appearance?: "illustrated" | "outline" }) {
  const animated = animate && appearance === "illustrated";
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animated) return;

    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduceMotion(enabled);
    }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const appState = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => {
      active = false;
      motion.remove();
      appState.remove();
    };
  }, [animated]);

  useEffect(() => {
    setFrame(0);
    if (!animated || !foreground || reduceMotion) return;

    let timer: ReturnType<typeof setTimeout>;
    const waitForBlink = () => {
      timer = setTimeout(() => showFrame(0), 3500 + Math.random() * 4000);
    };
    const showFrame = (index: number) => {
      setFrame(blinkFrames[index]);
      if (index + 1 === blinkFrames.length) waitForBlink();
      else timer = setTimeout(() => showFrame(index + 1), index === 2 ? 85 : 45);
    };
    waitForBlink();
    return () => clearTimeout(timer);
  }, [animated, foreground, reduceMotion]);

  if (appearance === "outline") {
    const pink = "#FF438E";
    return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: height, height, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 32, height: 32, transform: [{ scale: height / 32 }] }}>
        {/* Nuknuk's bob, swept fringe and smiling face, reduced for a header icon. */}
        <View style={{ position: "absolute", left: 2, top: 1, width: 28, height: 28, borderWidth: 1.8, borderColor: pink, borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 9, borderBottomRightRadius: 9 }} />
        <View style={{ position: "absolute", left: 7, top: 10, width: 18, height: 19, borderWidth: 1.6, borderTopWidth: 0, borderColor: pink, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }} />
        <View style={{ position: "absolute", left: 16, top: 3, width: 10, height: 14, borderLeftWidth: 1.8, borderTopLeftRadius: 8, borderColor: pink, transform: [{ rotate: "-32deg" }] }} />
        <View style={{ position: "absolute", left: 6, top: 6, width: 10, height: 9, borderTopWidth: 1.8, borderTopLeftRadius: 9, borderColor: pink, transform: [{ rotate: "-26deg" }] }} />
        <View style={{ position: "absolute", left: 11, top: 15, width: 2.6, height: 3.2, borderRadius: 2, backgroundColor: pink }} />
        <View style={{ position: "absolute", left: 19, top: 15, width: 2.6, height: 3.2, borderRadius: 2, backgroundColor: pink }} />
        <View style={{ position: "absolute", left: 12, top: 20, width: 8, height: 5, borderBottomWidth: 1.6, borderLeftWidth: 1.1, borderRightWidth: 1.1, borderColor: pink, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }} />
      </View>
    </View>;
  }

  const width = height / 2;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={{ width, height, overflow: "hidden" }}>
      <Image source={idleStrip} accessible={false} resizeMode="stretch" fadeDuration={0}
        style={{ position: "absolute", top: 0, left: -frame * width, width: width * 6, height }} />
    </View>
  );
}
