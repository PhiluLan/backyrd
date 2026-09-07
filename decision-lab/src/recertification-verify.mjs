import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { contentHash } from "./canonical-json.mjs";

export const VERIFIER_VERSION = "backyrd-recertification-verifier-v1";
const ALLOWED_SCOPES = new Set(["evidence-only", "presentation"]);
const FORBIDDEN_SCOPE = /^(supabase\/migrations\/|supabase\/production\/|supabase\/functions\/|packages\/(canonical-semantics|decision-input-runtime|decision-orchestrator-runtime|n6-shadow-runtime)\/src\/|mobile\/.*auth|web\/.*auth|admin-dashboard\/.*(?:auth|security)|legal\/)/;
const EVIDENCE_SCOPE = /^(decision-lab\/(?:config|test)\/|docs\/(?:decision|operations|readiness)\/|scripts\/(?:ci|decision)\/)/;
const PRESENTATION_SCOPE = /^(mobile\/|web\/|admin-dashboard\/)/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@()+\-\/[\] ]+$/;
const PRODUCTION_KEYS = ["supabaseProjectRef", "functionSlug", "activeVersion", "verifyJwt", "bundleHash", "entrypointPath", "entrypointSha256", "sourceIdentity", "deploymentSourceSetHash", "deploymentConfigHash", "eszipBodySha256", "eszipEvidenceHash", "deploymentControlMainSha"];
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const blob = (root, sha, path) => execFileSync("git", ["show", `${sha}:${path}`], { cwd: root, maxBuffer: 50 * 1024 * 1024 });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashTreeFiles = (root, sha, paths) => { const hash = createHash("sha256"); for (const path of [...paths].sort()) hash.update(blob(root, sha, path)); return hash.digest("hex"); };
const jsonAt = (root, sha, path) => JSON.parse(blob(root, sha, path).toString("utf8"));
const parentIdentities = (root, sha) => {
  const d2 = jsonAt(root, sha, "decision-lab/config/decision-quality-v1.1.freeze.json");
  const d22 = jsonAt(root, sha, "decision-lab/config/personalization-treatment-v1.freeze.json");
  const d3 = jsonAt(root, sha, "decision-lab/config/d3.1-diagnostic-coverage-v1.json");
  return { d2FreezeManifestHash: d2.freezeManifestHash, d2EngineRecertificationVersion: d2.engineRecertificationVersion, d2EngineRecertificationHash: d2.engineRecertificationHash, d22FreezeManifestHash: d22.freezeManifestHash, d22ParentFreezeManifestHash: d22.parentFreezeManifestHash, d3ParentFreezeManifestHash: d3.parentFreezeManifestHash, d3PersonalizationTreatmentFreezeHash: d3.personalizationTreatmentFreezeHash };
};
const same = (a, b) => contentHash(a) === contentHash(b);
const classifyScope = (path, protectedPaths) => {
  if (protectedPaths.includes(path) || /^(packages\/(canonical-semantics|decision-input-runtime|decision-orchestrator-runtime|n6-shadow-runtime)\/src\/|supabase\/functions\/decision-v13\/)/.test(path)) return "decision-source";
  if (FORBIDDEN_SCOPE.test(path)) return "db-auth-security";
  if (PRESENTATION_SCOPE.test(path)) return "presentation";
  if (EVIDENCE_SCOPE.test(path)) return "evidence-only";
  return "outside-allowlist";
};

export async function verifyCandidateEvidence({ root, artifact, trustedBaseSha }) {
  const reasons = [];
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
    if (base.status === "AUTHORIZED") {
      if (!base.certificationEvidenceSet?.paths?.length || hashTreeFiles(root, baseSha, base.certificationEvidenceSet.paths) !== base.certificationEvidenceSet.hash) reasons.push("PARENT_EVIDENCE_INVALID");
    } else {
      const parentBody = { ...base }; delete parentBody.recertificationHash;
      if (contentHash(parentBody) !== base.recertificationHash) reasons.push("PARENT_ADDITIVE_HASH_INVALID");
      const parentFreeze = jsonAt(root, baseSha, "decision-lab/config/additive-recertification-v1.freeze.json");
      if (parentFreeze.currentVersion !== base.version || parentFreeze.currentRecertificationHash !== base.recertificationHash) reasons.push("PARENT_ADDITIVE_FREEZE_INVALID");
    }
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
    if (!same(baseParents, artifact.d2D3Parents.base) || !same(candidateParents, artifact.d2D3Parents.candidate) || !same(baseParents, candidateParents) || baseParents.d2EngineRecertificationVersion !== (base.parent?.version ?? base.version) || baseParents.d22ParentFreezeManifestHash !== baseParents.d2FreezeManifestHash || baseParents.d3ParentFreezeManifestHash !== baseParents.d2FreezeManifestHash || baseParents.d3PersonalizationTreatmentFreezeHash !== baseParents.d22FreezeManifestHash) reasons.push("D2_D3_PARENT_FREEZE_DRIFT");
    if (!artifact.evidence.paths.length || !artifact.evidence.paths.every((path) => SAFE_PATH.test(path)) || new Set(artifact.evidence.paths).size !== artifact.evidence.paths.length) reasons.push("EVIDENCE_PATH_INVALID");
    if (hashTreeFiles(root, candidateSha, artifact.evidence.paths) !== artifact.evidence.derivedHash) reasons.push("EVIDENCE_HASH_MISMATCH");
  } catch (error) { reasons.push(`INPUT_UNREADABLE:${error.code ?? error.message}`); }
  for (const path of changed) {
    if (FORBIDDEN_SCOPE.test(path)) reasons.push(`FORBIDDEN_SCOPE:${path}`);
    else if (artifact.requestedScope === "evidence-only" && !EVIDENCE_SCOPE.test(path)) reasons.push(`SCOPE_OUTSIDE_ALLOWLIST:${path}`);
    else if (artifact.requestedScope === "presentation" && !PRESENTATION_SCOPE.test(path) && !EVIDENCE_SCOPE.test(path)) reasons.push(`SCOPE_OUTSIDE_ALLOWLIST:${path}`);
  }
  const uniqueReasons = [...new Set(reasons)];
  const body = { schemaVersion: "backyrd-recertification-verification-v1", verifierVersion: VERIFIER_VERSION, artifactHash: artifact.artifactHash, baseMainSha: artifact.baseMainSha, candidateSha: artifact.candidateSha, valid: uniqueReasons.length === 0, reasons: uniqueReasons };
  return { ...body, verificationHash: contentHash(body) };
}

export async function writeVerificationReceipt(path, receipt) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" }); }
