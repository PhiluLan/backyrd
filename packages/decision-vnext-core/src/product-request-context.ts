/** Request-local extraction. Never cache source text, ages or evidence spans here.
 * This bounded fallback complements the semantic interpreter; it is not a claim
 * of general language understanding. Unsupported budget semantics stay visible.
 */
export const PRODUCT_REQUEST_CONTEXT_VERSION = "decision-vnext-product-context-resolver-v2" as const;
const normalize = (text: string): string => text.normalize("NFKC").toLocaleLowerCase("de-CH");

export function hasPreciseRequestedTime(input: string): boolean {
  const text = normalize(input);
  return /\b(?:nach|ab|um|vor|bis|at|after|before|from|until)\s*(?:[01]?\d|2[0-3])(?:(?::[0-5]\d)?\s*(?:uhr|am|pm)\b|:[0-5]\d\b)/u.test(text)
    || /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/u.test(text);
}

const numberWords: Readonly<Record<string, number>> = {
  ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
};
const ageToken = `(?:\\d{1,3}|${Object.keys(numberWords).join("|")})`;
const agePattern = new RegExp(`(?<![\\p{L}\\d])(${ageToken})[ -]?(?:jährig\\p{L}*|jaehrig\\p{L}*|years?[ -]old|year-old)(?![\\p{L}\\d])`, "gu");
export function requestGroup(input: string) {
  const text = normalize(input);
  const ages = [...text.matchAll(agePattern)].map((match) => numberWords[match[1]!] ?? Number(match[1]))
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= 120);
  const family = /\b(?:tochter|sohn|kinder?n?|familie|familien\p{L}*|daughter|son|children|child|family)\b/u.test(text);
  // "Family" alone proves neither head count nor adult accompaniment.
  const adultPresent = /\b(?:mit erwachsenen|with an adult|with adults)\b/u.test(text)
    || new RegExp(`\\bmit\\s+(?:meiner?|meinen|unserer?|unseren)\\s+(?:${ageToken}[ -]?(?:jährig\\p{L}*|jaehrig\\p{L}*)\\s+)?(?:tochter|sohn|kindern?)\\b`, "u").test(text);
  return { size: null, minimumAge: ages.length ? Math.min(...ages) : null, adultPresent, companionType: family ? "FAMILY" : null };
}

export type RequestBudget = {
  readonly amount: number | null;
  readonly perPerson: boolean;
  readonly requested: boolean;
  readonly representable: boolean;
};
export function requestBudget(input: string): RequestBudget {
  const text = normalize(input);
  const moneyPattern = /(?<![\d.,])(?:chf\s*(\d{1,5}(?:[.,]\d{1,2})?)|(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:chf|franken)\b)(?![\d.,])/gu;
  const mentions = [...text.matchAll(moneyPattern)];
  const amounts = mentions.map((match) => Number((match[1] ?? match[2]!).replace(",", ".")));
  const ceilingBeforeAmount = /\b(?:höchstens|maximal|max\.?|bis|unter|weniger als|at most|up to|under|less than|budget)\s*:?\s*$/u;
  const requested = mentions.some((match) => ceilingBeforeAmount.test(text.slice(0, match.index)));
  const unique = [...new Set(amounts)];
  const amount = requested && unique.length === 1 && Number.isInteger(unique[0]) ? unique[0]! : null;
  const perPerson = /\b(?:pro person|je person|per person|each)\b|\bp\.p\./u.test(text);
  const strict = /\b(?:unter|weniger als|under|less than)\b/u.test(text);
  // The public v1 contract has integer CHF and a boolean perPerson. Do not
  // silently round decimals, turn < into <=, or compare a group total with a
  // World price range per person. Those need a versioned richer contract.
  const representable = requested && amount !== null && !strict && perPerson
    && !/\b(?:insgesamt|gesamt|zusammen|total|altogether|nicht|not|mindestens|at least)\b/u.test(text);
  return { amount, perPerson, requested, representable };
}
