// mobile/lib/decision/friendCopy.ts

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}
function clean(s: string) {
  return (s ?? "").trim();
}
function norm(s: string) {
  return clean(s).toLowerCase();
}
function cap(s: string) {
  const x = clean(s);
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}
function pick(list: string[], seed: number) {
  return list[seed % list.length];
}

const PHRASES: Record<string, string[]> = {
  cozy: ["klein & warm", "so richtig cozy", "entspannt & warm"],
  chic: ["clean & classy", "eher chic als chillig", "ein bisschen dress-up"],
  urban: ["city vibe", "mitten im Leben", "urbaner geht’s kaum"],
  intimate: ["eher intim", "perfekt zum reden", "nah & ruhig"],
  industrial: ["rough urban (im guten Sinn)", "industrial vibes", "bisschen gritty"],
  minimal: ["clean & minimal", "designig und ruhig", "wenig Schnickschnack"],
  lively: ["gute Energie", "mehr Stimmung", "eher lively als ruhig"],
  party: ["party mode", "mehr Nacht als Abend", "heute eskalationsfähig"],
  romantic: ["date-night Vibe", "romantisch ohne kitsch", "soft & sweet"],
  foodie: ["foodie-approved", "da gehst du nicht nur fürs Getränk hin", "für Hunger & Genuss"],
  hidden_gem: ["kleiner Geheimtipp", "low-key underrated", "nicht jeder kennt’s"],
  nature: ["grün & ruhig", "ein bisschen raus aus der Stadt", "Natur reset"],
  outdoor: ["frische Luft", "draussen tut gut", "kleiner Outdoor-Move"],
  creative: ["kreativer Vibe", "ein bisschen Culture", "macht den Kopf frei"],
};

function phraseFor(token: string, seed: number) {
  const t = norm(token);
  if (!t) return "";
  return PHRASES[t] ? pick(PHRASES[t], seed) : t;
}

function topTwo(tokens: string[]) {
  const t = uniq(tokens.map(norm)).filter(Boolean);
  return { t1: t[0] ?? "", t2: t[1] ?? "" };
}

function intersects(a: string[], b: string[]) {
  const bs = new Set(b.map(norm));
  return a.map(norm).filter((x) => x && bs.has(x));
}

export function friendOneLiner(params: { spotName: string; matchedTokens?: string[] | null }): string {
  const tokens = uniq((params.matchedTokens ?? []).map((t) => norm(t))).filter(Boolean);
  const seed = params.spotName.length;

  if (!tokens.length) return "Heute ein solider Pick — ohne viel Drama.";

  const { t1, t2 } = topTwo(tokens);
  const p1 = phraseFor(t1, seed);
  const p2 = t2 ? phraseFor(t2, seed + 7) : "";

  if (p1 && p2) return `${cap(p1)} — ${p2}.`;
  return `${cap(p1)}.`;
}

/**
 * Explanation Engine v2:
 * - 1 Zeile
 * - klingt wie ein guter Freund
 * - bezieht sich auf Input (moodA/moodB) + tatsächliche Matches (tokens/terms)
 * - ignoriert technische Raw-Strings (nur als Signal, falls vorhanden)
 */
export function friendOneLinerV2(params: {
  spotName: string;
  city?: string | null;
  moodA?: string | null;
  moodB?: string | null;
  matchedTokens?: string[] | null;
  matchedTerms?: string[] | null;
  rawWhyThis?: string | null;
}): string {
  const seed = params.spotName.length;

  const input = uniq([params.moodA ?? "", params.moodB ?? ""].map(norm)).filter(Boolean);
  const tokens = uniq((params.matchedTokens ?? []).map(norm)).filter(Boolean);
  const terms = uniq((params.matchedTerms ?? []).map(norm)).filter(Boolean);

  const overlap = intersects(tokens.length ? tokens : terms, input); // was matcht wirklich auf deine Eingabe?
  const hasMatches = tokens.length > 0 || terms.length > 0;

  // 0) Nothing matched → still confident, not robotic
  if (!hasMatches) {
    return "Solider Pick — fühlt sich heute einfach richtig an.";
  }

  // 1) Wenn die Eingabe wirklich getroffen wird → direkt spiegeln (premium-feel)
  if (overlap.length) {
    const o1 = overlap[0];
    const o2 = overlap[1];

    const p1 = phraseFor(o1, seed);
    const p2 = o2 ? phraseFor(o2, seed + 7) : "";

    if (p1 && p2) return `Trifft genau deinen Vibe: ${cap(p1)} — ${p2}.`;
    if (p1) return `Trifft genau deinen Vibe: ${cap(p1)}.`;
  }

  // 2) Kein direkter Overlap, aber wir haben klare Concepts → “ich seh was du meinst, hier ist die Nuance”
  const { t1, t2 } = topTwo(tokens.length ? tokens : terms);
  const p1 = phraseFor(t1, seed);
  const p2 = t2 ? phraseFor(t2, seed + 7) : "";

  // kleiner “friend move”: wenn Input existiert, nenn ihn einmal (ohne technisch zu werden)
  const inputText = input.length ? input.join(" + ") : "";

  if (p1 && p2) {
    return inputText
      ? `Du sagst ${inputText} — hier bekommst du ${cap(p1)} und ${p2}.`
      : `${cap(p1)} und ${p2} — guter Fit für heute.`;
  }

  if (p1) {
    return inputText ? `Du sagst ${inputText} — hier fühlt’s sich ${p1} an.` : `${cap(p1)} — passt.`;
  }

  return "Guter Vibe-Pick — vertrau mir kurz.";
}
