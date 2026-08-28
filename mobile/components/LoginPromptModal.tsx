import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { backyrdTheme as theme } from "../theme/backyrd";
import { AppText } from "./foundation/AppText";
import { Button, IconButton } from "./foundation/Button";

export default function LoginPromptModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const continueTo = (route: "/auth/login" | "/auth/register") => {
    onClose();
    router.push(route);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Anmeldung schließen" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <BlurView intensity={46} tint="dark" style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.copy}>
              <AppText role="caption" tone="lime" style={styles.kicker}>DEIN BACKYRD</AppText>
              <AppText role="sectionTitle">Kurz anmelden</AppText>
            </View>
            <IconButton accessibilityLabel="Schließen" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={22} color={theme.color.textPrimary} />
            </IconButton>
          </View>
          <AppText tone="secondary" style={styles.message}>Melde dich an oder erstelle ein Konto, um ein Review zu schreiben.</AppText>
          <View style={styles.actions}>
            <Button label="Anmelden" onPress={() => continueTo("/auth/login")} />
            <Button label="Konto erstellen" variant="secondary" onPress={() => continueTo("/auth/register")} />
            <Button label="Nicht jetzt" variant="tertiary" onPress={onClose} />
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.56)" },
  sheet: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxl, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: theme.color.border, backgroundColor: "rgba(17,17,19,0.96)", overflow: "hidden" },
  handle: { alignSelf: "center", width: 42, height: 5, marginBottom: theme.spacing.lg, borderRadius: theme.radius.pill, backgroundColor: theme.color.borderStrong },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  copy: { flex: 1, gap: theme.spacing.xxs },
  kicker: { letterSpacing: 1.8 },
  close: { backgroundColor: theme.color.surfaceElevated },
  message: { marginTop: theme.spacing.md, maxWidth: 420 },
  actions: { marginTop: theme.spacing.xl, gap: theme.spacing.sm },
});
