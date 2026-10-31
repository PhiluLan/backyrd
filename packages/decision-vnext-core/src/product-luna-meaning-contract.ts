import { BOOLEAN_CONCEPTS, OFFER_CATALOG, librarianConcept } from '@backyrd/world-knowledge-core';
import { contentHash, deepFreeze } from './canonical.js';
import { LIBRARIAN_FAMILY_STRATEGIES } from './product-librarian-language.js';
import type { LunaFactKey, LunaMeaningOutput } from './product-luna-librarian.js';

/** Shared provider instruction and executable boundary. These are exact domain
 * concepts, never substring guesses about the user's prose. No family rewrite,
 * duty demotion, new requirement or invented evidence happens in software. */
const rules: Record<string, readonly LunaFactKey[]> = {};
function assign(concepts: readonly string[], families: readonly LunaFactKey[]) {
  for (const concept of concepts) rules[concept] = families;
}
assign([...new Set(OFFER_CATALOG.map(offer => offer.concept)), 'table_tennis', 'bouldering', 'climbing', 'training', 'course', 'movement_play', 'children_course', 'guided', 'workshop', 'animals', 'exhibition', 'party', 'dancing', 'movement'], ['experience.activity', 'offer.kind']);
assign(['guided'], ['experience.activity', 'offer.kind', 'participation.format']);
assign(['meal', 'lunch', 'dinner', 'breakfast', 'snacks', 'aperitif'], ['experience.activity', 'offer.kind', 'food.meal', 'food.option']);
assign(['drinks'], ['experience.activity', 'offer.kind', 'food.drink']);
assign(['coffee'], ['experience.activity', 'offer.kind', 'food.drink']);
assign(['children_activity'], ['condition.children']);
assign(['quiet', 'loud'], ['atmosphere.noise', 'atmosphere.character']);
assign(['romantic', 'relaxed', 'cozy'], ['atmosphere.character']);
assign(['conversation'], ['atmosphere.conversation']);
assign(['jazz', 'live_jazz', 'live_music', 'music_event'], ['experience.activity', 'offer.feature', 'atmosphere.music']);
assign(['music', 'no_music', 'background_music'], ['atmosphere.music']);
assign(['vegan', 'vegetarian'], ['food.diet', 'food.cuisine']);
assign(['indoor', 'outdoor', 'terrace'], ['offer.area']);
assign(['rain_suitable'], ['offer.weather_suitability']);
assign(['shade'], ['offer.shade']);
assign(['covered'], ['condition.weather_protection', 'offer.weather_suitability']);
assign(['own_food', 'own_drinks', 'public_day_access'], ['participation.permission']);
assign(['spontaneous', 'booking_required'], ['participation.booking', 'participation.entry_mode']);
for (const [key, concept] of Object.entries(BOOLEAN_CONCEPTS)) {
  const families: LunaFactKey[] = ['offer.feature', 'offer.facility'];
  if (concept === 'playground') families.push('experience.activity', 'offer.kind');
  if (['step_free', 'stroller'].includes(concept)) families.push('participation.accessibility');
  if (key in LIBRARIAN_FAMILY_STRATEGIES) families.push(key as LunaFactKey);
  rules[concept] = families;
}
export const LUNA_MEANING_ROLE_CONTRACT = deepFreeze({version:'backyrd.luna-meaning-roles@1', rules});
export type LunaMeaningIssue = {
  readonly factId: string;
  readonly code: 'CONCEPT_FAMILY_MISMATCH' | 'UNSUPPORTED_REQUIREMENT';
  readonly allowedFamilies: readonly LunaFactKey[];
};
export function inspectLunaMeaning(output: LunaMeaningOutput): readonly LunaMeaningIssue[] {
  return output.facts.flatMap<LunaMeaningIssue>(fact => {
    if (fact.modality === 'CONTEXT' || fact.modality === 'NOT_REQUIRED') return [];
    const concept = 'text' in fact.value ? librarianConcept(fact.value.text) : null;
    const allowed = concept ? rules[concept] : undefined;
    if (allowed && !allowed.includes(fact.key)) return [{factId:fact.id,code:'CONCEPT_FAMILY_MISMATCH' as const,allowedFamilies:allowed}];
    if (['REQUIRED', 'EXCLUDED'].includes(fact.modality) && LIBRARIAN_FAMILY_STRATEGIES[fact.key] === 'UNSUPPORTED') return [{factId:fact.id,code:'UNSUPPORTED_REQUIREMENT' as const,allowedFamilies:[]}];
    return [];
  }).concat(output.extensions.filter(extension => ['REQUIRED', 'EXCLUDED'].includes(extension.modality)).map(extension => ({factId:extension.id,code:'UNSUPPORTED_REQUIREMENT' as const,allowedFamilies:[]})));
}
/** Only diagnosed keys may change in the bounded correction. Values, IDs,
 * scopes, polarity, basis, logic, participants and alternatives are immutable.
 * A correction that drops a wish or narrows it is rejected before any search. */
export function assertLunaMeaningCorrection(before: LunaMeaningOutput, after: LunaMeaningOutput, issues: readonly LunaMeaningIssue[]): void {
  const permitted = new Map(issues.map(issue => [issue.factId, issue.allowedFamilies]));
  const strip = (output: LunaMeaningOutput) => ({...output, facts:output.facts.map(fact => {
    const {key,...rest}=fact;
    return permitted.has(fact.id) ? rest : fact;
  })});
  if (contentHash(strip(before)) !== contentHash(strip(after)) || after.facts.some(fact => permitted.has(fact.id) && !permitted.get(fact.id)!.includes(fact.key))) {
    throw new Error('product_luna_correction_changed_meaning');
  }
}
export const LUNA_MEANING_ROLE_INSTRUCTIONS = '\nVERBINDLICHE BEDEUTUNGSROLLEN (ersetzen überlappende Basisdefinitionen): '
  + 'Das konkrete Erlebnis gehört zur Aktivität, eine Zutritts-/Mitnahme-Erlaubnis zur participation.permission, Personenmerkmale zum CONTEXT. '
  + 'condition.animals ist NICHT die gewünschte Tierbeobachtung; es bezeichnet nur besondere Tierhaltungs-/Tierzugangsbedingungen, deren genaue Bedeutung erhalten bleiben muss. Hund mitbringen ist keine Tierbeobachtung. '
  + 'Die folgenden bekannten Begriffe dürfen als Wunsch nur in den jeweils angegebenen Familien stehen: '
  + Object.entries(rules).map(([concept,families])=>`${concept}=>${families.join('|')}`).join('; ')
  + '. Unbekannte Wünsche vollständig erhalten, nicht auf einen ähnlichen bekannten Begriff zwingen. Niemals eine Pflicht abschwächen, eine Negation entfernen, ein Datum erfinden oder eine Alternative in mehrere Pflichten verwandeln. Vor Ausgabe jede Zuordnung gegen diesen Vertrag prüfen.';
