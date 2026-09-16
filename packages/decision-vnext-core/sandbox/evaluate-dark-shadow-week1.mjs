import { execFileSync } from "node:child_process";
import {
  DARK_SHADOW_CONTROL, DARK_SHADOW_ORACLE_CATALOG, DARK_SHADOW_RELEASE,
  FounderLabRequestSchema, PHASE3C_LAB_VERSIONS, createDarkShadowEnvelope,
  evaluateDarkShadow, replayDarkShadow, runFounderDecisionLab,
} from "../dist/index.js";
import { provisionLocalDarkShadowAuthority } from "../dist/shadow-fixtures.js";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sourceSha = git("rev-parse", "HEAD");
const sourceTreeHash = git("rev-parse", "HEAD^{tree}");
const request = FounderLabRequestSchema.parse({
  contractVersion: PHASE3C_LAB_VERSIONS.request,
  requestId: "week1-dark-shadow-smoke",
  ephemeralText: "Ich möchte in Zürich ruhig Kaffee trinken.",
  deviceLocation: { state: "AVAILABLE", city: "Zurich" },
  userMode: "NEUTRAL_MISSING",
  alternativeRequested: false,
  rejectedCandidateIds: [],
});
const canonicalResult = await runFounderDecisionLab({ request });
const { authority, trustAnchor } = provisionLocalDarkShadowAuthority({ sourceSha, sourceTreeHash });
const envelope = createDarkShadowEnvelope({ executionId: "week1-dark-shadow-smoke", evaluationTime: "2026-09-16T12:00:00.000Z", authority, trustAnchor, canonicalResult });
const report = evaluateDarkShadow({ envelope, trustAnchor });
const replay = replayDarkShadow(envelope, report, trustAnchor);
process.stdout.write(`${JSON.stringify({
  contractVersion: "backyrd.decision-vnext.dark-shadow-smoke@week1-1",
  sourceSha, sourceTreeHash,
  controlHash: DARK_SHADOW_CONTROL.controlHash,
  oracleCatalogHash: DARK_SHADOW_ORACLE_CATALOG.catalogHash,
  releaseHash: DARK_SHADOW_RELEASE.releaseHash,
  envelopeHash: envelope.envelopeHash,
  reportHash: report.reportHash,
  replayHash: replay.reportHash,
  executionAuthorized: DARK_SHADOW_CONTROL.executionAuthorized,
  productionDataUsed: report.boundaries.productionDataUsed,
  productRankingAuthorized: DARK_SHADOW_CONTROL.productRankingAuthorized,
  status: report.reportHash === replay.reportHash ? "PASS" : "FAIL",
})}\n`);
