import { createHash } from "node:crypto";
import { CATEGORIES, DENSITY, DISTRIBUTION, MATURITY, MOODS, PERSONAS, PERSONA_BIASES, PRODUCT_STATUS, REVIEW_WORDS } from "./model.mjs";
import { createRandom, deterministicUuid, round } from "./random.mjs";
import { latentUtility } from "./utility.mjs";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const weightedIndex = (random, size, power = 1.5) => Math.min(size - 1, Math.floor((random() ** power) * size));

function vector(random, bias = {}) {
  return Object.fromEntries(MOODS.map((key) => [key, round(clamp(random.normal(0.48 + (bias[key] ?? 0), 0.24)))]));
}

function userAt(random, seed, index) {
  const persona = random.weighted(PERSONAS);
  const maturity = random.weighted(MATURITY);
  const bias = PERSONA_BIASES[persona];
  return {
    id: deterministicUuid(`${seed}:user`, index), synthetic: true, persona, maturity,
    observed: { city: "Synthetic Basel", locale: random.bool(0.82) ? "de-CH" : "en", onboarding: maturity !== "cold" },
    latent: {
      mood: vector(random, bias.moods),
      category: Object.fromEntries(CATEGORIES.map((key) => [key, round(clamp(random.normal(0.45 + (bias.categories[key] ?? 0), 0.25)))])),
      priceTarget: round(clamp(random.normal(2.7 + bias.price, 0.85), 1, 5)), novelty: round(clamp(random.normal(0.5 + bias.novelty, 0.24))),
      distanceToleranceKm: round(clamp(random.normal(persona === "spontaneous_local" ? 2 : 4.5, 1.8), 0.8, 10)),
      social: { solo: round(random()), date: round(random()), friends: round(random()), family: round(persona === "family_planner" ? clamp(random.normal(0.82, 0.12)) : random()) },
      actionPropensity: round(clamp(random.normal(0.42, 0.2))), reviewPropensity: round(clamp(random.normal(0.1, 0.12)))
    }
  };
}

function spotAt(random, seed, index) {
  const category = random.weighted(CATEGORIES.map((key) => [key, key === "restaurant" ? 0.22 : key === "cafe" ? 0.16 : 0.103]));
  const density = random.weighted(DENSITY);
  const status = index === 0 ? "pending" : random.weighted(PRODUCT_STATUS);
  const distribution = index === 1 ? "reduced" : index === 2 ? "quarantined" : index === 3 ? "excluded" : random.weighted(DISTRIBUTION);
  const baseMood = vector(random);
  const strongest = [...MOODS].sort((a, b) => baseMood[b] - baseMood[a]).slice(0, 3);
  const categoryLabel = { cafe: "Café", restaurant: "Restaurant", bar: "Bar", culture: "Kulturort", activity: "Aktivität", outing: "Ausflugsort", experience: "Erlebnis", nightlife: "Nachtort" }[category];
  const observedMoods = strongest.filter(() => random.bool(density === "dense" ? 0.85 : density === "medium" ? 0.65 : 0.4));
  return {
    id: deterministicUuid(`${seed}:spot`, index), synthetic: true, category, density,
    latent: { mood: baseMood, quality: round(clamp(random.normal(0.62, 0.2))), price: random.int(1, 5), social: round(random()), indoor: round(clamp(random.normal(["culture", "cafe", "restaurant", "bar"].includes(category) ? 0.82 : 0.42, 0.18))), novelty: round(random()), distanceKm: round(clamp(random.normal(3.2, 2), 0.1, 12)), openByContext: { morning: random.bool(0.62), afternoon: random.bool(0.82), evening: random.bool(0.7), night: random.bool(category === "bar" || category === "nightlife" ? 0.85 : 0.12) } },
    observed: { name: `LAB ${categoryLabel} ${String(index + 1).padStart(3, "0")}`, slug: `lab-${category}-${index + 1}`, city: "Synthetic Basel", status, distribution, priceLevel: random.bool(density === "sparse" ? 0.45 : 0.85) ? Math.max(1, Math.min(5, Math.round(random.normal(3, 1)))) : null, lat: round(47.50 + random() * 0.12, 6), lng: round(7.53 + random() * 0.16, 6), moods: observedMoods, description: random.bool(density === "sparse" ? 0.45 : 0.92) ? `${categoryLabel} in Synthetic Basel. ${observedMoods.map((m) => random.pick(REVIEW_WORDS[m])).join(", ") || "Ein Ort für unterschiedliche Momente"}.` : null }
  };
}

function contextAt(random, seed, index) {
  const audience = random.weighted([["solo", 0.25], ["date", 0.22], ["friends", 0.36], ["family", 0.17]]);
  const timeBucket = random.weighted([["morning", 0.13], ["afternoon", 0.3], ["evening", 0.39], ["night", 0.18]]);
  const activeMoods = random.bool(0.75) ? [random.pick(MOODS)] : [];
  const moods = Object.fromEntries(MOODS.map((key) => [key, activeMoods.includes(key) ? round(random.normal(0.9, 0.06)) : round(clamp(random.normal(0.3, 0.15)))]));
  return { id: deterministicUuid(`${seed}:context`, index), audience, timeBucket, moods, indoorRequired: random.bool(0.22), requiresOpen: true, weekday: random.int(0, 6), weather: random.weighted([["dry", 0.66], ["rain", 0.24], ["cold", 0.1]]) };
}

function makeReview(random, seed, index, user, spot, utility) {
  const expressed = MOODS.filter((mood) => spot.latent.mood[mood] > 0.58 && random.bool(0.42)).slice(0, 2);
  const words = expressed.map((mood) => random.pick(REVIEW_WORDS[mood]));
  const noisyPositive = random.bool(clamp(0.18 + utility * 0.7));
  return { id: deterministicUuid(`${seed}:review`, index), userId: user.id, spotId: spot.id, createdDay: -random.int(1, 180), moods: expressed, text: `${random.pick(["Für mich", "Heute", "Der Besuch war", "Unerwartet"])} ${words.join(" und ") || random.pick(["angenehm", "okay", "durchwachsen"])}${noisyPositive ? ". Würde wiederkommen." : ". Nicht ganz mein Moment."}` };
}

function makeEvent(random, seed, index, users, spots, contexts) {
  const user = users[random.int(0, users.length - 1)];
  const spot = spots[weightedIndex(random, spots.length)];
  const context = contexts[random.int(0, contexts.length - 1)];
  const truth = latentUtility(user, spot, context);
  const exposedRank = random.int(1, 16);
  const seen = random.bool(Math.exp(-0.11 * (exposedRank - 1)));
  let type = "decision_impression";
  if (seen && random.bool(user.latent.actionPropensity * (0.16 + truth.utility * 0.65))) {
    type = random.weighted(truth.utility > 0.58 ? [["open", 0.34], ["like", 0.28], ["save", 0.18], ["was_here", 0.12], ["dislike", 0.08]] : [["open", 0.38], ["dislike", 0.38], ["save", 0.08], ["like", 0.1], ["was_here", 0.06]]);
  }
  return { id: deterministicUuid(`${seed}:event`, index), userId: user.id, spotId: spot.id, contextId: context.id, day: -random.int(1, 180), rank: exposedRank, exposed: seen, type };
}

export function generateWorld(config, metadata = {}) {
  const random = createRandom(config.seed);
  const users = Array.from({ length: config.scale.users }, (_, index) => userAt(random, config.seed, index));
  const spots = Array.from({ length: config.scale.spots }, (_, index) => spotAt(random, config.seed, index));
  const contexts = Array.from({ length: Math.max(80, Math.ceil(config.scale.users * 0.8)) }, (_, index) => contextAt(random, config.seed, index));
  const interactions = Array.from({ length: config.scale.interactions }, (_, index) => makeEvent(random, config.seed, index, users, spots, contexts));
  const decisions = interactions.filter((event) => event.type === "decision_impression").slice(0, config.scale.decisions).map((event, index) => ({ id: deterministicUuid(`${config.seed}:decision`, index), userId: event.userId, contextId: event.contextId, day: event.day, shownSpotId: event.spotId, rank: event.rank }));
  while (decisions.length < config.scale.decisions) { const index = decisions.length; const user = random.pick(users); const context = random.pick(contexts); decisions.push({ id: deterministicUuid(`${config.seed}:decision`, index), userId: user.id, contextId: context.id, day: -random.int(1, 180), shownSpotId: random.pick(spots).id, rank: random.int(1, 16) }); }
  const reviews = Array.from({ length: config.scale.reviews }, (_, index) => { const user = random.pick(users); const spot = spots[weightedIndex(random, spots.length, 1.9)]; const context = random.pick(contexts); return makeReview(random, config.seed, index, user, spot, latentUtility(user, spot, context).utility); });
  const worldId = deterministicUuid(`${config.generatorVersion}:${config.seed}`, 0);
  const manifest = { worldId, seed: config.seed, generatorVersion: config.generatorVersion, groundTruthVersion: config.groundTruthVersion, scenarioSetVersion: config.scenarioSetVersion, evaluationVersion: config.evaluationVersion, embeddingMode: config.embeddingMode, gitSha: metadata.gitSha ?? "UNKNOWN", migrationHash: metadata.migrationHash ?? "UNKNOWN", engineSourceHash: metadata.engineSourceHash ?? "UNKNOWN", generatedAt: "2026-08-11T12:00:00.000Z", counts: { users: users.length, spots: spots.length, reviews: reviews.length, interactions: interactions.length, decisions: decisions.length } };
  const world = { manifest, users, spots, contexts, reviews, interactions, decisions };
  manifest.worldHash = createHash("sha256").update(JSON.stringify(world)).digest("hex");
  return world;
}
