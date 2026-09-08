#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash } from "../../decision-lab/src/canonical-json.mjs";
import { verifyCandidateEvidence } from "../../decision-lab/src/recertification-verify.mjs";

export function activeAdminDataEvidenceProblems({
  freeze,
  record,
  verification,
  baseDescendsToCandidate,
  candidateIntegrated,
  candidateTree,
}) {
  const problems = [];
  const unsignedRecord = { ...record };
  delete unsignedRecord.recertificationHash;
  if (record.status !== "VERIFIED_ADDITIVE_EVIDENCE" || record.scope !== "admin-data-additive") problems.push("record is not active Admin/data evidence");
  if (freeze.currentVersion !== record.version || freeze.currentRecertificationHash !== record.recertificationHash) problems.push("freeze does not bind the record");
  if (contentHash(unsignedRecord) !== record.recertificationHash) problems.push("record content hash differs");
  if (!record.candidateArtifact || !record.verificationReceipt || !record.adminData) problems.push("record payload is incomplete");
  if (record.candidateArtifact && record.candidateArtifactHash !== record.candidateArtifact.artifactHash) problems.push("artifact hash binding differs");
  if (record.verificationReceipt && record.verificationHash !== record.verificationReceipt.verificationHash) problems.push("receipt hash binding differs");
  if (record.candidateArtifact && (record.baseMainSha !== record.candidateArtifact.baseMainSha || record.candidateSha !== record.candidateArtifact.candidateSha)) problems.push("base/candidate binding differs");
  if (record.candidateArtifact && record.adminData && contentHash(record.adminData) !== contentHash(record.candidateArtifact.adminData)) problems.push("Admin/data projection differs");
  if (record.candidateArtifact && (record.candidateProductTree !== record.candidateArtifact.candidateProductTree || record.candidateProductTree !== candidateTree)) problems.push("candidate tree binding differs");
  if (!baseDescendsToCandidate) problems.push("candidate does not descend from its bound base");
  if (!candidateIntegrated) problems.push("candidate is not integrated in the reviewed head");
  if (!verification?.valid || (record.verificationReceipt && contentHash(verification) !== contentHash(record.verificationReceipt))) problems.push("fresh receipt verification differs");
  return problems;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const value = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : process.argv[index + 1];
  };
  const root = resolve(value("--root") ?? new URL("../..", import.meta.url).pathname);
  const headSha = value("--head-sha") ?? "HEAD";
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const isAncestor = (ancestor, descendant) => spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" }).status === 0;
  const freeze = JSON.parse(readFileSync(resolve(root, "decision-lab/config/additive-recertification-v1.freeze.json"), "utf8"));
  const recordPath = resolve(root, `decision-lab/config/${freeze.currentVersion}.json`);
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  if (record.scope !== "admin-data-additive") {
    process.stdout.write(`${JSON.stringify({ mode: "inactive" })}\n`);
    process.exit(0);
  }
  const headCommit = git(["rev-parse", `${headSha}^{commit}`]);
  const candidateTree = git(["rev-parse", `${record.candidateSha}^{tree}`]);
  const verification = await verifyCandidateEvidence({
    root,
    artifact: record.candidateArtifact,
    trustedBaseSha: record.baseMainSha,
    verifierVersion: record.verificationReceipt?.verifierVersion,
  });
  const problems = activeAdminDataEvidenceProblems({
    freeze,
    record,
    verification,
    baseDescendsToCandidate: isAncestor(record.baseMainSha, record.candidateSha),
    candidateIntegrated: isAncestor(record.candidateSha, headCommit),
    candidateTree,
  });
  if (problems.length) throw new Error(`active Admin/data evidence is invalid: ${problems.join(", ")}`);
  process.stdout.write(`${JSON.stringify({
    mode: "admin-data-additive-active",
    version: record.version,
    baseSha: record.baseMainSha,
    candidateSha: record.candidateSha,
    candidateTree: record.candidateProductTree,
    artifactHash: record.candidateArtifactHash,
    receiptHash: record.verificationHash,
    manifestPath: record.adminData.manifestPath,
  })}\n`);
}
