import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText } from "./AppText";

type Variant = "primary" | "secondary" | "tertiary" | "destructive";
type Props = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const variants: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: theme.color.pink },
  secondary: { backgroundColor: theme.color.surfaceElevated, borderWidth: 1, borderColor: theme.color.border },
  tertiary: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.color.borderStrong },
  destructive: { backgroundColor: "rgba(255,104,104,0.14)", borderWidth: 1, borderColor: "rgba(255,104,104,0.36)" },
};

export function Button({ label, variant = "primary", loading = false, disabled, style, accessibilityLabel, ...props }: Props) {
  const inactive = disabled || loading;
  const textTone = variant === "primary" ? "#171214" : variant === "destructive" ? theme.color.error : theme.color.textPrimary;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [styles.root, variants[variant], inactive && styles.disabled, pressed && !inactive && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={textTone} /> : <AppText role="label" style={{ color: textTone }}>{label}</AppText>}
    </Pressable>
  );
}

export function IconButton({ accessibilityLabel, style, children, ...props }: Omit<PressableProps, "style"> & { accessibilityLabel: string; style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={6} style={({ pressed }) => [styles.icon, pressed && styles.pressed, style]}>{children}</Pressable>;
}

const styles = StyleSheet.create({
  root: { minHeight: theme.control.standard, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.xxl, alignItems: "center", justifyContent: "center" },
  icon: { minWidth: theme.control.compact, minHeight: theme.control.compact, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});
