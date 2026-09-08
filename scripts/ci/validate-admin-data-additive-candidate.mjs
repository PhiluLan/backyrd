#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { generateCandidateEvidence } from "../../decision-lab/src/recertification-generate.mjs";
import { verifyPreMergeCandidate } from "../../decision-lab/src/recertification-verify.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const baseSha = process.env.PR_BASE_SHA;
const headSha = process.env.PR_HEAD_SHA;
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();

if (!baseSha || !headSha) {
  process.stdout.write("Not a pull-request context; admin-data-additive candidate gate not applicable.\n");
  process.exit(0);
}
const changed = git(["diff", "--name-status", baseSha, headSha]).split("\n").filter(Boolean).map((line) => line.split("\t"));
const manifests = changed.filter(([status, path]) => status === "A" && /^docs\/operations\/admin-data-additive\/.+\.json$/.test(path)).map(([, path]) => path);
const touchesAdminData = changed.some(([, ...paths]) => paths.some((path) => /^supabase\/(?:migrations|tests)\//.test(path) || /^supabase\/canonical\/admin-data-additive\//.test(path) || /^scripts\/ci\/admin-data-additive\//.test(path)));
if (!manifests.length && !touchesAdminData) {
  process.stdout.write("No admin-data-additive candidate detected.\n");
  process.exit(0);
}
if (manifests.length !== 1) throw new Error(`exactly one newly added admin-data-additive manifest is required, found ${manifests.length}`);
const freeze = JSON.parse(execFileSync("git", ["show", `${baseSha}:decision-lab/config/additive-recertification-v1.freeze.json`], { cwd: root, encoding: "utf8" }));
const baseVersion = freeze.currentVersion.match(/v(\d+)$/)?.[1];
if (!baseVersion) throw new Error("canonical additive parent version is unreadable");
const artifact = await generateCandidateEvidence({
  root,
  baseVersion: `v${baseVersion}`,
  baseMainSha: baseSha,
  candidateSha: headSha,
  evidencePaths: manifests,
  requestedScope: "admin-data-additive",
  adminDataManifestPath: manifests[0],
});
const receipt = await verifyPreMergeCandidate({ root, artifact, prBaseSha: baseSha, prHeadSha: headSha });
const proof = { baseMainSha: artifact.baseMainSha, candidateSha: artifact.candidateSha, candidateProductTree: artifact.candidateProductTree, artifactHash: artifact.artifactHash, verifierVersion: receipt.verifierVersion, valid: receipt.valid, reasons: receipt.reasons };
process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
if (!receipt.valid) process.exitCode = 1;
