import { type PropsWithChildren, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "./AppText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { backyrdTheme as theme, useBackyrdTheme } from "../../theme/backyrd";

type Props = PropsWithChildren<{ scroll?: boolean; keyboardSafe?: boolean; bottomTab?: boolean; padded?: boolean }>;

/** Shared safe-area and floating-tab clearance. Screens never guess the bottom inset. */
export function Screen({ children, scroll = false, keyboardSafe = false, bottomTab = false, padded = true }: Props) {
  const insets = useSafeAreaInsets();
  const { color } = useBackyrdTheme();
  const content = scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, padded && styles.padded, { paddingBottom: (bottomTab ? theme.control.tabBar + theme.spacing.xxl : theme.spacing.xxl) + insets.bottom }]}>{children}</ScrollView> : <View style={[styles.fill, padded && styles.padded]}>{children}</View>;
  const body = <SafeAreaView edges={["top", "left", "right"]} style={[styles.root, { backgroundColor: color.background }]}>{content}</SafeAreaView>;
  return keyboardSafe ? <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>{body}</KeyboardAvoidingView> : body;
}

const styles = StyleSheet.create({ root: { flex: 1 }, fill: { flex: 1 }, scroll: { flexGrow: 1 }, padded: { paddingHorizontal: theme.layout.pageGutter } });

/** Shared account/utility hierarchy; long headings use the full content width. */
export function ScreenHeader({ title, eyebrow, subtitle, onBack, backLabel = "Zurück", action, inset = true }: {
  title: string; eyebrow?: string; subtitle?: string; onBack: () => void;
  backLabel?: string; action?: ReactNode; inset?: boolean;
}) {
  const color = theme.color;
  return <View style={[headerStyles.root, inset && headerStyles.inset]}>
    <View style={headerStyles.navigation}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={({ pressed }) => [headerStyles.back, { backgroundColor: color.surface }, pressed && { opacity: .65 }]}>
        <Ionicons accessibilityElementsHidden name="chevron-back" size={22} color={color.textPrimary} />
      </Pressable>
      {eyebrow ? <AppText role="caption" tone="secondary" style={headerStyles.eyebrow}>{eyebrow}</AppText> : <View style={headerStyles.flex} />}
      {action}
    </View>
    <AppText role="screenTitle" accessibilityRole="header" style={headerStyles.title}>{title}</AppText>
    {subtitle ? <AppText role="body" tone="secondary" style={headerStyles.subtitle}>{subtitle}</AppText> : null}
  </View>;
}
const headerStyles = StyleSheet.create({
  root: { paddingTop: 8, paddingBottom: 24, gap: 8 }, inset: { paddingHorizontal: theme.layout.pageGutter },
  navigation: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 }, eyebrow: { flex: 1, color: theme.color.textSecondary, fontSize: 13, lineHeight: 19 },
  title: { color: theme.color.textPrimary, fontSize: 28, lineHeight: 34, letterSpacing: -.7 }, subtitle: { color: theme.color.textSecondary, lineHeight: 24 },
});
