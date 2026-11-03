import { DynamicColorIOS, Platform, PlatformColor, useColorScheme } from "react-native";
import appearanceColors from "./appearance-colors.json";

type AppearanceColorName = keyof typeof appearanceColors.dark;

/** Native dynamic colors keep module-level StyleSheets in sync with the OS appearance. */
function appearanceColor(name: AppearanceColorName): string {
  if (Platform.OS === "ios") {
    return DynamicColorIOS({ light: appearanceColors.light[name], dark: appearanceColors.dark[name] }) as unknown as string;
  }
  if (Platform.OS === "android") {
    const resourceName = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return PlatformColor(`@color/backyrd_${resourceName}`) as unknown as string;
  }
  return appearanceColors.dark[name];
}

// Native SF Pro is available for the Home presentation on iOS.
export const useSFPro = Platform.OS === "ios";

export const backyrdTheme = {
  color: {
    background: appearanceColor("background"),
    backgroundLight: "#ECECEA",
    surface: appearanceColor("surface"),
    surfaceElevated: appearanceColor("surfaceElevated"),
    surfaceLight: "#F5F3EE",
    surfaceLightElevated: "#FFFFFF",
    textPrimary: appearanceColor("textPrimary"),
    textPrimaryLight: "#17161A",
    textSecondary: appearanceColor("textSecondary"),
    textSecondaryLight: "#827D77",
    textMuted: appearanceColor("textMuted"),
    pink: appearanceColor("pink"),
    blue: appearanceColor("blue"),
    openGreen: appearanceColor("openGreen"),
    /** @deprecated New Phase-1 surfaces use `blue` for context. */
    lime: appearanceColor("lime"),
    /** @deprecated Prefer `openGreen` for status or `blue` for context. */
    acid: appearanceColor("acid"),
    border: appearanceColor("border"),
    borderStrong: appearanceColor("borderStrong"),
    borderLight: "rgba(23,22,26,0.14)",
    success: appearanceColor("success"),
    warning: appearanceColor("warning"),
    closingSoon: appearanceColor("closingSoon"),
    danger: appearanceColor("danger"),
    onAccent: appearanceColor("onAccent"),
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, display: 48 },
  layout: { pageGutter: 24, sectionGap: 32, contentGap: 16 },
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
  typeScale: {
    displayXL: { fontSize: 54, lineHeight: 59, letterSpacing: -1.3 },
    displayL: { fontSize: 44, lineHeight: 49, letterSpacing: -1 },
    displayM: { fontSize: 36, lineHeight: 41, letterSpacing: -0.7 },
    screenTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.45 },
    sectionTitle: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
    cardTitle: { fontSize: 20, lineHeight: 26, letterSpacing: -0.25 },
    body: { fontSize: 16, lineHeight: 23 },
    meta: { fontSize: 14, lineHeight: 19 },
    label: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
    caption: { fontSize: 12, lineHeight: 17 },
  },
} as const;

export type BackyrdTheme = typeof backyrdTheme;

/** Semantic colors for the iPhone appearance selected in iOS Settings. */
export const backyrdLightColors = {
  ...backyrdTheme.color,
  ...appearanceColors.light,
} as const;

export const backyrdLightTheme = { ...backyrdTheme, color: backyrdLightColors } as const;

export function useBackyrdTheme() {
  return useColorScheme() === "light" ? backyrdLightTheme : backyrdTheme;
}
