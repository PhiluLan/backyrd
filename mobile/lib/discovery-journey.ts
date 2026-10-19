import type { DecisionProductCandidate } from "@backyrd/product-decision-contract";
import { presentMomentTags } from "./moment-presentation";

/** A new, editable wish from explicitly selected atmosphere; never a claimed venue fact. */
export function atmosphereWish(moods: readonly string[], city?: string | null, category?: string | null) {
  const labels = presentMomentTags([...moods]).slice(0, 2).map(label => label.slice(0, 60));
  const place = city?.trim().slice(0, 80);
  const kind = category?.trim();
  const readableKind = kind && !/^[A-Z_]+$/.test(kind) ? kind.slice(0, 80) : "einen Ort";
  return `Ich suche einen Ort${readableKind !== "einen Ort" ? ` (${readableKind})` : ""}${labels.length ? ` mit dieser Atmosphäre: ${labels.join(", ")}` : ""}${place ? ` in ${place}` : ""}.`;
}

export type JourneySelection = {
  actorId: string;
  decisionId: string;
  spotId: string;
  wish: string;
  recommendation: string;
  notes: string[];
  selectedAt: number;
};
const MAX_CONTEXT_AGE_MS = 30 * 60_000;
let selection: JourneySelection | null = null;

/** Memory-only. No wish or explanation is written to URLs, disk or analytics. */
export function rememberJourneySelection(input: JourneySelection) { selection = input; }
export function clearJourneySelection() { selection = null; }
export function journeySelectionFor(spotId: string, actorId: string | null, decisionOrigin: boolean, now = Date.now()) {
  if (!selection || !actorId || !decisionOrigin || selection.actorId !== actorId || selection.spotId !== spotId || now - selection.selectedAt < 0 || now - selection.selectedAt > MAX_CONTEXT_AGE_MS) return null;
  return selection;
}

export function canCarryPlaceRecommendation(candidate: DecisionProductCandidate) {
  return !candidate.presentation.event && candidate.rank !== null && !candidate.contextualReject;
}
