import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";

const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#131316",
    text: "#FFFFFF",
    textMuted: "#A6A8AD",
    primary: "#0EA5E9",
    accent: "#A78BFA",
  },
  radius: { xl: 24, pill: 999 },
  spacing: (n: number) => n * 8,
};

export default function LoginPromptModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <BlurView intensity={40} tint="dark" style={styles.box}>
          <Text style={styles.title}>Login erforderlich</Text>
          <Text style={styles.text}>
            Bitte melde dich an oder registriere dich, um ein Review zu schreiben.
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.btn, { backgroundColor: "rgba(255,255,255,0.08)" }]}
            >
              <Text style={styles.btnText}>Abbrechen</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                onClose();
                router.push("/login");
              }}
              style={[styles.btn, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={[styles.btnText, { color: "#000" }]}>Sign-in</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                onClose();
                router.push("/register");
              }}
              style={[styles.btn, { backgroundColor: theme.colors.accent }]}
            >
              <Text style={[styles.btnText, { color: "#000" }]}>Sign-up</Text>
            </Pressable>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  box: {
    width: "80%",
    borderRadius: theme.radius.xl,
    padding: theme.spacing(3),
    backgroundColor: "rgba(20,20,25,0.9)",
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  text: {
    color: theme.colors.textMuted,
    fontSize: 15,
    marginBottom: 16,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
