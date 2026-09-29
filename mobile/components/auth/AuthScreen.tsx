import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText, ProductTextInput } from "../foundation/AppText";

export function AuthScreen({ eyebrow, title, description, children, backTo = "/gate" }: { eyebrow: string; title: string; description: string; children: ReactNode; backTo?: "/gate" | "/auth/login" }) {
  const router = useRouter();

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
      <LinearGradient colors={["#050505", "#050505", "#160B12"]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable accessibilityLabel="Zurück" accessibilityRole="button" hitSlop={8} onPress={() => router.replace(backTo as never)} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Ionicons color={theme.color.textPrimary} name="arrow-back" size={23} />
          </Pressable>
          <View style={styles.hero}>
            <View style={styles.accentLine} />
            <AppText role="label" tone="pink" style={styles.eyebrow}>{eyebrow}</AppText>
            <AppText role="displayM" style={styles.title}>{title}</AppText>
            <AppText role="body" tone="secondary" style={styles.description}>{description}</AppText>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <AppText role="label" tone="secondary" style={styles.fieldLabel}>{label}</AppText>
      <ProductTextInput {...props} accessibilityLabel={label} maxFontSizeMultiplier={1.3} placeholderTextColor={theme.color.textMuted} style={styles.input} />
    </View>
  );
}

export function AuthSubmit({ label, loading, disabled, onPress }: { label: string; loading: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ busy: loading, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.submit, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      {loading ? <ActivityIndicator color={theme.color.background} /> : <AppText role="bodyStrong" style={styles.submitText}>{label}</AppText>}
    </Pressable>
  );
}

export function AuthDivider() {
  return <View style={styles.dividerRow}><View style={styles.divider} /><AppText role="caption" tone="muted">ODER</AppText><View style={styles.divider} /></View>;
}

export function AuthProviderButton({ provider, label, disabled, onPress }: { provider: "apple" | "google"; label: string; disabled: boolean; onPress: () => void }) {
  const isGoogle = provider === "google";
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.providerButton, isGoogle ? styles.googleButton : styles.appleButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Ionicons color={isGoogle ? theme.color.background : theme.color.textPrimary} name={isGoogle ? "logo-google" : "logo-apple"} size={20} />
      <AppText role="bodyStrong" style={isGoogle ? styles.googleText : undefined}>{label}</AppText>
    </Pressable>
  );
}

export const authStyles = StyleSheet.create({
  error: {
    borderLeftWidth: 3,
    borderColor: theme.color.danger,
    backgroundColor: "rgba(255,104,104,0.10)",
    color: theme.color.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  form: { gap: 4 },
  providerGroup: { gap: 10 },
  footer: { marginTop: 28, gap: 10, alignItems: "center" },
  footerLink: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  notice: { borderLeftWidth: 3, borderColor: theme.color.pink, backgroundColor: "rgba(255,79,145,0.09)", paddingHorizontal: 18, paddingVertical: 17, marginBottom: 20, gap: 7 },
  secondaryAction: { minHeight: 54, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 16 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: theme.layout.pageGutter, paddingTop: 18, paddingBottom: 32 },
  back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center" },
  hero: { marginTop: 36, marginBottom: 30 },
  accentLine: { width: 34, height: 4, borderRadius: 2, backgroundColor: theme.color.pink, marginBottom: 20 },
  eyebrow: { letterSpacing: 2, marginBottom: 12 },
  title: { maxWidth: 400 },
  description: { marginTop: 12, maxWidth: 365 },
  field: { marginBottom: 12 },
  fieldLabel: { marginBottom: 8 },
  input: { minHeight: 54, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceElevated, color: theme.color.textPrimary, fontSize: 16, paddingHorizontal: 16, paddingVertical: 14 },
  submit: { minHeight: 56, borderRadius: theme.radius.pill, backgroundColor: theme.color.pink, alignItems: "center", justifyContent: "center", marginTop: 12 },
  submitText: { color: theme.color.background },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 16, marginVertical: 26 },
  divider: { flex: 1, height: 1, backgroundColor: theme.color.border },
  providerButton: { minHeight: 54, borderRadius: theme.radius.pill, flexDirection: "row", gap: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  appleButton: { backgroundColor: theme.color.surfaceElevated, borderWidth: 1, borderColor: theme.color.border },
  googleButton: { backgroundColor: theme.color.textPrimary },
  googleText: { color: theme.color.background },
  pressed: { opacity: 0.82, transform: [{ scale: theme.motion.pressScale }] },
  disabled: { opacity: 0.5 },
});
