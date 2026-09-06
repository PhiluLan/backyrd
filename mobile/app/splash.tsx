import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

type SplashScreenProps = { compact?: boolean; onAnimationSettled?: () => void };

export default function SplashScreen({ compact = false, onAnimationSettled }: SplashScreenProps) {
  const fullOpacity = useRef(new Animated.Value(1)).current;
  const fullScale = useRef(new Animated.Value(1)).current;
  const fullTranslateY = useRef(new Animated.Value(0)).current;
  const compactOpacity = useRef(new Animated.Value(compact ? 1 : 0)).current;
  const compactScale = useRef(new Animated.Value(compact ? 1 : 0.9)).current;
  const compactTranslateY = useRef(new Animated.Value(compact ? 0 : 12)).current;
  const onAnimationSettledRef = useRef(onAnimationSettled);

  useEffect(() => {
    onAnimationSettledRef.current = onAnimationSettled;
  }, [onAnimationSettled]);

  useEffect(() => {
    if (compact) {
      fullOpacity.setValue(0);
      fullScale.setValue(0.96);
      fullTranslateY.setValue(4);
      compactOpacity.setValue(1);
      compactScale.setValue(1);
      compactTranslateY.setValue(0);
      return;
    }

    const token = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fullOpacity, { toValue: 0, duration: 230, useNativeDriver: true }),
        Animated.timing(fullScale, { toValue: 0.96, duration: 230, useNativeDriver: true }),
        Animated.timing(fullTranslateY, { toValue: -6, duration: 230, useNativeDriver: true }),
        Animated.timing(compactOpacity, { toValue: 1, duration: 220, delay: 160, useNativeDriver: true }),
        Animated.spring(compactScale, { toValue: 1, damping: 12, stiffness: 180, mass: 0.8, useNativeDriver: true }),
        Animated.timing(compactTranslateY, { toValue: 0, duration: 200, delay: 120, useNativeDriver: true }),
      ]).start(() => onAnimationSettledRef.current?.());
    }, 55);

    return () => {
      clearTimeout(token);
      fullOpacity.stopAnimation();
      fullScale.stopAnimation();
      fullTranslateY.stopAnimation();
      compactOpacity.stopAnimation();
      compactScale.stopAnimation();
      compactTranslateY.stopAnimation();
    };
  }, [compact, compactOpacity, compactScale, compactTranslateY, fullOpacity, fullScale, fullTranslateY]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.brandMark, { opacity: fullOpacity, transform: [{ scale: fullScale }, { translateY: fullTranslateY }] }]}>
        <Animated.Text style={styles.brandWord}>backyrd<Animated.Text style={styles.brandDot}>.</Animated.Text></Animated.Text>
      </Animated.View>
      <Animated.View style={[styles.compactMark, { opacity: compactOpacity, transform: [{ scale: compactScale }, { translateY: compactTranslateY }] }]}>
        <Animated.Text style={styles.compactWord}>b<Animated.Text style={styles.compactDot}>.</Animated.Text></Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  brandMark: { position: "absolute" },
  compactMark: { position: "absolute" },
  brandWord: { color: "#F3EDE5", fontSize: 46, lineHeight: 56, fontWeight: "700", letterSpacing: 1.2 },
  brandDot: { color: "#FF4F91", letterSpacing: 0 },
  compactWord: { color: "#F3EDE5", fontSize: 42, lineHeight: 46, fontWeight: "700", letterSpacing: -1 },
  compactDot: { color: "#FF4F91", letterSpacing: -2 },
});
