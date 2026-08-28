import { isUserTasteConcept, SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const DECISION_EVIDENCE_ENVELOPE_VERSION = "backyrd-decision-evidence-envelope-v2";

const lower = (value) => String(value ?? "").trim().toLowerCase();
const unique = (values) => [...new Set(values.filter(Boolean))].sort();
const DAYPARTS = new Set(["morning", "afternoon", "evening", "night"]);
const SOCIAL_CONTEXTS = new Set(["solo", "date", "friends", "family", "family_with_kids", "work", "group"]);
const LEARNING_AUDIENCE = Object.freeze({
  solo: "solo",
  date: "date",
  friends: "friends",
  family: "family",
  family_with_kids: "family",
  work: "work",
  // The frozen User Card has no audience.group scope. Preserve the canonical
  // requested value below, but do not invent a new learning scope here.
  group: "other",
});
const factValue = (value) => value && typeof value === "object" && !Array.isArray(value) && "value" in value ? value.value : value;
const factAuthority = (value) => lower(value?.authority ?? value?.provenance);

function requestedDayparts(requestContext) {
  const fact = requestContext?.canonicalIntent?.currentRequestFacts?.dayparts;
  const rows = Array.isArray(fact) ? fact : fact?.value;
  return unique((Array.isArray(rows) ? rows : []).map(lower).filter((value) => DAYPARTS.has(value)));
}

function requestedSocialContext(requestContext, currentMoment) {
  const facts = requestContext?.canonicalIntent?.currentRequestFacts ?? currentMoment?.currentRequestFacts ?? {};
  const family = lower(factValue(facts.familyContext));
  const candidates = [
    requestContext?.canonicalIntent?.socialContext,
    factValue(facts.socialContext),
    currentMoment?.fields?.social_context?.value,
    family === "family_with_child" ? "family_with_kids" : null,
  ];
  return candidates.map(lower).find((value) => SOCIAL_CONTEXTS.has(value)) ?? null;
}

function requestedChildAge(requestContext, currentMoment) {
  const fact = requestContext?.canonicalIntent?.currentRequestFacts?.childAge ?? currentMoment?.currentRequestFacts?.childAge;
  const value = Number(factValue(fact));
  if (!Number.isInteger(value) || value < 0 || value > 120) return null;
  return factAuthority(fact) === "explicit" ? value : null;
}

function ambientDaypart(currentMoment) {
  const value = lower(currentMoment?.fields?.daypart?.value);
  return DAYPARTS.has(value) ? value : null;
}

function requestedConcepts(requestContext) {
  return unique((requestContext?.canonicalIntent?.conceptDirections ?? [])
    .filter((row) => Number(row?.direction) > 0 && typeof row?.concept === "string")
    .map((row) => row.concept));
}

/**
 * Builds a bounded, immutable learning envelope from the already-frozen
 * Decision package. It is not ranking input and never changes the package.
 */
export function buildDecisionEvidenceEnvelope(decisionPackage, requestContext = {}) {
  const currentMoment = decisionPackage?.n3?.currentMoment;
  if (!decisionPackage?.decisionId || !decisionPackage?.userId || !currentMoment) {
    throw new Error("decision_evidence_envelope_source_invalid");
  }
  const dayparts = requestedDayparts(requestContext);
  const ambient = ambientDaypart(currentMoment);
  const socialContext = requestedSocialContext(requestContext, currentMoment);
  const audience = LEARNING_AUDIENCE[socialContext] ?? null;
  const childAge = requestedChildAge(requestContext, currentMoment);
  const placeTypes = unique([
    ...(requestContext?.canonicalIntent?.requiredPlaceTypes ?? []),
    ...(requestContext?.canonicalIntent?.preferredPlaceTypes ?? []),
  ].map(lower));
  const momentSignature = {
    ...(audience ? { audience } : {}),
    // Explicit requested time is authoritative; the execution clock remains
    // separately auditable and can never silently replace it.
    ...(dayparts[0] ? { daypart: dayparts[0] } : {}),
    ...(placeTypes.length === 1 ? { placeType: placeTypes[0] } : {}),
  };
  const requestedContext = {
    city: lower(currentMoment.fields?.city?.value) || null,
    socialContext,
    ...(childAge !== null ? { childAge } : {}),
    requestedDayparts: dayparts,
    concepts: requestedConcepts(requestContext),
  };
  const candidates = decisionPackage.candidates.map(({ spotId, n4 }) => ({
    spotId,
    n4SnapshotHash: n4.snapshotHash,
    n4SnapshotIdentity: n4.snapshotIdentity,
    availability: n4.availability,
    placeType: n4.placeType,
    tasteConcepts: n4.concepts
      .filter((row) => isUserTasteConcept(row.concept))
      .map((row) => ({ concept: row.concept, confidence: row.confidence, presence: row.presence })),
    suitabilityContext: n4.suitabilityFacts,
  }));
  return {
    version: DECISION_EVIDENCE_ENVELOPE_VERSION,
    decisionId: decisionPackage.decisionId,
    userId: decisionPackage.userId,
    momentHash: decisionPackage.n3.momentHash,
    packageHash: decisionPackage.packageHash,
    semanticContractVersion: decisionPackage.contractIdentities?.semantics ?? SEMANTIC_CONTRACT_VERSION,
    momentSignature,
    requestedContext,
    ambientContext: { observedDaypart: ambient },
    candidates,
  };
}
