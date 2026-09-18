#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const TRACKS = ["WORLD_ADMIN", "USER_UUID_AUTHORITY", "DECISION_SERVER_AUTHORITY", "MOBILE_INTEGRATION"];
const PREFIXES = [
  "package.json", "package-lock.json", ".github/workflows/risk-gate.yml",
  "packages/world-knowledge-core/src/", "packages/world-knowledge-authoring-ui/src/", "admin-dashboard/app/world-knowledge/",
  "packages/user-intelligence-vnext-core/src/", "packages/decision-vnext-core/src/",
  "mobile/app/(tabs)/decision.tsx", "mobile/components/PushNotificationRouter.tsx", "mobile/lib/decision/", "mobile/packages/founder-live-control-plane/src/",
  "delivery/integration/founder-activation-", "docs/operations/FOUNDER_TWO_ACCOUNT_ACTIVATION_RUNBOOK.md",
  "scripts/ci/founder-activation-", "scripts/ci/founder-live-control-plane.mjs",
  "supabase/functions/decision-founder-live/",
];
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();

export function buildFounderActivationArtifact({ root = ROOT, source = "HEAD" } = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 20) throw new Error("founder_activation_artifact_node20_required");
  const sourceSha = git(root, ["rev-parse", `${source}^{commit}`]);
  const sourceTreeSha = git(root, ["rev-parse", `${source}^{tree}`]);
  const files = git(root, ["ls-tree", "-r", sourceSha]).split("\n").filter(Boolean).map((line) => {
    const [metadata, path] = line.split("\t");
    const [, , blobSha] = metadata.split(" ");
    return { path, blobSha };
  }).filter(({ path }) => PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))).sort((left, right) => left.path.localeCompare(right.path));
  if (files.length < 30) throw new Error("founder_activation_artifact_source_set_too_small");
  const sourceSetHash = sha256(files);
  const body = { contractVersion: "backyrd.founder-activation-shared-node20-artifact@1.0", nodeMajor: 20, sourceSha, sourceTreeSha, sourceSetHash, fileCount: files.length, files, tracks: TRACKS, executionAuthorized: false };
  const artifactHash = sha256(body);
  return { ...body, artifactHash, trackVerifications: TRACKS.map((track) => ({ track, sourceSetHash, artifactHash, status: "VERIFIED" })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(buildFounderActivationArtifact({ root: resolve(process.argv[2] ?? ROOT), source: process.argv[3] ?? "HEAD" }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`founder_activation_artifact_blocked:${error.message}\n`); process.exitCode = 1; }
}
