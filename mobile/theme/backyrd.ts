import { Platform } from "react-native";

export const backyrdTheme = {
  color: {
    background: "#050506",
    surface: "#111113",
    surfaceElevated: "#19191C",
    textPrimary: "#F7F3E9",
    textSecondary: "#A8A5A0",
    textMuted: "#76747A",
    pink: "#FF4F91",
    lime: "#D8FF3E",
    /** @deprecated Prefer `lime` for new code. */
    acid: "#D8FF3E",
    border: "rgba(247,243,233,0.15)",
    borderStrong: "rgba(247,243,233,0.34)",
    success: "#65D88A",
    warning: "#F7C65C",
    danger: "#FF6868",
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, display: 48 },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  control: { compact: 44, standard: 52, tabBar: 82 },
  border: { hairline: 1, standard: 1 },
  motion: { image: 180, pressScale: 0.98 },
  type: {
    display: Platform.select({
      ios: "Avenir Next Condensed",
      android: "sans-serif-condensed",
      default: "Arial Narrow",
    }),
    body: "Inter_400Regular",
    bodyMedium: "Inter_600SemiBold",
    bodyBold: "Inter_700Bold",
  },
} as const;

export type BackyrdTheme = typeof backyrdTheme;
