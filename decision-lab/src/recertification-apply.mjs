import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { contentHash } from "./canonical-json.mjs";
import { verifyCandidateEvidence } from "./recertification-verify.mjs";

export const APPLIER_VERSION = "backyrd-recertification-applier-v1";
const writeIdempotent = async (path, value) => {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing !== null && existing !== body) throw new Error(`APPLY_TARGET_CONFLICT:${path}`);
  if (existing === null) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, body, { flag: "wx" }); }
};
const replaceJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "w" }); await rename(temporary, path); };

export async function applyCandidateEvidence({ root, artifact, receipt, trustedBaseSha }) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (head !== artifact.candidateSha) throw new Error(`CANDIDATE_NOT_CHECKED_OUT:${head}`);
  const fresh = await verifyCandidateEvidence({ root, artifact, trustedBaseSha });
  if (!fresh.valid || !receipt.valid || receipt.artifactHash !== artifact.artifactHash || receipt.verificationHash !== fresh.verificationHash) throw new Error(`VERIFICATION_REQUIRED:${fresh.reasons.join(",")}`);
  const recordBody = {
    schemaVersion: "backyrd-additive-recertification-v1",
    version: artifact.version,
    status: "VERIFIED_ADDITIVE_EVIDENCE",
    parent: artifact.parent,
    baseMainSha: artifact.baseMainSha,
    candidateSha: artifact.candidateSha,
    candidateProductTree: artifact.candidateProductTree,
    scope: artifact.requestedScope,
    scopeInventory: artifact.scopeInventory,
    changedFiles: artifact.changedFiles,
    changedProtectedFiles: artifact.protectedSourceSet.changedProtectedFiles,
    protectedSemanticSourceSet: { paths: artifact.protectedSourceSet.paths, hash: artifact.protectedSourceSet.candidateHash },
    decisionEngineIdentity: artifact.decisionEngineIdentity,
    production: artifact.production,
    d2D3Parents: artifact.d2D3Parents.candidate,
    evidence: artifact.evidence,
    candidateArtifactHash: artifact.artifactHash,
    verificationHash: receipt.verificationHash,
    generationToolVersion: artifact.generationToolVersion,
    verifierVersion: receipt.verifierVersion,
    applierVersion: APPLIER_VERSION,
    candidateArtifact: artifact,
    verificationReceipt: receipt,
    decisionSemanticsRecertified: false,
    productionMutation: "NONE"
  };
  const record = { ...recordBody, recertificationHash: contentHash(recordBody) };
  const versionNumber = artifact.version.match(/v(\d+)$/)?.[1];
  if (!versionNumber) throw new Error("INVALID_RECERTIFICATION_VERSION");
  const recordPath = resolve(root, `decision-lab/config/decision-v13-production-recertification-v${versionNumber}.json`);
  const freeze = { schemaVersion: "backyrd-additive-recertification-freeze-v1", currentVersion: record.version, currentRecertificationHash: record.recertificationHash, parentDecisionRecertificationVersion: artifact.parent.version, d2D3Parents: record.d2D3Parents };
  const entry = { version: record.version, parentVersion: artifact.parent.version, parentHash: artifact.parent.manifestHash, recertificationHash: record.recertificationHash, baseMainSha: record.baseMainSha, candidateSha: record.candidateSha, candidateProductTree: record.candidateProductTree, scope: record.scope, decisionSemanticsRecertified: false, productionMutation: "NONE" };
  const lineagePath = resolve(root, "docs/operations/DECISION_RECERTIFICATION_LINEAGE_V1.json");
  const existingLineage = JSON.parse(await readFile(lineagePath, "utf8").catch(() => '{"schemaVersion":"backyrd-decision-recertification-lineage-v1","entries":[]}'));
  const existingEntry = existingLineage.entries.find((item) => item.version === entry.version);
  if (existingEntry && contentHash(existingEntry) !== contentHash(entry)) throw new Error(`APPLY_TARGET_CONFLICT:${lineagePath}`);
  const lineage = { schemaVersion: "backyrd-decision-recertification-lineage-v1", entries: existingEntry ? existingLineage.entries : [...existingLineage.entries, entry] };
  const freezePath = resolve(root, "decision-lab/config/additive-recertification-v1.freeze.json");
  const existingFreeze = await readFile(freezePath, "utf8").then(JSON.parse).catch(() => null);
  if (existingFreeze && existingFreeze.currentVersion !== record.version && existingFreeze.currentVersion !== artifact.parent.version) throw new Error(`PARENT_FREEZE_CONFLICT:${freezePath}`);
  const existingRecord = await readFile(recordPath, "utf8").catch(() => null);
  if (existingRecord !== null && existingRecord !== `${JSON.stringify(record, null, 2)}\n`) throw new Error(`APPLY_TARGET_CONFLICT:${recordPath}`);
  await writeIdempotent(recordPath, record);
  if (!existingFreeze || contentHash(existingFreeze) !== contentHash(freeze)) await replaceJson(freezePath, freeze);
  if (contentHash(existingLineage) !== contentHash(lineage)) await replaceJson(lineagePath, lineage);
  return { applied: true, idempotent: true, recordPath, recertificationHash: record.recertificationHash };
}
