import { type PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { backyrdTheme as theme } from "../../theme/backyrd";

type Props = PropsWithChildren<{ scroll?: boolean; keyboardSafe?: boolean; bottomTab?: boolean; padded?: boolean }>;

/** Shared safe-area and floating-tab clearance. Screens never guess the bottom inset. */
export function Screen({ children, scroll = false, keyboardSafe = false, bottomTab = false, padded = true }: Props) {
  const insets = useSafeAreaInsets();
  const content = scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, padded && styles.padded, { paddingBottom: (bottomTab ? theme.control.tabBar + theme.spacing.xxl : theme.spacing.xxl) + insets.bottom }]}>{children}</ScrollView> : <View style={[styles.fill, padded && styles.padded]}>{children}</View>;
  const body = <SafeAreaView edges={["top", "left", "right"]} style={styles.root}>{content}</SafeAreaView>;
  return keyboardSafe ? <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>{body}</KeyboardAvoidingView> : body;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: theme.color.background }, fill: { flex: 1 }, scroll: { flexGrow: 1 }, padded: { paddingHorizontal: theme.spacing.xxl } });
