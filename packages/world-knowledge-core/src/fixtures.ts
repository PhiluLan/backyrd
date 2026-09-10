import { CLAIM_CONTRACT_VERSION, RESOLUTION_CONTRACT_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, createClaim, type ClaimDraft, type ClaimValue, type KnowledgeState, type WorldKnowledgeClaim } from "./contracts.js";
import { REGISTRY_VERSION } from "./registry.js";
import type { BuildWorldKnowledgeInput, NonKnowledgeContext } from "./port.js";

export const SYNTHETIC_AS_OF = "2026-01-15T12:00:00.000Z";
const observedAt = "2026-01-10T12:00:00.000Z";

interface ClaimOptions {
  readonly id?: string;
  readonly state?: KnowledgeState;
  readonly sourceReferenceId?: string | null;
  readonly verificationState?: ClaimDraft["verificationState"];
  readonly validFrom?: string | null;
  readonly validUntil?: string | null;
  readonly scopeArea?: string;
  readonly supersedesClaimId?: string | null;
  readonly stance?: ClaimDraft["stance"];
  readonly visibility?: ClaimDraft["visibility"];
  readonly sourceType?: ClaimDraft["sourceType"];
}

let sequence = 0;
function claim(spotId: string, attributeKey: string, value: ClaimValue, options: ClaimOptions = {}): WorldKnowledgeClaim {
  sequence += 1;
  const state = options.state ?? (value === true ? "KNOWN_TRUE" : value === false ? "KNOWN_FALSE" : value === null ? "UNKNOWN" : "KNOWN_VALUE");
  return createClaim({
    claimId: options.id ?? `${spotId}:claim:${String(sequence).padStart(3, "0")}`, attributeKey, scope: { spotId, area: options.scopeArea ?? "SPOT" }, knowledgeState: state, value,
    actorType: "ADMIN", sourceType: options.sourceType ?? "ADMIN_OBSERVATION", sourceReferenceId: options.sourceReferenceId ?? null, provenanceSessionId: `${spotId}:session:founder-pass`, verificationState: options.verificationState ?? "UNVERIFIED",
    observedAt, validFrom: options.validFrom ?? null, validUntil: options.validUntil ?? null, stance: options.stance ?? "SUPPORTS", visibility: options.visibility ?? "INTERNAL", supersedesClaimId: options.supersedesClaimId ?? null,
  });
}

const referenced = { sourceReferenceId: "source:official-fixture", verificationState: "UNVERIFIED" as const, sourceType: "OFFICIAL_SOURCE" as const };
const verified = { sourceReferenceId: "source:verified-fixture", verificationState: "VERIFIED" as const, sourceType: "OFFICIAL_SOURCE" as const };

export const PHILIPPS_CASA_CLAIMS = Object.freeze([
  claim("synthetic-spot-philipps-casa", "identity.name", "Philipps Casa"),
  claim("synthetic-spot-philipps-casa", "location.address_line1", "Casaweg 7"),
  claim("synthetic-spot-philipps-casa", "location.locality", "Zürich"),
  claim("synthetic-spot-philipps-casa", "location.country_code", "CH"),
  claim("synthetic-spot-philipps-casa", "location.latitude", 47.3769),
  claim("synthetic-spot-philipps-casa", "location.longitude", 8.5417),
  claim("synthetic-spot-philipps-casa", "location.timezone", "Europe/Zurich"),
  claim("synthetic-spot-philipps-casa", "classification.primary_category", "EAT"),
  claim("synthetic-spot-philipps-casa", "classification.place_types", ["PUB"]),
  claim("synthetic-spot-philipps-casa", "offering.food_specialities", ["BURGER", "PIZZA"]),
  claim("synthetic-spot-philipps-casa", "offering.groups", ["BEER", "COCKTAILS", "DINNER", "FULL_MEALS", "NON_ALCOHOLIC_DRINKS", "SNACKS", "WINE"]),
  claim("synthetic-spot-philipps-casa", "operation.service_model", "SELF_SERVICE"),
  claim("synthetic-spot-philipps-casa", "operation.service_format", "CASUAL_DINING"),
  claim("synthetic-spot-philipps-casa", "operation.takeaway", null, { state: "UNKNOWN" }),
  claim("synthetic-spot-philipps-casa", "operation.laptop_policy", true),
  claim("synthetic-spot-philipps-casa", "amenity.features", ["GARDEN", "HIGH_CHAIR", "POWER_OUTLETS", "TERRACE", "TOILET", "WATER_BOWL", "WIFI"]),
  claim("synthetic-spot-philipps-casa", "accessibility.accessible_toilet", true),
  claim("synthetic-spot-philipps-casa", "rule.external_food", { policy: "NOT_ALLOWED", exceptions: [] }),
  claim("synthetic-spot-philipps-casa", "rule.external_drink", { policy: "NOT_ALLOWED", exceptions: [] }),
  claim("synthetic-spot-philipps-casa", "hours.regular", [{ day: "MONDAY", intervals: [{ start: "08:00", end: "22:00" }] }]),
  claim("synthetic-spot-philipps-casa", "state.current", { kind: "OPEN", scope: "SPOT" }),
  claim("synthetic-spot-philipps-casa", "research.subjective_fits", ["AFTERWORK", "BIRTHDAY", "SPONTANEOUS"]),
]);

export const UNKNOWN_SPOT_CLAIMS = Object.freeze([] as WorldKnowledgeClaim[]);
export const MINIMAL_SPOT_CLAIMS = Object.freeze([
  claim("synthetic-spot-minimal", "identity.name", "Minimaler Testspot"), claim("synthetic-spot-minimal", "location.address_line1", "Testweg 1"), claim("synthetic-spot-minimal", "location.locality", "Basel"), claim("synthetic-spot-minimal", "classification.primary_category", "EAT"),
]);

export const CONFLICTING_SPOT_CLAIMS = Object.freeze([
  claim("synthetic-spot-conflicting", "classification.primary_category", "EAT", { id: "conflict:category:eat" }), claim("synthetic-spot-conflicting", "classification.primary_category", "DRINKS", { id: "conflict:category:drinks" }),
  claim("synthetic-spot-conflicting", "operation.takeaway", false), claim("synthetic-spot-conflicting", "offering.groups", ["TAKEAWAY_MEALS"]),
]);

export const EXPIRED_STATE_CLAIMS = Object.freeze([
  claim("synthetic-spot-expired-state", "state.current", { kind: "TEMPORARILY_CLOSED", scope: "SPOT" }, { validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2026-01-12T00:00:00.000Z" }),
]);

export const SPECIAL_HOURS_CLAIMS = Object.freeze([
  claim("synthetic-spot-special-hours", "hours.regular", [{ day: "THURSDAY", intervals: [{ start: "09:00", end: "18:00" }] }], referenced),
  claim("synthetic-spot-special-hours", "hours.special", [{ date: "2026-01-15", status: "CLOSED", intervals: [] }], verified),
]);

export const VENUE_KITCHEN_HOURS_CLAIMS = Object.freeze([
  claim("synthetic-spot-hours", "hours.regular", [{ day: "THURSDAY", intervals: [{ start: "10:00", end: "23:00" }] }], referenced),
  claim("synthetic-spot-hours", "hours.kitchen", [{ day: "THURSDAY", intervals: [{ start: "12:00", end: "21:30" }] }], referenced),
]);

export const INCONSISTENT_CAPACITY_CLAIMS = Object.freeze([
  claim("synthetic-spot-capacity", "capacity.seats_total", 50), claim("synthetic-spot-capacity", "capacity.seats_indoor", 40), claim("synthetic-spot-capacity", "capacity.seats_outdoor", 25), claim("synthetic-spot-capacity", "capacity.group_size_supported", { min: 2, max: 60 }), claim("synthetic-spot-capacity", "rule.reservation", { mode: "REQUIRED", minimumPartySize: 80, days: [], fromTime: null, toTime: null }),
]);

export const PARTIAL_ACCESSIBILITY_CLAIMS = Object.freeze([
  claim("synthetic-spot-partial-access", "accessibility.accessible_toilet", true), claim("synthetic-spot-partial-access", "accessibility.step_free_entrance", null, { state: "UNKNOWN" }),
]);

export const COMMERCIAL_CONTEXT: NonKnowledgeContext = Object.freeze({
  ownerTier: "PRO", subscription: "PAID", payment: "CURRENT", advertising: "CAMPAIGN", sponsorship: "FEATURED", adminNotes: "private moderation note", privateSourceUrls: ["https://private.invalid/evidence"], rawAiOutputs: ["untrusted model output"], userIntents: ["intent.afterwork"], userTaste: ["vibe.cozy"],
});

export const SYNTHETIC_WORLDS = Object.freeze({
  philippsCasa: { spotId: "synthetic-spot-philipps-casa", claims: PHILIPPS_CASA_CLAIMS }, unknown: { spotId: "synthetic-spot-unknown", claims: UNKNOWN_SPOT_CLAIMS }, minimal: { spotId: "synthetic-spot-minimal", claims: MINIMAL_SPOT_CLAIMS }, conflicting: { spotId: "synthetic-spot-conflicting", claims: CONFLICTING_SPOT_CLAIMS }, expiredState: { spotId: "synthetic-spot-expired-state", claims: EXPIRED_STATE_CLAIMS }, specialHours: { spotId: "synthetic-spot-special-hours", claims: SPECIAL_HOURS_CLAIMS }, venueKitchenHours: { spotId: "synthetic-spot-hours", claims: VENUE_KITCHEN_HOURS_CLAIMS }, inconsistentCapacity: { spotId: "synthetic-spot-capacity", claims: INCONSISTENT_CAPACITY_CLAIMS }, partialAccessibility: { spotId: "synthetic-spot-partial-access", claims: PARTIAL_ACCESSIBILITY_CLAIMS },
});

export function resolutionRequest(claims: readonly WorldKnowledgeClaim[], asOf = SYNTHETIC_AS_OF) {
  return { contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf, claims } as const;
}

export function snapshotInput(spotId: string, resolution: BuildWorldKnowledgeInput["resolution"], nonKnowledgeContext?: NonKnowledgeContext): BuildWorldKnowledgeInput {
  return nonKnowledgeContext ? { contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId, resolution, nonKnowledgeContext } : { contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId, resolution };
}

export const FIXTURE_CONTRACT_IDENTITY = Object.freeze({ claim: CLAIM_CONTRACT_VERSION, resolution: RESOLUTION_CONTRACT_VERSION, port: WORLD_KNOWLEDGE_PORT_VERSION, registry: REGISTRY_VERSION });
