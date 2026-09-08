import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const ADMIN_DATA_EVIDENCE_VERSION = "backyrd-admin-data-additive-evidence-v1";

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@()+\-\/\[\] ]+$/;
const MIGRATION_PATH = /^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/;
const TEST_PATH = /^supabase\/tests\/[a-z0-9_]+\.sql$/;
const FINGERPRINT_PATH = /^supabase\/canonical\/admin-data-additive\/[a-z0-9-]+\/(application-schema|public-acl)\.sha256$/;
const BASELINE_SCHEMA_PATH = /^supabase\/canonical\/application-schema(?:-[a-z0-9-]+)?\.sha256$/;
const BASELINE_ACL_PATH = /^supabase\/canonical\/public-acl(?:-[a-z0-9-]+)?\.sha256$/;
const RECONSTRUCTION_PATH = /^scripts\/ci\/admin-data-additive\/[a-z0-9-]+\/(application-schema|public-acl)-reconstruction\.sql$/;
const MANIFEST_PATH = /^docs\/operations\/admin-data-additive\/[A-Z0-9_\-]+\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;

const git = (root, args, options = {}) => execFileSync("git", args, {
  cwd: root,
  encoding: options.encoding ?? "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
}).trim();
const blob = (root, sha, path) => execFileSync("git", ["show", `${sha}:${path}`], {
  cwd: root,
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const textAt = (root, sha, path) => blob(root, sha, path).toString("utf8").trim();
const jsonAt = (root, sha, path) => JSON.parse(blob(root, sha, path).toString("utf8"));
const unique = (values) => Array.isArray(values) && new Set(values).size === values.length;
const sorted = (values) => [...values].sort();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const diffEntries = (root, baseSha, candidateSha) => {
  const output = git(root, ["diff", "--name-status", baseSha, candidateSha]);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [status, ...paths] = line.split("\t");
    return { status, paths };
  });
};

const fingerprintValue = (root, sha, path, reasons, label) => {
  try {
    const value = textAt(root, sha, path);
    if (!SHA256.test(value)) reasons.push(`${label}_FINGERPRINT_INVALID`);
    return value;
  } catch {
    reasons.push(`${label}_FINGERPRINT_UNREADABLE`);
    return null;
  }
};

export function buildAdminDataEvidence({ root, baseSha, candidateSha, manifestPath }) {
  const manifest = jsonAt(root, candidateSha, manifestPath);
  const paths = [
    ...manifest.migrations,
    ...manifest.acceptanceTests.positive,
    ...manifest.acceptanceTests.negative,
    manifest.fingerprints.candidate.applicationSchema,
    manifest.fingerprints.candidate.publicAcl,
    manifest.reconstruction.applicationSchema,
    manifest.reconstruction.publicAcl,
    manifestPath,
  ];
  return {
    schemaVersion: ADMIN_DATA_EVIDENCE_VERSION,
    manifestPath,
    manifestSha256: sha256(blob(root, candidateSha, manifestPath)),
    migrationSha256: Object.fromEntries(manifest.migrations.map((path) => [path, sha256(blob(root, candidateSha, path))])),
    acceptanceTestSha256: Object.fromEntries([...manifest.acceptanceTests.positive, ...manifest.acceptanceTests.negative].map((path) => [path, sha256(blob(root, candidateSha, path))])),
    reconstructionSha256: Object.fromEntries(Object.values(manifest.reconstruction).map((path) => [path, sha256(blob(root, candidateSha, path))])),
    candidateFingerprints: {
      applicationSchema: textAt(root, candidateSha, manifest.fingerprints.candidate.applicationSchema),
      publicAcl: textAt(root, candidateSha, manifest.fingerprints.candidate.publicAcl),
    },
    baselineFingerprints: {
      applicationSchema: textAt(root, baseSha, manifest.fingerprints.baseline.applicationSchema),
      publicAcl: textAt(root, baseSha, manifest.fingerprints.baseline.publicAcl),
    },
    paths: sorted(paths),
  };
}

export function verifyAdminDataEvidence({ root, baseSha, candidateSha, evidence }) {
  const reasons = [];
  if (!evidence || evidence.schemaVersion !== ADMIN_DATA_EVIDENCE_VERSION) return ["ADMIN_DATA_EVIDENCE_MISSING"];
  if (!SAFE_PATH.test(evidence.manifestPath) || !MANIFEST_PATH.test(evidence.manifestPath)) reasons.push("ADMIN_DATA_MANIFEST_PATH_INVALID");
  let manifest;
  try {
    manifest = jsonAt(root, candidateSha, evidence.manifestPath);
    if (sha256(blob(root, candidateSha, evidence.manifestPath)) !== evidence.manifestSha256) reasons.push("ADMIN_DATA_MANIFEST_HASH_MISMATCH");
  } catch {
    return [...reasons, "ADMIN_DATA_MANIFEST_UNREADABLE"];
  }
  if (manifest.schemaVersion !== ADMIN_DATA_EVIDENCE_VERSION) reasons.push("ADMIN_DATA_MANIFEST_VERSION_INVALID");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id ?? "")) reasons.push("ADMIN_DATA_ID_INVALID");
  const candidateDirectory = `supabase/canonical/admin-data-additive/${manifest.id}`;
  const reconstructionDirectory = `scripts/ci/admin-data-additive/${manifest.id}`;
  const migrations = manifest.migrations ?? [];
  const positive = manifest.acceptanceTests?.positive ?? [];
  const negative = manifest.acceptanceTests?.negative ?? [];
  if (!migrations.length || !unique(migrations) || !migrations.every((path) => MIGRATION_PATH.test(path))) reasons.push("ADMIN_DATA_MIGRATIONS_INVALID");
  if (!positive.length || !unique(positive) || !positive.every((path) => TEST_PATH.test(path))) reasons.push("ADMIN_DATA_POSITIVE_ACCEPTANCE_INVALID");
  if (!negative.length || !unique(negative) || !negative.every((path) => TEST_PATH.test(path))) reasons.push("ADMIN_DATA_NEGATIVE_ACCEPTANCE_INVALID");
  if ([...positive, ...negative].some((path, index, all) => all.indexOf(path) !== index)) reasons.push("ADMIN_DATA_ACCEPTANCE_OVERLAP");
  const candidateFingerprintPaths = manifest.fingerprints?.candidate ?? {};
  const baselineFingerprintPaths = manifest.fingerprints?.baseline ?? {};
  if (!FINGERPRINT_PATH.test(candidateFingerprintPaths.applicationSchema ?? "") || !FINGERPRINT_PATH.test(candidateFingerprintPaths.publicAcl ?? "")) reasons.push("ADMIN_DATA_CANDIDATE_FINGERPRINT_PATH_INVALID");
  if (candidateFingerprintPaths.applicationSchema !== `${candidateDirectory}/application-schema.sha256` || candidateFingerprintPaths.publicAcl !== `${candidateDirectory}/public-acl.sha256`) reasons.push("ADMIN_DATA_CANDIDATE_FINGERPRINT_ID_MISMATCH");
  if (!SAFE_PATH.test(baselineFingerprintPaths.applicationSchema ?? "") || !SAFE_PATH.test(baselineFingerprintPaths.publicAcl ?? "") || !BASELINE_SCHEMA_PATH.test(baselineFingerprintPaths.applicationSchema ?? "") || !BASELINE_ACL_PATH.test(baselineFingerprintPaths.publicAcl ?? "")) reasons.push("ADMIN_DATA_BASELINE_FINGERPRINT_PATH_INVALID");
  if (!RECONSTRUCTION_PATH.test(manifest.reconstruction?.applicationSchema ?? "") || !RECONSTRUCTION_PATH.test(manifest.reconstruction?.publicAcl ?? "")) reasons.push("ADMIN_DATA_RECONSTRUCTION_PATH_INVALID");
  if (manifest.reconstruction?.applicationSchema !== `${reconstructionDirectory}/application-schema-reconstruction.sql` || manifest.reconstruction?.publicAcl !== `${reconstructionDirectory}/public-acl-reconstruction.sql`) reasons.push("ADMIN_DATA_RECONSTRUCTION_ID_MISMATCH");

  const entries = diffEntries(root, baseSha, candidateSha);
  const added = new Set(entries.filter(({ status }) => status === "A").flatMap(({ paths }) => paths));
  const migrationDiff = entries.filter(({ paths }) => paths.some((path) => path.startsWith("supabase/migrations/")));
  if (migrationDiff.some(({ status }) => status !== "A")) reasons.push("HISTORICAL_MIGRATION_MUTATION");
  if (!same(sorted(migrationDiff.flatMap(({ paths }) => paths)), sorted(migrations))) reasons.push("ADMIN_DATA_MIGRATION_SET_MISMATCH");
  const requiredAdded = [
    ...migrations,
    ...positive,
    ...negative,
    candidateFingerprintPaths.applicationSchema,
    candidateFingerprintPaths.publicAcl,
    manifest.reconstruction?.applicationSchema,
    manifest.reconstruction?.publicAcl,
    evidence.manifestPath,
  ];
  if (requiredAdded.some((path) => !added.has(path))) reasons.push("ADMIN_DATA_EVIDENCE_NOT_FORWARD_ONLY");
  try {
    const positiveBodies = positive.map((path) => blob(root, candidateSha, path).toString("utf8"));
    const negativeBodies = negative.map((path) => blob(root, candidateSha, path).toString("utf8"));
    if (positiveBodies.some((body) => !/raise\s+exception/i.test(body))) reasons.push("ADMIN_DATA_POSITIVE_ASSERTION_MISSING");
    if (negativeBodies.some((body) => !/set\s+local\s+role\s+(?:anon|authenticated)/i.test(body) || !/raise\s+exception/i.test(body) || !/(?:insufficient_privilege|sqlstate\s+'42501'|has_(?:table|function|schema|sequence)_privilege|row_security)/i.test(body))) reasons.push("ADMIN_DATA_NEGATIVE_DENIAL_ASSERTION_MISSING");
  } catch { reasons.push("ADMIN_DATA_ACCEPTANCE_UNREADABLE"); }
  try {
    const baseMigrationNames = git(root, ["ls-tree", "-r", "--name-only", baseSha, "--", "supabase/migrations"]).split("\n").filter(Boolean);
    const baseTip = sorted(baseMigrationNames.map((path) => path.match(MIGRATION_PATH)?.[1]).filter(Boolean)).at(-1);
    if (!baseTip || migrations.some((path) => path.match(MIGRATION_PATH)[1] <= baseTip)) reasons.push("ADMIN_DATA_MIGRATION_NOT_FORWARD");
  } catch { reasons.push("ADMIN_DATA_MIGRATION_LINEAGE_UNREADABLE"); }

  const candidateApplication = fingerprintValue(root, candidateSha, candidateFingerprintPaths.applicationSchema, reasons, "CANDIDATE_SCHEMA");
  const candidateAcl = fingerprintValue(root, candidateSha, candidateFingerprintPaths.publicAcl, reasons, "CANDIDATE_ACL");
  const baselineApplication = fingerprintValue(root, baseSha, baselineFingerprintPaths.applicationSchema, reasons, "BASELINE_SCHEMA");
  const baselineAcl = fingerprintValue(root, baseSha, baselineFingerprintPaths.publicAcl, reasons, "BASELINE_ACL");
  if (candidateApplication !== evidence.candidateFingerprints?.applicationSchema || candidateAcl !== evidence.candidateFingerprints?.publicAcl) reasons.push("ADMIN_DATA_CANDIDATE_FINGERPRINT_BINDING_MISMATCH");
  if (baselineApplication !== evidence.baselineFingerprints?.applicationSchema || baselineAcl !== evidence.baselineFingerprints?.publicAcl) reasons.push("ADMIN_DATA_BASELINE_FINGERPRINT_BINDING_MISMATCH");
  for (const [path, expected] of Object.entries(evidence.migrationSha256 ?? {})) if (!migrations.includes(path) || sha256(blob(root, candidateSha, path)) !== expected) reasons.push("ADMIN_DATA_MIGRATION_HASH_MISMATCH");
  for (const [path, expected] of Object.entries(evidence.acceptanceTestSha256 ?? {})) if (![...positive, ...negative].includes(path) || sha256(blob(root, candidateSha, path)) !== expected) reasons.push("ADMIN_DATA_ACCEPTANCE_HASH_MISMATCH");
  for (const [path, expected] of Object.entries(evidence.reconstructionSha256 ?? {})) if (!Object.values(manifest.reconstruction ?? {}).includes(path) || sha256(blob(root, candidateSha, path)) !== expected) reasons.push("ADMIN_DATA_RECONSTRUCTION_HASH_MISMATCH");
  if (!same(sorted(Object.keys(evidence.migrationSha256 ?? {})), sorted(migrations))) reasons.push("ADMIN_DATA_MIGRATION_HASH_SET_MISMATCH");
  if (!same(sorted(Object.keys(evidence.acceptanceTestSha256 ?? {})), sorted([...positive, ...negative]))) reasons.push("ADMIN_DATA_ACCEPTANCE_HASH_SET_MISMATCH");
  if (!same(sorted(Object.keys(evidence.reconstructionSha256 ?? {})), sorted(Object.values(manifest.reconstruction ?? {})))) reasons.push("ADMIN_DATA_RECONSTRUCTION_HASH_SET_MISMATCH");
  return [...new Set(reasons)];
}

export function adminDataAllowedPath(path, evidence) {
  if (evidence?.paths?.includes(path)) return true;
  if (/^admin-dashboard\//.test(path) && !/(?:auth|security)/i.test(path)) return true;
  if (/^docs\/(?:operations|readiness)\//.test(path)) return true;
  return false;
}
