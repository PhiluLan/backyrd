import { isUserTasteConcept, SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const DECISION_EVIDENCE_ENVELOPE_VERSION = "backyrd-decision-evidence-envelope-v1";

const lower = (value) => String(value ?? "").trim().toLowerCase();
const unique = (values) => [...new Set(values.filter(Boolean))].sort();
const DAYPARTS = new Set(["morning", "afternoon", "evening", "night"]);
const AUDIENCES = new Set(["solo", "date", "friends", "family", "work", "other"]);

function requestedDayparts(requestContext) {
  const fact = requestContext?.canonicalIntent?.currentRequestFacts?.dayparts;
  const rows = Array.isArray(fact) ? fact : fact?.value;
  return unique((Array.isArray(rows) ? rows : []).map(lower).filter((value) => DAYPARTS.has(value)));
}

function requestedAudience(requestContext, currentMoment) {
  const canonical = lower(requestContext?.canonicalIntent?.socialContext);
  if (AUDIENCES.has(canonical)) return canonical;
  const moment = lower(currentMoment?.fields?.social_context?.value);
  return AUDIENCES.has(moment) ? moment : null;
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
  const audience = requestedAudience(requestContext, currentMoment);
  const placeTypes = unique([
    ...(requestContext?.canonicalIntent?.requiredPlaceTypes ?? []),
    ...(requestContext?.canonicalIntent?.preferredPlaceTypes ?? []),
  ].map(lower));
  const momentSignature = {
    ...(audience ? { audience } : {}),
    // Explicit requested time is authoritative; the execution clock remains
    // separately auditable and can never silently replace it.
    ...(dayparts[0] ? { daypart: dayparts[0] } : ambient ? { daypart: ambient } : {}),
    ...(placeTypes.length === 1 ? { placeType: placeTypes[0] } : {}),
  };
  const requestedContext = {
    city: lower(currentMoment.fields?.city?.value) || null,
    socialContext: audience,
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
