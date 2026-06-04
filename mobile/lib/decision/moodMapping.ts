// mobile/lib/decision/moodMapping.ts

export const MOOD_CLUSTERS = {
  misc: 1,
  chillig: 3,
  gemütlich: 4,
  stylish: 5,
  lokal: 6,
  romantisch: 7,
  party: 8,
  kreativ: 9,
  family: 10,
  foodie: 11,
  outdoor: 12,
} as const;

export type MoodClusterId = (typeof MOOD_CLUSTERS)[keyof typeof MOOD_CLUSTERS];

function normalize(s: string): string {
  // lowercase + trim + collapse spaces + basic umlaut/diacritics handling
  const x = (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  // german umlauts + ß
  const umlautFixed = x
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  // remove diacritics (e.g. é -> e)
  return umlautFixed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function splitTokens(input: string): string[] {
  const s = normalize(input);
  if (!s) return [];
  // split on comma, slash, pipe, semicolon, newline
  const rough = s.split(/[,/|;\n]+/g).map((t) => t.trim()).filter(Boolean);

  // also split multi-word phrases into tokens BUT keep the full phrase as well
  const out: string[] = [];
  for (const part of rough) {
    out.push(part);
    const words = part.split(" ").map((w) => w.trim()).filter(Boolean);
    if (words.length > 1) out.push(...words);
  }
  return Array.from(new Set(out)).filter(Boolean);
}

/**
 * Dictionary: token -> clusterId
 * Add synonyms here over time. Keep it deterministic and explicit.
 */
const TOKEN_TO_CLUSTER: Record<string, MoodClusterId> = {
  // gemütlich
  "gemuetlich": MOOD_CLUSTERS.gemütlich,
  "gemutlich": MOOD_CLUSTERS.gemütlich,
  "cozy": MOOD_CLUSTERS.gemütlich,
  "cosy": MOOD_CLUSTERS.gemütlich,
  "comfort": MOOD_CLUSTERS.gemütlich,
  "comfortable": MOOD_CLUSTERS.gemütlich,
  "warm": MOOD_CLUSTERS.gemütlich,
  "homey": MOOD_CLUSTERS.gemütlich,
  "homely": MOOD_CLUSTERS.gemütlich,
  "snug": MOOD_CLUSTERS.gemütlich,

  // chillig
  "chillig": MOOD_CLUSTERS.chillig,
  "chill": MOOD_CLUSTERS.chillig,
  "relax": MOOD_CLUSTERS.chillig,
  "relaxed": MOOD_CLUSTERS.chillig,
  "laidback": MOOD_CLUSTERS.chillig,
  "laid-back": MOOD_CLUSTERS.chillig,
  "calm": MOOD_CLUSTERS.chillig,

  // stylish
  "stylish": MOOD_CLUSTERS.stylish,
  "style": MOOD_CLUSTERS.stylish,
  "chic": MOOD_CLUSTERS.stylish,
  "fancy": MOOD_CLUSTERS.stylish,
  "design": MOOD_CLUSTERS.stylish,
  "modern": MOOD_CLUSTERS.stylish,

  // lokal
  "lokal": MOOD_CLUSTERS.lokal,
  "local": MOOD_CLUSTERS.lokal,
  "authentic": MOOD_CLUSTERS.lokal,
  "authentisch": MOOD_CLUSTERS.lokal,
  "neighborhood": MOOD_CLUSTERS.lokal,
  "neighbourhood": MOOD_CLUSTERS.lokal,
  "urban": MOOD_CLUSTERS.lokal,

  // romantisch
  "romantisch": MOOD_CLUSTERS.romantisch,
  "romantic": MOOD_CLUSTERS.romantisch,
  "date": MOOD_CLUSTERS.romantisch,
  "datenight": MOOD_CLUSTERS.romantisch,
  "date-night": MOOD_CLUSTERS.romantisch,
  "intimate": MOOD_CLUSTERS.romantisch,

  // party
  "party": MOOD_CLUSTERS.party,
  "nightlife": MOOD_CLUSTERS.party,
  "club": MOOD_CLUSTERS.party,
  "dance": MOOD_CLUSTERS.party,
  "loud": MOOD_CLUSTERS.party,
  "fun": MOOD_CLUSTERS.party,

  // kreativ
  "kreativ": MOOD_CLUSTERS.kreativ,
  "creative": MOOD_CLUSTERS.kreativ,
  "art": MOOD_CLUSTERS.kreativ,
  "gallery": MOOD_CLUSTERS.kreativ,
  "culture": MOOD_CLUSTERS.kreativ,

  // family
  "family": MOOD_CLUSTERS.family,
  "kids": MOOD_CLUSTERS.family,
  "child": MOOD_CLUSTERS.family,
  "children": MOOD_CLUSTERS.family,
  "familie": MOOD_CLUSTERS.family,

  // foodie
  "foodie": MOOD_CLUSTERS.foodie,
  "food": MOOD_CLUSTERS.foodie,
  "eat": MOOD_CLUSTERS.foodie,
  "restaurant": MOOD_CLUSTERS.foodie,
  "dinner": MOOD_CLUSTERS.foodie,
  "brunch": MOOD_CLUSTERS.foodie,
  "lunch": MOOD_CLUSTERS.foodie,
  "fine": MOOD_CLUSTERS.foodie,

  // outdoor
  "outdoor": MOOD_CLUSTERS.outdoor,
  "nature": MOOD_CLUSTERS.outdoor,
  "park": MOOD_CLUSTERS.outdoor,
  "walk": MOOD_CLUSTERS.outdoor,
  "hike": MOOD_CLUSTERS.outdoor,
  "hiking": MOOD_CLUSTERS.outdoor,
  "sun": MOOD_CLUSTERS.outdoor,
  "terrace": MOOD_CLUSTERS.outdoor,
  "garden": MOOD_CLUSTERS.outdoor,
};

export function mapTextToClusterIds(inputA: string, inputB: string): {
  clusterIds: number[];
  matchedTokens: string[];
  leftoverText: string; // could be used as query hint if you want
} {
  const tokens = [...splitTokens(inputA), ...splitTokens(inputB)];
  const matched: { token: string; id: number }[] = [];
  const leftovers: string[] = [];

  for (const t of tokens) {
    const id = TOKEN_TO_CLUSTER[t];
    if (id) matched.push({ token: t, id });
    else leftovers.push(t);
  }

  const clusterIds = Array.from(new Set(matched.map((m) => m.id))).sort((a, b) => a - b);
  const matchedTokens = matched.map((m) => m.token);

  // keep leftovers short and meaningful
  const leftoverText = Array.from(new Set(leftovers))
    .filter((x) => x.length >= 3)
    .slice(0, 8)
    .join(" ");

  return { clusterIds, matchedTokens, leftoverText };
}
