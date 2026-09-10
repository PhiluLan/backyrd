import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTRACT_VERSIONS, SYNTHETIC_WORLD_SOURCE_POLICY, SyntheticPhase2UserProjectionPort, SyntheticWorldKnowledgeReader,
  canonicalJson, contentHash, generateSyntheticWorld, replayPhase2Evaluation, runPhase2Evaluation,
} from "../dist/index.js";

const configPath = resolve(process.argv[2] ?? "sandbox/config/world-smoke-v1.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const world = generateSyntheticWorld(config);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const city = config.cities[0];
const request = {
  contractVersion: CONTRACT_VERSIONS.decisionRequest,
  idempotencyKey: `phase2-${config.seed}`,
  clientRequestedAt: config.observedAt,
  location: { kind: "city", city },
  intentKeys: ["fixture.intent.eat"], moodKeys: ["fixture.mood.calm"],
  budget: { state: "KNOWN", namespace: "fixture.context.budget", values: ["fixture.budget.flexible"] },
  availableTime: { state: "KNOWN", namespace: "fixture.context.available-time", values: ["fixture.time.90-minutes"] },
  shownCandidateIds: [], rejectedCandidateIds: [], hardConstraints: [{ kind: "open_now", value: true }], softPreferences: [],
  client: { surface: "synthetic", version: "phase2-evaluation-cli-v1" },
};
const subjectBindingHash = contentHash(`phase2-subject:${config.seed}`);
const snapshotHash = contentHash(`phase2-user-snapshot:${config.seed}`);
const { envelope, report } = await runPhase2Evaluation({
  scenarioId: `phase2-seed-${config.seed}`, seed: config.seed, sourceSha, request, world,
  worldReader: new SyntheticWorldKnowledgeReader(world), acceptedWorldSourcePolicy: SYNTHETIC_WORLD_SOURCE_POLICY,
  userProjectionPort: new SyntheticPhase2UserProjectionPort("ACTIVE", "syn-spot-0013"), candidatePoolSize: config.candidatePoolSize,
  authority: { decisionId: `phase2-decision-${config.seed}`, serverRequestId: `phase2-server-request-${config.seed}`, sessionId: `phase2-session-${config.seed}`, serverTime: config.observedAt, idempotencyIdentity: `phase2-idempotency-${config.seed}`, authorizedLocationScope: { kind: "city", city }, actor: { kind: "AUTHENTICATED_USER", userId: "syn-user-0001", subjectBindingHash, authenticationContextHash: contentHash(`phase2-auth:${config.seed}`) }, userSnapshot: { snapshotId: `phase2-user-snapshot-${config.seed}`, snapshotHash } },
});
const replayed = replayPhase2Evaluation(envelope, report);
if (canonicalJson(replayed) !== canonicalJson(report)) throw new Error("phase2_cli_replay_not_byte_identical");
process.stdout.write(`${canonicalJson(report)}\n`);
