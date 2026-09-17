import { execFileSync } from "node:child_process";
import {
  ACCEPTED_SOURCE_POLICY, WORLD_KNOWLEDGE_PORT_VERSION, buildWorldKnowledgeSnapshot,
  createWorldDarkReader, parseBuildWorldKnowledgeInput, resolutionRequest, resolveWorldKnowledge,
} from "@backyrd/world-knowledge-core";
import {
  FounderLabRequestSchema, PHASE3C_LAB_VERSIONS, SyntheticUserProjectionReader,
  INTERNAL_DARK_ALLOWLIST, INTERNAL_DARK_CONTROL, INTERNAL_DARK_RELEASE,
  createInternalDarkPostDeployEvidence, contentHash, handleInternalDarkShadowRequest,
} from "../dist/index.js";
import {
  createLocalInternalDarkController, enableLocalInternalDarkTestOn,
  provisionLocalInternalDarkEnvelope, replayLocalInternalDarkShadow,
  runLocalInternalDarkShadow,
} from "../dist/internal-dark-shadow-fixtures.js";
import {
  createLocalSyntheticDarkRequestManifest, provisionLocalDarkRequestAuthority,
  runLocalDarkRequestRehearsal,
} from "../dist/dark-request-fixtures.js";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sourceSha = git("rev-parse", "HEAD"); const sourceTreeHash = git("rev-parse", "HEAD^{tree}");
const resolution = resolveWorldKnowledge({ ...resolutionRequest([]), sourcePolicy: ACCEPTED_SOURCE_POLICY }, [ACCEPTED_SOURCE_POLICY]);
const snapshots = Array.from({ length: 8 }, (_, index) => buildWorldKnowledgeSnapshot(parseBuildWorldKnowledgeInput({ contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, spotId: `week3-spot-${String(index + 1).padStart(2, "0")}`, resolution }, [ACCEPTED_SOURCE_POLICY]), [ACCEPTED_SOURCE_POLICY]));
const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.spot.spotId, snapshot]));
const manifest = createLocalSyntheticDarkRequestManifest({ cohortId: "week3-internal-dark-shadow", frozenAt: "2026-01-15T12:00:00.000Z", snapshots });
const referenceReader = { contractVersion: "backyrd.world-knowledge.reader-port@1.0", async readSnapshot({ spotId }) { const snapshot = snapshotById.get(spotId); if (!snapshot) throw new Error("snapshot_not_found"); return snapshot; } };
const darkReader = createWorldDarkReader({ configuration: { WORLD_PRODUCT_READ: "true", WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED", WORLD_PRODUCT_READ_ENVIRONMENT: "PROD_LIKE_TEST" }, loadSnapshot: async ({ spotId }) => snapshotById.get(spotId) });
const userProjectionPort = new SyntheticUserProjectionReader("MISSING_SNAPSHOT");
const requestFor = (id, text, deviceCity = "Zurich", extra = {}) => FounderLabRequestSchema.parse({ contractVersion: PHASE3C_LAB_VERSIONS.request, requestId: `week3-${id}`, ephemeralText: text, deviceLocation: { state: "AVAILABLE", city: deviceCity }, userMode: "NEUTRAL_MISSING", alternativeRequested: false, rejectedCandidateIds: [], ...extra });

async function prepare(request, city = "Zurich") {
  const referenceAuthority = provisionLocalDarkRequestAuthority({ request, city, manifest, sourceSha, sourceTreeHash });
  const referenceReport = await runLocalDarkRequestRehearsal({ request, ...referenceAuthority, worldReader: referenceReader, manifest, userProjectionPort });
  const reference = { report: referenceReport, ...referenceAuthority };
  return { reference, ...provisionLocalInternalDarkEnvelope({ request, city, environment: "PROD_LIKE_TEST", manifest, worldDarkReader: darkReader, reference, sourceSha, sourceTreeHash }) };
}

async function execute(prepared, onWorldRead) {
  const controller = createLocalInternalDarkController(); enableLocalInternalDarkTestOn(controller);
  const result = await runLocalInternalDarkShadow({ ...prepared, manifest, worldDarkReader: darkReader, userProjectionPort, controller, onWorldRead });
  return { result, controller };
}

const disabled = await handleInternalDarkShadowRequest({ untrusted: true }, { requestedMode: "TEST_ON" });
const scenarios = [
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
  ["disputed", "Umstrittenes Café in Zürich"],
  ["not-configured", "Flirrblaues Erlebnis in Zürich"],
  ["closed", "Jetzt geöffnetes Café in Zürich"],
];
const scenarioResults = [];
let primary = null;
for (const [id, text, deviceCity = "Zurich", extra = {}] of scenarios) {
  const prepared = await prepare(requestFor(id, text, deviceCity, extra)); const { result } = await execute(prepared);
  if ("status" in result) throw new Error(`unexpected_abort:${id}`);
  if (id === "c") primary = { prepared, report: result };
  scenarioResults.push({ scenarioId: id, reportHash: result.reportHash, interpretationHash: result.interpretationHash, candidateSetHash: result.candidateSetHash, counters: result.counters, resultDiscarded: result.boundaries.resultDiscarded });
}
if (!primary) throw new Error("primary_scenario_missing");
const { result: second } = await execute(primary.prepared); if ("status" in second) throw new Error("unexpected_second_abort");
const replayController = createLocalInternalDarkController(); enableLocalInternalDarkTestOn(replayController);
const replay = await replayLocalInternalDarkShadow({ ...primary.prepared, manifest, worldDarkReader: darkReader, userProjectionPort, controller: replayController }, primary.report);
if (JSON.stringify(primary.report) !== JSON.stringify(second) || primary.report.reportHash !== replay.reportHash) throw new Error("internal_dark_non_deterministic");
const abortController = createLocalInternalDarkController(); enableLocalInternalDarkTestOn(abortController);
const aborted = await runLocalInternalDarkShadow({ ...primary.prepared, manifest, worldDarkReader: darkReader, userProjectionPort, controller: abortController, onWorldRead(count) { if (count === 1) abortController.emergencyOff(); } });
if (!("status" in aborted)) throw new Error("emergency_off_did_not_abort");
const productionPlanHash = contentHash({ status: "PLAN_ONLY_NOT_EXECUTED", executionAuthorized: false, sourceSha, sourceTreeHash });
const postDeployEvidence = createInternalDarkPostDeployEvidence({ envelope: primary.prepared.envelope, trust: primary.prepared.artifactTrust, report: primary.report, productionPlanHash });

process.stdout.write(`${JSON.stringify({
  contractVersion: "backyrd.decision-vnext.internal-dark-shadow-evaluation@week3-1", sourceSha, sourceTreeHash,
  controlHash: INTERNAL_DARK_CONTROL.controlHash, allowlistHash: INTERNAL_DARK_ALLOWLIST.allowlistHash,
  releaseHash: INTERNAL_DARK_RELEASE.releaseHash, cohortHash: manifest.cohortHash,
  envelopeHash: primary.prepared.envelope.envelopeHash, artifactTrustHash: primary.prepared.artifactTrust.trustHash,
  reportHash: primary.report.reportHash, replayHash: replay.reportHash, postDeployEvidenceHash: postDeployEvidence.evidenceHash,
  productionPlanHash, defaultOff: { status: disabled.status, reason: disabled.reason, counters: disabled.counters },
  testOn: { environment: primary.prepared.envelope.environment, counters: primary.report.counters, resultDiscarded: true, productOutputProduced: false },
  emergencyOff: aborted, metrics: primary.report.metrics, scenarios: scenarioResults,
  postDeployStatus: postDeployEvidence.status, executionAuthorized: false, productionAuthorized: false,
  status: "PASS",
})}\n`);
