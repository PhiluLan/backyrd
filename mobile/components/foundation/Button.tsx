import { ActivityIndicator, Pressable, type PressableProps, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText } from "./AppText";

type Variant = "primary" | "secondary" | "tertiary" | "destructive";
type ButtonProps = Omit<PressableProps, "children" | "style"> & { label: string; variant?: Variant; loading?: boolean; labelTone?: "primary" | "lime" | "pink" | "error"; style?: StyleProp<ViewStyle> };

const variants: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: theme.color.pink },
  secondary: { backgroundColor: theme.color.surfaceElevated, borderColor: theme.color.border, borderWidth: 1 },
  tertiary: { backgroundColor: "transparent", borderColor: theme.color.borderStrong, borderWidth: 1 },
  destructive: { backgroundColor: "rgba(255,104,104,0.14)", borderColor: "rgba(255,104,104,0.36)", borderWidth: 1 },
};

export function Button({ label, variant = "primary", loading = false, disabled, accessibilityLabel, labelTone, style, ...props }: ButtonProps) {
  const inactive = disabled || loading;
  const defaultColor = variant === "primary" ? theme.color.background : variant === "destructive" ? theme.color.danger : theme.color.textPrimary;
  const color = labelTone === "lime" ? theme.color.lime : labelTone === "pink" ? theme.color.pink : labelTone === "error" ? theme.color.danger : defaultColor;
  return <Pressable {...props} accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" accessibilityState={{ disabled: inactive, busy: loading }} disabled={inactive} style={({ pressed }) => [styles.root, variants[variant], inactive && styles.disabled, pressed && !inactive && styles.pressed, style]}>{loading ? <ActivityIndicator color={color} /> : <AppText role="label" style={{ color }}>{label}</AppText>}</Pressable>;
}

export function IconButton({ accessibilityLabel, style, children, ...props }: Omit<PressableProps, "style"> & { accessibilityLabel: string; style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} accessibilityLabel={accessibilityLabel} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.icon, pressed && styles.pressed, style]}>{children}</Pressable>;
}

const styles = StyleSheet.create({ root: { minHeight: theme.control.standard, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.xxl, alignItems: "center", justifyContent: "center" }, icon: { minWidth: theme.control.compact, minHeight: theme.control.compact, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.82, transform: [{ scale: theme.motion.pressScale }] }, disabled: { opacity: 0.5 } });
