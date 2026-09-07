import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type SplashScreenProps = {
  compact?: boolean;
  onAnimationSettled?: () => void;
  onReadyToReveal?: () => void;
};

/**
 * The visual sequence deliberately takes three seconds. The native launch
 * screen stays up only until this React view has laid out; the compact mark
 * then remains still if bootstrap needs longer.
 */
const WORDMARK_HOLD_MS = 1_450;
const TRANSITION_MS = 760;
const COMPACT_HOLD_MS = 1_000;

// The wordmark is deliberately built from one continuous set of glyphs. The
// previous overlay of two complete marks made the three-second sequence look
// like a hard replacement on a physical device.
const MARK_STAGE_WIDTH = 272;
const INITIAL_B_LEFT = 13;
const FINAL_B_LEFT = 111;
const INITIAL_TAIL_LEFT = 45;
const INITIAL_DOT_LEFT = 245;
const FINAL_DOT_LEFT = 143;

export default function SplashScreen({ compact = false, onAnimationSettled, onReadyToReveal }: SplashScreenProps) {
  const bTranslateX = useRef(new Animated.Value(compact ? FINAL_B_LEFT - INITIAL_B_LEFT : 0)).current;
  const tailOpacity = useRef(new Animated.Value(compact ? 0 : 1)).current;
  const tailTranslateX = useRef(new Animated.Value(0)).current;
  const dotTranslateX = useRef(new Animated.Value(compact ? FINAL_DOT_LEFT - INITIAL_DOT_LEFT : 0)).current;
  const onAnimationSettledRef = useRef(onAnimationSettled);
  const onReadyToRevealRef = useRef(onReadyToReveal);
  const hasReportedLayoutRef = useRef(false);

  useEffect(() => {
    onAnimationSettledRef.current = onAnimationSettled;
  }, [onAnimationSettled]);

  useEffect(() => {
    onReadyToRevealRef.current = onReadyToReveal;
  }, [onReadyToReveal]);

  const onLayout = useCallback(() => {
    if (hasReportedLayoutRef.current) return;
    hasReportedLayoutRef.current = true;
    onReadyToRevealRef.current?.();
  }, []);

  useEffect(() => {
    if (compact) {
      bTranslateX.setValue(FINAL_B_LEFT - INITIAL_B_LEFT);
      tailOpacity.setValue(0);
      tailTranslateX.setValue(-20);
      dotTranslateX.setValue(FINAL_DOT_LEFT - INITIAL_DOT_LEFT);
      return;
    }

    let compactHold: ReturnType<typeof setTimeout> | undefined;
    const token = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bTranslateX, {
          toValue: FINAL_B_LEFT - INITIAL_B_LEFT,
          duration: TRANSITION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(tailOpacity, {
          toValue: 0,
          duration: 430,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tailTranslateX, {
          toValue: -22,
          duration: TRANSITION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(dotTranslateX, {
          toValue: FINAL_DOT_LEFT - INITIAL_DOT_LEFT,
          duration: TRANSITION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        compactHold = setTimeout(() => onAnimationSettledRef.current?.(), COMPACT_HOLD_MS);
      });
    }, WORDMARK_HOLD_MS);

    return () => {
      clearTimeout(token);
      if (compactHold) clearTimeout(compactHold);
      bTranslateX.stopAnimation();
      tailOpacity.stopAnimation();
      tailTranslateX.stopAnimation();
      dotTranslateX.stopAnimation();
    };
  }, [bTranslateX, compact, dotTranslateX, tailOpacity, tailTranslateX]);

  return (
    <View onLayout={onLayout} style={styles.container}>
      <View style={styles.markStage} pointerEvents="none">
        <Animated.Text style={[styles.brandGlyph, styles.bGlyph, { transform: [{ translateX: bTranslateX }] }]}>b</Animated.Text>
        <Animated.Text style={[styles.brandGlyph, styles.tailGlyph, { opacity: tailOpacity, transform: [{ translateX: tailTranslateX }] }]}>ackyrd</Animated.Text>
        <Animated.Text style={[styles.brandGlyph, styles.brandDot, { transform: [{ translateX: dotTranslateX }] }]}>.</Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  markStage: { width: MARK_STAGE_WIDTH, height: 64, position: "relative" },
  brandGlyph: { position: "absolute", top: 0, color: "#F3EDE5", fontSize: 46, lineHeight: 56, fontWeight: "700", letterSpacing: 1.2 },
  bGlyph: { left: INITIAL_B_LEFT },
  tailGlyph: { left: INITIAL_TAIL_LEFT },
  brandDot: { left: INITIAL_DOT_LEFT, color: "#FF4F91", letterSpacing: 0 },
});
