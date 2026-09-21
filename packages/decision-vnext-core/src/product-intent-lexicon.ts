import type { ProductV1Intent } from "./product-v1-authority.js";

export const PRODUCT_INTENT_LEXICON_VERSION = "decision-vnext-product-intent-lexicon@2.0" as const;

type Signal = Readonly<{ term: string; weight: number }>;

const specific = (terms: readonly string[], weight = 4): readonly Signal[] => terms.map((term) => Object.freeze({ term, weight }));
const generic = (terms: readonly string[]): readonly Signal[] => terms.map((term) => Object.freeze({ term, weight: 1 }));

/**
 * Product-v1 language policy. These words only identify the broad request
 * intent used for retrieval and eligibility; they never rank a venue or claim
 * that a venue actually offers the requested item.
 */
export const PRODUCT_INTENT_LEXICON: Readonly<Record<ProductV1Intent, readonly Signal[]>> = Object.freeze({
  COFFEE: Object.freeze([
    ...specific(["kaffee", "coffee", "cafe", "espresso", "cappuccino", "latte macchiato", "latte", "flat white", "filterkaffee", "cold brew", "macchiato", "cortado"]),
    ...generic(["kaffeetrinken", "kaffee trinken", "kaffeepause"]),
  ]),
  DRINKS: Object.freeze([
    ...specific(["bier", "beer", "craft beer", "craft bier", "weizenbier", "lagerbier", "ipa", "ale", "stout", "pils", "pilsner", "wein", "wine", "rotwein", "weisswein", "rosewein", "naturwein", "cocktail", "cocktails", "mocktail", "mocktails", "drink", "drinks", "getrank", "getranke", "aperitif", "apero", "spritz", "gin", "whisky", "whiskey", "rum", "tequila", "cider", "most", "bar", "pub", "kneipe", "brauerei", "brewery", "taproom", "weinbar", "cocktailbar"]),
    ...generic(["trinken", "etwas trinken", "trinken gehen", "afterwork", "feierabenddrink"]),
  ]),
  EAT: Object.freeze([
    ...specific(["taco", "tacos", "ramen", "sushi", "sashimi", "pizza", "pizzeria", "pasta", "spaghetti", "burger", "cheeseburger", "kebab", "kebap", "doner", "falafel", "shawarma", "curry", "pho", "dim sum", "dumplings", "gyoza", "bao", "tapas", "steak", "steakhouse", "schnitzel", "fondue", "raclette", "risotto", "paella", "burrito", "quesadilla", "nachos", "hotdog", "hot dog", "sandwich", "salat", "bowl", "poke", "suppe", "brunch", "fruhstuck", "breakfast", "mittagessen", "lunch", "abendessen", "dinner", "dessert", "kuchen", "glace", "eiscreme", "restaurant", "bistro", "brasserie", "imbiss", "backerei", "konditorei"]),
    ...generic(["essen", "etwas essen", "essen gehen", "food", "hunger", "mahlzeit"]),
  ]),
  SPORT_MOVEMENT: Object.freeze([
    ...specific(["ping pong", "pingpong", "tischtennis", "padel", "tennis", "badminton", "squash", "bouldern", "bouldering", "klettern", "climbing", "fitness", "gym", "crossfit", "yoga", "pilates", "schwimmen", "swimming", "joggen", "running", "laufen", "fussball", "football", "basketball", "volleyball", "handball", "eishockey", "skaten", "skateboard", "velofahren", "radfahren", "cycling", "rudern", "rowing"]),
    ...generic(["sport", "training", "trainieren", "bewegung", "workout"]),
  ]),
  NATURE_ANIMAL_EXPERIENCE: Object.freeze([
    ...specific(["zoo", "tierpark", "wildpark", "aquarium", "botanischer garten", "naturpark", "naturreservat", "wald", "see", "fluss", "berg", "aussichtspunkt", "wasserfall", "wandern", "hiking", "spaziergang", "spazieren", "walk", "picknick", "tiere", "vogelbeobachtung"]),
    ...generic(["natur", "draussen", "outdoor", "aussicht"]),
  ]),
  CULTURE_ART: Object.freeze([
    ...specific(["museum", "museen", "galerie", "gallery", "ausstellung", "exhibition", "kunst", "art", "theater", "schauspiel", "oper", "ballett", "konzert", "concert", "klassik", "vernissage", "planetarium", "historisches gebaude", "architektur"]),
    ...generic(["kultur", "kulturell"]),
  ]),
  ACTIVITY_EXPERIENCE: Object.freeze([
    ...specific(["escape room", "escaperoom", "minigolf", "bowling", "kegeln", "billard", "poolbillard", "darts", "karaoke", "kino", "cinema", "film", "workshop", "töpfern", "toepfern", "malen", "kochkurs", "tanzkurs", "trampolin", "freizeitpark", "gaming", "arcade", "laser tag", "lasertag", "go kart", "gokart", "kartbahn", "sauna", "spa", "wellness"]),
    ...generic(["aktivitat", "erlebnis", "unternehmen", "ausflug"]),
  ]),
});

const fold = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("de-CH")
  .replaceAll("ß", "ss")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(" ", "\\s+");
const negatedBefore = (text: string, index: number): boolean => {
  const window = text.slice(Math.max(0, index - 45), index).trimEnd();
  const contrastBound = window.split(/\b(?:sondern|aber|lieber|stattdessen)\b/u).at(-1) ?? "";
  return /(?:^|\s)(?:kein(?:e|en|er|es)?|ohne|nicht)(?:\s+[a-z0-9]+){0,2}$/u.test(contrastBound.trim());
};

function signalScore(text: string, signal: Signal): number {
  const term = fold(signal.term);
  const matcher = new RegExp(`(?:^|\\s)${escaped(term)}(?=$|\\s)`, "gu");
  for (const match of text.matchAll(matcher)) {
    const index = (match.index ?? 0) + (match[0].startsWith(" ") ? 1 : 0);
    if (!negatedBefore(text, index)) return signal.weight;
  }
  return 0;
}

/** Returns null when no intent or two equally strong intents are evidenced. */
export function inferProductV1Intent(value: string): ProductV1Intent | null {
  const text = fold(value);
  if (!text) return null;
  const scored = (Object.entries(PRODUCT_INTENT_LEXICON) as [ProductV1Intent, readonly Signal[]][])
    .map(([intent, signals]) => ({ intent, score: signals.reduce((sum, signal) => sum + signalScore(text, signal), 0) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.intent.localeCompare(right.intent));
  const first = scored[0];
  if (!first || scored[1]?.score === first.score) return null;
  return first.intent;
}
