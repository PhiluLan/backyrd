import { Platform } from "react-native";

/**
 * The single active visual foundation for the consumer mobile product.
 * Keep values semantic here; screens should not need to know brand hex values.
 */
export const backyrdTheme = {
  color: {
    background: "#050506",
    surface: "#111113",
    surfaceElevated: "#19191C",
    surfaceEditorial: "#0B0B0D",
    textPrimary: "#F7F3E9",
    textSecondary: "#B8B4AC",
    textMuted: "#817E78",
    border: "rgba(247,243,233,0.14)",
    borderStrong: "rgba(247,243,233,0.24)",
    pink: "#FF7DA7",
    lime: "#C8E3A6",
    error: "#FF6868",
    warning: "#F7C65C",
    success: "#65D88A",
    disabled: "rgba(247,243,233,0.30)",
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40, hero: 48 },
  radius: { sm: 12, md: 18, lg: 24, xl: 32, pill: 999 },
  border: { hairline: 1 },
  control: { compact: 44, standard: 52, prominent: 56, tabBar: 78 },
  icon: { sm: 16, md: 20, lg: 24, xl: 30 },
  elevation: { tabBar: 10, floating: 20 },
  motion: { fast: 160, standard: 220, image: 180 },
  type: {
    // Inter names below exactly match the families loaded in app/_layout.tsx.
    body: "Inter_400Regular",
    bodyMedium: "Inter_600SemiBold",
    bodyBold: "Inter_700Bold",
    // Native families are intentionally used for the editorial display voice.
    display: Platform.select({
      ios: "Avenir Next Condensed",
      android: "sans-serif-condensed",
      default: "Arial Narrow",
    }),
  },
} as const;

export type BackyrdTheme = typeof backyrdTheme;
