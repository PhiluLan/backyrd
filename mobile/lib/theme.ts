// Compatibility shape for older UI components; values follow the Home design system.

import { backyrdTheme } from "../theme/backyrd";

export const colors = {
  background: "#1D222B",
  primary: "#F24D86",
  accent: "#242B35",
  highlight: "#2B323D",
  text: {
    primary: "#F5F6F6",
    secondary: "#B3BAC3",
    muted: "#89929F",
  },
  border: "#4A5361",
  overlay: "rgba(17,21,29,0.72)",
};

export const spacing = {
  xs: backyrdTheme.spacing.xxs,
  sm: backyrdTheme.spacing.xs,
  md: backyrdTheme.spacing.md,
  lg: backyrdTheme.spacing.xl,
  xl: backyrdTheme.spacing.xxl,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};

export const typography = {
  fontRegular: backyrdTheme.type.body,
  fontBold: backyrdTheme.type.bodyBold,
  h1: { fontFamily: backyrdTheme.type.display, fontSize: 30 },
  h2: { fontFamily: backyrdTheme.type.display, fontSize: 24 },
  body: { fontFamily: backyrdTheme.type.body, fontSize: 16 },
  small: { fontFamily: backyrdTheme.type.body, fontSize: 14 },
};

export const theme = {
  colors,
  spacing,
  radius,
  typography,
};
