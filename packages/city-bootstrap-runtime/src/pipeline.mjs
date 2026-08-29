import { pointInCity } from "./config.mjs";
import { candidateIdentityKey, distanceMeters, normalizeText, sha256 } from "./normalization.mjs";
import { classifyRelevance } from "./relevance.mjs";
import { resolveIdentity } from "./identity.mjs";

export function normalizeDiscoveredCandidate(row, config) {
  if (!row?.name || !Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) throw new Error("candidate_identity_invalid");
  if (!pointInCity(config, Number(row.lat), Number(row.lng))) throw new Error("candidate_outside_geography");
  const relevance = row.relevance ?? classifyRelevance(row.externalTypes);
  const candidate = { sourceFamily: row.sourceFamily, sourceIdentity: row.sourceIdentity, googlePlaceId: row.googlePlaceId ?? null, name: String(row.name).trim(), address: row.address ? String(row.address).trim() : null, city: config.name, country: config.country, lat: Number(row.lat), lng: Number(row.lng), website: row.website ?? null, phone: row.phone ?? null, externalTypes: [...new Set(row.externalTypes ?? [])], relevance };
  return Object.freeze({ ...candidate, normalizedName: normalizeText(candidate.name), normalizedAddress: normalizeText(candidate.address), identityKey: candidateIdentityKey(candidate), sourceFingerprint: row.sourceFingerprint ?? sha256(candidate), sourceQuality: (candidate.website ? 2 : 0) + (candidate.address ? 1 : 0) + (candidate.googlePlaceId ? 2 : 0) });
}

export function reconcileCandidates(rows) {
  const byIdentity = new Map();
  for (const row of rows) {
    const existing = byIdentity.get(row.identityKey);
    if (!existing) { byIdentity.set(row.identityKey, row); continue; }
    byIdentity.set(row.identityKey, Object.freeze({ ...existing, googlePlaceId: existing.googlePlaceId ?? row.googlePlaceId, website: existing.website ?? row.website, phone: existing.phone ?? row.phone, address: existing.address ?? row.address, externalTypes: [...new Set([...existing.externalTypes, ...row.externalTypes])], sourceQuality: Math.max(existing.sourceQuality, row.sourceQuality), discoverySources: [...new Set([...(existing.discoverySources ?? [existing.sourceFamily]), row.sourceFamily])] }));
  }
  return Object.freeze([...byIdentity.values()].sort((a, b) => a.identityKey.localeCompare(b.identityKey)));
}

export function attachEphemeralGoogleIdentities(retainableCandidates, googleRows) {
  const linked = [], ambiguous = [], unmatched = [];
  const candidates = retainableCandidates.map((row) => ({ ...row }));
  for (const google of googleRows) {
    const value = google.ephemeral;
    const matches = candidates.filter((candidate) => normalizeText(candidate.name) === normalizeText(value.name) && Number.isFinite(value.lat) && Number.isFinite(value.lng) && distanceMeters(candidate, { lat: value.lat, lng: value.lng }) <= 60);
    if (matches.length === 1 && !matches[0].googlePlaceId) { matches[0].googlePlaceId = google.googlePlaceId; linked.push({ placeId: google.googlePlaceId, identityKey: matches[0].identityKey }); }
    else if (matches.length > 1) ambiguous.push({ placeId: google.googlePlaceId, candidateIdentityKeys: matches.map((row) => row.identityKey) });
    else unmatched.push(google.googlePlaceId);
  }
  return Object.freeze({ candidates: Object.freeze(candidates.map(Object.freeze)), linked: Object.freeze(linked), ambiguous: Object.freeze(ambiguous), unmatched: Object.freeze(unmatched) });
}

export function evaluateCandidate(candidate, existingSpots) {
  const identity = resolveIdentity(candidate, existingSpots);
  let lifecycleState = "IDENTITY_RESOLVED", reviewReason = null;
  if (candidate.relevance.state === "IRRELEVANT") lifecycleState = "REJECTED";
  else if (candidate.relevance.state === "AMBIGUOUS") { lifecycleState = "REVIEW_REQUIRED"; reviewReason = "RELEVANCE_AMBIGUOUS"; }
  else if (identity.state === "AMBIGUOUS" || identity.confidence === "POSSIBLE") { lifecycleState = "REVIEW_REQUIRED"; reviewReason = "IDENTITY_AMBIGUOUS"; }
  else lifecycleState = identity.state === "MATCHED_EXISTING" ? "IDENTITY_RESOLVED" : "EVIDENCE_PENDING";
  return Object.freeze({ ...candidate, identity, lifecycleState, reviewReason });
}

export function refreshDecision(previous, nextFingerprint, { stale = false, previousFailure = false, manualReview = false, pipelineChanged = false } = {}) {
  if (!previous) return Object.freeze({ process: true, reason: "NEW_CANDIDATE" });
  if (previous.sourceFingerprint !== nextFingerprint) return Object.freeze({ process: true, reason: "SOURCE_CHANGED" });
  if (stale) return Object.freeze({ process: true, reason: "FACT_FAMILY_STALE" });
  if (previousFailure) return Object.freeze({ process: true, reason: "RETRY_PREVIOUS_FAILURE" });
  if (manualReview) return Object.freeze({ process: true, reason: "MANUAL_REVIEW_REQUEST" });
  if (pipelineChanged) return Object.freeze({ process: true, reason: "PIPELINE_VERSION_CHANGED_RELEVANT_STAGE" });
  return Object.freeze({ process: false, reason: "UNCHANGED_SOURCE_SKIP" });
}

export function circuitBreaker(metrics, policy) {
  const failures = [];
  if (metrics.duplicateCreates > 0) failures.push("DUPLICATE_CREATION");
  if (metrics.fixtureLeakage > 0) failures.push("FIXTURE_LEAKAGE");
  if (metrics.canonicalUnauthorizedWrites > 0) failures.push("UNAUTHORIZED_CANONICAL_WRITE");
  if (metrics.processed >= policy.minimumSample && metrics.providerFailures / metrics.processed > policy.maxProviderFailureRate) failures.push("PROVIDER_FAILURE_SPIKE");
  if (metrics.processed >= policy.minimumSample && metrics.schemaFailures / metrics.processed > policy.maxSchemaFailureRate) failures.push("AI_SCHEMA_FAILURE_SPIKE");
  if (metrics.processed >= policy.minimumSample && metrics.reviewRequired / metrics.processed > policy.maxReviewRate) failures.push("REVIEW_RATE_SPIKE");
  return Object.freeze({ stop: failures.length > 0, failures });
}

export const DEFAULT_CIRCUIT_BREAKER = Object.freeze({ minimumSample: 10, maxProviderFailureRate: 0.25, maxSchemaFailureRate: 0.1, maxReviewRate: 0.5 });
