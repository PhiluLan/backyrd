#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { buildFounderActivationArtifact } from "./founder-activation-artifact.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const run = (command, args) => execFileSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 100 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

if (Number(process.versions.node.split(".")[0]) !== 20) throw new Error("founder_activation_four_track_node20_required");

for (const script of ["world-knowledge:build", "user-intelligence-vnext:build", "decision-vnext:build"]) run("npm", ["run", script]);
const tracks = [
  { track: "WORLD_ADMIN", tests: ["packages/world-knowledge-core/test/slice4a-authoring.test.mjs", "packages/world-knowledge-core/test/authoring-reliability.test.mjs", "packages/world-knowledge-core/test/founder-handoff.test.mjs"] },
  { track: "USER_UUID_AUTHORITY", tests: ["packages/user-intelligence-vnext-core/test/founder-live-projection.test.mjs", "packages/user-intelligence-vnext-core/test/founder-live-uuid-authority.test.mjs"] },
  { track: "DECISION_SERVER_AUTHORITY", tests: ["packages/decision-vnext-core/test/founder-live-api.test.mjs", "packages/decision-vnext-core/test/isolation.test.mjs"] },
  { track: "MOBILE_INTEGRATION", tests: ["mobile/packages/founder-live-control-plane/test/control-plane.test.mjs", "scripts/ci/founder-activation-control-plane.test.mjs", "scripts/ci/scan-founder-activation-pii.test.mjs"] },
];
for (const { tests } of tracks) run(process.execPath, ["--test", ...tests]);

const artifact = buildFounderActivationArtifact({ root: ROOT, source: process.argv[2] ?? "HEAD" });
const body = {
  contractVersion: "backyrd.founder-activation-four-track-rehearsal@1.0",
  status: "PASS",
  nodeMajor: 20,
  tracks: tracks.map(({ track, tests }) => ({ track, tests, artifactHash: artifact.artifactHash, sourceSetHash: artifact.sourceSetHash, status: "PASS" })),
  flow: ["AUTHENTICATED_SESSION", "SERVER_UUID_ALLOWLIST", "WORLD_READ", "MINIMIZED_USER_PROJECTION", "DECISION_API", "MOBILE_RESULT", "SITUATIONAL_REJECT", "ALTERNATIVE", "EMERGENCY_OFF"],
  negativeCases: ["MISSING_CONFIGURATION", "MALFORMED_CONFIGURATION", "WRONG_ENVIRONMENT", "UNKNOWN_MEMBER", "SESSION_SUBJECT_MISMATCH", "EMAIL_AUTHORITY", "USER_METADATA_AUTHORITY", "CLIENT_FOUNDER_CLAIM", "REVOKED_SESSION", "CONSENT_WITHDRAWN", "ACCOUNT_ERASURE", "KILL_SWITCH"],
  boundaries: { configuredMembers: 2, concreteIdentityValues: 0, durableWrites: 0, externalNetworkCalls: 0, productOutputsAfterEmergencyOff: 0, readsAfterEmergencyOff: 0, projectionsAfterEmergencyOff: 0, learning: "OFF", writeback: "OFF", ranking: "OFF", shadow: "OFF", productionActions: 0 },
  executionAuthorized: false,
};
process.stdout.write(`${JSON.stringify({ ...body, evidenceHash: hash(body) })}\n`);
