import {
  canonicalJson, parseExperienceProfile, parseWorldResearchBatch, validateAuthoringSubmission,
  type ExperienceProfile, type ExperienceProperty, type WorldResearchBatchDocument,
  type WorldResearchClaim, type WorldResearchSource,
} from "@backyrd/world-knowledge-core";
import type { NuknukDraft, ResearchResult } from "./nuknukResearchDraft";

const sameName = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("de-CH");
const same = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);

function mergeProperties(existing: readonly ExperienceProperty[], incoming: readonly ExperienceProperty[]): ExperienceProperty[] {
  const result = [...existing];
  for (const property of incoming) {
    const previous = result.find(item => item.key === property.key && same(item.conditions, property.conditions));
    if (previous && !same(previous, property)) throw new Error("Ein recherchiertes Merkmal widerspricht einer vorhandenen Angabe. Bitte im Profil-Editor prüfen.");
    if (!previous) result.push(property);
  }
  return result;
}

/** Supplement a partial research result. Never remove existing entities, links or details. */
export function mergeResearchProfile(current: unknown, incoming: unknown): ExperienceProfile {
  const proposed = parseExperienceProfile(incoming, false);
  if (current === undefined || current === null) return parseExperienceProfile({ ...proposed, reviewed: true });
  const existing = parseExperienceProfile(current, false);
  if (existing.category !== proposed.category) throw new Error("Die Profilkategorie hat sich geändert. Bitte zuerst im Profil-Editor abgleichen.");
  const areas = [...existing.areas];
  const areaIds = new Map<string, string>();
  for (const area of proposed.areas) {
    const matches = areas.filter(item => item.kind === area.kind && sameName(item.name) === sameName(area.name));
    if (matches.length > 1 || areas.some(item => item.id === area.id && !matches.includes(item))) throw new Error("Ein Bereich lässt sich nicht eindeutig zuordnen. Bitte im Profil-Editor prüfen.");
    const previous = matches[0];
    areaIds.set(area.id, previous?.id ?? area.id);
    if (!previous) areas.push(area);
    else areas[areas.indexOf(previous)] = { ...previous, properties: mergeProperties(previous.properties, area.properties) };
  }
  const offers = [...existing.offers];
  for (const offer of proposed.offers) {
    const matches = offers.filter(item => item.kind === offer.kind && sameName(item.name) === sameName(offer.name));
    if (matches.length > 1 || offers.some(item => item.id === offer.id && !matches.includes(item))) throw new Error("Ein Angebot lässt sich nicht eindeutig zuordnen. Bitte im Profil-Editor prüfen.");
    const linked = offer.areaIds.map(id => areaIds.get(id) ?? (areas.some(area => area.id === id) ? id : null));
    if (linked.some(id => id === null)) throw new Error("Eine Angebotszuordnung verweist auf einen unbekannten Bereich.");
    const areaLinks = linked.filter((id): id is string => id !== null);
    const previous = matches[0];
    if (!previous) { offers.push({ ...offer, areaIds: areaLinks }); continue; }
    for (const key of ["prices", "schedule"] as const) {
      if (previous[key].length && offer[key].length && !same(previous[key], offer[key])) throw new Error("Preise oder Zeiten weichen vom vorhandenen Angebot ab. Bitte im Profil-Editor prüfen.");
    }
    for (const key of ["validFrom", "validUntil"] as const) {
      if (previous[key] && offer[key] && previous[key] !== offer[key]) throw new Error("Die Gültigkeit des Angebots muss im Profil-Editor geprüft werden.");
    }
    offers[offers.indexOf(previous)] = {
      ...previous, properties: mergeProperties(previous.properties, offer.properties),
      areaIds: [...new Set([...previous.areaIds, ...areaLinks])],
      prices: offer.prices.length ? offer.prices : previous.prices,
      schedule: offer.schedule.length ? offer.schedule : previous.schedule,
      validFrom: offer.validFrom ?? previous.validFrom, validUntil: offer.validUntil ?? previous.validUntil,
    };
  }
  return parseExperienceProfile({ ...existing, areas, offers,
    properties: mergeProperties(existing.properties, proposed.properties), reviewed: true });
}

function sourcesFor(result: ResearchResult, officialWebsite: unknown): WorldResearchSource[] {
  if (!result.citations?.length || result.citations.length > 30) throw new Error("Ein vollständiger Quellenbeleg fehlt oder umfasst zu viele Einzelbelege. Bitte im Profil-Editor prüfen.");
  let officialHost: string;
  try { officialHost = new URL(String(officialWebsite)).hostname.replace(/^www\./, ""); }
  catch { throw new Error("Bitte zuerst die offizielle Website des Spots bestätigen."); }
  return result.citations.map(citation => {
    if (new URL(citation.url).hostname.replace(/^www\./, "") !== officialHost) throw new Error("Ein Beleg stammt nicht von der bestätigten offiziellen Website. Bitte im Profil-Editor prüfen.");
    if (!citation.observedAt) throw new Error("Der Abrufzeitpunkt des Belegs fehlt. Bitte den ursprünglichen Recherchebericht erneut laden.");
    return { url: citation.url, evidence: citation.evidence, observedAt: citation.observedAt, trust: "OFFICIAL_PRIMARY" };
  });
}

export function supplementResearchValue(attributeKey: string, existing: { knowledgeState: string; value: unknown } | undefined, incoming: unknown): unknown {
  if (attributeKey === "experience.profile") return mergeResearchProfile(existing?.value, incoming);
  if (attributeKey === "hours.regular" && existing?.knowledgeState === "KNOWN_VALUE") {
    const proposed = validateAuthoringSubmission(attributeKey, "KNOWN_VALUE", incoming);
    const previous = validateAuthoringSubmission(attributeKey, "KNOWN_VALUE", existing.value);
    if (!proposed.ok || !previous.ok || !Array.isArray(proposed.value) || !Array.isArray(previous.value)) throw new Error("Der Wochenplan muss im Profil-Editor geprüft werden.");
    const days = new Map(proposed.value.map(day => [day.day, day]));
    return [...previous.value.filter(day => !days.has(day.day)), ...proposed.value];
  }
  return incoming;
}

export function prepareNuknukDraftImport(draft: NuknukDraft, current: WorldResearchBatchDocument, reviewedKeys: readonly string[]) {
  const spot = current.batch.spots[0];
  if (current.batch.spots.length !== 1 || !spot || spot.spotId !== draft.spotId) throw new Error("Der Recherchebericht gehört nicht zum ausgewählten bestehenden Spot.");
  if (new Set(draft.results.map(item => item.attributeKey)).size !== draft.results.length) throw new Error("Der Bericht enthält ein Feld mehrfach.");
  if (!reviewedKeys.length || reviewedKeys.some(key => !draft.results.some(item => item.attributeKey === key && item.value !== undefined && item.status === "REQUIRES_REVIEW"))) {
    throw new Error("Bitte wähle mindestens eine belegte und inhaltlich geprüfte Angabe aus.");
  }
  const claims: WorldResearchClaim[] = [];
  const unresolved: Array<{ attributeKey: string; reason: string }> = [];
  const held: Array<{ attributeKey: string; reason: string }> = [];
  for (const result of draft.results) {
    if (!reviewedKeys.includes(result.attributeKey)) continue;
    try {
      const selectedWebsite = reviewedKeys.includes("contact.website") ? draft.results.find(item => item.attributeKey === "contact.website")?.value : undefined;
      const sources = sourcesFor(result, selectedWebsite ?? spot.existingValues["contact.website"]?.value);
      const value = supplementResearchValue(result.attributeKey, spot.existingValues[result.attributeKey], result.value);
      const claim: WorldResearchClaim = { attributeKey: result.attributeKey, knowledgeState: "KNOWN_VALUE", value,
        source: sources[0]!, ...(sources.length > 1 ? { supportingSources: sources.slice(1) } : {}) };
      // Apply the identical transport/field checks to each proposed field, without writes.
      const check = { ...current, research: { ...current.research, spots: [{ spotId: spot.spotId, claims: [claim], unresolved: [] }] } };
      parseWorldResearchBatch(check);
      claims.push(claim);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Diese Angabe konnte nicht für den Import vorbereitet werden.";
      held.push({ attributeKey: result.attributeKey, reason });
    }
  }
  // Native error codes remain in the original saved report. The import contains a safe explanation.
  for (const result of draft.results.filter(item => item.status === "UNRESOLVED")) {
    unresolved.push({ attributeKey: result.attributeKey, reason: "Im Recherchelauf nicht ausreichend belegt; vorhandenes Wissen bleibt unverändert." });
  }
  for (const item of held) unresolved.push({ attributeKey: item.attributeKey, reason: "Bitte anhand des Originalberichts im Profil-Editor prüfen; kein automatischer Ersatz." });
  const document = { ...current, research: { ...current.research, spots: [{ spotId: spot.spotId, claims, unresolved }] } };
  parseWorldResearchBatch(document);
  return { document, held };
}

export type DraftProfileAnswer = { claimId?: string; knowledgeState?: string; value?: unknown; visibility?: string };
export type DraftReviewField = { attributeKey: string; covered: boolean; claimId: string | null; currentValue?: unknown };

/** Coverage is a read-back fact, not a claim that a user accepted every proposal. */
export function assessNuknukDraftReview(draft: NuknukDraft, answers: Record<string, DraftProfileAnswer>): DraftReviewField[] {
  return draft.results.filter(result => result.status === "REQUIRES_REVIEW" && result.value !== undefined).map(result => {
    const candidate = answers[result.attributeKey];
    const answer = candidate?.visibility === "PUBLIC" ? candidate : undefined;
    let covered = false;
    if (answer?.claimId && answer.visibility === "PUBLIC" && answer.knowledgeState === "KNOWN_VALUE") {
      try {
        if (Array.isArray(result.value) && result.value.length > 0 && result.value.every(item => typeof item === "string") && Array.isArray(answer.value)) {
          covered = result.value.every(item => (answer.value as unknown[]).includes(item));
        } else covered = same(supplementResearchValue(result.attributeKey, answer as { knowledgeState: string; value: unknown }, result.value), answer.value);
      } catch { /* An unresolved merge is a difference for human review. */ }
    }
    return { attributeKey: result.attributeKey, covered, claimId: answer?.claimId ?? null, currentValue: answer?.value };
  });
}

export function finishNuknukDraftReview(draft: NuknukDraft, answers: Record<string, DraftProfileAnswer>, kept: Record<string, unknown>) {
  const fields = assessNuknukDraftReview(draft, answers);
  if (Object.keys(kept).some(key => !fields.some(field => field.attributeKey === key))) throw new Error("Die Abschlussauswahl enthält ein fremdes Feld.");
  const pending = fields.filter(field => !field.covered && (!Object.hasOwn(kept, field.attributeKey) || kept[field.attributeKey] !== field.claimId));
  return { pending: pending.map(field => field.attributeKey), decisions: fields.map(field => ({
    attributeKey: field.attributeKey, claimId: field.claimId,
    outcome: field.covered ? "PROFILE_VERIFIED" : Object.hasOwn(kept,field.attributeKey) && kept[field.attributeKey] === field.claimId ? field.claimId ? "KEPT_PROFILE" : "DECLINED" : "PENDING",
  })) };
}
