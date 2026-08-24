import { Platform } from "react-native";

export const backyrdTheme = {
  color: {
    background: "#050506",
    surface: "#111113",
    surfaceElevated: "#19191C",
    textPrimary: "#F7F3E9",
    textSecondary: "#A8A5A0",
    pink: "#FF4F91",
    acid: "#D8FF3E",
    border: "rgba(247,243,233,0.15)",
    success: "#65D88A",
    warning: "#F7C65C",
    danger: "#FF6868",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
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
