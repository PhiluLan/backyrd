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
  readRecord,
}) {
  const problems = [];
  const unsignedRecord = { ...record };
  delete unsignedRecord.recertificationHash;
  if (record.status !== "VERIFIED_ADDITIVE_EVIDENCE" || record.scope !== "admin-data-additive") problems.push("record is not active Admin/data evidence");
  if (freeze.currentVersion !== record.version || freeze.currentRecertificationHash !== record.recertificationHash) {
    try {
      const historicalRecord = resolveHistoricalAdminDataRecord({ freeze, readRecord });
      if (historicalRecord.version !== record.version || contentHash(historicalRecord) !== contentHash(record)) {
        problems.push("active additive chain does not bind the record");
      }
    } catch {
      problems.push("active additive chain does not bind the record");
    }
  }
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

export function resolveHistoricalAdminDataRecord({ freeze, readRecord }) {
  let record = readRecord(freeze.currentVersion);
  if (freeze.currentVersion !== record.version || freeze.currentRecertificationHash !== record.recertificationHash) {
    throw new Error("active freeze does not bind current additive record");
  }
  const seen = new Set();
  while (record.scope !== "admin-data-additive") {
    if (seen.has(record.version)) throw new Error("active additive parent cycle");
    seen.add(record.version);
    if (record.status !== "VERIFIED_ADDITIVE_EVIDENCE") throw new Error("active additive parent is not verified");
    const unsigned = { ...record };
    delete unsigned.recertificationHash;
    if (contentHash(unsigned) !== record.recertificationHash) throw new Error("active additive record content hash differs");
    const currentVersion = Number(record.version?.match(/^decision-v13-production-recertification-v(\d+)$/)?.[1]);
    const parentVersion = Number(record.parent?.version?.match(/^decision-v13-production-recertification-v(\d+)$/)?.[1]);
    if (!Number.isInteger(currentVersion) || parentVersion !== currentVersion - 1) throw new Error("active additive parent version is not contiguous");
    const parent = readRecord(record.parent.version);
    if (record.parent.path !== `decision-lab/config/${parent.version}.json` || record.parent.manifestHash !== contentHash(parent)) {
      throw new Error("active additive parent identity differs");
    }
    record = parent;
  }
  return record;
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
  const readRecord = (version) => JSON.parse(readFileSync(resolve(root, `decision-lab/config/${version}.json`), "utf8"));
  let record;
  try {
    record = resolveHistoricalAdminDataRecord({ freeze, readRecord });
  } catch (error) {
    if (readRecord(freeze.currentVersion).scope !== "admin-data-additive") {
      process.stderr.write(`active_admin_data_parent_blocked:${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
  if (!record) {
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
    readRecord,
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
