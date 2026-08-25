import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText } from "./AppText";
import { Button } from "./Button";

type Props = { kind: "loading" | "empty" | "error" | "offline" | "permission" | "exhausted"; title: string; message?: string; actionLabel?: string; onAction?: () => void };

export function StateView({ kind, title, message, actionLabel, onAction }: Props) {
  return <View accessibilityRole={kind === "error" ? "alert" : undefined} style={styles.root}>
    {kind === "loading" ? <ActivityIndicator color={theme.color.pink} /> : null}
    <AppText role="sectionTitle" style={styles.title}>{title}</AppText>
    {message ? <AppText tone="secondary" style={styles.message}>{message}</AppText> : null}
    {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}
  </View>;
}

const styles = StyleSheet.create({ root: { alignItems: "flex-start", padding: theme.spacing.xxl, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface }, title: { marginTop: theme.spacing.md }, message: { marginTop: theme.spacing.sm }, action: { marginTop: theme.spacing.xl, alignSelf: "stretch" } });
