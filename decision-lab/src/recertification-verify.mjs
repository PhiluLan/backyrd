import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { adminDataAllowedPath, verifyAdminDataEvidence } from "./admin-data-additive.mjs";
import { mobileStorageAtomicAllowedPath, verifyMobileStorageAtomicEvidence } from "./mobile-storage-atomic.mjs";

export const VERIFIER_VERSION = "backyrd-recertification-verifier-v1";
export const PRE_MERGE_VERIFIER_VERSION = "backyrd-recertification-pre-merge-verifier-v1.3";
export const ADMIN_DATA_VERIFIER_VERSION = "backyrd-recertification-pre-merge-verifier-v1.4";
export const MOBILE_STORAGE_ATOMIC_VERIFIER_VERSION = "backyrd-recertification-pre-merge-verifier-v1.5";
export const SUPPORTED_VERIFIER_VERSIONS = Object.freeze([VERIFIER_VERSION, PRE_MERGE_VERIFIER_VERSION, ADMIN_DATA_VERIFIER_VERSION, MOBILE_STORAGE_ATOMIC_VERIFIER_VERSION]);
const CANONICAL_MAIN_REF = "refs/remotes/origin/main";
const ALLOWED_SCOPES = new Set(["evidence-only", "presentation", "admin-data-additive", "mobile-storage-atomic", "release-control"]);
const FORBIDDEN_SCOPE = /^(supabase\/(?:production|functions)\/|packages\/(canonical-semantics|decision-input-runtime|decision-orchestrator-runtime|n6-shadow-runtime)\/src\/|decision-lab\/config\/(?:decision-quality-v1\.1(?:\.freeze)?|personalization-treatment-v1(?:\.freeze)?|d3\.1-diagnostic-coverage-v1)\.json$|mobile\/.*auth|web\/.*auth|admin-dashboard\/.*(?:auth|security)|legal\/)/;
const EVIDENCE_SCOPE = /^(decision-lab\/(?:config|test)\/|docs\/(?:decision|operations|readiness)\/|scripts\/(?:ci|decision)\/)/;
const PRESENTATION_SCOPE = /^(mobile\/|web\/|admin-dashboard\/)/;
const RELEASE_CONTROL_PATHS = new Set([
  ".github/workflows/supabase-production.yml",
  "decision-lab/src/recertification-generate.mjs",
  "decision-lab/src/recertification-verify.mjs",
  "scripts/deployment/verify-supabase-migration-dry-run.mjs",
  "scripts/deployment/verify-supabase-migration-dry-run.test.mjs",
]);
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@()+\-\/[\] ]+$/;
const PRODUCTION_KEYS = ["supabaseProjectRef", "functionSlug", "activeVersion", "verifyJwt", "bundleHash", "entrypointPath", "entrypointSha256", "sourceIdentity", "deploymentSourceSetHash", "deploymentConfigHash", "eszipBodySha256", "eszipEvidenceHash", "deploymentControlMainSha"];
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim();
export const blob = (root, sha, path) => execFileSync("git", ["show", `${sha}:${path}`], { cwd: root, maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const hashTreeFiles = (root, sha, paths) => { const hash = createHash("sha256"); for (const path of [...paths].sort()) hash.update(blob(root, sha, path)); return hash.digest("hex"); };
const jsonAt = (root, sha, path) => JSON.parse(blob(root, sha, path).toString("utf8"));
export const parentIdentities = (root, sha) => {
  const d2 = jsonAt(root, sha, "decision-lab/config/decision-quality-v1.1.freeze.json");
  const d22 = jsonAt(root, sha, "decision-lab/config/personalization-treatment-v1.freeze.json");
  const d3 = jsonAt(root, sha, "decision-lab/config/d3.1-diagnostic-coverage-v1.json");
  return { d2FreezeManifestHash: d2.freezeManifestHash, d2EngineRecertificationVersion: d2.engineRecertificationVersion, d2EngineRecertificationHash: d2.engineRecertificationHash, d22FreezeManifestHash: d22.freezeManifestHash, d22ParentFreezeManifestHash: d22.parentFreezeManifestHash, d3ParentFreezeManifestHash: d3.parentFreezeManifestHash, d3PersonalizationTreatmentFreezeHash: d3.personalizationTreatmentFreezeHash };
};
const same = (a, b) => contentHash(a) === contentHash(b);
const isAncestor = (root, ancestor, descendant) => {
  try { return git(root, ["merge-base", "--is-ancestor", ancestor, descendant]) === ""; }
  catch { return false; }
};
const isFirstParentCommit = (root, sha) => git(root, ["rev-list", "--first-parent", CANONICAL_MAIN_REF]).split("\n").includes(sha);
const classifyScope = (path, protectedPaths) => {
  if (protectedPaths.includes(path) || /^(packages\/(canonical-semantics|decision-input-runtime|decision-orchestrator-runtime|n6-shadow-runtime)\/src\/|supabase\/functions\/decision-v13\/|decision-lab\/config\/(?:decision-quality-v1\.1(?:\.freeze)?|personalization-treatment-v1(?:\.freeze)?|d3\.1-diagnostic-coverage-v1)\.json$)/.test(path)) return "decision-source";
  if (FORBIDDEN_SCOPE.test(path)) return "db-auth-security";
  if (/^supabase\/migrations\//.test(path)) return "admin-data-migration";
  if (/^supabase\/tests\//.test(path)) return "admin-data-acceptance";
  if (/^supabase\/canonical\/admin-data-additive\//.test(path) || /^scripts\/ci\/admin-data-additive\//.test(path) || /^docs\/operations\/admin-data-additive\//.test(path)) return "admin-data-evidence";
  if (/^supabase\/canonical\/mobile-storage-atomic\//.test(path) || /^scripts\/ci\/mobile-storage-atomic\//.test(path) || /^docs\/operations\/mobile-storage-atomic\//.test(path)) return "mobile-storage-evidence";
  if (path === "supabase/canonical/storage.sql") return "mobile-storage-policy";
  if (PRESENTATION_SCOPE.test(path)) return "presentation";
  if (EVIDENCE_SCOPE.test(path)) return "evidence-only";
  if (RELEASE_CONTROL_PATHS.has(path)) return "release-control";
  return "outside-allowlist";
};

const versionNumber = (version) => Number(version?.match(/^decision-v13-production-recertification-v(\d+)$/)?.[1]);
const lineageEntry = (record) => ({ version: record.version, parentVersion: record.parent.version, parentHash: record.parent.manifestHash, recertificationHash: record.recertificationHash, baseMainSha: record.baseMainSha, candidateSha: record.candidateSha, candidateProductTree: record.candidateProductTree, scope: record.scope, decisionSemanticsRecertified: false, productionMutation: "NONE" });
const validateParentChain = (root, stateSha, record, seen = new Set()) => {
  const reasons = [];
  if (seen.has(stateSha)) return { reasons: ["PARENT_CHAIN_CYCLE"], entries: [], anchorVersion: null };
  seen.add(stateSha);
  if (record.status === "AUTHORIZED") {
    if (!record.certificationEvidenceSet?.paths?.length || hashTreeFiles(root, stateSha, record.certificationEvidenceSet.paths) !== record.certificationEvidenceSet.hash) reasons.push("PARENT_EVIDENCE_INVALID");
    if (versionNumber(record.version) !== 44) reasons.push("PARENT_TRUST_ANCHOR_INVALID");
    return { reasons, entries: [], anchorVersion: record.version };
  }
  if (record.status !== "VERIFIED_ADDITIVE_EVIDENCE") return { reasons: ["PARENT_RECERTIFICATION_INVALID"], entries: [], anchorVersion: null };
  const body = { ...record }; delete body.recertificationHash;
  if (contentHash(body) !== record.recertificationHash) reasons.push("PARENT_ADDITIVE_HASH_INVALID");
  const freeze = jsonAt(root, stateSha, "decision-lab/config/additive-recertification-v1.freeze.json");
  if (freeze.currentVersion !== record.version || freeze.currentRecertificationHash !== record.recertificationHash || freeze.parentDecisionRecertificationVersion !== record.parent?.version) reasons.push("PARENT_ADDITIVE_FREEZE_INVALID");
  if (versionNumber(record.version) !== versionNumber(record.parent?.version) + 1) reasons.push("PARENT_VERSION_NOT_CONTIGUOUS");
  const artifact = record.candidateArtifact; const receipt = record.verificationReceipt;
  if (!artifact || !receipt) reasons.push("PARENT_RECEIPT_MISSING");
  else {
    const unsigned = { ...artifact }; delete unsigned.artifactHash;
    const receiptBody = { ...receipt }; delete receiptBody.verificationHash;
    if (contentHash(unsigned) !== artifact.artifactHash || contentHash(receiptBody) !== receipt.verificationHash || !receipt.valid || receipt.artifactHash !== artifact.artifactHash || record.candidateArtifactHash !== artifact.artifactHash || record.verificationHash !== receipt.verificationHash) reasons.push("PARENT_RECEIPT_INVALID");
    if (!same(artifact.parent, record.parent) || artifact.version !== record.version || artifact.baseMainSha !== record.baseMainSha || artifact.candidateSha !== record.candidateSha || artifact.candidateProductTree !== record.candidateProductTree) reasons.push("PARENT_ARTIFACT_BINDING_INVALID");
  }
  if (!isAncestor(root, record.candidateSha, stateSha)) reasons.push("PARENT_CANDIDATE_NOT_IN_STATE");
  const parentState = git(root, ["rev-parse", `${record.baseMainSha}^{commit}`]);
  const parent = jsonAt(root, parentState, record.parent.path);
  if (parent.version !== record.parent.version || contentHash(parent) !== record.parent.manifestHash) reasons.push("PARENT_IDENTITY_MISMATCH");
  const prior = validateParentChain(root, parentState, parent, seen);
  reasons.push(...prior.reasons.map((reason) => `PARENT:${reason}`));
  const entries = [...prior.entries, lineageEntry(record)];
  const lineage = jsonAt(root, stateSha, "docs/operations/DECISION_RECERTIFICATION_LINEAGE_V1.json");
  if (lineage.schemaVersion !== "backyrd-decision-recertification-lineage-v1" || !same(lineage.entries, entries)) reasons.push("PARENT_LINEAGE_INVALID");
  return { reasons, entries, anchorVersion: prior.anchorVersion };
};

export async function verifyCandidateEvidence({ root, artifact, trustedBaseSha, verifierVersion = VERIFIER_VERSION }) {
  const reasons = [];
  if (!SUPPORTED_VERIFIER_VERSIONS.includes(verifierVersion)) reasons.push("VERIFIER_VERSION_UNSUPPORTED");
  const unsigned = { ...artifact }; delete unsigned.artifactHash;
  if (artifact.schemaVersion !== "backyrd-recertification-candidate-evidence-v1") reasons.push("SCHEMA_VERSION_INVALID");
  if (contentHash(unsigned) !== artifact.artifactHash) reasons.push("ARTIFACT_HASH_MISMATCH");
  if (!ALLOWED_SCOPES.has(artifact.requestedScope)) reasons.push("SCOPE_NOT_ADDITIVE");
  let base; let changed = [];
  try {
    const baseSha = git(root, ["rev-parse", `${artifact.baseMainSha}^{commit}`]);
    const candidateSha = git(root, ["rev-parse", `${artifact.candidateSha}^{commit}`]);
    const trusted = git(root, ["rev-parse", `${trustedBaseSha}^{commit}`]);
    if (baseSha !== trusted) reasons.push("STALE_BASE");
    if (git(root, ["merge-base", baseSha, candidateSha]) !== baseSha) reasons.push("BASE_NOT_CANDIDATE_ANCESTOR");
    if (git(root, ["rev-parse", `${candidateSha}^{tree}`]) !== artifact.candidateProductTree) reasons.push("CANDIDATE_TREE_MISMATCH");
    changed = git(root, ["diff", "--name-only", baseSha, candidateSha]).split("\n").filter(Boolean).sort();
    if (!same(changed, artifact.changedFiles)) reasons.push("CHANGED_FILES_MISMATCH");
    if (artifact.parent.path !== `decision-lab/config/${artifact.parent.version}.json`) reasons.push("PARENT_PATH_INVALID");
    base = jsonAt(root, baseSha, artifact.parent.path);
    if (base.version !== artifact.parent.version || contentHash(base) !== artifact.parent.manifestHash || !new Set(["AUTHORIZED", "VERIFIED_ADDITIVE_EVIDENCE"]).has(base.status)) reasons.push("PARENT_RECERTIFICATION_INVALID");
    const parentChain = validateParentChain(root, baseSha, base);
    reasons.push(...parentChain.reasons);
    const parentNumber = Number(artifact.parent.version.match(/v(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(parentNumber) || artifact.version !== `decision-v13-production-recertification-v${parentNumber + 1}`) reasons.push("RECERTIFICATION_VERSION_INVALID");
    const protectedPaths = [...base.protectedSemanticSourceSet.paths].sort();
    if (!same(protectedPaths, artifact.protectedSourceSet.paths)) reasons.push("PROTECTED_SOURCE_SET_MISMATCH");
    const scopeInventory = Object.fromEntries(changed.map((path) => [path, classifyScope(path, protectedPaths)]));
    if (!same(scopeInventory, artifact.scopeInventory)) reasons.push("SCOPE_INVENTORY_MISMATCH");
    const baseProtectedHash = hashTreeFiles(root, baseSha, protectedPaths);
    const candidateProtectedHash = hashTreeFiles(root, candidateSha, protectedPaths);
    if (baseProtectedHash !== base.protectedSemanticSourceSet.hash || baseProtectedHash !== artifact.protectedSourceSet.baseHash) reasons.push("BASE_PROTECTED_SOURCE_INVALID");
    if (candidateProtectedHash !== artifact.protectedSourceSet.candidateHash || candidateProtectedHash !== baseProtectedHash || artifact.protectedSourceSet.changedProtectedFiles.length) reasons.push("DECISION_SOURCE_DRIFT");
    const enginePath = artifact.decisionEngineIdentity.path;
    const baseEngine = sha256(blob(root, baseSha, enginePath)); const candidateEngine = sha256(blob(root, candidateSha, enginePath));
    const authorizedEngineHash = base.authorization?.authorizedEngineSourceHash ?? base.decisionEngineIdentity?.candidateSha256;
    if (baseEngine !== artifact.decisionEngineIdentity.baseSha256 || candidateEngine !== artifact.decisionEngineIdentity.candidateSha256 || baseEngine !== candidateEngine || baseEngine !== authorizedEngineHash) reasons.push("DECISION_ENGINE_IDENTITY_DRIFT");
    const production = artifact.production.identity;
    const baseProduction = base.production.identity ?? base.production;
    if (!same(Object.keys(production).sort(), [...PRODUCTION_KEYS].sort()) || contentHash(production) !== artifact.production.identityHash || !same(production, Object.fromEntries(PRODUCTION_KEYS.map((key) => [key, baseProduction[key]])))) reasons.push("PRODUCTION_IDENTITY_DRIFT");
    const entrypointHash = sha256(blob(root, candidateSha, production.entrypointPath));
    if (entrypointHash !== production.entrypointSha256 || entrypointHash !== artifact.production.candidateEntrypointSha256) reasons.push("PRODUCTION_ENTRYPOINT_DRIFT");
    const baseParents = parentIdentities(root, baseSha); const candidateParents = parentIdentities(root, candidateSha);
    if (!same(baseParents, artifact.d2D3Parents.base) || !same(candidateParents, artifact.d2D3Parents.candidate) || !same(baseParents, candidateParents) || baseParents.d2EngineRecertificationVersion !== parentChain.anchorVersion || baseParents.d22ParentFreezeManifestHash !== baseParents.d2FreezeManifestHash || baseParents.d3ParentFreezeManifestHash !== baseParents.d2FreezeManifestHash || baseParents.d3PersonalizationTreatmentFreezeHash !== baseParents.d22FreezeManifestHash) reasons.push("D2_D3_PARENT_FREEZE_DRIFT");
    if (artifact.requestedScope === "admin-data-additive") reasons.push(...verifyAdminDataEvidence({ root, baseSha, candidateSha, evidence: artifact.adminData }));
    else if (artifact.adminData) reasons.push("UNEXPECTED_ADMIN_DATA_EVIDENCE");
    if (artifact.requestedScope === "mobile-storage-atomic") reasons.push(...verifyMobileStorageAtomicEvidence({ root, baseSha, candidateSha, evidence: artifact.mobileStorageAtomic }));
    else if (artifact.mobileStorageAtomic) reasons.push("UNEXPECTED_MOBILE_STORAGE_EVIDENCE");
    if (!artifact.evidence.paths.length || !artifact.evidence.paths.every((path) => SAFE_PATH.test(path)) || new Set(artifact.evidence.paths).size !== artifact.evidence.paths.length) reasons.push("EVIDENCE_PATH_INVALID");
    if (hashTreeFiles(root, candidateSha, artifact.evidence.paths) !== artifact.evidence.derivedHash) reasons.push("EVIDENCE_HASH_MISMATCH");
  } catch (error) { reasons.push(`INPUT_UNREADABLE:${error.code ?? error.message}`); }
  for (const path of changed) {
    if (FORBIDDEN_SCOPE.test(path)) reasons.push(`FORBIDDEN_SCOPE:${path}`);
    else if (/^supabase\/migrations\//.test(path) && !new Set(["admin-data-additive", "mobile-storage-atomic"]).has(artifact.requestedScope)) reasons.push(`FORBIDDEN_SCOPE:${path}`);
    else if (artifact.requestedScope === "evidence-only" && !EVIDENCE_SCOPE.test(path)) reasons.push(`SCOPE_OUTSIDE_ALLOWLIST:${path}`);
    else if (artifact.requestedScope === "presentation" && !PRESENTATION_SCOPE.test(path) && !EVIDENCE_SCOPE.test(path)) reasons.push(`SCOPE_OUTSIDE_ALLOWLIST:${path}`);
    else if (artifact.requestedScope === "release-control" && !RELEASE_CONTROL_PATHS.has(path) && !EVIDENCE_SCOPE.test(path)) reasons.push(`SCOPE_OUTSIDE_ALLOWLIST:${path}`);
    else if (artifact.requestedScope === "admin-data-additive" && !adminDataAllowedPath(path, artifact.adminData)) reasons.push(`SCOPE_OUTSIDE_ALLOWLIST:${path}`);
    else if (artifact.requestedScope === "mobile-storage-atomic" && !mobileStorageAtomicAllowedPath(path, artifact.mobileStorageAtomic)) reasons.push(`SCOPE_OUTSIDE_ALLOWLIST:${path}`);
  }
  const uniqueReasons = [...new Set(reasons)];
  const body = { schemaVersion: "backyrd-recertification-verification-v1", verifierVersion, artifactHash: artifact.artifactHash, baseMainSha: artifact.baseMainSha, candidateSha: artifact.candidateSha, valid: uniqueReasons.length === 0, reasons: uniqueReasons };
  return { ...body, verificationHash: contentHash(body) };
}

export async function verifyPreMergeCandidate({ root, artifact, prBaseSha, prHeadSha }) {
  const verifierVersion = artifact.requestedScope === "admin-data-additive"
    ? ADMIN_DATA_VERIFIER_VERSION
    : artifact.requestedScope === "mobile-storage-atomic"
      ? MOBILE_STORAGE_ATOMIC_VERIFIER_VERSION
      : PRE_MERGE_VERIFIER_VERSION;
  const receipt = await verifyCandidateEvidence({ root, artifact, trustedBaseSha: prBaseSha, verifierVersion });
  const reasons = [...receipt.reasons];
  try {
    const canonicalMainSha = git(root, ["rev-parse", `${CANONICAL_MAIN_REF}^{commit}`]);
    const baseSha = git(root, ["rev-parse", `${prBaseSha}^{commit}`]);
    const headSha = git(root, ["rev-parse", `${prHeadSha}^{commit}`]);
    if (artifact.baseMainSha !== baseSha) reasons.push("PR_BASE_BINDING_MISMATCH");
    if (artifact.candidateSha !== headSha) reasons.push("PR_HEAD_BINDING_MISMATCH");
    if (artifact.requestedScope === "mobile-storage-atomic" && baseSha !== canonicalMainSha) reasons.push("MOBILE_STORAGE_BASE_NOT_CANONICAL_TIP");
    if (!isFirstParentCommit(root, baseSha)) reasons.push("PR_BASE_NOT_CANONICAL_FIRST_PARENT");
    if (!isAncestor(root, baseSha, canonicalMainSha)) reasons.push("PR_BASE_NOT_CANONICAL_ANCESTOR");
    if (isAncestor(root, headSha, canonicalMainSha)) reasons.push("CANDIDATE_ALREADY_CANONICALLY_INTEGRATED");
  } catch (error) { reasons.push(`CANONICAL_PR_CONTEXT_UNREADABLE:${error.code ?? error.message}`); }
  const uniqueReasons = [...new Set(reasons)];
  if (uniqueReasons.length === receipt.reasons.length && uniqueReasons.every((reason, index) => reason === receipt.reasons[index])) return receipt;
  const body = { schemaVersion: receipt.schemaVersion, verifierVersion: receipt.verifierVersion, artifactHash: receipt.artifactHash, baseMainSha: receipt.baseMainSha, candidateSha: receipt.candidateSha, valid: false, reasons: uniqueReasons };
  return { ...body, verificationHash: contentHash(body) };
}

export async function writeVerificationReceipt(path, receipt) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" }); }
