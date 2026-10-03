import { deepFreeze, withContentHash } from "./canonical.js";
import { PLACE_TYPES, PRIMARY_CATEGORIES, PRIMARY_VISIT_PURPOSES, type PlaceType, type PrimaryCategory } from "@backyrd/world-knowledge-core";
import { DecisionProductEvaluationPolicySchema, DecisionProductEvaluationReleaseSchema, DecisionProductIntentPolicySchema, DecisionProductRankingPolicySchema, PRODUCT_DECISION_VERSIONS } from "./product-v1-contracts.js";

export type ProductV1Intent = "EAT" | "COFFEE" | "DRINKS" | "NIGHTLIFE" | "SPORT_MOVEMENT" | "NATURE_ANIMAL_EXPERIENCE" | "CULTURE_ART" | "ACTIVITY_EXPERIENCE";
type PrimaryVisitPurpose = typeof PRIMARY_VISIT_PURPOSES[number];
export type ProductV1IntentMapping = { intentId: ProductV1Intent; acceptedPrimaryPurposes: readonly PrimaryVisitPurpose[]; acceptedPrimaryCategories: readonly PrimaryCategory[]; acceptedPlaceTypes: readonly PlaceType[]; incompatiblePrimaryPurposes: readonly PrimaryVisitPurpose[]; incompatiblePrimaryCategories: readonly PrimaryCategory[]; incompatiblePlaceTypes: readonly PlaceType[] };
// OTHER and temporary venues need a specific verified place type; the other
// canonical primary classifications have a known purpose and must not silently
// become eligible for an unrelated intent.
const unresolvedPurposes = new Set<PrimaryVisitPurpose>(["OTHER", "TEMPORARY_EVENT"]);
const unresolvedCategories = new Set<PrimaryCategory>(["OTHER", "TEMPORARY_PLACES"]);
const unresolvedPlaceTypes = new Set<PlaceType>(["OTHER_PLACE", "POP_UP", "EVENT_VENUE", "FESTIVAL_SITE", "SEASONAL_MARKET"]);
const map = (intentId: ProductV1Intent, acceptedPrimaryPurposes: readonly PrimaryVisitPurpose[], acceptedPrimaryCategories: readonly PrimaryCategory[], acceptedPlaceTypes: readonly PlaceType[]): ProductV1IntentMapping => ({
  intentId, acceptedPrimaryPurposes, acceptedPrimaryCategories, acceptedPlaceTypes,
  incompatiblePrimaryPurposes: PRIMARY_VISIT_PURPOSES.filter((value) => !acceptedPrimaryPurposes.includes(value) && !unresolvedPurposes.has(value)),
  incompatiblePrimaryCategories: PRIMARY_CATEGORIES.filter((value) => !acceptedPrimaryCategories.includes(value) && !unresolvedCategories.has(value)),
  incompatiblePlaceTypes: PLACE_TYPES.filter((value) => !acceptedPlaceTypes.includes(value) && !unresolvedPlaceTypes.has(value)),
});
export const PRODUCT_V1_INTENT_MAPPINGS: readonly ProductV1IntentMapping[] = deepFreeze([
  map("EAT", ["EAT_DRINK"], ["EAT"], ["RESTAURANT", "BRASSERIE", "BISTRO", "SNACK_BAR", "TAKEAWAY", "FAST_FOOD", "FOOD_HALL"]),
  map("COFFEE", ["EAT_DRINK"], ["COFFEE_DAYTIME"], ["CAFE", "BAKERY", "PATISSERIE"]),
  map("DRINKS", ["EAT_DRINK"], ["DRINKS", "NIGHTLIFE"], ["PUB", "WINE_BAR", "BAR", "BREWERY", "TAPROOM", "COCKTAIL_BAR", "LOUNGE"]),
  map("NIGHTLIFE", ["EAT_DRINK", "ENTERTAINMENT"], ["NIGHTLIFE", "DRINKS"], ["NIGHTCLUB", "MUSIC_CLUB", "BAR", "PUB", "COCKTAIL_BAR", "LOUNGE", "BREWERY", "TAPROOM"]),
  map("SPORT_MOVEMENT", ["SPORT_MOVEMENT"], ["SPORT_MOVEMENT"], ["CLIMBING_GYM", "GYM", "SPORTS_CENTRE", "SPORTS_COURT", "SWIMMING_POOL", "ICE_RINK", "YOGA_STUDIO"]),
  map("NATURE_ANIMAL_EXPERIENCE", ["NATURE_ANIMAL_EXPERIENCE"], ["OUTDOOR_NATURE", "ATTRACTIONS_LANDMARKS"], ["PARK", "NATURE_RESERVE", "ZOO", "AQUARIUM", "TRAIL", "BOTANICAL_GARDEN", "WATERFRONT"]),
  map("CULTURE_ART", ["CULTURE_ARTS"], ["CULTURE_ARTS"], ["MUSEUM", "GALLERY", "THEATRE", "CONCERT_VENUE", "CULTURAL_CENTRE", "LIBRARY"]),
  map("ACTIVITY_EXPERIENCE", ["ACTIVITY_PLAY", "ENTERTAINMENT", "CULTURE_ARTS", "NATURE_ANIMAL_EXPERIENCE", "ATTRACTION_VISIT", "SPORT_MOVEMENT"], ["ACTIVITIES_PLAY", "ENTERTAINMENT", "CULTURE_ARTS", "OUTDOOR_NATURE", "ATTRACTIONS_LANDMARKS", "SPORT_MOVEMENT"], ["ARCADE", "ESCAPE_ROOM", "BOWLING_ALLEY", "MINI_GOLF", "WORKSHOP_STUDIO", "AMUSEMENT_PARK", "CINEMA", "THEATRE", "COMEDY_CLUB", "MUSEUM", "ZOO", "AQUARIUM", "PARK", "SPORTS_CENTRE", "CLIMBING_GYM", "SWIMMING_POOL"]),
]);
export const DECISION_PRODUCT_INTENT_POLICY = deepFreeze(DecisionProductIntentPolicySchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.intentPolicy, policyId: "decision-vnext-product-intent-policy-v3", scope: "PRODUCT_V1", mappings: PRODUCT_V1_INTENT_MAPPINGS, precedence: "PURPOSE_AND_CATEGORY_BEFORE_PLACE_TYPE_WITH_MIXED_VENUES", embeddedOfferingsConfirmPrimaryIntent: false, generalEatDrinkConfirmsSpecificIntent: false, commercialSignalsForbidden: true }, "policyHash")));
export const DECISION_PRODUCT_RANKING_POLICY = deepFreeze(DecisionProductRankingPolicySchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.rankingPolicy, policyId: "decision-vnext-product-lexicographic-ranking-v3", precedence: ["HARD_CONSTRAINTS", "ELIGIBILITY_TIER", "CORE_INTENT_COVERAGE", "PRIMARY_VISIT_PURPOSE", "ACTUAL_AVAILABILITY", "SITUATIONAL_CONTEXT_FIT", "CONSENTED_USER_RELEVANCE", "WORLD_EVIDENCE", "NEUTRAL_IDENTITY"], userSignals: ["DIRECT_SPOT_POSITIVE", "DIRECT_SPOT_NEGATIVE", "TASTE_CONCEPT_MATCH", "TASTE_CONCEPT_CONTRADICTION"], commercialSignalsForbidden: true, fixtureOrderForbidden: true, spotNameForbidden: true }, "policyHash")));
export const DECISION_PRODUCT_EVALUATION_POLICY = deepFreeze(DecisionProductEvaluationPolicySchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.evaluationPolicy, policyId: "decision-vnext-product-evaluation-policy-v1", scope: "PRODUCT_DECISION", requiresCanonicalWorldPort: true, requiresCanonicalUserProjectionPort: true, requiresVerifiedContext: true, founderLabAuthorityAccepted: false, syntheticFixtureAuthorityAccepted: false, hardConstraintsBeforeRanking: true }, "policyHash")));
export const DECISION_PRODUCT_EVALUATION_RELEASE = deepFreeze(DecisionProductEvaluationReleaseSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.evaluationRelease, releaseId: "decision-vnext-product-evaluation-release-v3", evaluationPolicyHash: DECISION_PRODUCT_EVALUATION_POLICY.policyHash, rankingPolicyHash: DECISION_PRODUCT_RANKING_POLICY.policyHash, intentPolicyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash, productSemanticsApproved: true, productRankingAuthorized: true, runtimeActivated: false, productionExecutionAuthorized: false }, "releaseHash")));
