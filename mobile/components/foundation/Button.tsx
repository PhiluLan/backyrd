import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { backyrdTheme as theme, useBackyrdTheme } from "../../theme/backyrd";
import { AppText } from "./AppText";

type Variant = "primary" | "secondary" | "tertiary" | "destructive";
type ButtonProps = Omit<PressableProps, "children" | "style"> & { label: string; variant?: Variant; loading?: boolean; labelTone?: "primary" | "lime" | "pink" | "error"; style?: StyleProp<ViewStyle> };

export function Button({ label, variant = "primary", loading = false, disabled, accessibilityLabel, accessibilityState, labelTone, style, ...props }: ButtonProps) {
  const { color: palette } = useBackyrdTheme();
  const variants: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: palette.pink },
    secondary: { backgroundColor: palette.surfaceElevated, borderColor: palette.border, borderWidth: 1 },
    tertiary: { backgroundColor: "transparent", borderColor: palette.borderStrong, borderWidth: 1 },
    destructive: { backgroundColor: "rgba(255,104,104,0.14)", borderColor: "rgba(255,104,104,0.36)", borderWidth: 1 },
  };
  const inactive = disabled || loading;
  const defaultColor = variant === "primary" ? palette.onAccent : variant === "destructive" ? palette.danger : palette.textPrimary;
  const color = labelTone === "lime" ? palette.lime : labelTone === "pink" ? palette.pink : labelTone === "error" ? palette.danger : defaultColor;
  return <Pressable {...props} accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" accessibilityState={{ ...accessibilityState, disabled: Boolean(inactive), busy: loading }} disabled={inactive} style={({ pressed }) => [styles.root, variants[variant], inactive && styles.disabled, pressed && !inactive && styles.pressed, style]}>{loading ? <ActivityIndicator color={color} /> : <AppText role="meta" style={{ color, textAlign: "center", flexShrink: 1 }}>{label}</AppText>}</Pressable>;
}

export function IconButton({ accessibilityLabel, accessibilityState, disabled, hitSlop = 6, style, children, ...props }: Omit<PressableProps, "style"> & { accessibilityLabel: string; style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }} disabled={disabled} hitSlop={hitSlop} style={({ pressed }) => [styles.icon, disabled && styles.disabled, pressed && !disabled && styles.pressed, style]}>{children}</Pressable>;
}

const styles = StyleSheet.create({ root: { minHeight: theme.control.standard, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, minWidth: 0, alignItems: "center", justifyContent: "center" }, icon: { minWidth: theme.control.compact, minHeight: theme.control.compact, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.82, transform: [{ scale: theme.motion.pressScale }] }, disabled: { opacity: 0.5 } });
