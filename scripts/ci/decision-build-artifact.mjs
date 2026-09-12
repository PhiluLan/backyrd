#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DECISION_TEST_PLAN_VERSION } from "./decision-test-plan.mjs";

const CONTRACT_VERSION = "backyrd-decision-ci-build-artifact-v1";
const DIST_ROOTS = [
  "packages/world-knowledge-core/dist",
  "packages/user-intelligence-vnext-core/dist",
  "packages/decision-vnext-core/dist",
];
const SOURCE_ROOTS = [
  "packages/world-knowledge-core/src",
  "packages/user-intelligence-vnext-core/src",
  "packages/decision-vnext-core/src",
  "packages/decision-vnext-core/test",
  "packages/decision-vnext-core/sandbox",
  "decision-lab/src",
  "decision-lab/test",
  "decision-lab/config",
  ".github/workflows/risk-gate.yml",
  "delivery/change-policy.json",
  "package.json",
  "scripts/ci/decision-build-artifact.mjs",
  "scripts/ci/decision-fast-lane.test.mjs",
  "scripts/ci/run-decision-ci.mjs",
  "scripts/ci/decision-test-plan.mjs",
  "scripts/ci/validate-decision-test-plan.mjs",
  "scripts/ci/verify-decision-shards.mjs",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function filesUnder(root, entries) {
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(root, entry);
    if (!existsSync(absolute)) throw new Error(`decision_artifact_path_missing:${entry}`);
    if (lstatSync(absolute).isFile()) { files.push(entry); continue; }
    const walk = (directory) => {
      for (const name of readdirSync(directory).sort()) {
        const child = join(directory, name);
        if (lstatSync(child).isDirectory()) walk(child);
        else files.push(relative(root, child).split(sep).join("/"));
      }
    };
    walk(absolute);
  }
  return [...new Set(files)].sort();
}

function entries(root, paths) {
  return filesUnder(root, paths).map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) }));
}

export function createDecisionBuildArtifact(root) {
  const lockfileHash = sha256(readFileSync(resolve(root, "package-lock.json")));
  const sources = entries(root, SOURCE_ROOTS);
  const files = entries(root, DIST_ROOTS);
  const body = {
    contractVersion: CONTRACT_VERSION,
    testPlanVersion: DECISION_TEST_PLAN_VERSION,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    lockfileHash,
    sourceSetHash: sha256(JSON.stringify(sources)),
    files,
  };
  return { ...body, artifactHash: sha256(JSON.stringify(body)) };
}

export function verifyDecisionBuildArtifact(root, value) {
  if (!value || value.contractVersion !== CONTRACT_VERSION) throw new Error("decision_artifact_contract_unknown");
  const expected = createDecisionBuildArtifact(root);
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("decision_artifact_integrity_mismatch");
  return expected;
}

const parseArgs = (argv) => Object.fromEntries(argv.reduce((items, value, index) => {
  if (value.startsWith("--")) items.push([value.slice(2), argv[index + 1]]);
  return items;
}, []));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    if (args.create) {
      const manifest = createDecisionBuildArtifact(root);
      writeFileSync(resolve(args.create), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "w" });
      process.stdout.write(`${JSON.stringify({ outcome: "PASS", artifactHash: manifest.artifactHash })}\n`);
    } else if (args.verify) {
      const manifest = JSON.parse(readFileSync(resolve(args.verify), "utf8"));
      const verified = verifyDecisionBuildArtifact(root, manifest);
      process.stdout.write(`${JSON.stringify({ outcome: "PASS", artifactHash: verified.artifactHash })}\n`);
    } else throw new Error("decision_artifact_mode_required");
  } catch (error) {
    process.stderr.write(`decision_artifact_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
