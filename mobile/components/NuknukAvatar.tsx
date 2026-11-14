import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, Image, View } from "react-native";

const idleStrip = require("../assets/characters/nuknuk/idle.webp");
const blinkFrames = [1, 2, 3, 2, 1, 0] as const;

export function NuknukAvatar({ height, animate = false }: { height: number; animate?: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animate) return;

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
  }, [animate]);

  useEffect(() => {
    setFrame(0);
    if (!animate || !foreground || reduceMotion) return;

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
  }, [animate, foreground, reduceMotion]);

  const width = height / 2;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={{ width, height, overflow: "hidden" }}>
      <Image source={idleStrip} accessible={false} resizeMode="stretch" fadeDuration={0}
        style={{ position: "absolute", top: 0, left: -frame * width, width: width * 6, height }} />
    </View>
  );
}
