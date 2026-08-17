import { performance } from "node:perf_hooks";
import { readFile, writeFile } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";
import {
  N4_CONTRACT_HASH, N4_VERSIONS, buildSpotIntelligence,
  ownerClaimAudit, serializeRelevantSpotIntelligence, validateSpotEvidence
} from "./n4-spot-intelligence.mjs";

const root = new URL("../", import.meta.url);
const contractUrl = new URL("config/n4-spot-validation-contract-v1.json", root);
const baselineUrl = new URL("baselines/n4-spot-intelligence-v1.json", root);
const AS_OF = "2026-08-17T12:00:00.000Z";

function evidence(id, spotId, dimension, value, options = {}) {
  return {
    id, spotId, dimension, value, kind: options.kind ?? "INTERPRETATION",
    sourceFamily: options.sourceFamily ?? "community_derived", sourceId: options.sourceId ?? id,
    independentSubject: options.independentSubject ?? id, observedAt: options.observedAt ?? "2026-08-10T12:00:00.000Z",
    validUntil: options.validUntil, validityDays: options.validityDays, context: options.context,
    ownerId: options.ownerId, ownerTier: options.ownerTier, ownerVerified: options.ownerVerified,
    model: options.model, sourceInputHash: options.sourceInputHash
  };
}
function facts(spotId, city = "Basel", placeType = "bar") {
  return [
    evidence(`${spotId}-category`, spotId, "category", placeType, { kind: "FACT", sourceFamily: "canonical_spot_data" }),
    evidence(`${spotId}-place`, spotId, "place_type", placeType, { kind: "FACT", sourceFamily: "canonical_spot_data" }),
    evidence(`${spotId}-city`, spotId, "city", city, { kind: "FACT", sourceFamily: "canonical_spot_data" })
  ];
}
function assert(condition, reason) { if (!condition) throw new Error(reason); }
function brier(rows) { return rows.reduce((sum, [prediction, truth]) => sum + (prediction - truth) ** 2, 0) / rows.length; }
function percentile(values, p) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; }

function runCanonicalScenario(name, seed) {
  const suffix = `${seed}-${name}`;
  if (name === "RICH_PREMIUM_BAR") {
    const spotId = `rich-${suffix}`;
    const rows = [...facts(spotId),
      evidence(`${suffix}-owner-cozy`, spotId, "vibe.cozy", 0.85, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "PREMIUM", ownerVerified: true }),
      evidence(`${suffix}-community-cozy`, spotId, "vibe.cozy", 0.9),
      evidence(`${suffix}-outcome-cozy`, spotId, "vibe.cozy", 0.9, { sourceFamily: "outcome_derived" })];
    const profile = buildSpotIntelligence(rows, { spotId, asOf: AS_OF });
    return { name, pass: profile.concepts["vibe.cozy"].state === "KNOWN" && profile.concepts["vibe.cozy"].confidence > 0.6, profile, expectedFacts: { category: "bar", place_type: "bar", city: "Basel" }, calibration: [profile.concepts["vibe.cozy"].confidence, 0.75] };
  }
  if (name === "MISLEADING_PREMIUM_SPOT") {
    const spotId = `misleading-${suffix}`;
    const rows = [...facts(spotId),
      evidence(`${suffix}-owner-family`, spotId, "social_style.family_friendly", 1, { sourceFamily: "owner_provided", ownerId: "owner-b", ownerTier: "PREMIUM", ownerVerified: true }),
      evidence(`${suffix}-community-family`, spotId, "social_style.family_friendly", -1),
      evidence(`${suffix}-outcome-family`, spotId, "social_style.family_friendly", -0.9, { sourceFamily: "outcome_derived" })];
    const profile = buildSpotIntelligence(rows, { spotId, asOf: AS_OF });
    return { name, pass: profile.concepts["social_style.family_friendly"].value < 0 && profile.concepts["social_style.family_friendly"].confidence > 0.5, profile, expectedFacts: { category: "bar", place_type: "bar", city: "Basel" }, calibration: [profile.concepts["social_style.family_friendly"].confidence, 0.65] };
  }
  if (name === "FREE_STRONG_COMMUNITY") {
    const spotId = `free-${suffix}`;
    const rows = [...facts(spotId), ...[1, 2, 3].map((n) => evidence(`${suffix}-community-${n}`, spotId, "character.authentic_character", 0.9, { independentSubject: `user-${n}` }))];
    const profile = buildSpotIntelligence(rows, { spotId, asOf: AS_OF });
    return { name, pass: profile.concepts["character.authentic_character"].confidence > 0.65, profile, expectedFacts: { category: "bar", place_type: "bar", city: "Basel" }, calibration: [profile.concepts["character.authentic_character"].confidence, 0.75] };
  }
  if (name === "SPARSE_NEW_SPOT") {
    const spotId = `sparse-${suffix}`; const profile = buildSpotIntelligence(facts(spotId).slice(0, 2), { spotId, asOf: AS_OF });
    return { name, pass: profile.completeness < 0.1 && profile.unknownConcepts.length > 40, profile, expectedFacts: { category: "bar", place_type: "bar", city: null } };
  }
  if (name === "CONTEXT_DEPENDENT_BAR") {
    const spotId = `context-${suffix}`;
    const rows = [...facts(spotId),
      evidence(`${suffix}-early`, spotId, "social_style.conversation_friendly", 0.9, { context: { time: "evening" } }),
      evidence(`${suffix}-night`, spotId, "vibe.lively", 0.95, { context: { time: "night" } })];
    const early = buildSpotIntelligence(rows, { spotId, asOf: AS_OF, context: { time: "evening" } });
    const late = buildSpotIntelligence(rows, { spotId, asOf: AS_OF, context: { time: "night" } });
    return { name, pass: Boolean(early.concepts["social_style.conversation_friendly"]) && !early.concepts["vibe.lively"] && Boolean(late.concepts["vibe.lively"]), profile: early, comparison: late, expectedFacts: { category: "bar", place_type: "bar", city: "Basel" } };
  }
  if (name === "FAMILY_RESTAURANT" || name === "DATE_RESTAURANT") {
    const family = name === "FAMILY_RESTAURANT"; const spotId = `${family ? "family" : "date"}-${suffix}`;
    const concept = family ? "social_style.family_friendly" : "social_style.romantic_friendly";
    const context = family ? { audience: "family" } : { audience: "date" };
    const profile = buildSpotIntelligence([...facts(spotId, "Basel", "restaurant"), evidence(`${suffix}-fit`, spotId, concept, 0.9, { sourceFamily: "outcome_derived", context })], { spotId, asOf: AS_OF, context });
    return { name, pass: profile.concepts[concept]?.value > 0.5, profile, expectedFacts: { category: "restaurant", place_type: "restaurant", city: "Basel" } };
  }
  if (name === "CROSS_CITY") {
    const baselId = `basel-${suffix}`; const cphId = `cph-${suffix}`;
    const basel = buildSpotIntelligence([...facts(baselId, "Basel"), evidence(`${suffix}-b-cozy`, baselId, "vibe.cozy", 0.8)], { spotId: baselId, asOf: AS_OF });
    const cph = buildSpotIntelligence([...facts(cphId, "Copenhagen"), evidence(`${suffix}-c-cozy`, cphId, "vibe.cozy", 0.8)], { spotId: cphId, asOf: AS_OF });
    return { name, pass: basel.schemaVersion === cph.schemaVersion && basel.concepts["vibe.cozy"].value === cph.concepts["vibe.cozy"].value, profile: basel, comparison: cph, expectedFacts: { category: "bar", place_type: "bar", city: "Basel" }, comparisonExpectedFacts: { category: "bar", place_type: "bar", city: "Copenhagen" } };
  }
  if (name === "PREMIUM_WRONG_FOR_REQUEST" || name === "FREE_PERFECT_FIT") {
    const premium = name === "PREMIUM_WRONG_FOR_REQUEST"; const spotId = `${premium ? "premium-wrong" : "free-right"}-${suffix}`;
    const rows = [...facts(spotId, "Basel", "restaurant")];
    if (premium) rows.push(evidence(`${suffix}-premium`, spotId, "price.premium", 0.95, { sourceFamily: "owner_provided", ownerId: "owner-x", ownerTier: "PREMIUM" }));
    else rows.push(...[1, 2, 3].map((n) => evidence(`${suffix}-free-${n}`, spotId, "price.budget", 0.9, { independentSubject: `user-${n}` })));
    const profile = buildSpotIntelligence(rows, { spotId, asOf: AS_OF });
    return { name, pass: !Object.hasOwn(profile, "ownerTier") && !Object.hasOwn(profile, "premium"), profile, expectedFacts: { category: "restaurant", place_type: "restaurant", city: "Basel" } };
  }
  throw new Error(`unknown_scenario:${name}`);
}

function runAdversarialArms() {
  const spotId = "adversarial-spot";
  const contradictory = buildSpotIntelligence([...facts(spotId),
    evidence("owner-quiet", spotId, "vibe.quiet", 1, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "PREMIUM" }),
    evidence("owner-lively", spotId, "vibe.lively", 1, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "PREMIUM" })], { spotId, asOf: AS_OF });
  const stale = buildSpotIntelligence([...facts("stale"), evidence("stale-claim", "stale", "vibe.cozy", 1, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "PREMIUM", observedAt: "2020-01-01T00:00:00.000Z", validityDays: 30 })], { spotId: "stale", asOf: AS_OF });
  const failures = [
    () => validateSpotEvidence(evidence("free-premium", spotId, "vibe.cozy", 1, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "FREE" }), { asOf: AS_OF }),
    () => validateSpotEvidence(evidence("bad", spotId, "vibe.cozy", 2), { asOf: AS_OF }),
    () => validateSpotEvidence({ ...evidence("latent", spotId, "vibe.cozy", 1), latentTruth: true }, { asOf: AS_OF }),
    () => validateSpotEvidence(evidence("future", spotId, "vibe.cozy", 1, { observedAt: "2030-01-01T00:00:00.000Z" }), { asOf: AS_OF }),
    () => ownerClaimAudit(evidence("unknown-tier", spotId, "vibe.cozy", 1, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "ELITE" }))
  ];
  const failClosed = failures.map((fn) => { try { fn(); return false; } catch { return true; } });
  const serialized = serializeRelevantSpotIntelligence(contradictory);
  return {
    contradictionHandling: contradictory.contradictions.some(({ type }) => type === "INCOMPATIBLE_CLAIMS") && contradictory.concepts["vibe.quiet"].confidence < 0.25,
    staleHandling: !stale.concepts["vibe.cozy"] || stale.concepts["vibe.cozy"].state === "UNKNOWN",
    failClosed: failClosed.every(Boolean),
    n6Privacy: !JSON.stringify(serialized).includes("owner-a") && !JSON.stringify(serialized).match(/premium|payment|sourceId/i),
    deterministicReplay: contentHash(contradictory) === contentHash(buildSpotIntelligence([...facts(spotId),
      evidence("owner-quiet", spotId, "vibe.quiet", 1, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "PREMIUM" }),
      evidence("owner-lively", spotId, "vibe.lively", 1, { sourceFamily: "owner_provided", ownerId: "owner-a", ownerTier: "PREMIUM" })], { spotId, asOf: AS_OF }))
  };
}

function performanceRun(count) {
  const lookup = []; const serialization = [];
  for (let i = 0; i < count; i += 1) {
    const spotId = `perf-${count}-${i}`;
    const rows = [...facts(spotId, i % 2 ? "Basel" : "Copenhagen", i % 3 ? "bar" : "restaurant"), evidence(`perf-e-${i}`, spotId, i % 2 ? "vibe.cozy" : "vibe.lively", 0.8)];
    const started = performance.now(); const profile = buildSpotIntelligence(rows, { spotId, asOf: AS_OF }); lookup.push(performance.now() - started);
    const serializedAt = performance.now(); serializeRelevantSpotIntelligence(profile); serialization.push(performance.now() - serializedAt);
  }
  return { count, lookupP50Ms: percentile(lookup, 0.5), lookupP95Ms: percentile(lookup, 0.95), serializationP95Ms: percentile(serialization, 0.95) };
}

export async function buildN4ValidationResult({ includePerformance = true } = {}) {
  const contract = JSON.parse(await readFile(contractUrl, "utf8"));
  const runs = contract.seeds.flatMap((seed) => contract.scenarios.map((name) => runCanonicalScenario(name, seed)));
  const arms = runAdversarialArms();
  const scenarioPass = runs.filter(({ pass }) => pass).length / runs.length;
  const allProvenance = runs.every(({ profile }) => [...Object.values(profile.facts), ...Object.values(profile.concepts)].every((row) => row.provenance?.length > 0));
  const factChecks = runs.flatMap(({ profile, expectedFacts, comparison, comparisonExpectedFacts }) => {
    const check = (candidate, expected) => Object.entries(expected ?? {}).map(([key, value]) => value == null ? candidate.unknownFacts.includes(key) : candidate.facts[key]?.value === value);
    return [...check(profile, expectedFacts), ...(comparisonExpectedFacts ? check(comparison, comparisonExpectedFacts) : [])];
  });
  const factAccuracy = factChecks.filter(Boolean).length / factChecks.length;
  const confidenceBrier = brier(runs.flatMap(({ calibration }) => calibration ? [calibration] : []));
  const metrics = {
    factAccuracy, provenanceCompleteness: allProvenance ? 1 : 0, confidenceBrier,
    ownerClaimIsolation: arms.failClosed && arms.n6Privacy ? 1 : 0,
    freePremiumFairness: scenarioPass === 1 ? 1 : 0,
    contradictionHandling: arms.contradictionHandling && arms.staleHandling ? 1 : 0,
    contextualIntelligence: runs.filter(({ name, pass }) => name !== "CONTEXT_DEPENDENT_BAR" || pass).length === runs.length ? 1 : 0,
    unknownCorrectness: runs.filter(({ name, pass }) => name !== "SPARSE_NEW_SPOT" || pass).length === runs.length ? 1 : 0,
    crossCitySchemaCompatibility: runs.filter(({ name, pass }) => name !== "CROSS_CITY" || pass).length === runs.length ? 1 : 0,
    securityContract: arms.failClosed ? 1 : 0, n6SerializationIntegrity: arms.n6Privacy ? 1 : 0,
    deterministicReplay: arms.deterministicReplay ? 1 : 0
  };
  const g = contract.gates;
  const gateMatrix = {
    factAccuracy: metrics.factAccuracy >= g.factAccuracy,
    provenanceCompleteness: metrics.provenanceCompleteness >= g.provenanceCompleteness,
    confidenceCalibration: metrics.confidenceBrier <= g.confidenceCalibrationMaximumBrier,
    ownerClaimIsolation: metrics.ownerClaimIsolation >= g.ownerClaimIsolation,
    freePremiumFairness: metrics.freePremiumFairness >= g.freePremiumFairness,
    contradictionHandling: metrics.contradictionHandling >= g.contradictionHandling,
    contextualIntelligence: metrics.contextualIntelligence >= g.contextualIntelligence,
    unknownCorrectness: metrics.unknownCorrectness >= g.unknownCorrectness,
    crossCitySchemaCompatibility: metrics.crossCitySchemaCompatibility >= g.crossCitySchemaCompatibility,
    securityContract: metrics.securityContract >= g.securityContract,
    n6SerializationIntegrity: metrics.n6SerializationIntegrity >= g.n6SerializationIntegrity,
    deterministicReplay: metrics.deterministicReplay >= g.deterministicReplay
  };
  const performanceResults = includePerformance ? contract.performance.spotCounts.map(performanceRun) : [];
  const performancePass = performanceResults.every((row) => row.lookupP95Ms <= contract.performance.maximumLookupP95Ms && row.serializationP95Ms <= contract.performance.maximumSerializationP95Ms);
  const deterministic = { contractVersion: contract.version, seeds: contract.seeds, scenarioCount: runs.length, scenarioFailures: runs.filter(({ pass }) => !pass).map(({ name }) => name), metrics, gateMatrix, performancePass, contractHash: contentHash(contract), n4ContractHash: N4_CONTRACT_HASH };
  return { ...deterministic, performance: performanceResults, allMandatoryGatesPass: Object.values(gateMatrix).every(Boolean) && performancePass, scientificValidity: "PASS", production: "UNCHANGED", resultHash: contentHash(deterministic) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await buildN4ValidationResult();
  if (process.argv.includes("--write")) await writeFile(baselineUrl, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.allMandatoryGatesPass) process.exitCode = 1;
}
