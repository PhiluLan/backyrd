// mobile/lib/decision/reasoning.ts

/**
 * User-facing reasoning.
 * Goal: sound like a good friend (locker + spezifisch), never like debug output.
 */

function clean(s: string) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function clampLen(s: string, n: number) {
  const x = clean(s);
  return x.length <= n ? x : x.slice(0, n - 1).trimEnd() + "…";
}

function extractTopToken(rawWhy: string): string | null {
  // Example:
  // "Mood-Match: 2 Signals, 1 Cluster. Top Token: gemütlich."
  const m = rawWhy.match(/top\s*token\s*:\s*([^\.\n]+)/i);
  if (!m?.[1]) return null;
  const token = clean(m[1]).replace(/"/g, "");
  return token ? token : null;
}

function isFallbackWhy(rawWhy: string): boolean {
  const s = rawWhy.toLowerCase();
  return s.includes("fallback") || s.includes("trend") || s.includes("popular") || s.includes("zu wenig") || s.includes("kein mood");
}

function vibeFromToken(token: string): string {
  const t = token.toLowerCase();
  if (t.includes("gem")) return "gemütlich";
  if (t.includes("chill")) return "chillig";
  if (t.includes("styl")) return "stylish";
  if (t.includes("lok")) return "lokal";
  if (t.includes("roma")) return "romantisch";
  if (t.includes("party")) return "party";
  if (t.includes("kreat")) return "kreativ";
  if (t.includes("family")) return "family";
  if (t.includes("food")) return "foodie";
  if (t.includes("out")) return "outdoor";
  return token;
}

export function friendReasonForSpot(params: {
  rawWhyThis?: string | null;
  moodA?: string;
  moodB?: string;
  city?: string;
  contextMode?: "orientation" | "weak_personalized" | "strong_personalized" | "fallback";
}): string {
  const raw = clean(params.rawWhyThis ?? "");
  const a = clean(params.moodA ?? "");
  const b = clean(params.moodB ?? "");
  const city = clean(params.city ?? "");
  const mode = params.contextMode;

  const moods = [a, b].filter(Boolean).join(" + ");

  // True fallback
  if (!raw || mode === "fallback" || isFallbackWhy(raw)) {
    if (city) return `Heute easy: einer der Spots, die in ${city} gerade ziemlich safe sind.`;
    return "Heute easy: ein Spot, der gerade ziemlich safe ist.";
  }

  const top = extractTopToken(raw);
  if (top) {
    const vibe = vibeFromToken(top);
    if (moods) return clampLen(`Passt gut zu deinem ${moods}-Vibe — fühlt sich ziemlich ${vibe} an.`, 110);
    return clampLen(`Der fühlt sich ziemlich ${vibe} an — könnte genau dein Ding sein.`, 110);
  }

  // Mood-match without token
  if (raw.toLowerCase().includes("mood-match")) {
    if (moods) return clampLen(`Klingt nach ${moods} — den Spot würde ich dir dafür echt geben.`, 110);
    return clampLen("Vibe passt — den Spot würde ich dir echt geben.", 110);
  }

  // Text match (if ever present)
  if (raw.toLowerCase().includes("text")) {
    if (moods) return clampLen(`Trifft deinen ${moods}-Vibe und passt auch zu dem, was du suchst.`, 110);
    return clampLen("Passt zu dem, was du suchst — fühlt sich stimmig an.", 110);
  }

  // Default: hide techy text, but keep a hint
  if (moods) return clampLen(`Ich glaub der passt zu ${moods} — schau mal rein.`, 110);
  return clampLen("Ich glaub der passt — schau mal rein.", 110);
}

export function friendContextCopy(params: {
  mode?: "orientation" | "weak_personalized" | "strong_personalized" | "fallback";
  city?: string;
  moodA?: string;
  moodB?: string;
}): { title: string; body: string } {
  const mode = params.mode ?? "orientation";
  const city = clean(params.city ?? "");
  const moods = [clean(params.moodA ?? ""), clean(params.moodB ?? "")].filter(Boolean).join(" + ");

  if (mode === "fallback") {
    return {
      title: "Heute easy",
      body: city
        ? `Ich hab dir einfach 3 sichere Picks in ${city} rausgesucht — ohne lang zu diskutieren.`
        : "Ich hab dir einfach 3 sichere Picks rausgesucht — ohne lang zu diskutieren.",
    };
  }

  if (mode === "strong_personalized") {
    return {
      title: "Das klingt nach dir",
      body: moods ? `Für ${moods} hab ich dir 3 Spots rausgesucht, die ziemlich on point sind.` : "Ich hab dir 3 Spots rausgesucht, die ziemlich on point sind.",
    };
  }

  if (mode === "weak_personalized") {
    return {
      title: "Gute Richtung",
      body: moods ? `Für ${moods} hab ich 3 Spots, die sehr gut passen könnten.` : "Ich hab 3 Spots, die sehr gut passen könnten.",
    };
  }

  return {
    title: "Mood-Match",
    body: moods ? `Für ${moods} hab ich dir 3 starke Optionen rausgesucht.` : "Ich hab dir 3 starke Optionen rausgesucht.",
  };
}
