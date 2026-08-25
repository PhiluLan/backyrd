import { type StyleProp, type TextProps, type TextStyle, Text, useWindowDimensions } from "react-native";

import { backyrdTheme as theme } from "../../theme/backyrd";

export type TextRole = "displayXL" | "displayL" | "displayM" | "screenTitle" | "sectionTitle" | "cardTitle" | "body" | "bodyStrong" | "meta" | "label" | "caption";

type Props = Omit<TextProps, "style" | "role"> & { role?: TextRole; tone?: "primary" | "secondary" | "muted" | "pink" | "lime" | "error"; style?: StyleProp<TextStyle> };

const roles: Record<TextRole, TextStyle> = {
  // Deliberately generous line heights: the condensed display face has tight glyph metrics on iOS.
  displayXL: { fontFamily: theme.type.display, fontWeight: "900", fontSize: 58, lineHeight: 64, letterSpacing: -1.2 },
  displayL: { fontFamily: theme.type.display, fontWeight: "900", fontSize: 46, lineHeight: 52, letterSpacing: -0.9 },
  displayM: { fontFamily: theme.type.display, fontWeight: "900", fontSize: 38, lineHeight: 44, letterSpacing: -0.6 },
  screenTitle: { fontFamily: theme.type.bodyBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.45 },
  sectionTitle: { fontFamily: theme.type.bodyBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  cardTitle: { fontFamily: theme.type.bodyBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.25 },
  body: { fontFamily: theme.type.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: theme.type.bodyMedium, fontSize: 16, lineHeight: 23 },
  meta: { fontFamily: theme.type.bodyMedium, fontSize: 14, lineHeight: 19 },
  label: { fontFamily: theme.type.bodyBold, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  caption: { fontFamily: theme.type.bodyMedium, fontSize: 12, lineHeight: 17 },
};

const maximumScale: Record<TextRole, number> = { displayXL: 1.1, displayL: 1.12, displayM: 1.15, screenTitle: 1.2, sectionTitle: 1.25, cardTitle: 1.25, body: 1.4, bodyStrong: 1.35, meta: 1.35, label: 1.3, caption: 1.3 };
const tones = { primary: theme.color.textPrimary, secondary: theme.color.textSecondary, muted: theme.color.textMuted, pink: theme.color.pink, lime: theme.color.lime, error: theme.color.danger } as const;

function responsiveDisplay(role: TextRole, width: number): TextStyle | undefined {
  if (!role.startsWith("display")) return undefined;
  const base = roles[role];
  const factor = Math.max(0.86, Math.min(1, width / 390));
  return { fontSize: Math.round((base.fontSize as number) * factor), lineHeight: Math.round((base.lineHeight as number) * factor) };
}

/** Typography primitive with metric-safe display roles and bounded Dynamic Type. */
export function AppText({ role = "body", tone = "primary", maxFontSizeMultiplier, style, ...props }: Props) {
  const { width } = useWindowDimensions();
  return <Text {...props} maxFontSizeMultiplier={maxFontSizeMultiplier ?? maximumScale[role]} style={[{ color: tones[tone] }, roles[role], responsiveDisplay(role, width), style]} />;
}
