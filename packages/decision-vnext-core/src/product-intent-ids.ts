/** Canonical intent identifiers without runtime policy/schema dependencies. */
export const PRODUCT_V1_INTENT_IDS = ["EAT", "COFFEE", "DRINKS", "NIGHTLIFE", "SPORT_MOVEMENT", "NATURE_ANIMAL_EXPERIENCE", "CULTURE_ART", "ACTIVITY_EXPERIENCE"] as const;
export type ProductV1Intent = typeof PRODUCT_V1_INTENT_IDS[number];
