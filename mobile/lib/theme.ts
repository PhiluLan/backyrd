// mobile/lib/theme.ts

export const colors = {
  background: "#FFFFF5", // App Hintergrund (Beige-Hell)
  primary: "#CAEDF3", // Buttonfarbe (Hellblau)
  accent: "#F4D4D1", // Box-Farbe für Popular + Letzte Besuche
  highlight: "#F4E8E3", // Box oben (Hi Gast)
  text: {
    primary: "#000000", // Schwarz
    secondary: "#333333",
    muted: "#666666",
  },
  border: "#000000", // für Suchergebnisse
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
  fontRegular: "PlayfairDisplay-Regular",
  fontBold: "PlayfairDisplay-Bold",
  h1: { fontFamily: "PlayfairDisplay-Bold", fontSize: 28 },
  h2: { fontFamily: "PlayfairDisplay-Bold", fontSize: 22 },
  body: { fontFamily: "PlayfairDisplay-Regular", fontSize: 16 },
  small: { fontFamily: "PlayfairDisplay-Regular", fontSize: 14 },
};

export const theme = {
  colors,
  spacing,
  radius,
  typography,
};
