// mobile/lib/theme.ts

import { backyrdTheme } from "../theme/backyrd";

/** @deprecated Import `backyrdTheme` from `theme/backyrd` in new UI code. */
export const colors = {
  background: backyrdTheme.color.background,
  primary: backyrdTheme.color.pink,
  accent: backyrdTheme.color.surfaceElevated,
  highlight: backyrdTheme.color.surface,
  text: {
    primary: backyrdTheme.color.textPrimary,
    secondary: backyrdTheme.color.textSecondary,
    muted: backyrdTheme.color.textMuted,
  },
  border: backyrdTheme.color.border,
  overlay: "rgba(0,0,0,0.6)",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 12, md: 18, lg: 24, xl: 32, full: 9999 };
export const typography = {
  fontRegular: backyrdTheme.type.body,
  fontBold: backyrdTheme.type.bodyBold,
  h1: { fontFamily: backyrdTheme.type.bodyBold, fontSize: 28, lineHeight: 35 },
  h2: { fontFamily: backyrdTheme.type.bodyBold, fontSize: 22, lineHeight: 29 },
  body: { fontFamily: backyrdTheme.type.body, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: backyrdTheme.type.body, fontSize: 14, lineHeight: 19 },
};

export const theme = { colors, spacing, radius, typography };
