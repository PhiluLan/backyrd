/** Local training contract. Spot registries supply values; this bridge names
 * their request roles. It never interprets user prose or rewrites live facts. */
import { EXPERIENCE_LANGUAGE_DATA, EXPERIENCE_VALUE_CHOICES, EXPERIENCE_QUESTIONS,
  librarianConcept } from '@backyrd/world-knowledge-core';
import { contentHash, deepFreeze } from './canonical.js';
import { LIBRARIAN_PROPERTY_SOURCE_ALIASES } from './product-librarian-language.js';

// Only unambiguous finite values are constrained. No keyword-to-query parser.
// Quiet deliberately belongs to both atmosphere.character and atmosphere.noise.
const roles = new Map<string, Set<string>>();
function add(values: readonly string[], keys: readonly string[]) {
  for (const value of values) {
    const concept = librarianConcept(value);
    if (!concept) continue;
    const allowed = roles.get(concept) ?? new Set<string>();
    keys.forEach(key => allowed.add(key)); roles.set(concept, allowed);
  }
}
for (const key of ['atmosphere.character', 'atmosphere.noise', 'food.diet'] as const)
  add(EXPERIENCE_VALUE_CHOICES[key] ?? [], [key]);
add(['conversation'], ['atmosphere.conversation']);
add(['indoor', 'outdoor', 'terrace'], ['offer.area']);
add(['own_food', 'own_drinks'], ['participation.permission']);
// These alternate roles genuinely have compatible canonical evidence.
for (const allowed of roles.values()) if (allowed.has('atmosphere.character')) allowed.add('experience.character');
const roleKeys = new Set(['offer.kind', 'experience.activity', 'offer.area', 'offer.feature', 'food.meal',
  'food.drink', 'food.dish', 'food.diet', 'food.delivery', 'participation.permission',
  'atmosphere.character', 'experience.character', 'atmosphere.noise', 'atmosphere.conversation']);
export const NUKNUK_TRAINING_VOCABULARY = deepFreeze({
  version: 'backyrd.nuknuk-training-vocabulary@1',
  language: EXPERIENCE_LANGUAGE_DATA,
  questions: EXPERIENCE_QUESTIONS,
  choices: EXPERIENCE_VALUE_CHOICES,
  requestPropertyAliases: LIBRARIAN_PROPERTY_SOURCE_ALIASES,
  conceptRoles: Object.fromEntries([...roles].map(([concept, keys]) => [concept, [...keys].sort()])),
  checkedRoleKeys: [...roleKeys].sort(),
  rules: [
    'Spotkategorie, angebotene Aktivität, Bereich und Atmosphäre sind verschiedene Dimensionen.',
    'Gemütlich bezeichnet Atmosphäre, nicht eine Kategorie, Aktivität, Lautstärke oder einen Innenbereich.',
    'Drinnen/draussen bezeichnet den Bereich, nicht Gemütlichkeit oder Lautstärke.',
    'Gut unterhalten können bezeichnet Gesprächsbedingungen; es verlangt nicht automatisch Ruhe.',
    'Eigenes Essen mitbringen bezeichnet Erlaubnis, nicht Verkauf, Lieferung oder eine Mahlzeit des Anbieters.',
    'Vegan bezeichnet Ernährung, nicht eine ausschliesslich vegane Gruppe oder ein ausschliesslich veganes Lokal.',
    'Empfohlene Reservierung ist keine Reservationspflicht. Öffnung beweist keinen freien Tisch.',
    'Anlässe sind CONTEXT. Besonders, speziell und einzigartig sind positive Erlebniswünsche (PREFERRED), keine festen Ortskategorien; daraus folgen weder Luxus noch Romantik oder ein Preis. Explizite Negation oder Gleichgültigkeit gesondert erhalten.',
    'Ein Begriff kann mehrere Rollen haben: Café kann einen Ort oder Kaffeetrinken meinen. Der Satz entscheidet.',
    'Die Zuordnung entscheidet nicht über Pflicht oder Wunsch: unbedingt gemütlich bleibt REQUIRED; gerne gemütlich PREFERRED.',
    'Nicht erforderlich ist kein Verbot. Keine ungenannten Pflichten aus Kontext oder Katalog ableiten.',
    'Ein unbekannter Ausdruck ist nicht falsch. Bedeutung erhalten und prüfen, keine Kategorie erzwingen.',
  ],
});
export const NUKNUK_TRAINING_VOCABULARY_HASH = contentHash(NUKNUK_TRAINING_VOCABULARY);


export type NuknukVocabularyIssue = { readonly factId: string; readonly code: 'CONCEPT_ROLE_CONFLICT';
  readonly key: string; readonly value: string; readonly allowedKeys: readonly string[] };
export function inspectNuknukTrainingVocabulary(target: unknown): readonly NuknukVocabularyIssue[] {
  if (!isRecord(target) || !isRecord(target.meaning) || !Array.isArray(target.meaning.facts)) return [];
  return target.meaning.facts.flatMap((fact: unknown): NuknukVocabularyIssue[] => {
    if (!isRecord(fact) || typeof fact.key !== 'string' || !isRecord(fact.value) || typeof fact.value.text !== 'string') return [];
    const concept = librarianConcept(fact.value.text), allowed = concept ? roles.get(concept) : undefined;
    if (!allowed || !roleKeys.has(fact.key) || allowed.has(fact.key)) return [];
    return [{ factId: String(fact.id), code: 'CONCEPT_ROLE_CONFLICT', key: fact.key,
      value: fact.value.text, allowedKeys: [...allowed].sort() }];
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function nuknukTrainingVocabularyInstructions(): string {
  return '\nSPOT_VOCABULARY ' + NUKNUK_TRAINING_VOCABULARY_HASH + '\n' + JSON.stringify({
    rules: NUKNUK_TRAINING_VOCABULARY.rules,
    // Full catalogues are in the hashed review artifact. Keep model context
    // bounded: teaching roles does not require repeating every venue type.
    dimensions: {place: 'offer.kind', activity: 'experience.activity', area: 'offer.area',
      atmosphere: 'atmosphere.character', conversation: 'atmosphere.conversation',
      diet: 'food.diet', permission: 'participation.permission'},
    properties: EXPERIENCE_QUESTIONS.filter(q => [...roles.values()].some(keys => keys.has(q.key)))
      .map(({key, label}) => ({key, label})),
    choices: EXPERIENCE_VALUE_CHOICES,
    conceptRoles: Object.fromEntries([...roles].map(([concept, keys]) => [concept, [...keys]])),
    conversation: {requestKey: 'atmosphere.conversation', values: ['conversation', 'conversation_possible'],
      profileLabel: 'Unterhaltung gut möglich'},
  });
}
