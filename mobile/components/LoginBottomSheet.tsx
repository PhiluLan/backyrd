// mobile/components/LoginBottomSheet.tsx
import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, Platform } from "react-native";
import Animated, {
  useSharedValue,
  withTiming,
  withSpring,
  useAnimatedStyle,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const { height } = Dimensions.get("window");

type Props = {
  visible: boolean;
  onClose?: () => void;
  onApple?: () => void;
  onGoogle?: () => void;
};

export default function LoginBottomSheet({ visible, onClose, onApple, onGoogle }: Props) {
  const router = useRouter();
  const open = useSharedValue(0); // 0=zu, 1=offen

  useEffect(() => {
    open.value = withTiming(visible ? 1 : 0, {duration: 450,});
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 500 }),
    pointerEvents: visible ? "auto" : "none",
  })) as any;

  const sheetStyle = useAnimatedStyle(() => {
    const translateY = interpolate(open.value, [0, 1], [height, height * 0.2]);
    return { transform: [{ translateY }] };
  });

    const handleClose = () => {
    open.value = withSpring(
        0,
        {
        damping: 16,
        stiffness: 140,
        mass: 0.3,
        },
        () => {
        if (onClose) runOnJS(onClose)();
        }
    );
    };

  return (
    <>
      {/* Dimmed overlay */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheetContainer, sheetStyle]}>
        <BlurView intensity={70} tint="dark" style={styles.sheetBlur}>
          <View style={styles.grabber} />

          <Text style={styles.title}>Willkommen bei Backyrd</Text>
          <Text style={styles.subtitle}>Melde dich an, um Spots zu speichern, Freunden zu folgen und deine Journey zu starten.</Text>

          {/* Apple */}
          <Pressable onPress={onApple} style={({ pressed }) => [styles.btn, styles.btnApple, pressed && { opacity: 0.9 }]}>
            <Ionicons name="logo-apple" size={20} color="#fff" />
            <Text style={styles.btnText}>Mit Apple anmelden</Text>
          </Pressable>

          {/* Google */}
          <Pressable onPress={onGoogle} style={({ pressed }) => [styles.btn, styles.btnGoogle, pressed && { opacity: 0.95 }]}>
            <Ionicons name="logo-google" size={18} color="#111" />
            <Text style={[styles.btnText, { color: "#111" }]}>Mit Google anmelden</Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerLabel}>oder</Text>
            <View style={styles.divider} />
          </View>

          {/* E-Mail */}
          <Pressable
            onPress={() => {
              handleClose();
              router.push("/auth/login");
            }}
            style={({ pressed }) => [styles.btn, styles.btnEmail, pressed && { opacity: 0.95 }]}
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.btnText}>Mit E-Mail fortfahren</Text>
          </Pressable>

          {/* Close */}
          <Pressable onPress={handleClose} style={styles.close}>
            <Ionicons name="close" size={22} color="#B8BBC3" />
          </Pressable>
        </BlurView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: "rgba(0,0,0,0.45)" },
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: height * 0.7,
  },
  sheetBlur: {
    borderRadius: 22,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  grabber: {
    alignSelf: "center",
    width: 44, height: 5, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 12,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: 0.3, textAlign: "center" },
  subtitle: { color: "#A6A8AD", fontSize: 14, marginTop: 6, textAlign: "center" },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 12,
    borderWidth: 1,
  },
  btnApple: { backgroundColor: "#111", borderColor: "#222" },
  btnGoogle: { backgroundColor: "#fff", borderColor: "#E5E7EB" },
  btnEmail: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.16)" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  divider: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  dividerLabel: { color: "#8E9198", fontSize: 12, fontWeight: "600" },

  close: { alignSelf: "center", marginTop: 10, padding: 8, opacity: 0.9 },
});
