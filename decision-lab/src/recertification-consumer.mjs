import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { blob, hashTreeFiles, parentIdentities, sha256, verifyCandidateEvidence } from "./recertification-verify.mjs";

export const CONSUMER_VERSION = "backyrd-recertification-consumer-v1.2";
const ANCHOR_VERSION = "decision-v13-production-recertification-v44";
const FREEZE_PATH = "decision-lab/config/additive-recertification-v1.freeze.json";
const LINEAGE_PATH = "docs/operations/DECISION_RECERTIFICATION_LINEAGE_V1.json";
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim();
const recordPath = (version) => `decision-lab/config/${version}.json`;
const readJson = async (root, ref, path) => ref
  ? JSON.parse(execFileSync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }))
  : JSON.parse(await readFile(resolve(root, path), "utf8"));
const maybeJson = async (root, ref, path) => { try { return await readJson(root, ref, path); } catch { return null; } };
const same = (left, right) => contentHash(left) === contentHash(right);
const isAncestor = (root, ancestor, descendant) => {
  try { return git(root, ["merge-base", "--is-ancestor", ancestor, descendant]) === ""; }
  catch { return false; }
};
const isCanonicalMainCommit = (root, sha) => git(root, ["rev-list", "--first-parent", "refs/remotes/origin/main"]).split("\n").includes(sha);
const versionNumber = (version) => Number(version?.match(/^decision-v13-production-recertification-v(\d+)$/)?.[1]);
const recordProjection = (artifact, receipt) => ({
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
  verifierVersion: receipt.verifierVersion
});
const lineageProjection = (record) => ({ version: record.version, parentVersion: record.parent.version, parentHash: record.parent.manifestHash, recertificationHash: record.recertificationHash, baseMainSha: record.baseMainSha, candidateSha: record.candidateSha, candidateProductTree: record.candidateProductTree, scope: record.scope, decisionSemanticsRecertified: false, productionMutation: "NONE" });

async function validateState({ root, ref, trustedBaseSha, seen }) {
  const reasons = [];
  const stateSha = ref ? git(root, ["rev-parse", `${ref}^{commit}`]) : git(root, ["rev-parse", "HEAD"]);
  if (seen.has(stateSha)) return { valid: false, reasons: ["RECERTIFICATION_CHAIN_CYCLE"], chain: [] };
  seen.add(stateSha);
  const freeze = await maybeJson(root, ref, FREEZE_PATH);
  if (!freeze) {
    const anchor = await maybeJson(root, ref, recordPath(ANCHOR_VERSION));
    return { valid: anchor?.version === ANCHOR_VERSION && anchor?.status === "AUTHORIZED", reasons: anchor?.version === ANCHOR_VERSION && anchor?.status === "AUTHORIZED" ? [] : ["V44_TRUST_ANCHOR_MISSING"], chain: [], activeVersion: ANCHOR_VERSION, activeManifestHash: anchor ? contentHash(anchor) : null };
  }
  const activeNumber = versionNumber(freeze.currentVersion);
  if (!Number.isSafeInteger(activeNumber) || activeNumber <= 44) reasons.push("ACTIVE_VERSION_INVALID");
  const record = await maybeJson(root, ref, recordPath(freeze.currentVersion));
  if (!record) return { valid: false, reasons: [...reasons, "APPLIED_RECERTIFICATION_MISSING"], chain: [] };
  const artifact = record.candidateArtifact; const receipt = record.verificationReceipt;
  if (!artifact) reasons.push("CANDIDATE_ARTIFACT_MISSING");
  if (!receipt) reasons.push("VERIFICATION_RECEIPT_MISSING");
  if (record.schemaVersion !== "backyrd-additive-recertification-v1" || record.status !== "VERIFIED_ADDITIVE_EVIDENCE") reasons.push("APPLIED_RECERTIFICATION_SCHEMA_INVALID");
  const body = { ...record }; delete body.recertificationHash;
  if (contentHash(body) !== record.recertificationHash || record.recertificationHash !== freeze.currentRecertificationHash) reasons.push("APPLIED_RECERTIFICATION_HASH_MISMATCH");
  if (freeze.currentVersion !== record.version || freeze.parentDecisionRecertificationVersion !== record.parent?.version || !same(freeze.d2D3Parents, record.d2D3Parents)) reasons.push("ACTIVE_FREEZE_MISMATCH");
  if (artifact && receipt) {
    const verification = await verifyCandidateEvidence({ root, artifact, trustedBaseSha: record.baseMainSha });
    if (!verification.valid || !same(verification, receipt)) reasons.push("VERIFICATION_RECEIPT_INVALID");
    const projection = recordProjection(artifact, receipt);
    if (Object.entries(projection).some(([key, value]) => !same(record[key], value))) reasons.push("APPLIED_RECERTIFICATION_CONTENT_MISMATCH");
    if (artifact.version !== record.version || receipt.artifactHash !== artifact.artifactHash || receipt.baseMainSha !== artifact.baseMainSha || receipt.candidateSha !== artifact.candidateSha) reasons.push("ARTIFACT_RECEIPT_BINDING_MISMATCH");
    try { if (git(root, ["merge-base", artifact.candidateSha, stateSha]) !== artifact.candidateSha) reasons.push("STALE_CANDIDATE"); }
    catch { reasons.push("STALE_CANDIDATE"); }
  }
  const recordNumber = versionNumber(record.version); const parentNumber = versionNumber(record.parent?.version);
  if (!Number.isSafeInteger(recordNumber) || !Number.isSafeInteger(parentNumber) || recordNumber !== parentNumber + 1) reasons.push("PARENT_VERSION_NOT_CONTIGUOUS");
  let parent = { valid: false, reasons: ["PARENT_NOT_VALIDATED"], chain: [] };
  if (record.baseMainSha) parent = await validateState({ root, ref: record.baseMainSha, trustedBaseSha: null, seen });
  if (!parent.valid) reasons.push(...parent.reasons.map((reason) => `PARENT:${reason}`));
  if (parent.activeVersion !== record.parent?.version || parent.activeManifestHash !== record.parent?.manifestHash) reasons.push("PARENT_IDENTITY_MISMATCH");
  const lineage = await maybeJson(root, ref, LINEAGE_PATH);
  const expectedChain = [...parent.chain, lineageProjection(record)];
  if (!lineage || lineage.schemaVersion !== "backyrd-decision-recertification-lineage-v1" || !same(lineage.entries, expectedChain)) reasons.push("LINEAGE_CHAIN_INVALID");
  const versions = lineage?.entries?.map((entry) => entry.version) ?? [];
  if (new Set(versions).size !== versions.length) reasons.push("FORK_CHAIN_DETECTED");
  if (trustedBaseSha) {
    try {
      const canonicalBase = git(root, ["rev-parse", `${trustedBaseSha}^{commit}`]);
      const historicalBase = git(root, ["rev-parse", `${record.baseMainSha}^{commit}`]);
      const candidate = git(root, ["rev-parse", `${record.candidateSha}^{commit}`]);
      if (!isCanonicalMainCommit(root, canonicalBase)) reasons.push("NON_CANONICAL_BASE");
      if (!isAncestor(root, historicalBase, canonicalBase)) reasons.push("HISTORICAL_BASE_NOT_ANCESTOR");
      if (!isAncestor(root, candidate, canonicalBase)) reasons.push("CANDIDATE_NOT_CANONICALLY_INTEGRATED");
      const currentParent = await maybeJson(root, canonicalBase, record.parent?.path);
      if (!currentParent || contentHash(currentParent) !== record.parent?.manifestHash) reasons.push("CURRENT_PARENT_MANIFEST_DRIFT");
      const currentProduction = currentParent?.production?.identity ?? currentParent?.production;
      const expectedProduction = record.production?.identity;
      const currentProductionProjection = currentProduction && expectedProduction
        ? Object.fromEntries(Object.keys(expectedProduction).map((key) => [key, currentProduction[key]]))
        : null;
      if (!currentProductionProjection || !same(currentProductionProjection, expectedProduction)) reasons.push("CURRENT_PRODUCTION_IDENTITY_DRIFT");
      if (hashTreeFiles(root, canonicalBase, record.protectedSemanticSourceSet.paths) !== record.protectedSemanticSourceSet.hash) reasons.push("CURRENT_PROTECTED_SOURCE_DRIFT");
      if (sha256(blob(root, canonicalBase, record.decisionEngineIdentity.path)) !== record.decisionEngineIdentity.candidateSha256) reasons.push("CURRENT_DECISION_ENGINE_DRIFT");
      if (sha256(blob(root, canonicalBase, record.production.identity.entrypointPath)) !== record.production.identity.entrypointSha256) reasons.push("CURRENT_PRODUCTION_ENTRYPOINT_DRIFT");
      if (!same(parentIdentities(root, canonicalBase), record.d2D3Parents)) reasons.push("CURRENT_D2_D3_PARENT_DRIFT");
    } catch { reasons.push("CANONICAL_CONTINUATION_UNREADABLE"); }
  }
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)], chain: expectedChain, activeVersion: record.version, activeManifestHash: contentHash(record), record };
}

export async function validateActiveAdditiveRecertification({ root, trustedBaseSha = null }) {
  const freeze = await maybeJson(root, null, FREEZE_PATH);
  if (!freeze) {
    const anchor = await maybeJson(root, null, recordPath(ANCHOR_VERSION));
    const valid = anchor?.version === ANCHOR_VERSION && anchor?.status === "AUTHORIZED";
    return { consumerVersion: CONSUMER_VERSION, valid, mode: "V44_TRUST_ANCHOR", activeVersion: ANCHOR_VERSION, reasons: valid ? [] : ["V44_TRUST_ANCHOR_MISSING"], chainLength: 0 };
  }
  if (!trustedBaseSha) return { consumerVersion: CONSUMER_VERSION, valid: false, mode: "ADDITIVE_CHAIN", activeVersion: freeze.currentVersion, reasons: ["TRUSTED_BASE_REQUIRED"], chainLength: 0 };
  const result = await validateState({ root, ref: null, trustedBaseSha, seen: new Set() });
  const dirty = git(root, ["status", "--porcelain"]);
  const reasons = [...result.reasons, ...(dirty ? ["WORKTREE_NOT_CLEAN"] : [])];
  return { consumerVersion: CONSUMER_VERSION, valid: reasons.length === 0, mode: "ADDITIVE_CHAIN", activeVersion: result.activeVersion, reasons, chainLength: result.chain.length };
}
