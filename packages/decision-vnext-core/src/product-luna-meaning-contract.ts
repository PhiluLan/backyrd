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
export const LUNA_CONTEXT_ONLY_FAMILIES: readonly LunaFactKey[] = Object.freeze(['budget.scope','time.original','time.reference','time.timezone','time.relation','experience.purpose','experience.occasion','people.identity','people.role','people.relationship','people.age','people.mobility_aid','people.pet','people.experience','people.capability']);
export const LUNA_MEANING_ROLE_CONTRACT = deepFreeze({version:'backyrd.luna-meaning-roles@7', rules, contextOnlyFamilies:LUNA_CONTEXT_ONLY_FAMILIES});
export type LunaMeaningIssue = {
  readonly factId: string;
  readonly code: 'CONCEPT_FAMILY_MISMATCH' | 'UNSUPPORTED_REQUIREMENT' | 'DIET_CONTEXT_NOT_EXECUTABLE' | 'FIELD_NAME_AS_VALUE' | 'UNKNOWN_AGE_PLACEHOLDER';
  readonly allowedFamilies: readonly LunaFactKey[];
  readonly repairPlaceholderValue?: true;
  readonly allowRemoval?: true;
  readonly allowedModalities?: readonly LunaMeaningOutput["facts"][number]["modality"][];
};
export function inspectLunaMeaning(output: LunaMeaningOutput, sourceText?: string): readonly LunaMeaningIssue[] {
  const foodVisit = output.facts.some(f => ['experience.activity','food.meal','offer.kind'].includes(f.key)
    && ['REQUIRED','PREFERRED'].includes(f.modality) && 'text' in f.value
    && ['meal','breakfast','brunch','lunch','dinner','snacks','aperitif'].includes(librarianConcept(f.value.text) ?? ''));
  return output.facts.flatMap<LunaMeaningIssue>(fact => {
    if (fact.key === 'people.age' && 'amount' in fact.value && fact.value.amount === 0 && fact.value.operator === 'APPROX'
      && sourceText !== undefined && !/\b(?:0|null|zero|zéro)\b/iu.test(sourceText))
      return [{factId:fact.id,code:'UNKNOWN_AGE_PLACEHOLDER',allowedFamilies:['people.age'],allowRemoval:true}];
    if ('text' in fact.value && Object.keys(LIBRARIAN_FAMILY_STRATEGIES).includes(fact.value.text.trim()))
      return [{factId:fact.id,code:'FIELD_NAME_AS_VALUE',allowedFamilies:[fact.key],repairPlaceholderValue:true}];
    if (foodVisit && fact.key === 'food.diet' && fact.modality === 'CONTEXT')
      return [{factId:fact.id,code:'DIET_CONTEXT_NOT_EXECUTABLE',allowedFamilies:['food.diet'],allowedModalities:['REQUIRED','PREFERRED','EXCLUDED','NOT_REQUIRED']}];
    if (fact.modality === 'CONTEXT' || fact.modality === 'NOT_REQUIRED') return [];
    const concept = 'text' in fact.value ? librarianConcept(fact.value.text) : null;
    const allowed = concept ? rules[concept] : undefined;
    if (allowed && !allowed.includes(fact.key)) return [{factId:fact.id,code:'CONCEPT_FAMILY_MISMATCH' as const,allowedFamilies:allowed}];
    if (['REQUIRED', 'EXCLUDED'].includes(fact.modality) && LIBRARIAN_FAMILY_STRATEGIES[fact.key] === 'UNSUPPORTED') return [{factId:fact.id,code:'UNSUPPORTED_REQUIREMENT' as const,allowedFamilies:[]}];
    return [];
  }).concat(output.extensions.filter(extension => ['REQUIRED', 'EXCLUDED'].includes(extension.modality)).map(extension => ({factId:extension.id,code:'UNSUPPORTED_REQUIREMENT' as const,allowedFamilies:[]})));
}
/** Only diagnosed keys may change in the bounded correction. A context-only
 * diet during a food visit may additionally be classified by the model into
 * an executable modality; all other modalities remain immutable. Values, IDs,
 * scopes, basis, logic, participants and alternatives are immutable.
 * A correction that drops a wish or narrows it is rejected before any search. */
export function assertLunaMeaningCorrection(before: LunaMeaningOutput, after: LunaMeaningOutput, issues: readonly LunaMeaningIssue[]): void {
  const permitted = new Map(issues.map(issue => [issue.factId, issue]));
  const strip = (output: LunaMeaningOutput) => ({...output, facts:output.facts.filter(fact => !permitted.get(fact.id)?.allowRemoval).map(fact => {
    const {key,...rest}=fact;
    if (!permitted.has(fact.id)) return fact;
    if (permitted.get(fact.id)!.repairPlaceholderValue) { const {value,...stable}=rest; return stable; }
    if (permitted.get(fact.id)!.allowedModalities) { const {modality,...stable}=rest; return stable; }
    return rest;
  })});
  if (after.facts.some(f=>permitted.get(f.id)?.allowRemoval) || contentHash(strip(before)) !== contentHash(strip(after)) || after.facts.some(fact => permitted.has(fact.id) && (!permitted.get(fact.id)!.allowedFamilies.includes(fact.key) || permitted.get(fact.id)!.repairPlaceholderValue && (!('text' in fact.value) || Object.keys(LIBRARIAN_FAMILY_STRATEGIES).includes(fact.value.text.trim()) || !fact.value.text.trim()) || permitted.get(fact.id)!.allowedModalities && !permitted.get(fact.id)!.allowedModalities!.includes(fact.modality)))) {
    throw new Error('product_luna_correction_changed_meaning');
  }
}
export const LUNA_MEANING_ROLE_INSTRUCTIONS = '\nVERBINDLICHE BEDEUTUNGSROLLEN (ersetzen überlappende Basisdefinitionen): '
  + 'Das konkrete Erlebnis gehört zur Aktivität, eine Zutritts-/Mitnahme-Erlaubnis zur participation.permission, Personenmerkmale zum CONTEXT. '
  + 'condition.animals ist NICHT die gewünschte Tierbeobachtung; es bezeichnet nur besondere Tierhaltungs-/Tierzugangsbedingungen, deren genaue Bedeutung erhalten bleiben muss. Hund mitbringen ist keine Tierbeobachtung. '
  + 'Die folgenden bekannten Begriffe dürfen als Wunsch nur in den jeweils angegebenen Familien stehen: '
  + Object.entries(rules).map(([concept,families])=>`${concept}=>${families.join('|')}`).join('; ')
  + '. Kontextfamilien dürfen ausschliesslich CONTEXT sein: ' + LUNA_CONTEXT_ONLY_FAMILIES.join(', ')
  + '. Eine zeitliche Reihenfolge gehört zwischen mehrere konkret benannte Tätigkeiten in SEQUENCE; ein alleinstehendes zuerst oder danach erzeugt keine zusätzliche erfüllbare Ortsanforderung. '
  + 'VERNEINTE VORAUSSETZUNGEN: Eine Voraussetzung nicht erfüllen wollen bedeutet, dass der Ort ohne diese Voraussetzung nutzbar sein muss. Ohne Reservierung, ohne Anmeldung, ohne Vorbuchung => participation.booking spontaneous REQUIRED; möglichst ohne Vorbuchung => spontaneous PREFERRED. NOT_REQUIRED bedeutet dagegen ausdrücklich egal ob eine Buchung nötig ist. Dafür spontaneous NOT_REQUIRED verwenden. booking_required NOT_REQUIRED ist eine mehrdeutige Doppelverneinung und nicht erlaubt. Dasselbe Prinzip für Zugang ohne Hotelaufenthalt: public_day_access REQUIRED statt Hotelaufenthalt als unverbindlich wegzulassen. Den Wunsch niemals verlieren. '
  + 'PERSONENZAHL: Die beiläufig genannte Begleitung (wir beide, mit einer Freundin) ist people.count CONTEXT und kein Auftrag, eine buchbare Gruppenkapazität nachzuweisen. REQUIRED nur bei ausdrücklich verlangten Plätzen/Kapazität für eine Gruppe oder gemeinsamer Gruppenbuchung. Zahl und Bezug trotzdem erhalten; bestehende dokumentierte Kapazitätsgrenzen bleiben zu beachten. '
  + 'budget.scope ist ausschliesslich CONTEXT: ein Preisparameter, keine weitere Pflicht des Ortes. Bei gratis keinen unnötigen Pro-Person-Umfang ergänzen; der Geldbetrag 0 ist die verbindliche Forderung. '
  + 'FEHLENDE ANGABEN: Tochter, Sohn und Kind ohne genanntes Alter erzeugen KEIN people.age. Unbekanntes Alter ist weder 0 noch APPROX 0. Bei Regen ist eine Wetterbedingung ohne Besuchsdatum: ohne heute, morgen, Datum oder anderen konkreten Datumsbezug KEIN time.date. reference.now ist kein Nutzerwunsch. '
  + 'Feldnamen wie experience.activity sind niemals Inhaltswerte. Benenne die tatsächlich gewünschte Tätigkeit (z.B. meal), nicht den Schlüssel als Text. '
  + 'ERNÄHRUNG BEIM GEMEINSAMEN ESSEN: Ein genanntes Ernährungsbedürfnis einer Begleitperson (vegan, vegetarisch, glutenfrei, Allergie) muss beim konkret gewünschten Essen erfüllbar sein: food.diet mit Personenbezug REQUIRED. Es bedeutet eine passende Option für diese Person, niemals ausschliesslich veganes Lokal. Nur ausdrücklich optionale Bedürfnisse sind PREFERRED oder NOT_REQUIRED. food.diet CONTEXT ist bei einem Essenswunsch nicht ausführbar und verliert das Bedürfnis. '
  + 'Unbekannte Wünsche vollständig erhalten, nicht auf einen ähnlichen bekannten Begriff zwingen. Niemals eine Pflicht abschwächen, eine Negation entfernen, ein Datum erfinden oder eine Alternative in mehrere Pflichten verwandeln. Vor Ausgabe jede Zuordnung gegen diesen Vertrag prüfen.';
