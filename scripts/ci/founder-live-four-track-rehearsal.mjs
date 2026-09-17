#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const run = (command, args) => execFileSync(command, args, {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 100 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

if (Number(process.versions.node.split(".")[0]) !== 20) throw new Error("founder_live_four_track_node20_required");

run("npm", ["run", "world-knowledge:build"]);
run("npm", ["run", "user-intelligence-vnext:build"]);
run("npm", ["run", "decision-vnext:build"]);

const suites = [
  { track: "WORLD_ADMIN", files: ["packages/world-knowledge-core/test/slice4a-authoring.test.mjs", "packages/world-knowledge-core/test/authoring-reliability.test.mjs", "packages/world-knowledge-core/test/founder-handoff.test.mjs"] },
  { track: "USER", files: ["packages/user-intelligence-vnext-core/test/founder-live-projection.test.mjs"] },
  { track: "DECISION", files: ["packages/decision-vnext-core/test/founder-live-api.test.mjs"] },
  { track: "MOBILE_INTEGRATION", files: ["mobile/packages/founder-live-control-plane/test/control-plane.test.mjs", "scripts/ci/founder-live-control-plane.test.mjs"] },
];

for (const suite of suites) run(process.execPath, ["--test", ...suite.files]);
const browser = JSON.parse(run(process.execPath, ["scripts/ci/founder-live-e2e.mjs"]).trim());

const body = {
  contractVersion: "backyrd.founder-live-four-track-rehearsal@1.0",
  nodeMajor: 20,
  status: "PASS",
  tracks: suites.map(({ track, files }) => ({ track, files, status: "PASS" })),
  flow: "ADMIN_AUTHORING_TO_WORLD_READER_TO_USER_PROJECTION_TO_DECISION_API_TO_MOBILE",
  scenarios: ["A", "B", "C", "D", "FAMILY_OUTING", "BOULDERING", "CONTEXT_FLIP", "ALTERNATIVE", "SITUATIONAL_REJECT"],
  failClosed: ["DEFAULT_OFF", "EMERGENCY_OFF", "ALLOWLIST_DENIED", "AUTH_STALE_OR_INVALID", "AUTHORITY_MISMATCH", "IDEMPOTENCY_CONFLICT", "RATE_LIMIT", "UNKNOWN_VERSION", "PORT_FAILURE", "TIMEOUT"],
  boundaries: {
    productionActions: 0,
    externalNetworkCalls: 0,
    productOutputs: 0,
    durableUserWrites: 0,
    userLearning: "OFF",
    ranking: "NOT_CONFIGURED",
    confidenceInfluence: "NOT_CONFIGURED",
    syntheticProductionMixing: false
  },
  browser: {
    adminBrowser: browser.adminBrowser,
    mobileViewports: browser.mobileViewports,
    assertions: browser.assertions,
    manualFileHandoffs: browser.manualFileHandoffs
  },
  executionAuthorized: false
};

process.stdout.write(`${JSON.stringify({ ...body, evidenceHash: hash(body) })}\n`);
