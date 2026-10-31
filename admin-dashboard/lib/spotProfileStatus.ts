import {
  AUTHORING_STEPS, getAuthoringFieldsForContext, evaluateAuthoringReadiness,
  parseExperienceProfile, validateAuthoringSubmission,
  type ExperienceProfile, type ExperienceProperty,
} from "@backyrd/world-knowledge-core/browser";
import { getExperienceAuthoringQuestions } from "@backyrd/world-knowledge-authoring-ui/experience-authoring";

export type ProfileCheck = { id: string; label: string; complete: boolean };
export type ProfileSection = { id: string; label: string; checks: ProfileCheck[] };
export type ProfileCompleteness = {
  version: "profile-coverage-v1";
  percent: number;
  completed: number;
  total: number;
  sections: ProfileSection[];
};
export type SpotProfileStatus = {
  label: string; detail: string; state: "available" | "attention" | "unavailable";
  completeness?: ProfileCompleteness;
};
type Answer = { knowledgeState: string; value: unknown; visibility?: string; validUntil?: string | null };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
// Extra social channels and volatile/derived/subjective data are not prerequisites
// for a complete factual profile. In particular, no Mood or review is required.
const unscored = new Set([
  "discovery.profile", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok",
  "location.neighborhood", "state.current", "hours.special", "hours.kitchen_special",
  "context.visit_situations", "context.atmosphere", "context.typical_dayparts",
]);
// A scoped profile replaces these older flat summaries; requiring both would
// report already-researched offer details as missing a second time.
const scopedReplacements = new Set([
  "offering.cuisines", "offering.food_specialities", "offering.groups",
  "operation.service_model", "operation.service_format", "offering.onsite",
]);
const meaningful = (value: unknown): boolean => {
  if (typeof value === "string") return value.trim().length > 0 && value !== "UNKNOWN";
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0 && value.every(meaningful);
  if (record(value)) return Object.entries(value).some(([key, item]) => !["conditions", "contractVersion"].includes(key) && meaningful(item));
  return false;
};
const usable = (answer: Answer | undefined, now: number): boolean => !!answer
  && ["KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE"].includes(answer.knowledgeState)
  && (!answer.visibility || answer.visibility === "PUBLIC")
  && (!answer.validUntil || Date.parse(answer.validUntil) > now)
  && meaningful(answer.value);

/** Saved profile coverage, not confidence, popularity or publication eligibility. */
function coverage(answers: Record<string, Answer>, allowed: string[], conflicts: Set<string>, now: number): ProfileCompleteness {
  const known = (key: string) => usable(answers[key], now) && !conflicts.has(key)
    && validateAuthoringSubmission(key, answers[key].knowledgeState, answers[key].value).ok
    // A structured rule containing a still-unknown sub-answer is only partial.
    && (key === "experience.profile" || !JSON.stringify(answers[key].value).includes('"UNKNOWN"'));
  let profile: ExperienceProfile | null = null;
  if (known("experience.profile")) {
    try { profile = parseExperienceProfile(answers["experience.profile"].value); } catch { /* Invalid/unreviewed is an open task. */ }
  }
  const guidance = { placeTypes: answers["classification.place_types"]?.value, onsiteOfferings: answers["offering.onsite"]?.value };
  const category = answers["classification.primary_category"]?.value;
  const sectionLabels: Record<string, string> = {
    basics: "Grunddaten und Kontakt", classification: "Art des Ortes", discovery: "Angebote und Bereiche",
    offering: "Küche und Service", objective: "Nutzung und Besuch", amenities: "Zugang und Ausstattung", context: "Besuch",
  };
  const sections: ProfileSection[] = AUTHORING_STEPS.filter(step => step.id !== "review").map(step => ({
    id: step.id,
    label: sectionLabels[step.id] ?? step.title,
    checks: getAuthoringFieldsForContext(step.id, category, guidance)
      .filter(field => allowed.includes(field.attributeKey) && !unscored.has(field.attributeKey) && !(profile && scopedReplacements.has(field.attributeKey)))
      .map(field => {
        const key = field.attributeKey;
        // An incomplete week must not look complete. Explicit closed days count;
        // missing days never become closed through the completeness calculation.
        const value = answers[key]?.value;
        const weekComplete = !["hours.regular", "hours.kitchen"].includes(key) || (Array.isArray(value)
          && new Set(value.filter(record).map(row => row.day)).size === 7);
        return { id: key, label: field.label, complete: known(key) && weekComplete };
      }),
  }));
  const experience = sections.find(section => section.id === "discovery");
  if (experience && allowed.includes("experience.profile")) {
    // Even a reviewed empty object does not describe what can be experienced.
    const base = experience.checks.find(check => check.id === "experience.profile");
    if (base) base.complete = !!profile && profile.offers.length > 0;
    if (profile) {
      const addProperties = (prefix: string, name: string, questions: ReturnType<typeof getExperienceAuthoringQuestions>, properties: readonly ExperienceProperty[]) => {
        for (const question of questions) {
          const values = properties.filter(property => property.key === question.key);
          // Explicitly not applicable is an answered question. Unknown isn't.
          experience.checks.push({ id: `${prefix}:${question.key}`, label: `${name}: ${question.label}`,
            complete: values.length > 0 && values.every(property => property.state === "NOT_APPLICABLE" || (property.state === "KNOWN" && meaningful(property.value))) });
        }
      };
      // Count the same questions (and labels) the editor actually presents.
      // The storage catalogue also permits historical and differently scoped
      // answers; those must not create duplicate, unanswerable admin tasks.
      addProperties("spot", "Allgemein", getExperienceAuthoringQuestions(profile.category, "SPOT", undefined, undefined, answers), profile.properties);
      for (const offer of profile.offers) addProperties(`offer:${offer.id}`, offer.name, getExperienceAuthoringQuestions(profile.category, "OFFER", offer.kind, undefined, answers), offer.properties);
      for (const area of profile.areas) addProperties(`area:${area.id}`, area.name, getExperienceAuthoringQuestions(profile.category, "AREA", undefined, area.kind, answers), area.properties);
    }
  }
  const order = ["basics", "classification", "hours", "discovery", "offering", "price", "objective", "amenities", "context"];
  const relevant = sections.filter(section => section.checks.length > 0).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const checks = relevant.flatMap(section => section.checks);
  const completed = checks.filter(check => check.complete).length;
  // Never round an unfinished profile up to 100%.
  return { version: "profile-coverage-v1", percent: checks.length ? Math.floor(completed * 100 / checks.length) : 0, completed, total: checks.length, sections: relevant };
}

/** Same current authoring answers as the editor; never legacy Gold facts. */
export function spotProfileStatus(input: unknown, spotId: string, now = Date.now()): SpotProfileStatus {
  if (!record(input) || input.contractVersion !== "backyrd.world-knowledge.product-authoring-detail@1.0" || input.spotId !== spotId || !record(input.answers) || !record(input.actor) || !Array.isArray(input.actor.allowedAttributeKeys) || !input.actor.allowedAttributeKeys.every(key => typeof key === "string")) throw new Error("invalid_profile_status");
  const answers: Record<string, Answer> = {};
  for (const [key, value] of Object.entries(input.answers)) {
    if (!record(value) || typeof value.knowledgeState !== "string" || !("value" in value)) throw new Error("invalid_profile_answer");
    answers[key] = { knowledgeState: value.knowledgeState, value: value.value, visibility: typeof value.visibility === "string" ? value.visibility : undefined, validUntil: typeof value.validUntil === "string" ? value.validUntil : undefined };
  }
  const manifest = record(input.manifest) ? input.manifest : null;
  const snapshot = manifest && record(manifest.worldSnapshot) ? manifest.worldSnapshot : null;
  const conflicts = snapshot && Array.isArray(snapshot.conflicts) ? snapshot.conflicts : [];
  const conflictKeys = new Set(conflicts.filter(record).flatMap(conflict => [
    ...(typeof conflict.attributeKey === "string" ? [conflict.attributeKey] : []),
    ...(Array.isArray(conflict.attributeKeys) ? conflict.attributeKeys.filter((key): key is string => typeof key === "string") : []),
  ]));
  const allowed = input.actor.allowedAttributeKeys as string[];
  const completeness = coverage(answers, allowed, conflictKeys, now);
  if (!completeness.total) return { label: "Profilstand nicht verfügbar", detail: "Für dieses Profil sind keine auswertbaren Angaben verfügbar", state: "unavailable" };
  if (conflicts.length) return { label: `${conflicts.length} ${conflicts.length === 1 ? "Widerspruch" : "Widersprüche"} prüfen`, detail: "Gespeicherte Angaben widersprechen sich", state: "attention", completeness };
  const missing = evaluateAuthoringReadiness({ answers }).blocking.filter(issue => allowed.includes(issue.attributeKey));
  if (missing.length) return { label: `${missing.length} ${missing.length === 1 ? "Pflichtangabe" : "Pflichtangaben"} prüfen`, detail: missing[0].label, state: "attention", completeness };
  return { label: completeness.percent === 100 ? "Profilangaben vollständig" : "Profil ergänzen", detail: `${completeness.completed} von ${completeness.total} passenden Angaben ausgefüllt`, state: "available", completeness };
}
