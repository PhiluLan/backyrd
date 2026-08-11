import { CATEGORIES, MATURITY, PERSONAS } from "./model.mjs";

const variance = (values) => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length; };
const countBy = (items, getter) => Object.fromEntries([...items.reduce((map, item) => map.set(getter(item), (map.get(getter(item)) ?? 0) + 1), new Map())].sort());

export function validateWorld(world) {
  const failures = [];
  const requireCheck = (condition, code, detail) => { if (!condition) failures.push({ code, detail }); };
  requireCheck(world.users.length === world.manifest.counts.users, "USER_COUNT", "manifest mismatch");
  requireCheck(world.spots.length === world.manifest.counts.spots, "SPOT_COUNT", "manifest mismatch");
  const personas = countBy(world.users, (user) => user.persona);
  const maturity = countBy(world.users, (user) => user.maturity);
  const categories = countBy(world.spots, (spot) => spot.category);
  const density = countBy(world.spots, (spot) => spot.density);
  const statuses = countBy(world.spots, (spot) => spot.observed.status);
  const distribution = countBy(world.spots, (spot) => spot.observed.distribution);
  for (const [persona] of PERSONAS) requireCheck((personas[persona] ?? 0) > 0, "PERSONA_MISSING", persona);
  for (const [state] of MATURITY) requireCheck((maturity[state] ?? 0) > 0, "MATURITY_MISSING", state);
  for (const category of CATEGORIES) requireCheck((categories[category] ?? 0) > 0, "CATEGORY_MISSING", category);
  for (const state of ["sparse", "medium", "dense"]) requireCheck((density[state] ?? 0) > 0, "DENSITY_MISSING", state);
  for (const state of ["approved", "pending"]) requireCheck((statuses[state] ?? 0) > 0, "PRODUCT_FIXTURE_MISSING", state);
  for (const state of ["normal", "reduced", "quarantined", "excluded"]) requireCheck((distribution[state] ?? 0) > 0, "DISTRIBUTION_FIXTURE_MISSING", state);
  requireCheck(variance(world.users.map((user) => user.latent.novelty)) > 0.025, "USER_DEGENERACY", "novelty variance too low");
  requireCheck(variance(world.spots.map((spot) => spot.latent.quality)) > 0.015, "SPOT_DEGENERACY", "quality variance too low");
  const reviewCounts = world.spots.map((spot) => world.reviews.filter((review) => review.spotId === spot.id).length);
  requireCheck(variance(reviewCounts) > 2, "REVIEW_UNIFORMITY", "review counts have insufficient variance");
  const observationRatios = world.spots.map((spot) => spot.observed.moods.length / Object.keys(spot.latent.mood).filter((key) => spot.latent.mood[key] > 0.58).length).filter(Number.isFinite);
  requireCheck(observationRatios.some((value) => value < 1), "TRUTH_COPY", "observed moods perfectly copy latent moods");
  return { valid: failures.length === 0, failures, summary: { personas, maturity, categories, density, statuses, distribution, reviewedSpots: new Set(world.reviews.map((review) => review.spotId)).size, eventTypes: countBy(world.interactions, (event) => event.type), userPreferenceVariance: variance(world.users.map((user) => user.latent.novelty)), spotQualityVariance: variance(world.spots.map((spot) => spot.latent.quality)) } };
}
