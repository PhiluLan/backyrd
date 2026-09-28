import { forwardRef } from "react";
import { type StyleProp, type TextInputProps, type TextProps, type TextStyle, StyleSheet, Text, TextInput, useWindowDimensions } from "react-native";

import { backyrdTheme as theme } from "../../theme/backyrd";

export type TextRole = "displayXL" | "displayL" | "displayM" | "screenTitle" | "sectionTitle" | "cardTitle" | "body" | "bodyStrong" | "meta" | "label" | "caption";

type Props = Omit<TextProps, "style" | "role"> & { role?: TextRole; tone?: "primary" | "secondary" | "muted" | "pink" | "lime" | "error"; style?: StyleProp<TextStyle> };

const roles: Record<TextRole, TextStyle> = {
  displayXL: { fontFamily: theme.type.display, ...theme.typeScale.displayXL },
  displayL: { fontFamily: theme.type.display, ...theme.typeScale.displayL },
  displayM: { fontFamily: theme.type.display, ...theme.typeScale.displayM },
  screenTitle: { fontFamily: theme.type.bodyBold, ...theme.typeScale.screenTitle },
  sectionTitle: { fontFamily: theme.type.bodyBold, ...theme.typeScale.sectionTitle },
  cardTitle: { fontFamily: theme.type.bodyBold, ...theme.typeScale.cardTitle },
  body: { fontFamily: theme.type.body, ...theme.typeScale.body },
  bodyStrong: { fontFamily: theme.type.bodyMedium, ...theme.typeScale.body },
  meta: { fontFamily: theme.type.bodyMedium, ...theme.typeScale.meta },
  label: { fontFamily: theme.type.bodyBold, ...theme.typeScale.label },
  caption: { fontFamily: theme.type.bodyMedium, ...theme.typeScale.caption },
};

const maximumScale: Record<TextRole, number> = { displayXL: 1.1, displayL: 1.12, displayM: 1.15, screenTitle: 1.2, sectionTitle: 1.25, cardTitle: 1.25, body: 1.4, bodyStrong: 1.35, meta: 1.35, label: 1.3, caption: 1.3 };
const tones = { primary: theme.color.textPrimary, secondary: theme.color.textSecondary, muted: theme.color.textMuted, pink: theme.color.pink, lime: theme.color.lime, error: theme.color.danger } as const;

function responsiveDisplay(role: TextRole, width: number): TextStyle | undefined {
  if (!role.startsWith("display")) return undefined;
  const base = roles[role];
  const factor = Math.max(0.86, Math.min(1, width / 390));
  return { fontSize: Math.round((base.fontSize as number) * factor), lineHeight: Math.round((base.lineHeight as number) * factor) };
}

function uiFont(style: StyleProp<TextStyle>, fallback: string) {
  const flattened = StyleSheet.flatten(style);
  if (fallback === theme.type.display || flattened?.fontFamily === theme.type.display) return theme.type.display;
  if (flattened?.fontFamily === theme.type.bodyBold || flattened?.fontFamily === theme.type.bodyMedium) return flattened.fontFamily;
  const weight = Number.parseInt(String(flattened?.fontWeight ?? "400"), 10);
  return weight >= 700 ? theme.type.bodyBold : weight >= 600 ? theme.type.bodyMedium : fallback;
}

/** Canonical Libre Franklin UI typography with deliberately scarce DM Serif display roles. */
export function AppText({ role = "body", tone = "primary", maxFontSizeMultiplier, style, ...props }: Props) {
  const { width } = useWindowDimensions();
  return <Text {...props} maxFontSizeMultiplier={maxFontSizeMultiplier ?? maximumScale[role]} style={[{ color: tones[tone] }, roles[role], responsiveDisplay(role, width), style, { fontFamily: uiFont(style, roles[role].fontFamily as string), fontWeight: "normal" }]} />;
}

/** For legacy layouts: keeps their sizing while replacing mixed system/Inter fonts with Home's UI family. */
export function ProductText({ style, maxFontSizeMultiplier, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style);
  return <Text {...props} maxFontSizeMultiplier={maxFontSizeMultiplier ?? 1.4} style={[{ color: theme.color.textPrimary, fontFamily: theme.type.body, ...theme.typeScale.body, lineHeight: flattened?.fontSize ? undefined : theme.typeScale.body.lineHeight }, style, { fontFamily: uiFont(style, theme.type.body), fontWeight: "normal" }]} />;
}

/** Native input behavior and refs remain intact; only the UI font is normalized. */
export const ProductTextInput = forwardRef<TextInput, TextInputProps>(function ProductTextInput({ style, ...props }, ref) {
  return <TextInput ref={ref} {...props} style={[style, { fontFamily: theme.type.body }]} />;
});
