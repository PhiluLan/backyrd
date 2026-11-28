import { AUTHORING_STEPS, EXPERIENCE_QUESTIONS, EXPERIENCE_TEMPLATES, emptyExperienceConditions, getAuthoringFieldsForContext, getExperienceQuestions, hasOfferModule, type ExperienceArea, type ExperienceCategory, type ExperienceProfile, type ExperienceProperty, type ExperienceQuestion, type ExperienceScope } from "@backyrd/world-knowledge-core/browser";

export type ExperienceWorkspace = "OFFERS" | "AREAS" | "SPOT";

/** Where a NEW answer is authored, not where historical claims are allowed.
 * Keep the stored contract permissive so old scoped answers remain intact.
 * Physical access uses the precise area questions instead of the old catch-all.
 */
const primaryScope: Readonly<Record<string, ExperienceScope | null>> = {
  "participation.accessibility": null,
  "stay.maximum_occupancy": "OFFER",
  "stay.room_type": "OFFER",
  "participation.entry_mode": "OFFER",
  "condition.children": "OFFER",
  "route.length": "OFFER",
  "condition.terrain": "OFFER",
  "atmosphere.music": "AREA",
  "amenity.shower": "AREA",
  "location.setting": "AREA",
  "offer.feature": "AREA",
  "amenity.toilet": "SPOT",
  "amenity.changing_table": "SPOT",
  "participation.permission": "SPOT",
};

export function getExperienceAuthoringQuestions(category: ExperienceCategory, scope: ExperienceScope, offerKind?: string, areaKind?: string, existingAnswers: Readonly<Record<string,unknown>> = {}, sharedFacilitiesManaged = false): readonly ExperienceQuestion[] {
  const amenities=existingAnswers["amenity.features"];
  const existingFeatures=amenities && typeof amenities==="object" && "knowledgeState" in amenities && amenities.knowledgeState==="KNOWN_VALUE" && "value" in amenities && Array.isArray(amenities.value) ? amenities.value : [];
  const sharedFeatures: Readonly<Record<string,string>>={"amenity.toilet":"TOILET","amenity.changing_table":"CHANGING_TABLE","amenity.parking":"PARKING"};
  const questions = [...getExperienceQuestions(category, scope, offerKind, areaKind)];
  // A private celebration is not necessarily a meal. Its actual audience can
  // be documented without forcing a new food service or a new storage shape.
  if (scope === "OFFER" && offerKind === "PRIVATE_CELEBRATION") {
    const suitability = EXPERIENCE_QUESTIONS.find(question => question.key === "participation.age_suitability");
    if (suitability && !questions.some(question => question.key === suitability.key)) questions.push(suitability);
  }
  return questions
    .filter(question => (!(question.key in primaryScope) || primaryScope[question.key] === scope) && !(scope==="SPOT" && (existingFeatures.includes(sharedFeatures[question.key]) || sharedFacilitiesManaged && question.key in sharedFeatures)))
    .map(question => ({ ...question, label:
      question.key === "location.setting" ? "Drinnen oder draussen?" :
      question.key === "amenity.step_free" ? "Ist dieser Bereich stufenlos erreichbar?" :
      question.key === "amenity.stroller" ? "Ist dieser Bereich mit Kinderwagen zugänglich?" :
      question.key === "offer.feature" ? "Ausstattung in diesem Bereich" :
      question.key === "offer.temperature" && areaKind === "POOL_AREA" ? "Wassertemperatur" :
      question.key === "amenity.toilet" ? "Gibt es ein WC am Spot?" :
      question.key === "amenity.changing_table" ? "Gibt es einen Wickeltisch am Spot?" : question.label,
    }));
}

/** Existing structured facts keep their original scope and a real editor even
 * when their category or the preferred place of entry has changed. */
export function getExperienceCareQuestions(category: ExperienceCategory, scope: ExperienceScope, offerKind?: string, areaKind?: string, existingAnswers: Readonly<Record<string,unknown>> = {}, sharedFacilitiesManaged = false, properties: readonly ExperienceProperty[] = []): readonly ExperienceQuestion[] {
  const questions = getExperienceAuthoringQuestions(category, scope, offerKind, areaKind, existingAnswers, sharedFacilitiesManaged);
  const stored = EXPERIENCE_QUESTIONS.filter(question => question.scopes.includes(scope)
    && properties.some(property => property.key === question.key)
    && !questions.some(current => current.key === question.key));
  return [...questions, ...stored];
}

/** Deliberate exceptions, not another compulsory questionnaire. These are
 * supported scoped fields; adding one never copies or widens a shared fact. */
export function getExperienceAdditionalQuestions(category: ExperienceCategory, scope: ExperienceScope, offerKind?: string, areaKind?: string, existingAnswers: Readonly<Record<string,unknown>> = {}, sharedFacilitiesManaged = false, properties: readonly ExperienceProperty[] = []): readonly ExperienceQuestion[] {
  const visible = getExperienceCareQuestions(category, scope, offerKind, areaKind, existingAnswers, sharedFacilitiesManaged, properties);
  const candidates = [...getExperienceQuestions(category, scope, offerKind, areaKind),
    ...EXPERIENCE_QUESTIONS.filter(question => question.scopes.includes(scope)
      && (question.key === "participation.permission" || question.key === "participation.minimum_age" || question.key === "participation.accessibility"))];
  return candidates.filter((question, index) => candidates.findIndex(item => item.key === question.key) === index
    && !visible.some(item => item.key === question.key));
}

/** Presentation only: original fields, permissions and append-only writers stay
 * authoritative. Every non-profile key has exactly one navigation destination. */
export const SHARED_AUTHORING_STEPS = ["hours", "price", "offering", "context", "objective", "amenities"] as const;
export function getSpotCareSteps(category: unknown, guidance?: Parameters<typeof getAuthoringFieldsForContext>[2]) {
  const discovery = AUTHORING_STEPS.find(step => step.id === "discovery")!;
  const sharedKeys = [...new Set(["experience.profile", ...SHARED_AUTHORING_STEPS.flatMap(id => getAuthoringFieldsForContext(id, category, guidance).map(field => field.attributeKey))])];
  return AUTHORING_STEPS.filter(step => ["basics", "classification", "discovery", "review"].includes(step.id)).flatMap(step => step.id === "discovery" ? [
    step,
    {...discovery, id:"areas", attributeKeys:["experience.profile"]},
    {...discovery, id:"shared", attributeKeys:sharedKeys},
  ] : [step]);
}

/** The first screen asks only what distinguishes this service. Other supported
 * details and all historical answers remain editable in a disclosure. */
export function experienceQuestionSections(category: ExperienceCategory, scope: ExperienceScope, offerKind?: string, areaKind?: string, existingAnswers: Readonly<Record<string,unknown>> = {}) {
  const questions = getExperienceAuthoringQuestions(category, scope, offerKind, areaKind, existingAnswers);
  const primaryKeys = new Set(scope === "AREA" ? ["location.setting", "amenity.step_free", "amenity.stroller", ...(areaKind === "POOL_AREA" ? ["offer.temperature"] : [])] : scope === "SPOT" ? questions.map(question => question.key) : [
    "participation.booking", "participation.age_suitability", "participation.minimum_age",
    ...(offerKind === "OTHER" ? ["experience.activity"] : []),
    ...(hasOfferModule(offerKind ?? "", "instructed") ? ["participation.language", "participation.group_access", "time.duration", "offer.capacity"] : []),
    ...(hasOfferModule(offerKind ?? "", "sport") ? ["sport.level", "sport.equipment", "sport.rental", "sport.induction", "participation.prerequisite"] : []),
    ...(hasOfferModule(offerKind ?? "", "play") ? ["sport.level"] : []),
    ...(offerKind === "PRIVATE_CELEBRATION" ? ["experience.activity", "offer.capacity", "time.duration"] : []),
    ...(hasOfferModule(offerKind ?? "", "food") && offerKind !== "PRIVATE_CELEBRATION" ? ["food.diet", "food.meal_extent"] : []),
    ...(hasOfferModule(offerKind ?? "", "stay") ? ["stay.check_in", "stay.check_out", "stay.minimum_nights", "stay.maximum_occupancy", "stay.meal_inclusion"] : []),
  ]);
  return {primary:questions.filter(question => primaryKeys.has(question.key)), additional:questions.filter(question => !primaryKeys.has(question.key))};
}

export function categoryOfferChoices(category: ExperienceCategory) {
  const offers = EXPERIENCE_TEMPLATES[category].offers.filter(offer => offer.kind !== "GASTRONOMY");
  // Play parks and sports venues can sell a distinct birthday package without
  // suggesting celebration services at every museum or unrelated venue type.
  return ["ACTIVITIES_PLAY", "SPORT", "SPORT_MOVEMENT"].includes(category) && !offers.some(offer => offer.kind === "PRIVATE_CELEBRATION")
    ? [...offers, {kind:"PRIVATE_CELEBRATION",label:"Private Feier"}] : offers;
}

export type SimpleOfferSetting = "UNKNOWN" | "INDOOR" | "OUTDOOR" | "BOTH";
const simpleArea = (area: ExperienceArea) => /^setting-(?:indoor|outdoor)(?:-\d+)?$/.test(area.id)
  && area.name === (area.kind === "INDOOR" ? "Innenbereich" : "Aussenbereich")
  && ["INDOOR", "OUTDOOR"].includes(area.kind) && area.properties.length === 1
  && area.properties[0]?.key === "location.setting" && area.properties[0].state === "KNOWN"
  && area.properties[0].value === (area.kind === "INDOOR" ? "drinnen" : "draussen")
  && JSON.stringify(area.properties[0].conditions) === JSON.stringify(emptyExperienceConditions());
export function simpleOfferSetting(profile: ExperienceProfile, offerId: string): SimpleOfferSetting | null {
  const offer = profile.offers.find(item => item.id === offerId);
  if (!offer) return null;
  const areas = offer.areaIds.map(id => profile.areas.find(area => area.id === id));
  if (areas.some(area => !area || !simpleArea(area))) return null;
  return areas.length === 0 ? "UNKNOWN" : areas.some(area => area?.kind === "INDOOR") && areas.some(area => area?.kind === "OUTDOOR") ? "BOTH" : areas[0]?.kind === "INDOOR" ? "INDOOR" : "OUTDOOR";
}
/** Explicit visitor-area answer, stored through the existing offer/area contract.
 * Never replace a named/custom area, delete an area, infer access or copy hours. */
export function setSimpleOfferSetting(profile: ExperienceProfile, offerId: string, setting: SimpleOfferSetting): ExperienceProfile {
  if (!["UNKNOWN", "INDOOR", "OUTDOOR", "BOTH"].includes(setting)) throw new Error("offer_setting_invalid");
  if (simpleOfferSetting(profile, offerId) === null) throw new Error("offer_setting_requires_area_review");
  const areas = [...profile.areas];
  const kinds = setting === "BOTH" ? ["INDOOR", "OUTDOOR"] : setting === "UNKNOWN" ? [] : [setting];
  const ids = kinds.map(kind => {
    const existing = areas.find(area => area.kind === kind && simpleArea(area));
    if (existing) return existing.id;
    if (areas.length >= 30) throw new Error("experience_area_limit");
    const prefix = `setting-${kind.toLowerCase()}`;
    let id = prefix;
    for (let n = 2; areas.some(area => area.id === id); n++) id = `${prefix}-${n}`;
    areas.push({id, kind, name:kind === "INDOOR" ? "Innenbereich" : "Aussenbereich", properties:[{key:"location.setting", label:null, state:"KNOWN", value:kind === "INDOOR" ? "drinnen" : "draussen", conditions:emptyExperienceConditions()}]});
    return id;
  });
  return {...profile, reviewed:false, areas, offers:profile.offers.map(offer => offer.id === offerId ? {...offer, areaIds:ids} : offer)};
}
