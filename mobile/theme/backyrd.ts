export const backyrdTheme = {
  color: {
    background: "#050505",
    backgroundLight: "#ECECEA",
    surface: "#101010",
    surfaceElevated: "#171719",
    surfaceLight: "#F5F3EE",
    surfaceLightElevated: "#FFFFFF",
    textPrimary: "#F6F0E8",
    textPrimaryLight: "#17161A",
    textSecondary: "#9B9B9F",
    textSecondaryLight: "#827D77",
    textMuted: "#747478",
    pink: "#FF4F91",
    blue: "#A9C2FF",
    openGreen: "#9AE67A",
    /** @deprecated New Phase-1 surfaces use `blue` for context. */
    lime: "#9AE67A",
    /** @deprecated Prefer `openGreen` for status or `blue` for context. */
    acid: "#9AE67A",
    border: "rgba(246,240,232,0.14)",
    borderStrong: "rgba(246,240,232,0.30)",
    borderLight: "rgba(23,22,26,0.14)",
    success: "#9AE67A",
    warning: "#F7C65C",
    danger: "#FF6868",
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, display: 48 },
  radius: { sm: 10, md: 16, lg: 24, xl: 30, pill: 999 },
  control: { compact: 44, standard: 52, tabBar: 80, tabBarVisual: 64 },
  border: { hairline: 1, standard: 1 },
  motion: { image: 180, pressScale: 0.98 },
  type: {
    display: "DMSerifDisplay_400Regular",
    body: "LibreFranklin_400Regular",
    bodyMedium: "LibreFranklin_600SemiBold",
    bodyBold: "LibreFranklin_700Bold",
  },
} as const;

export type BackyrdTheme = typeof backyrdTheme;
