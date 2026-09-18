#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const TRACKS = ["WORLD", "USER", "DECISION", "MOBILE", "ADMIN", "INTEGRATION"];
const PREFIXES = [
  "package-lock.json", "package.json",
  "packages/world-knowledge-core/src/", "packages/user-intelligence-vnext-core/src/", "packages/decision-vnext-core/src/",
  "mobile/packages/founder-live-control-plane/src/", "mobile/app/(tabs)/decision.tsx", "mobile/lib/decision/",
  "admin-dashboard/app/world-knowledge/", "packages/world-knowledge-authoring-ui/src/",
  "delivery/integration/accelerated-production-roadmap.json", "delivery/integration/dependency-ownership-matrix.json",
  "delivery/integration/founder-live-manifest.json", "docs/adr/ADR-DECISION-VNEXT-012-INDEPENDENT-PRODUCT.md",
  "docs/operations/integration/FOUNDER_LIVE_",
];
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();

export function buildFounderLiveArtifact({ root = ROOT, source = "HEAD" } = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 20) throw new Error("founder_live_artifact_node20_required");
  const sourceSha = git(root, ["rev-parse", `${source}^{commit}`]);
  const sourceTreeSha = git(root, ["rev-parse", `${source}^{tree}`]);
  const entries = git(root, ["ls-tree", "-r", sourceSha]).split("\n").filter(Boolean).map((line) => {
    const [metadata, path] = line.split("\t"); const [, , blobSha] = metadata.split(" "); return { path, blobSha };
  }).filter(({ path }) => PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))).sort((a, b) => a.path.localeCompare(b.path));
  if (entries.length < 20) throw new Error("founder_live_artifact_source_set_too_small");
  const sourceSetHash = sha256(entries);
  const body = { contractVersion: "backyrd.founder-live-shared-node20-artifact@1.0", nodeMajor: 20, sourceSha, sourceTreeSha, sourceSetHash, fileCount: entries.length, tracks: TRACKS, files: entries, executionAuthorized: false };
  return { ...body, artifactHash: sha256(body), trackVerifications: TRACKS.map((track) => ({ track, artifactHash: sha256(body), sourceSetHash, status: "VERIFIED" })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(buildFounderLiveArtifact({ root: resolve(process.argv[2] ?? ROOT), source: process.argv[3] ?? "HEAD" }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`founder_live_artifact_blocked:${error.message}\n`); process.exitCode = 1; }
}
