import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { contentHash } from "./canonical-json.mjs";

export const GENERATOR_VERSION = "backyrd-recertification-generator-v1";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const blob = (root, sha, path) => execFileSync("git", ["show", `${sha}:${path}`], { cwd: root, maxBuffer: 50 * 1024 * 1024 });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashTreeFiles = (root, sha, paths) => {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) hash.update(blob(root, sha, path));
  return hash.digest("hex");
};
const jsonAt = (root, sha, path) => JSON.parse(blob(root, sha, path).toString("utf8"));
const productionIdentity = (production) => ({
  supabaseProjectRef: production.supabaseProjectRef,
  functionSlug: production.functionSlug,
  activeVersion: production.activeVersion,
  verifyJwt: production.verifyJwt,
  bundleHash: production.bundleHash,
  entrypointPath: production.entrypointPath,
  entrypointSha256: production.entrypointSha256,
  sourceIdentity: production.sourceIdentity,
  deploymentSourceSetHash: production.deploymentSourceSetHash,
  deploymentConfigHash: production.deploymentConfigHash,
  eszipBodySha256: production.eszipBodySha256,
  eszipEvidenceHash: production.eszipEvidenceHash,
  deploymentControlMainSha: production.deploymentControlMainSha
});
const parentIdentities = (root, sha) => {
  const d2 = jsonAt(root, sha, "decision-lab/config/decision-quality-v1.1.freeze.json");
  const d22 = jsonAt(root, sha, "decision-lab/config/personalization-treatment-v1.freeze.json");
  const d3 = jsonAt(root, sha, "decision-lab/config/d3.1-diagnostic-coverage-v1.json");
  return {
    d2FreezeManifestHash: d2.freezeManifestHash,
    d2EngineRecertificationVersion: d2.engineRecertificationVersion,
    d2EngineRecertificationHash: d2.engineRecertificationHash,
    d22FreezeManifestHash: d22.freezeManifestHash,
    d22ParentFreezeManifestHash: d22.parentFreezeManifestHash,
    d3ParentFreezeManifestHash: d3.parentFreezeManifestHash,
    d3PersonalizationTreatmentFreezeHash: d3.personalizationTreatmentFreezeHash
  };
};
const classifyScope = (path, protectedPaths) => {
  if (protectedPaths.includes(path) || /^(packages\/(canonical-semantics|decision-input-runtime|decision-orchestrator-runtime|n6-shadow-runtime)\/src\/|supabase\/functions\/decision-v13\/)/.test(path)) return "decision-source";
  if (/^(supabase\/(?:migrations|production|functions)\/|mobile\/.*auth|web\/.*auth|admin-dashboard\/.*(?:auth|security)|legal\/)/.test(path)) return "db-auth-security";
  if (/^(mobile\/|web\/|admin-dashboard\/)/.test(path)) return "presentation";
  if (/^(decision-lab\/(?:config|test)\/|docs\/(?:decision|operations|readiness)\/|scripts\/(?:ci|decision)\/)/.test(path)) return "evidence-only";
  return "outside-allowlist";
};

export async function generateCandidateEvidence({ root, baseVersion, baseMainSha, candidateSha, evidencePaths, requestedScope }) {
  if (!root || !baseVersion || !baseMainSha || !candidateSha || !requestedScope || !evidencePaths?.length) throw new Error("All generation inputs are required");
  const basePath = `decision-lab/config/decision-v13-production-recertification-${baseVersion}.json`;
  const baseCommit = git(root, ["rev-parse", `${baseMainSha}^{commit}`]);
  const candidateCommit = git(root, ["rev-parse", `${candidateSha}^{commit}`]);
  const base = jsonAt(root, baseCommit, basePath);
  const changedFiles = git(root, ["diff", "--name-only", baseCommit, candidateCommit]).split("\n").filter(Boolean).sort();
  const protectedPaths = [...base.protectedSemanticSourceSet.paths].sort();
  const changedProtectedFiles = changedFiles.filter((path) => protectedPaths.includes(path));
  const observedProduction = productionIdentity(base.production.identity ?? base.production);
  const artifact = {
    schemaVersion: "backyrd-recertification-candidate-evidence-v1",
    version: `decision-v13-production-recertification-v${Number(baseVersion.replace(/^v/, "")) + 1}`,
    parent: { version: base.version, manifestHash: contentHash(base), path: basePath },
    baseMainSha: baseCommit,
    candidateSha: candidateCommit,
    candidateProductTree: git(root, ["rev-parse", `${candidateCommit}^{tree}`]),
    requestedScope,
    changedFiles,
    scopeInventory: Object.fromEntries(changedFiles.map((path) => [path, classifyScope(path, protectedPaths)])),
    protectedSourceSet: {
      paths: protectedPaths,
      baseHash: hashTreeFiles(root, baseCommit, protectedPaths),
      candidateHash: hashTreeFiles(root, candidateCommit, protectedPaths),
      changedProtectedFiles
    },
    decisionEngineIdentity: {
      path: "supabase/functions/decision-v13/index.ts",
      baseSha256: sha256(blob(root, baseCommit, "supabase/functions/decision-v13/index.ts")),
      candidateSha256: sha256(blob(root, candidateCommit, "supabase/functions/decision-v13/index.ts"))
    },
    production: {
      identity: observedProduction,
      identityHash: contentHash(observedProduction),
      candidateEntrypointSha256: sha256(blob(root, candidateCommit, observedProduction.entrypointPath))
    },
    d2D3Parents: { base: parentIdentities(root, baseCommit), candidate: parentIdentities(root, candidateCommit) },
    evidence: { paths: [...new Set(evidencePaths)].sort(), derivedHash: hashTreeFiles(root, candidateCommit, evidencePaths) },
    generationToolVersion: GENERATOR_VERSION
  };
  return { ...artifact, artifactHash: contentHash(artifact) };
}

export async function writeCandidateEvidence(path, artifact) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
}
