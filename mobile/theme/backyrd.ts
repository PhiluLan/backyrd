import { DynamicColorIOS, Platform, PlatformColor, useColorScheme } from "react-native";
import { runtimeVersion } from "expo-updates";
import appearanceColors from "./appearance-colors.json";

type AppearanceColorName = keyof typeof appearanceColors.dark;

export const usesFixedDarkAppearance = Platform.OS === "ios" && runtimeVersion === "1.1.0";

/** Native dynamic colors keep module-level StyleSheets in sync with the OS appearance. */
function appearanceColor(name: AppearanceColorName): string {
  if (Platform.OS === "ios") {
    if (usesFixedDarkAppearance) return appearanceColors.dark[name];
    return DynamicColorIOS({ light: appearanceColors.light[name], dark: appearanceColors.dark[name] }) as unknown as string;
  }
  if (Platform.OS === "android") {
    const resourceName = name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return PlatformColor(`@color/backyrd_${resourceName}`) as unknown as string;
  }
  return `var(--backyrd-${name}, ${appearanceColors.dark[name]})`;
}

// Kept for existing responsive Home geometry. Typography itself is branded in AppText.
export const useSFPro = Platform.OS === "ios";

export const backyrdTheme = {
  // Beta presentation: retain the rig/assets for later refinement, without mounting them.
  nuknuk: { showCharacter: false },
  color: {
    background: appearanceColor("background"),
    backgroundLight: "#F5F7FA",
    surface: appearanceColor("surface"),
    surfaceElevated: appearanceColor("surfaceElevated"),
    surfaceLight: "#F8F9FB",
    surfaceLightElevated: "#FFFFFF",
    textPrimary: appearanceColor("textPrimary"),
    textPrimaryLight: "#171B22",
    textSecondary: appearanceColor("textSecondary"),
    textSecondaryLight: "#65707B",
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
    borderLight: "#D6DCE3",
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
    display: "BarlowCondensed_800ExtraBold",
    body: "LibreFranklin_400Regular",
    bodyMedium: "LibreFranklin_600SemiBold",
    bodyBold: "LibreFranklin_700Bold",
  },
  typeScale: {
    displayXL: { fontSize: 56, lineHeight: 55, letterSpacing: -0.35 },
    displayL: { fontSize: 46, lineHeight: 46, letterSpacing: -0.3 },
    displayM: { fontSize: 37, lineHeight: 38, letterSpacing: -0.2 },
    screenTitle: { fontSize: 30, lineHeight: 32, letterSpacing: -0.15 },
    sectionTitle: { fontSize: 24, lineHeight: 26, letterSpacing: 0 },
    cardTitle: { fontSize: 22, lineHeight: 24, letterSpacing: 0 },
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
  const scheme = useColorScheme();
  return !usesFixedDarkAppearance && scheme === "light" ? backyrdLightTheme : backyrdTheme;
}
