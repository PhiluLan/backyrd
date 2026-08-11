export const CATEGORIES = ["restaurant", "cafe", "bar", "culture", "activity", "outing", "experience", "nightlife"];
export const MOODS = ["cozy", "quiet", "lively", "romantic", "urban", "inspiring", "chic", "playful"];
export const PERSONAS = [
  ["date_planner", 0.16], ["social_explorer", 0.16], ["quiet_regular", 0.15],
  ["culture_seeker", 0.13], ["family_planner", 0.13], ["budget_discoverer", 0.12],
  ["spontaneous_local", 0.1], ["novelty_hunter", 0.05]
];
export const MATURITY = [["cold", 0.15], ["onboarding", 0.12], ["sparse", 0.2], ["developing", 0.23], ["mature", 0.22], ["power", 0.08]];
export const DENSITY = [["sparse", 0.32], ["medium", 0.48], ["dense", 0.2]];
export const DISTRIBUTION = [["normal", 0.86], ["reduced", 0.08], ["quarantined", 0.03], ["excluded", 0.03]];
export const PRODUCT_STATUS = [["approved", 0.92], ["pending", 0.04], ["rejected", 0.025], ["archived", 0.015]];

export const PERSONA_BIASES = {
  date_planner: { moods: { romantic: 0.8, cozy: 0.55 }, categories: { restaurant: 0.5, bar: 0.25 }, price: 0.1, novelty: 0.1 },
  social_explorer: { moods: { lively: 0.75, urban: 0.5 }, categories: { bar: 0.6, nightlife: 0.45 }, price: 0, novelty: 0.35 },
  quiet_regular: { moods: { quiet: 0.8, cozy: 0.6 }, categories: { cafe: 0.65, restaurant: 0.2 }, price: 0.05, novelty: -0.4 },
  culture_seeker: { moods: { inspiring: 0.85, quiet: 0.35 }, categories: { culture: 0.85, experience: 0.25 }, price: 0.1, novelty: 0.25 },
  family_planner: { moods: { playful: 0.75, quiet: 0.1 }, categories: { activity: 0.65, outing: 0.65 }, price: -0.1, novelty: -0.1 },
  budget_discoverer: { moods: { cozy: 0.3, urban: 0.25 }, categories: { cafe: 0.25, activity: 0.2 }, price: -0.8, novelty: 0.2 },
  spontaneous_local: { moods: { lively: 0.35, cozy: 0.25 }, categories: { restaurant: 0.25, bar: 0.25, cafe: 0.25 }, price: -0.05, novelty: 0.15 },
  novelty_hunter: { moods: { inspiring: 0.55, urban: 0.4 }, categories: { experience: 0.65, culture: 0.3 }, price: 0.15, novelty: 0.9 }
};

export const REVIEW_WORDS = {
  cozy: ["gemütlich", "warm", "intim"], quiet: ["ruhig", "entspannt", "gelassen"],
  lively: ["lebhaft", "energiegeladen", "gesellig"], romantic: ["romantisch", "intim", "Date-tauglich"],
  urban: ["urban", "modern", "stadtlich"], inspiring: ["inspirierend", "kreativ", "besonders"],
  chic: ["chic", "elegant", "stilvoll"], playful: ["spielerisch", "interaktiv", "familienfreundlich"]
};
