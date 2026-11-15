import { Pressable, type PressableProps, StyleSheet, type StyleProp, View, type ViewStyle } from "react-native";

import { backyrdTheme as theme, useBackyrdTheme } from "../../theme/backyrd";
import { AppText } from "./AppText";

type Kind = "input" | "selected" | "information" | "status";
type Props = { label: string; kind?: Kind; selected?: boolean; onPress?: PressableProps["onPress"]; style?: StyleProp<ViewStyle> };

export function Chip({ label, kind = "information", selected = false, onPress, style }: Props) {
  const { color } = useBackyrdTheme();
  const active = selected || kind === "selected";
  const contents = <AppText role="caption" tone="secondary" style={active ? { color: color.onAccent } : undefined}>{label}</AppText>;
  const base = [styles.root, { backgroundColor: color.surfaceElevated, borderColor: color.border }, active && { backgroundColor: color.pink, borderColor: color.pink }, kind === "status" && styles.status, style];
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [...base, pressed && styles.pressed]}>{contents}</Pressable> : <View style={base}>{contents}</View>;
}

const styles = StyleSheet.create({ root: { minHeight: theme.control.compact, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xs, flexShrink: 1, borderRadius: theme.radius.pill, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: theme.color.border }, selected: { backgroundColor: theme.color.pink, borderColor: theme.color.pink }, status: { borderColor: "rgba(200,227,166,0.34)" }, pressed: { opacity: 0.8 } });
