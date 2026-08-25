import React from "react";
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText } from "./AppText";

type ChipKind = "input" | "selected" | "information" | "status";
type Props = { label: string; kind?: ChipKind; selected?: boolean; onPress?: PressableProps["onPress"]; style?: StyleProp<ViewStyle> };

export function Chip({ label, kind = "information", selected = false, onPress, style }: Props) {
  const active = selected || kind === "selected";
  const content = <AppText role="caption" tone={active ? "primary" : "secondary"}>{label}</AppText>;
  const base = [styles.root, active && styles.selected, kind === "status" && styles.status, style];
  if (!onPress) return <View style={base}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [...base, pressed && styles.pressed]}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  root: { minHeight: theme.control.compact, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.pill, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: theme.color.border },
  selected: { backgroundColor: theme.color.pink, borderColor: theme.color.pink },
  status: { borderColor: "rgba(200,227,166,0.34)" },
  pressed: { opacity: 0.8 },
});
