// mobile/lib/moods.ts
/**
 * Mood Utilities: Farben, Normalisierung, Vorschläge
 * - Stabile Farbzuordnung via Hash -> Brand-Palette
 * - Einheitliche Darstellung für Mood-Pills
 */

export const MOOD_SUGGESTIONS: string[] = [
  "gemütlich",
  "lebendig",
  "romantisch",
  "laut",
  "leise",
  "authentisch",
  "versteckt",
  "urban",
  "instagrammable",
  "chillig",
  "rustikal",
  "modern",
];

const PALETTE = [
  "#FF6F61", // Coral
  "#4CAF50", // Backyard Green
  "#FFD966", // Soft Yellow
  "#3A86FF", // Blau
  "#9B5DE5", // Lila
  "#2EC4B6", // Teal
  "#FFBE0B", // Gelb (kräftig)
  "#F94144", // Rot
];

/** lowercase + trim */
export function normalizeMood(mood: string): string {
  return (mood || "").toLowerCase().trim();
}

/** einfacher Hash für stabile Farbwahl */
function hashMood(mood: string): number {
  const s = normalizeMood(mood);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function moodColor(mood: string): string {
  const idx = hashMood(mood) % PALETTE.length;
  return PALETTE[idx];
}

/** Textfarbe schwarz/weiß je nach Hintergrund */
export function readableTextColor(bg: string): "#000" | "#fff" {
  // simple luminance check
  const hex = bg.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000" : "#fff";
}

export function getPillStyle(mood: string, variant: "solid" | "outline") {
  const bg = moodColor(mood);
  const fg = readableTextColor(bg);
  if (variant === "solid") {
    return {
      container: {
        backgroundColor: bg,
        borderColor: bg,
      },
      textColor: fg,
    };
  }
  // outline
  return {
    container: {
      backgroundColor: "transparent",
      borderColor: bg,
    },
    textColor: "#000" as const,
  };
}
