// Compatibility shape for older UI components; values follow the Home design system.

import { backyrdTheme } from "../theme/backyrd";

export const colors = {
  background: "#050506",
  primary: "#FF4F91",
  accent: "#D8FF3E",
  highlight: "#19191C",
  text: {
    primary: "#F7F3E9",
    secondary: "#D6D2CA",
    muted: "#A8A5A0",
  },
  border: "rgba(247,243,233,0.15)",
  overlay: "rgba(0,0,0,0.6)",
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
  h1: { fontFamily: backyrdTheme.type.bodyBold, fontSize: 28 },
  h2: { fontFamily: backyrdTheme.type.bodyBold, fontSize: 22 },
  body: { fontFamily: backyrdTheme.type.body, fontSize: 16 },
  small: { fontFamily: backyrdTheme.type.body, fontSize: 14 },
};

export const theme = {
  colors,
  spacing,
  radius,
  typography,
};
