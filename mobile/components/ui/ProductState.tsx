import React, { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";
import { AppText } from "../foundation/AppText";
import { StateView } from "../foundation/StateView";
import { SafeAreaView } from "react-native-safe-area-context";

import { backyrdTheme as theme } from "../../theme/backyrd";

type StateProps = {
  eyebrow?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ProductState({ eyebrow, title, message, actionLabel, onAction }: StateProps) {
  return <SafeAreaView style={styles.root}>
    {eyebrow ? <AppText role="caption" tone="pink" style={{ marginBottom: theme.spacing.sm }}>{eyebrow}</AppText> : null}
    <StateView kind="empty" title={title} message={message} actionLabel={actionLabel} onAction={onAction} />
  </SafeAreaView>;
}

export function ProductLoading({ label = "Backyrd startet" }: { label?: string }) {
  return <SafeAreaView style={styles.root}><StateView kind="loading" title={label} /></SafeAreaView>;
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
});
