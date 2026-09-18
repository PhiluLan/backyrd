#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { FOUNDER_COHORT_VERSION, FOUNDER_EVALUATION_SCOPE, REGISTRY_HASH, REGISTRY_VERSION } from "@backyrd/world-knowledge-core";
import {
  FOUNDER_LIVE_API_VERSIONS, FOUNDER_LIVE_RELEASE, SyntheticUserProjectionReader, SyntheticWorldKnowledgeReader,
  canonicalJson, contentHash, createCanonicalFounderLiveEvaluator, createFounderLivePostDeployEvidence, executeFounderLiveDecision, executeFounderLiveDualRun, generateSyntheticWorld,
} from "../dist/index.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "../dist/synthetic-world-policy.js";

const root = new URL("../../..", import.meta.url).pathname;
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTreeHash = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
const now = "2026-09-17T18:00:00.000Z";
const actor = Object.freeze({ userId: "founder-live-evaluation-user", subjectBindingHash: contentHash("founder-live-evaluation-subject"), authenticationContextHash: contentHash("founder-live-evaluation-auth"), expertAccess: true });
const world = generateSyntheticWorld({ configVersion: "backyrd-vnext-sandbox-config-v1", worldVersion: "backyrd-vnext-synthetic-world-founder-live-api", seed: 3101, observedAt: now, spotCount: 12, userCount: 3, cities: ["Zurich", "Basel"], candidatePoolSize: 8 });
const spots = [...world.spots].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 5);
const manifestBody = { contractVersion: FOUNDER_COHORT_VERSION, scope: FOUNDER_EVALUATION_SCOPE, cohortId: "founder-live-local-cohort-1", frozenAt: now, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion, policyHash: SYNTHETIC_WORLD_SOURCE_POLICY.policyHash, spots: spots.map((spot) => ({ spotId: spot.id, manifestHash: contentHash(`manifest:${spot.id}`), snapshotHash: spot.snapshot.snapshotHash, contextHandoffHash: contentHash(`context:${spot.id}`) })), exclusions: ["ADMIN_NOTES", "OWNER_TIER", "PAYMENT", "PRIVATE_ACTOR_IDS", "PRIVATE_SOURCE_REFERENCES", "RAW_AI_OUTPUTS", "SUBSCRIPTION"] };
const manifest = Object.freeze({ ...manifestBody, cohortHash: contentHash(manifestBody) });
const state = new Map();
const createPorts = () => { const records = new Map(); return { auth: { contractVersion: "backyrd.decision-vnext.founder-live-auth-port@2.0", async authenticate() { return actor; } }, allowlist: { contractVersion: "backyrd.decision-vnext.founder-live-allowlist-port@2.0", async authorize() { return { authorized: true, authorityVersion: "backyrd.decision-vnext.founder-live-synthetic-authority@1.0", decisionHash: contentHash("synthetic-founder-live-authority") }; } }, authority: { contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0", async bind({ requestedCity }) { return { serverTime: now, authorizedCity: requestedCity, locationBindingHash: contentHash({ requestedCity, authorizedCity: requestedCity, subjectBindingHash: actor.subjectBindingHash }) }; } }, world: new SyntheticWorldKnowledgeReader(world), retrieval: { contractVersion: "backyrd.decision-vnext.founder-live-retrieval-port@1.0", async retrieve() { return manifest; } }, user: new SyntheticUserProjectionReader("MISSING_SNAPSHOT"), evaluator: createCanonicalFounderLiveEvaluator(), userSnapshot: null, idempotency: { contractVersion: "backyrd.decision-vnext.founder-live-idempotency-port@1.0", async read(key) { return records.get(key) ?? null; }, async create(key, value) { if (records.has(key)) return "CONFLICT"; records.set(key, value); return "CREATED"; } }, rateLimit: { contractVersion: "backyrd.decision-vnext.founder-live-rate-limit-port@1.0", async consume() { return true; } }, control: { enabled: true, environment: "PROD_LIKE_TEST", purpose: "FOUNDER_DECISION_EVALUATION", requestTimeoutMilliseconds: 2_000, maxRequestBytes: 16_384, isKillSwitchEngaged() { return false; } } }; };
const ports = createPorts();
const scenarios = [
  ["A", "Ruhiges Restaurant in Zürich für ein erstes Date, höchstens 40 CHF pro Person", false, []],
  ["B", "Familienessen in Basel mit 12-jährigem Kind und Erwachsenen", false, []],
  ["C", "Rollstuhlgerechtes gemütliches Café in Basel", false, []],
  ["D", "Restaurant in Zürich", false, []],
  ["FAMILY", "Familienausflug in Basel am Nachmittag", false, []],
  ["BOULDER", "Bouldern in Basel mit Familie", false, []],
  ["FLIP", "Lebhafte Bar in Basel mit Freunden", false, []],
  ["ALTERNATIVE", "Café in Basel", true, []],
  ["REJECT", "Café in Basel", false, [spots[0].id]],
  ["REPLAY", "Café in Basel", false, []],
];
const results = [];
for (const [scenarioId, naturalLanguage, alternativeRequested, rejectedCandidateIds] of scenarios) {
  const request = { contractVersion: FOUNDER_LIVE_API_VERSIONS.request, requestId: `founder-live-${scenarioId.toLowerCase()}`, idempotencyKey: `founder-live-${scenarioId.toLowerCase()}`, naturalLanguage, explicit: {}, alternativeRequested, rejectedCandidateIds };
  const execution = await executeFounderLiveDecision(request, actor, ports);
  results.push({ scenarioId, requestHash: execution.expert.envelope.requestHash, responseHash: contentHash(execution.response), expertHash: execution.expert.expertHash, candidateCount: execution.response.candidates.length });
}
const replayRequest = { contractVersion: FOUNDER_LIVE_API_VERSIONS.request, requestId: "founder-live-replay", idempotencyKey: "founder-live-replay", naturalLanguage: "Café in Basel", explicit: {}, alternativeRequested: false, rejectedCandidateIds: [] };
const replayOne = await executeFounderLiveDecision(replayRequest, actor, ports); const replayTwo = await executeFounderLiveDecision(replayRequest, actor, ports);
if (canonicalJson(replayOne) !== canonicalJson(replayTwo)) throw new Error("founder_live_replay_mismatch");
const dualRun = await executeFounderLiveDualRun({ request: replayRequest, actor, primary: createPorts(), comparator: createPorts() });
const reportBody = { contractVersion: "backyrd.decision-vnext.founder-live-evaluation-report@1.0", releaseHash: FOUNDER_LIVE_RELEASE.releaseHash, sourceSha, sourceTreeHash, worldHash: world.worldHash, cohortHash: manifest.cohortHash, scenarioCount: results.length, results, replayIdentical: true, dualRunHash: dualRun.reportHash, dualRunSemanticEquivalent: dualRun.semanticResponseEquivalent, productionAuthorized: false, productRankingAuthorized: false, externalNetworkUsed: false };
const report = { ...reportBody, reportHash: contentHash(reportBody) };
const planHash = contentHash({ sourceSha, sourceTreeHash, releaseHash: FOUNDER_LIVE_RELEASE.releaseHash, action: "NO_GO", executionAuthorized: false, migrations: [], functions: [] });
const postDeployEvidence = createFounderLivePostDeployEvidence(planHash);
process.stdout.write(`${JSON.stringify({ ...report, postDeployEvidence }, null, 2)}\n`);
