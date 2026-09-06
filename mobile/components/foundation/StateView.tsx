import { ActivityIndicator, StyleSheet, View } from "react-native";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText } from "./AppText";
import { Button } from "./Button";

type Props = { kind: "loading" | "empty" | "error" | "offline" | "permission" | "exhausted"; title: string; message?: string; actionLabel?: string; onAction?: () => void; appearance?: "dark" | "light" };

export function StateView({ kind, title, message, actionLabel, onAction, appearance = "dark" }: Props) {
  const light = appearance === "light";
  return <View accessibilityRole={kind === "error" ? "alert" : undefined} style={[styles.root, light && styles.rootLight]}>{kind === "loading" ? <ActivityIndicator color={theme.color.pink} /> : null}<AppText role="sectionTitle" style={[styles.title, light && styles.titleLight]}>{title}</AppText>{message ? <AppText style={[styles.message, light && styles.messageLight]}>{message}</AppText> : null}{actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}</View>;
}

const styles = StyleSheet.create({ root: { alignItems: "flex-start", padding: theme.spacing.xxl, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface }, rootLight: { borderColor: theme.color.borderLight, backgroundColor: theme.color.surfaceLightElevated }, title: { marginTop: theme.spacing.md }, titleLight: { color: theme.color.textPrimaryLight }, message: { marginTop: theme.spacing.xs, color: theme.color.textSecondary }, messageLight: { color: theme.color.textSecondaryLight }, action: { alignSelf: "stretch", marginTop: theme.spacing.xl } });
