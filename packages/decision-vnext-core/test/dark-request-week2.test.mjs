import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  DARK_REQUEST_CONTROL, DARK_REQUEST_THRESHOLD_TEMPLATE, DarkRequestInputSchema,
  FounderLabRequestSchema, PHASE3C_LAB_VERSIONS,
  SyntheticUserProjectionReader, SyntheticWorldKnowledgeReader, generateSyntheticWorld,
  handleDarkDecisionRequest, validateDarkRequestAuthority,
} from "../dist/index.js";
import {
  createLocalSyntheticDarkRequestManifest, provisionLocalDarkRequestAuthority,
  replayLocalDarkRequestRehearsal, runLocalDarkRequestRehearsal,
  LOCAL_DARK_REQUEST_ORACLE_CATALOG as FIXTURE_ORACLES,
} from "../dist/dark-request-fixtures.js";
import { withContentHash } from "../dist/canonical.js";

const sourceSha = "a".repeat(40); const sourceTreeHash = "b".repeat(40);
const config = { configVersion: "backyrd-vnext-sandbox-config-v1", worldVersion: "backyrd-vnext-synthetic-world-week2-dark-request", seed: 2102, observedAt: "2026-01-15T12:00:00.000Z", spotCount: 12, userCount: 3, cities: ["Zurich", "Basel"], candidatePoolSize: 8 };
const world = generateSyntheticWorld(config); const reader = new SyntheticWorldKnowledgeReader(world); const userPort = new SyntheticUserProjectionReader("MISSING_SNAPSHOT");
const manifest = createLocalSyntheticDarkRequestManifest({ cohortId: "week2-dark-request-cohort", frozenAt: config.observedAt, snapshots: world.spots.slice(0, 8).map((item) => item.snapshot) });
const requestFor = (requestId, ephemeralText, deviceCity = "Zurich", extra = {}) => FounderLabRequestSchema.parse({ contractVersion: PHASE3C_LAB_VERSIONS.request, requestId, ephemeralText, deviceLocation: { state: "AVAILABLE", city: deviceCity }, userMode: "NEUTRAL_MISSING", alternativeRequested: false, rejectedCandidateIds: [], ...extra });
const request = requestFor("week2-dark-request", "Ich möchte in Zürich ruhig Kaffee trinken.");
const authorityFor = (value = request, city = "Zurich", cohort = manifest) => provisionLocalDarkRequestAuthority({ request: value, city, manifest: cohort, sourceSha, sourceTreeHash });
const run = (value = request, city = "Zurich", cohort = manifest, worldReader = reader) => runLocalDarkRequestRehearsal({ request: value, ...authorityFor(value, city, cohort), worldReader, manifest: cohort, userProjectionPort: userPort });
const rehash = (value, field) => { const body = { ...value }; delete body[field]; return withContentHash(body, field); };

test("public dark request path is permanently OFF with zero reads, evaluation, writes, network and Product output", async () => {
  let calls = 0; const exploding = new Proxy({}, { get() { calls += 1; throw new Error("must_not_read_dependency"); } });
  const off = await handleDarkDecisionRequest({ userId: "attacker" }, { environmentValue: "false", worldReader: exploding, userProjectionPort: exploding });
  assert.equal(calls, 0); assert.equal(off.status, "DISABLED"); assert.deepEqual(off.counters, { worldReads: 0, userReads: 0, evaluations: 0, persistenceWrites: 0, networkCalls: 0, productOutputs: 0 });
  const attempted = await handleDarkDecisionRequest(request, { environmentValue: "true", worldReader: exploding, userProjectionPort: exploding });
  assert.equal(calls, 0); assert.equal(attempted.reason, "ACTIVATION_NOT_AUTHORIZED");
  assert.equal(DARK_REQUEST_CONTROL.killSwitch, "ENGAGED"); assert.equal(DARK_REQUEST_CONTROL.sampleRateBasisPoints, 0); assert.equal(DARK_REQUEST_CONTROL.executionAuthorized, false);
});

test("client request rejects server authority, policies, identity and Product output fields fail closed", () => {
  for (const field of ["userId", "authorizedLocation", "worldSnapshot", "rankingPolicy", "eligibilityPolicy", "engineVersion", "productOutput"]) assert.throws(() => DarkRequestInputSchema.parse({ ...request, [field]: "attacker" }), /unknown field/);
});

test("local Test-ON consumes canonical World and User ports exactly once per bound item without Product authority", async () => {
  const report = await run();
  assert.equal(report.counters.worldReads, manifest.spots.length); assert.equal(report.counters.userReads, 1); assert.equal(report.counters.evaluations, 1);
  assert.equal(report.counters.persistenceWrites, 0); assert.equal(report.counters.networkCalls, 0); assert.equal(report.counters.productOutputs, 0);
  assert.equal(report.boundaries.clientResponseProduced, false); assert.equal(report.boundaries.productRankingAuthorized, false); assert.equal(report.boundaries.productEligibilityAuthorized, false); assert.equal(report.boundaries.writesUserState, false); assert.equal(report.boundaries.writesWorldState, false);
  assert.equal(report.metrics.classification, "TECHNICAL_INTEGRITY_ONLY"); assert.equal(report.metrics.productQualityClaim, false);
  assert.equal(report.sourceCohortHash, manifest.cohortHash); assert.equal(report.worldCohortHash, report.evaluationResult.worldCohort.cohortHash); assert.equal(report.worldSnapshotHashes.length, manifest.spots.length);
});

test("server authority binds request, source, location, World policy and User port fail closed", async () => {
  await assert.rejects(() => runLocalDarkRequestRehearsal({ request, ...authorityFor(request, "Basel"), worldReader: reader, manifest, userProjectionPort: userPort }), /location_authority_mismatch/);
  const { authority, sourceTrust } = authorityFor();
  assert.throws(() => validateDarkRequestAuthority(rehash({ ...authority, sourceIdentity: { ...authority.sourceIdentity, sourceSha: "0".repeat(40) } }, "authorityHash"), sourceTrust), /source_identity_not_trusted/);
  assert.throws(() => validateDarkRequestAuthority(rehash({ ...authority, world: { ...authority.world, registryVersion: "unknown-registry" } }, "authorityHash"), sourceTrust), /world_binding_mismatch/);
  assert.throws(() => validateDarkRequestAuthority(rehash({ ...authority, user: { ...authority.user, portVersion: "unknown-user-port" } }, "authorityHash"), sourceTrust), /user_binding_mismatch/);
});

test("recursive replay rejects fully rehashed inner semantic manipulation", async () => {
  const input = { request, ...authorityFor(), worldReader: reader, manifest, userProjectionPort: userPort }; const report = await runLocalDarkRequestRehearsal(input);
  const forgedMetrics = rehash({ ...report.metrics, falseConfirmationCount: 1 }, "metricsHash"); const forged = rehash({ ...report, metrics: forgedMetrics }, "reportHash");
  await assert.rejects(() => replayLocalDarkRequestRehearsal(input, forged), /dark_request_replay_mismatch/);
  assert.equal((await replayLocalDarkRequestRehearsal(input, report)).reportHash, report.reportHash);
  assert.equal((await runLocalDarkRequestRehearsal(input)).reportHash, report.reportHash);
});

test("closed Week-2 Founder oracle catalog covers all required safety and degradation scenarios", () => {
  assert.equal(FIXTURE_ORACLES.scenarioIds.length, 15); assert.equal(new Set(FIXTURE_ORACLES.scenarioIds).size, 15);
  for (const id of ["quiet-first-date", "family-age12-with-adult", "wheelchair-confirmed-vs-unknown", "target-zurich-device-basel", "founder-family-outing-afternoon", "founder-bouldering-family", "context-flip", "alternative-request", "spot-not-fit", "full-replay", "unknown-hard-constraint", "disputed-world-fact", "not-configured-mapping", "closed-despite-typical-daypart", "single-spot-cohort"]) assert.ok(FIXTURE_ORACLES.scenarioIds.includes(id));
  assert.equal(FIXTURE_ORACLES.oracles.every((item) => !item.productionAuthorized && !item.productQualityClaim && item.rankingExpectation === "NOT_CONFIGURED"), true);
  assert.equal(DARK_REQUEST_THRESHOLD_TEMPLATE.decisionState, "DECISION_REQUIRED"); assert.equal(DARK_REQUEST_THRESHOLD_TEMPLATE.productQualityOracle, "NOT_CONFIGURED");
});

test("Founder A-D and extended scenarios traverse the same authorized read-only adapter", async () => {
  const cases = [
    ["a", "Ich suche nächste Woche in Zürich ein ruhiges Restaurant für ein erstes Date, höchstens 40 CHF pro Person."],
    ["b", "Ich suche nächste Woche in Zürich einen Ort für ein Familienessen für mich und meine zwölfjährige Tochter."],
    ["c", "Ich möchte in Zürich gemütlich Kaffee trinken und brauche einen rollstuhlgerechten Zugang."],
    ["d", "Ich bin in Basel und suche für nächste Woche ein Restaurant in Zürich.", "Basel"],
    ["family", "Familienausflug am Nachmittag in Zürich mit 12-jährigem Kind und Erwachsenen"],
    ["boulder", "Bouldern mit Familie am Nachmittag in Zürich"],
    ["flip", "Lebhaft etwas trinken in Zürich mit Freunden"],
    ["alternative", "Ruhiges Café in Zürich", "Zurich", { alternativeRequested: true }],
    ["reject", "Ruhiges Café in Zürich", "Zurich", { rejectedCandidateIds: [manifest.spots[0].spotId] }],
    ["unknown", "Rollstuhlgerechtes Café in Zürich"],
    ["notconfigured", "Flirrblaues Erlebnis in Zürich"],
    ["closed", "Jetzt geöffnetes Café in Zürich"],
  ];
  for (const [id, text, deviceCity = "Zurich", extra = {}] of cases) { const value = requestFor(`week2-${id}`, text, deviceCity, extra); const report = await run(value, "Zurich"); assert.equal(report.boundaries.evaluationOnly, true); assert.equal(report.counters.productOutputs, 0); }
  const one = createLocalSyntheticDarkRequestManifest({ cohortId: "week2-one-spot", frozenAt: config.observedAt, snapshots: [world.spots[0].snapshot] }); const oneReport = await run(requestFor("week2-single", "Café in Zürich"), "Zurich", one); assert.equal(oneReport.evaluationResult.candidates.length, 1);
});

test("no persistence, network, Supabase or product publisher dependency exists and fixtures are not public", async () => {
  const source = fs.readFileSync(new URL("../src/dark-request.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|supabase|postgres|writeFile|localStorage|publishRecommendation|service_role/i);
  const runtime = await import("../dist/index.js");
  assert.equal("runLocalDarkRequestRehearsal" in runtime, false); assert.equal("provisionLocalDarkRequestAuthority" in runtime, false); assert.equal(typeof runtime.handleDarkDecisionRequest, "function");
});
