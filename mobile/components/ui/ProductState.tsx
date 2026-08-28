import React, { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { backyrdTheme as theme } from "../../theme/backyrd";

type StateProps = {
  eyebrow?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ProductState({ eyebrow = "BACKYRD", title, message, actionLabel, onAction }: StateProps) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.marker} />
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

export function ProductLoading({ label = "Backyrd startet" }: { label?: string }) {
  return (
    <SafeAreaView style={styles.root}>
      <ActivityIndicator color={theme.color.pink} size="small" />
      <Text style={styles.loading}>{label}</Text>
    </SafeAreaView>
  );
}

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.screen}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.color.background,
  },
  screen: { flex: 1, backgroundColor: theme.color.background },
  marker: { width: 76, height: 7, backgroundColor: theme.color.pink, marginBottom: 20, transform: [{ rotate: "-2deg" }] },
  eyebrow: { color: theme.color.acid, fontFamily: theme.type.bodyBold, fontSize: 12, letterSpacing: 3.4 },
  title: { marginTop: 12, color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 46, lineHeight: 47, textTransform: "uppercase" },
  message: { marginTop: 18, maxWidth: 420, color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 16, lineHeight: 24 },
  action: { marginTop: 28, minHeight: 54, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 22, backgroundColor: theme.color.pink },
  actionText: { color: theme.color.background, fontFamily: theme.type.bodyBold, fontSize: 15 },
  loading: { marginTop: 14, color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 14 },
});
