import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Image, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { createNuknukMotionSession, NUKNUK_BLINK, NUKNUK_MOTIONS, NUKNUK_REST, type NuknukMotionState, type NuknukPose } from "@/lib/nuknuk-motion";

const art = {
  head: require("../assets/characters/nuknuk/motion/head.png"),
  torso: require("../assets/characters/nuknuk/motion/torso.png"),
  leftLeg: require("../assets/characters/nuknuk/motion/legLeft.png"),
  rightLeg: require("../assets/characters/nuknuk/motion/legRight.png"),
  leftUpper: require("../assets/characters/nuknuk/motion/armLeftUpper.png"),
  leftLower: require("../assets/characters/nuknuk/motion/armLeftLower.png"),
  rightUpper: require("../assets/characters/nuknuk/motion/armRightUpper.png"),
  rightLower: require("../assets/characters/nuknuk/motion/armRightLower.png"),
  leftLash: require("../assets/characters/nuknuk/motion/eyeClosedLeft.png"),
  rightLash: require("../assets/characters/nuknuk/motion/eyeClosedRight.png"),
};

type Props = {
  height: number;
  animate?: boolean;
  state?: NuknukMotionState;
  motionKey?: string | number;
  active?: boolean;
  visible?: boolean;
  placement?: { left: number; top: number };
  appearance?: "illustrated" | "outline";
};

export function NuknukAvatar({ appearance = "illustrated", ...props }: Props) {
  return appearance === "outline" ? <OutlineAvatar height={props.height} /> : <IllustratedAvatar {...props} />;
}

function IllustratedAvatar({ height, animate = false, state = "listening", motionKey = 0, active = true, visible = true, placement }: Props) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted.current) setReduceMotion(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const app = AppState.addEventListener("change", value => setForeground(value === "active"));
    return () => { mounted.current = false; motion.remove(); app.remove(); };
  }, []);

  const headRot = useSharedValue(0), headY = useSharedValue(0), torso = useSharedValue(0);
  const leftShoulder = useSharedValue(0), leftElbow = useSharedValue(0), rightShoulder = useSharedValue(0), rightElbow = useSharedValue(0);
  const blink = useSharedValue(0);
  const opacity = useSharedValue(visible ? 1 : 0);
  const size = useSharedValue(height), x = useSharedValue(placement?.left ?? 0), y = useSharedValue(placement?.top ?? 0);
  const makeSession = useMemo(() => () => {
    const values = { headRot, headY, torso, leftShoulder, leftElbow, rightShoulder, rightElbow };
    return createNuknukMotionSession({
      stop: () => { Object.values(values).forEach(cancelAnimation); cancelAnimation(blink); },
      reset: () => { for (const key of Object.keys(values) as (keyof NuknukPose)[]) values[key].value = NUKNUK_REST[key]; blink.value = 0; },
      pose: target => {
        const motion = NUKNUK_MOTIONS[target];
        for (const key of Object.keys(values) as (keyof NuknukPose)[]) {
          let at = 0;
          const steps = motion.frames.map(frame => {
            const duration = Math.round((frame.at - at) * motion.duration); at = frame.at;
            return withTiming(frame.pose[key] ?? 0, { duration, easing: Easing.inOut(Easing.cubic) });
          });
          values[key].value = withSequence(...steps);
        }
      },
      ambient: () => { torso.value = withRepeat(withSequence(withTiming(.0045, { duration: 2900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2900, easing: Easing.inOut(Easing.sin) })), -1, false); },
      blink: () => { blink.value = withSequence(withTiming(1, { duration: NUKNUK_BLINK.close }), withDelay(NUKNUK_BLINK.hold, withTiming(0, { duration: NUKNUK_BLINK.open }))); },
    });
  }, [blink, headRot, headY, leftElbow, leftShoulder, rightElbow, rightShoulder, torso]);
  const session = useRef<ReturnType<typeof createNuknukMotionSession> | null>(null);
  useEffect(() => {
    const current = makeSession();
    session.current = current;
    return () => { current.dispose(); session.current = null; };
  }, [makeSession]);
  useEffect(() => { session.current?.update({ state, key: motionKey, enabled: animate && active && visible && foreground && !reduceMotion }); }, [makeSession, state, motionKey, animate, active, visible, foreground, reduceMotion]);
  useEffect(() => {
    const options = { duration: reduceMotion || !foreground || !active ? 0 : 420, easing: Easing.out(Easing.cubic) };
    size.value = withTiming(height, options);
    x.value = withTiming(placement?.left ?? 0, options);
    y.value = withTiming(placement?.top ?? 0, options);
    return () => { cancelAnimation(size); cancelAnimation(x); cancelAnimation(y); };
  }, [height, placement?.left, placement?.top, active, foreground, reduceMotion, size, x, y]);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: reduceMotion || !foreground ? 0 : 180 });
    return () => cancelAnimation(opacity);
  }, [visible, reduceMotion, foreground, opacity]);
  const frameStyle = useAnimatedStyle(() => ({ opacity: opacity.value, width: size.value * .65, height: size.value, ...(placement ? { left: x.value, top: y.value } : {}) }));
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: size.value / 800 }] }));
  const headStyle = useAnimatedStyle(() => ({ transform: [{ translateY: headY.value }, { rotate: `${headRot.value}deg` }] }));
  const torsoStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + torso.value }] }));
  const leftStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${leftShoulder.value}deg` }] }));
  const leftLowerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${leftElbow.value}deg` }] }));
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rightShoulder.value}deg` }] }));
  const rightLowerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rightElbow.value}deg` }] }));
  const upperStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const lowerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - blink.value) * 12 }, { scaleY: Math.max(.18, blink.value * .82) }] }));
  const lashStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (blink.value - .62) / .38)) }));

  return <Animated.View testID="nuknuk-motion-figure" accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[placement && styles.placed, frameStyle]}>
    <Animated.View style={[styles.stage, stageStyle]}>
      <Image source={art.leftLeg} fadeDuration={0} style={styles.leftLeg} />
      <Image source={art.rightLeg} fadeDuration={0} style={styles.rightLeg} />
      <Animated.View style={[styles.leftArm, leftStyle]}><Image source={art.leftUpper} fadeDuration={0} style={styles.armImage} /><Animated.Image source={art.leftLower} fadeDuration={0} style={[styles.armImage, styles.leftElbow, leftLowerStyle]} /></Animated.View>
      <Animated.View style={[styles.rightArm, rightStyle]}><Image source={art.rightUpper} fadeDuration={0} style={styles.armImage} /><Animated.Image source={art.rightLower} fadeDuration={0} style={[styles.armImage, styles.rightElbow, rightLowerStyle]} /></Animated.View>
      <Animated.Image source={art.torso} fadeDuration={0} style={[styles.torso, torsoStyle]} />
      <Animated.View style={[styles.head, headStyle]}>
        <Image source={art.head} fadeDuration={0} style={StyleSheet.absoluteFill} />
        {(["left", "right"] as const).map(side => <View key={side} style={[styles.eye, { left: side === "left" ? 92 : 210 }]}>
          <Animated.View style={[styles.upperLid, upperStyle]}><LinearGradient colors={side === "left" ? ["#F6A66B", "#F5A165", "#E78B53"] : ["#F9AC6C", "#F8A669", "#E78B53"]} style={StyleSheet.absoluteFill} /></Animated.View>
          <Animated.View style={[styles.lowerLid, lowerStyle]}><LinearGradient colors={side === "left" ? ["#EDA05E", "#F5A165"] : ["#EDA05E", "#F8A669"]} style={StyleSheet.absoluteFill} /></Animated.View>
          <Animated.Image source={side === "left" ? art.leftLash : art.rightLash} fadeDuration={0} style={[styles.lash, lashStyle]} />
        </View>)}
      </Animated.View>
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  placed: { position: "absolute", zIndex: 2 },
  stage: { position: "absolute", left: 0, top: 0, width: 520, height: 800, transformOrigin: "top left" },
  leftLeg: { position: "absolute", zIndex: 1, left: 126, top: 491, width: 150, height: 302 },
  rightLeg: { position: "absolute", zIndex: 1, left: 255, top: 489, width: 146, height: 310 },
  leftArm: { position: "absolute", zIndex: 2, left: 105, top: 314, width: 118, height: 287, transformOrigin: [73.16, 22.96, 0] },
  rightArm: { position: "absolute", zIndex: 2, left: 299, top: 313, width: 114, height: 284, transformOrigin: [43.32, 22.72, 0] },
  armImage: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" },
  leftElbow: { transformOrigin: "50% 50.5%" }, rightElbow: { transformOrigin: "50% 50.4%" },
  torso: { position: "absolute", zIndex: 3, left: 153, top: 294, width: 214, height: 224, transformOrigin: "50% 88%" },
  head: { position: "absolute", zIndex: 4, left: 80, top: 5, width: 360, height: 336, transformOrigin: "50% 94%" },
  eye: { position: "absolute", zIndex: 5, top: 137, width: 82, height: 66, borderRadius: 41, overflow: "hidden" },
  upperLid: { position: "absolute", top: 0, left: 0, width: 82, height: 66, borderBottomWidth: 2, borderBottomColor: "#5D2B18CC", transformOrigin: "top" },
  lowerLid: { position: "absolute", bottom: 0, left: 0, width: 82, height: 15.84, borderTopWidth: 1, borderTopColor: "#74351D61", transformOrigin: "bottom" },
  lash: { position: "absolute", zIndex: 2, top: 28, left: 0, width: 82, height: 41.72 },
});

function OutlineAvatar({ height }: { height: number }) {
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
