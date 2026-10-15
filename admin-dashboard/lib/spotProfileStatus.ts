import { evaluateAuthoringReadiness, parseExperienceProfile } from "@backyrd/world-knowledge-core";

export type SpotProfileStatus = { label: string; detail: string; state: "available" | "attention" | "unavailable" };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
/** Summarize the same current authoring answers as the editor, never legacy Gold facts. */
export function spotProfileStatus(input: unknown, spotId: string): SpotProfileStatus {
  if (!record(input) || input.contractVersion !== "backyrd.world-knowledge.product-authoring-detail@1.0" || input.spotId !== spotId || !record(input.answers) || !record(input.actor) || !Array.isArray(input.actor.allowedAttributeKeys)) throw new Error("invalid_profile_status");
  const answers: Record<string, {knowledgeState: string; value: unknown}> = {};
  for (const [key, value] of Object.entries(input.answers)) {
    if (!record(value) || typeof value.knowledgeState !== "string" || !("value" in value)) throw new Error("invalid_profile_answer");
    answers[key] = {knowledgeState: value.knowledgeState, value: value.value};
  }
  const manifest = record(input.manifest) ? input.manifest : null;
  const snapshot = manifest && record(manifest.worldSnapshot) ? manifest.worldSnapshot : null;
  const conflicts = snapshot && Array.isArray(snapshot.conflicts) ? snapshot.conflicts.length : 0;
  if (conflicts) return {label:`${conflicts} ${conflicts === 1 ? "Widerspruch" : "Widersprüche"} prüfen`,detail:"Gespeicherte Angaben widersprechen sich",state:"attention"};
  const allowed = input.actor.allowedAttributeKeys;
  const missing = evaluateAuthoringReadiness({answers}).blocking.filter(issue => allowed.includes(issue.attributeKey));
  if (missing.length) return {label: `${missing.length} ${missing.length === 1 ? "Pflichtangabe" : "Pflichtangaben"} prüfen`, detail: missing[0].label, state:"attention"};
  let offers = 0;
  if (answers["experience.profile"]?.knowledgeState === "KNOWN_VALUE") {
    try { offers = parseExperienceProfile(answers["experience.profile"].value, false).offers.length; }
    catch { return {label:"Angebote prüfen",detail:"Gespeichertes Angebotsprofil nicht lesbar",state:"attention"}; }
  }
  return {label:"Grunddaten vorhanden",detail:offers ? `${offers} ${offers === 1 ? "Angebot" : "Angebote"} erfasst` : "Noch keine Angebote erfasst",state:"available"};
}
