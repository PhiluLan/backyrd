import { getExperienceQuestions, type ExperienceCategory, type ExperienceQuestion, type ExperienceScope } from "@backyrd/world-knowledge-core";

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
};

export function getExperienceAuthoringQuestions(category: ExperienceCategory, scope: ExperienceScope, offerKind?: string, areaKind?: string, existingAnswers: Readonly<Record<string,unknown>> = {}): readonly ExperienceQuestion[] {
  const amenities=existingAnswers["amenity.features"];
  const existingFeatures=amenities && typeof amenities==="object" && "knowledgeState" in amenities && amenities.knowledgeState==="KNOWN_VALUE" && "value" in amenities && Array.isArray(amenities.value) ? amenities.value : [];
  const sharedFeatures: Readonly<Record<string,string>>={"amenity.toilet":"TOILET","amenity.changing_table":"CHANGING_TABLE","amenity.parking":"PARKING"};
  return getExperienceQuestions(category, scope, offerKind, areaKind)
    .filter(question => (!(question.key in primaryScope) || primaryScope[question.key] === scope) && !(scope==="SPOT" && existingFeatures.includes(sharedFeatures[question.key])))
    .map(question => ({ ...question, label:
      question.key === "amenity.step_free" ? "Ist dieser Bereich stufenlos erreichbar?" :
      question.key === "amenity.stroller" ? "Ist dieser Bereich mit Kinderwagen zugänglich?" :
      question.key === "offer.feature" ? "Ausstattung in diesem Bereich" :
      question.key === "amenity.toilet" ? "Gibt es ein WC am Spot?" :
      question.key === "amenity.changing_table" ? "Gibt es einen Wickeltisch am Spot?" : question.label,
    }));
}
