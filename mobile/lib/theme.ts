// mobile/lib/theme.ts

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
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};

export const typography = {
  fontRegular: "Inter_400Regular",
  fontBold: "Inter_700Bold",
  h1: { fontFamily: "Inter_700Bold", fontSize: 28 },
  h2: { fontFamily: "Inter_700Bold", fontSize: 22 },
  body: { fontFamily: "Inter_400Regular", fontSize: 16 },
  small: { fontFamily: "Inter_400Regular", fontSize: 14 },
};

export const theme = {
  colors,
  spacing,
  radius,
  typography,
};
