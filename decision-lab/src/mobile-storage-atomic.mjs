import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { contentHash } from "./canonical-json.mjs";

export const MOBILE_STORAGE_ATOMIC_EVIDENCE_VERSION = "backyrd-mobile-storage-atomic-evidence-v1";

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@()+\-\/\[\] ]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MIGRATION_PATH = /^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/;
const ACCEPTANCE_PATH = /^supabase\/tests\/review_media_atomic_[a-z0-9_]+\.sql$/;
const MANIFEST_PATH = /^docs\/operations\/mobile-storage-atomic\/[A-Z0-9_\-]+\.json$/;
const DOCUMENTATION_PATH = /^docs\/operations\/[A-Z0-9_\-]+\.md$/;
const FINGERPRINT_PATH = /^supabase\/canonical\/mobile-storage-atomic\/[a-z0-9-]+\/(application-schema|public-acl)\.sha256$/;
const BASELINE_SCHEMA_PATH = /^supabase\/canonical\/application-schema(?:-[a-z0-9-]+)?\.sha256$/;
const BASELINE_ACL_PATH = /^supabase\/canonical\/public-acl(?:-[a-z0-9-]+)?\.sha256$/;
const ACTIVE_ADMIN_SCHEMA_PATH = /^supabase\/canonical\/admin-data-additive\/[a-z0-9-]+\/application-schema\.sha256$/;
const ACTIVE_ADMIN_ACL_PATH = /^supabase\/canonical\/admin-data-additive\/[a-z0-9-]+\/public-acl\.sha256$/;
const RECONSTRUCTION_PATH = /^scripts\/ci\/mobile-storage-atomic\/[a-z0-9-]+\/(application-schema|public-acl)-reconstruction\.sql$/;
const STORAGE_POLICY_PATH = "supabase/canonical/storage.sql";
const REQUIRED_CONSUMERS = Object.freeze([
  "mobile/app/review/new.tsx",
  "mobile/app/review/quick.tsx",
  "mobile/app/review/smart.tsx",
]);
const REQUIRED_HELPER = "mobile/lib/review-media-upload.ts";
const REQUIRED_MOBILE_TEST = "mobile/scripts/test-review-media-upload.mjs";
const MOBILE_PACKAGE = "mobile/package.json";
export const MOBILE_STORAGE_REQUIRED_ASSERTIONS = Object.freeze([
  "positive_atomic_publish",
  "reservation_user_review_path_bucket_mime_expiry_bound",
  "direct_review_photos_insert_denied",
  "foreign_user_denied",
  "foreign_review_denied",
  "foreign_path_denied",
  "foreign_bucket_denied",
  "mime_mismatch_denied",
  "missing_reservation_denied",
  "expired_reservation_denied",
  "consumed_reservation_denied",
  "upload_failure_no_review_or_smart_evidence",
  "bind_failure_no_review_or_smart_evidence",
  "exact_retry_idempotent",
]);

const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
}).trim();
const blob = (root, sha, path) => execFileSync("git", ["show", `${sha}:${path}`], {
  cwd: root,
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});
const textAt = (root, sha, path) => blob(root, sha, path).toString("utf8");
const jsonAt = (root, sha, path) => JSON.parse(textAt(root, sha, path));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sorted = (values) => [...values].sort();
const unique = (values) => Array.isArray(values) && new Set(values).size === values.length;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function resolveMobileStorageBaselineFingerprintPaths({ root, baseSha }) {
  const freeze = jsonAt(root, baseSha, "decision-lab/config/additive-recertification-v1.freeze.json");
  const record = jsonAt(root, baseSha, `decision-lab/config/${freeze.currentVersion}.json`);
  if (record.scope !== "admin-data-additive") return null;
  const unsignedRecord = { ...record };
  delete unsignedRecord.recertificationHash;
  if (record.status !== "VERIFIED_ADDITIVE_EVIDENCE"
    || freeze.currentRecertificationHash !== record.recertificationHash
    || contentHash(unsignedRecord) !== record.recertificationHash) {
    throw new Error("active Admin/data record is not exactly freeze-bound");
  }
  git(root, ["merge-base", "--is-ancestor", record.baseMainSha, record.candidateSha]);
  git(root, ["merge-base", "--is-ancestor", record.candidateSha, baseSha]);
  if (git(root, ["rev-parse", `${record.candidateSha}^{tree}`]) !== record.candidateProductTree) {
    throw new Error("active Admin/data candidate tree binding differs");
  }
  const adminData = record.adminData;
  const manifest = jsonAt(root, baseSha, adminData.manifestPath);
  if (sha256(blob(root, baseSha, adminData.manifestPath)) !== adminData.manifestSha256) {
    throw new Error("active Admin/data manifest hash differs");
  }
  const applicationSchema = manifest.fingerprints?.candidate?.applicationSchema;
  const publicAcl = manifest.fingerprints?.candidate?.publicAcl;
  if (!ACTIVE_ADMIN_SCHEMA_PATH.test(applicationSchema ?? "")
    || !ACTIVE_ADMIN_ACL_PATH.test(publicAcl ?? "")
    || !adminData.paths?.includes(applicationSchema)
    || !adminData.paths?.includes(publicAcl)
    || textAt(root, baseSha, applicationSchema).trim() !== adminData.candidateFingerprints?.applicationSchema
    || textAt(root, baseSha, publicAcl).trim() !== adminData.candidateFingerprints?.publicAcl) {
    throw new Error("active Admin/data fingerprint binding differs");
  }
  return { applicationSchema, publicAcl };
}

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
    const value = textAt(root, sha, path).trim();
    if (!SHA256.test(value)) reasons.push(`${label}_FINGERPRINT_INVALID`);
    return value;
  } catch {
    reasons.push(`${label}_FINGERPRINT_UNREADABLE`);
    return null;
  }
};

const manifestPaths = (manifest, manifestPath) => [
  manifest.migration,
  manifest.storagePolicy,
  ...manifest.mobile.consumers,
  manifest.mobile.helper,
  ...manifest.mobile.tests,
  manifest.mobile.packageManifest,
  ...manifest.acceptanceTests,
  manifest.fingerprints.candidate.applicationSchema,
  manifest.fingerprints.candidate.publicAcl,
  manifest.reconstruction.applicationSchema,
  manifest.reconstruction.publicAcl,
  ...(manifest.documentation ?? []),
  manifestPath,
];

export function buildMobileStorageAtomicEvidence({ root, baseSha, candidateSha, manifestPath }) {
  const manifest = jsonAt(root, candidateSha, manifestPath);
  const testPaths = [...manifest.mobile.tests, ...manifest.acceptanceTests];
  const paths = manifestPaths(manifest, manifestPath);
  return {
    schemaVersion: MOBILE_STORAGE_ATOMIC_EVIDENCE_VERSION,
    manifestPath,
    manifestSha256: sha256(blob(root, candidateSha, manifestPath)),
    migrationSha256: sha256(blob(root, candidateSha, manifest.migration)),
    storagePolicySha256: {
      base: sha256(blob(root, baseSha, manifest.storagePolicy)),
      candidate: sha256(blob(root, candidateSha, manifest.storagePolicy)),
    },
    mobileSha256: Object.fromEntries([
      ...manifest.mobile.consumers,
      manifest.mobile.helper,
      ...manifest.mobile.tests,
      manifest.mobile.packageManifest,
    ].map((path) => [path, sha256(blob(root, candidateSha, path))])),
    testSha256: Object.fromEntries(testPaths.map((path) => [path, sha256(blob(root, candidateSha, path))])),
    reconstructionSha256: Object.fromEntries(Object.values(manifest.reconstruction).map((path) => [path, sha256(blob(root, candidateSha, path))])),
    candidateFingerprints: {
      applicationSchema: textAt(root, candidateSha, manifest.fingerprints.candidate.applicationSchema).trim(),
      publicAcl: textAt(root, candidateSha, manifest.fingerprints.candidate.publicAcl).trim(),
    },
    baselineFingerprints: {
      applicationSchema: textAt(root, baseSha, manifest.fingerprints.baseline.applicationSchema).trim(),
      publicAcl: textAt(root, baseSha, manifest.fingerprints.baseline.publicAcl).trim(),
    },
    paths: sorted(paths),
  };
}

export function verifyMobileStorageAtomicEvidence({ root, baseSha, candidateSha, evidence }) {
  const reasons = [];
  if (!evidence || evidence.schemaVersion !== MOBILE_STORAGE_ATOMIC_EVIDENCE_VERSION) return ["MOBILE_STORAGE_EVIDENCE_MISSING"];
  if (!SAFE_PATH.test(evidence.manifestPath ?? "") || !MANIFEST_PATH.test(evidence.manifestPath ?? "")) reasons.push("MOBILE_STORAGE_MANIFEST_PATH_INVALID");
  let manifest;
  try {
    manifest = jsonAt(root, candidateSha, evidence.manifestPath);
    if (sha256(blob(root, candidateSha, evidence.manifestPath)) !== evidence.manifestSha256) reasons.push("MOBILE_STORAGE_MANIFEST_HASH_MISMATCH");
  } catch {
    return [...reasons, "MOBILE_STORAGE_MANIFEST_UNREADABLE"];
  }
  if (manifest.schemaVersion !== MOBILE_STORAGE_ATOMIC_EVIDENCE_VERSION) reasons.push("MOBILE_STORAGE_MANIFEST_VERSION_INVALID");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id ?? "")) reasons.push("MOBILE_STORAGE_ID_INVALID");
  const candidateDirectory = `supabase/canonical/mobile-storage-atomic/${manifest.id}`;
  const reconstructionDirectory = `scripts/ci/mobile-storage-atomic/${manifest.id}`;
  if (!MIGRATION_PATH.test(manifest.migration ?? "")) reasons.push("MOBILE_STORAGE_MIGRATION_INVALID");
  if (manifest.storagePolicy !== STORAGE_POLICY_PATH) reasons.push("MOBILE_STORAGE_POLICY_PATH_INVALID");
  if (!same(sorted(manifest.mobile?.consumers ?? []), sorted(REQUIRED_CONSUMERS))) reasons.push("MOBILE_STORAGE_CONSUMERS_INVALID");
  if (manifest.mobile?.helper !== REQUIRED_HELPER || !same(manifest.mobile?.tests ?? [], [REQUIRED_MOBILE_TEST]) || manifest.mobile?.packageManifest !== MOBILE_PACKAGE) reasons.push("MOBILE_STORAGE_HELPER_TEST_SET_INVALID");
  const acceptanceTests = manifest.acceptanceTests ?? [];
  if (!acceptanceTests.length || !unique(acceptanceTests) || !acceptanceTests.every((path) => ACCEPTANCE_PATH.test(path))) reasons.push("MOBILE_STORAGE_ACCEPTANCE_SET_INVALID");
  const documentation = manifest.documentation ?? [];
  if (!unique(documentation) || !documentation.every((path) => DOCUMENTATION_PATH.test(path))) reasons.push("MOBILE_STORAGE_DOCUMENTATION_INVALID");
  const assertionKeys = Object.keys(manifest.assertions ?? {}).sort();
  if (!same(assertionKeys, sorted(MOBILE_STORAGE_REQUIRED_ASSERTIONS))) reasons.push("MOBILE_STORAGE_ASSERTION_MATRIX_INCOMPLETE");
  const testPaths = [...(manifest.mobile?.tests ?? []), ...acceptanceTests];
  if (Object.values(manifest.assertions ?? {}).some((path) => !testPaths.includes(path))) reasons.push("MOBILE_STORAGE_ASSERTION_PATH_INVALID");

  const candidateFingerprints = manifest.fingerprints?.candidate ?? {};
  const baselineFingerprints = manifest.fingerprints?.baseline ?? {};
  let activeBaselineFingerprints = null;
  let activeBaselineInvalid = false;
  try {
    activeBaselineFingerprints = resolveMobileStorageBaselineFingerprintPaths({ root, baseSha });
  } catch {
    activeBaselineInvalid = true;
    reasons.push("MOBILE_STORAGE_ACTIVE_BASELINE_INVALID");
  }
  if (!FINGERPRINT_PATH.test(candidateFingerprints.applicationSchema ?? "") || !FINGERPRINT_PATH.test(candidateFingerprints.publicAcl ?? "") || candidateFingerprints.applicationSchema !== `${candidateDirectory}/application-schema.sha256` || candidateFingerprints.publicAcl !== `${candidateDirectory}/public-acl.sha256`) reasons.push("MOBILE_STORAGE_CANDIDATE_FINGERPRINT_PATH_INVALID");
  const baselinePathsValid = !activeBaselineInvalid && (activeBaselineFingerprints
    ? baselineFingerprints.applicationSchema === activeBaselineFingerprints.applicationSchema
      && baselineFingerprints.publicAcl === activeBaselineFingerprints.publicAcl
    : BASELINE_SCHEMA_PATH.test(baselineFingerprints.applicationSchema ?? "")
      && BASELINE_ACL_PATH.test(baselineFingerprints.publicAcl ?? ""));
  if (!baselinePathsValid) reasons.push("MOBILE_STORAGE_BASELINE_FINGERPRINT_PATH_INVALID");
  if (!RECONSTRUCTION_PATH.test(manifest.reconstruction?.applicationSchema ?? "") || !RECONSTRUCTION_PATH.test(manifest.reconstruction?.publicAcl ?? "") || manifest.reconstruction?.applicationSchema !== `${reconstructionDirectory}/application-schema-reconstruction.sql` || manifest.reconstruction?.publicAcl !== `${reconstructionDirectory}/public-acl-reconstruction.sql`) reasons.push("MOBILE_STORAGE_RECONSTRUCTION_PATH_INVALID");

  const entries = diffEntries(root, baseSha, candidateSha);
  const changed = new Map(entries.flatMap(({ status, paths }) => paths.map((path) => [path, status])));
  const migrationEntries = entries.filter(({ paths }) => paths.some((path) => path.startsWith("supabase/migrations/")));
  if (migrationEntries.some(({ status }) => status !== "A")) reasons.push("HISTORICAL_MIGRATION_MUTATION");
  if (!same(migrationEntries.flatMap(({ paths }) => paths), [manifest.migration])) reasons.push("MOBILE_STORAGE_MIGRATION_SET_MISMATCH");
  const mustBeAdded = [
    manifest.migration,
    manifest.mobile?.helper,
    ...(manifest.mobile?.tests ?? []),
    ...acceptanceTests,
    candidateFingerprints.applicationSchema,
    candidateFingerprints.publicAcl,
    manifest.reconstruction?.applicationSchema,
    manifest.reconstruction?.publicAcl,
    ...documentation,
    evidence.manifestPath,
  ];
  if (mustBeAdded.some((path) => changed.get(path) !== "A")) reasons.push("MOBILE_STORAGE_EVIDENCE_NOT_FORWARD_ONLY");
  const mustBeModified = [...REQUIRED_CONSUMERS, MOBILE_PACKAGE, STORAGE_POLICY_PATH];
  if (mustBeModified.some((path) => changed.get(path) !== "M")) reasons.push("MOBILE_STORAGE_BOUND_EXISTING_FILE_MISSING");
  const expectedPaths = manifestPaths(manifest, evidence.manifestPath);
  if (!same(sorted([...changed.keys()]), sorted(expectedPaths))) reasons.push("MOBILE_STORAGE_CHANGED_SET_MISMATCH");

  try {
    const baseMigrations = git(root, ["ls-tree", "-r", "--name-only", baseSha, "--", "supabase/migrations"]).split("\n").filter(Boolean);
    const baseTip = sorted(baseMigrations.map((path) => path.match(MIGRATION_PATH)?.[1]).filter(Boolean)).at(-1);
    if (!baseTip || manifest.migration.match(MIGRATION_PATH)?.[1] <= baseTip) reasons.push("MOBILE_STORAGE_MIGRATION_NOT_FORWARD");
  } catch { reasons.push("MOBILE_STORAGE_MIGRATION_LINEAGE_UNREADABLE"); }

  try {
    const migrationBody = textAt(root, candidateSha, manifest.migration);
    const storageBody = textAt(root, candidateSha, STORAGE_POLICY_PATH);
    const requiredMigrationFragments = [
      "review_media_upload_reservations_v1", "reserve_review_media_upload_v1", "review_media_upload_is_reserved_v1",
      "finalize_review_with_media_v1", "auth.uid()", "expires_at", "finalized_at", "storage_paths", "content_types",
      "bucket_id", "review_id", "user_id", "spot_id", "p_review_id", "p_spot_id", "p_storage_paths",
      "p_content_types", "p_max_sizes_bytes", "review-photos", "review_photos", "security definer", "set search_path",
    ];
    if (requiredMigrationFragments.some((fragment) => !migrationBody.toLowerCase().includes(fragment.toLowerCase()))) reasons.push("MOBILE_STORAGE_AUTHORITY_CONTRACT_INCOMPLETE");
    const mirror = /with\s+check\s*\(\s*public\.review_media_upload_is_reserved_v1\s*\(\s*bucket_id\s*,\s*name\s*,\s*owner\s*,\s*metadata\s*\)\s*\)/i;
    if (!mirror.test(migrationBody) || !mirror.test(storageBody)) reasons.push("MOBILE_STORAGE_POLICY_MIRROR_MISMATCH");
    const mobileBodies = [...REQUIRED_CONSUMERS, REQUIRED_HELPER, REQUIRED_MOBILE_TEST, MOBILE_PACKAGE].map((path) => textAt(root, candidateSha, path));
    if (mobileBodies.some((body) => /service[_-]?role|supabase_service_role|secret[_-]?key/i.test(body))) reasons.push("MOBILE_STORAGE_CLIENT_PRIVILEGE_MATERIAL");
    const databaseAcceptance = acceptanceTests.map((path) => textAt(root, candidateSha, path)).join("\n").toLowerCase();
    const requiredDatabaseSignals = [
      "review_media_upload_is_reserved_v1", "finalize_review_with_media_v1", "review_photos",
      "backyrd_memory_bridge_outbox_v1", "expires_at", "finalized_at", "insufficient_privilege",
      "foreign", "missing", "consumed", "count(*)", "set local role authenticated", "set local role anon",
    ];
    if (requiredDatabaseSignals.some((signal) => !databaseAcceptance.includes(signal))) reasons.push("MOBILE_STORAGE_DATABASE_ACCEPTANCE_CONTRACT_INCOMPLETE");
    const mobileAcceptance = textAt(root, candidateSha, REQUIRED_MOBILE_TEST).toLowerCase();
    const requiredMobileSignals = ["uploadreservedreviewmedia", "finalizereviewwithmedia", "storage_upload", "finalization", "finalized", "upsert", "calls"];
    if (requiredMobileSignals.some((signal) => !mobileAcceptance.includes(signal))) reasons.push("MOBILE_STORAGE_CLIENT_ACCEPTANCE_CONTRACT_INCOMPLETE");
    for (const assertion of MOBILE_STORAGE_REQUIRED_ASSERTIONS) {
      const path = manifest.assertions?.[assertion];
      if (!path || !textAt(root, candidateSha, path).includes(`V15_ASSERT:${assertion}`)) reasons.push(`MOBILE_STORAGE_ASSERTION_MARKER_MISSING:${assertion}`);
    }
  } catch { reasons.push("MOBILE_STORAGE_CONTRACT_UNREADABLE"); }

  const candidateSchema = fingerprintValue(root, candidateSha, candidateFingerprints.applicationSchema, reasons, "MOBILE_STORAGE_CANDIDATE_SCHEMA");
  const candidateAcl = fingerprintValue(root, candidateSha, candidateFingerprints.publicAcl, reasons, "MOBILE_STORAGE_CANDIDATE_ACL");
  const baselineSchema = fingerprintValue(root, baseSha, baselineFingerprints.applicationSchema, reasons, "MOBILE_STORAGE_BASELINE_SCHEMA");
  const baselineAcl = fingerprintValue(root, baseSha, baselineFingerprints.publicAcl, reasons, "MOBILE_STORAGE_BASELINE_ACL");
  if (candidateSchema !== evidence.candidateFingerprints?.applicationSchema || candidateAcl !== evidence.candidateFingerprints?.publicAcl) reasons.push("MOBILE_STORAGE_CANDIDATE_FINGERPRINT_BINDING_MISMATCH");
  if (baselineSchema !== evidence.baselineFingerprints?.applicationSchema || baselineAcl !== evidence.baselineFingerprints?.publicAcl) reasons.push("MOBILE_STORAGE_BASELINE_FINGERPRINT_BINDING_MISMATCH");
  if (sha256(blob(root, candidateSha, manifest.migration)) !== evidence.migrationSha256) reasons.push("MOBILE_STORAGE_MIGRATION_HASH_MISMATCH");
  if (sha256(blob(root, baseSha, STORAGE_POLICY_PATH)) !== evidence.storagePolicySha256?.base || sha256(blob(root, candidateSha, STORAGE_POLICY_PATH)) !== evidence.storagePolicySha256?.candidate) reasons.push("MOBILE_STORAGE_POLICY_HASH_MISMATCH");
  for (const [path, expected] of Object.entries(evidence.mobileSha256 ?? {})) if (!expectedPaths.includes(path) || sha256(blob(root, candidateSha, path)) !== expected) reasons.push("MOBILE_STORAGE_MOBILE_HASH_MISMATCH");
  for (const [path, expected] of Object.entries(evidence.testSha256 ?? {})) if (!testPaths.includes(path) || sha256(blob(root, candidateSha, path)) !== expected) reasons.push("MOBILE_STORAGE_TEST_HASH_MISMATCH");
  for (const [path, expected] of Object.entries(evidence.reconstructionSha256 ?? {})) if (!Object.values(manifest.reconstruction ?? {}).includes(path) || sha256(blob(root, candidateSha, path)) !== expected) reasons.push("MOBILE_STORAGE_RECONSTRUCTION_HASH_MISMATCH");
  if (!same(sorted(Object.keys(evidence.mobileSha256 ?? {})), sorted([...REQUIRED_CONSUMERS, REQUIRED_HELPER, REQUIRED_MOBILE_TEST, MOBILE_PACKAGE]))) reasons.push("MOBILE_STORAGE_MOBILE_HASH_SET_MISMATCH");
  if (!same(sorted(Object.keys(evidence.testSha256 ?? {})), sorted(testPaths))) reasons.push("MOBILE_STORAGE_TEST_HASH_SET_MISMATCH");
  if (!same(sorted(Object.keys(evidence.reconstructionSha256 ?? {})), sorted(Object.values(manifest.reconstruction ?? {})))) reasons.push("MOBILE_STORAGE_RECONSTRUCTION_HASH_SET_MISMATCH");
  if (!same(sorted(evidence.paths ?? []), sorted(expectedPaths))) reasons.push("MOBILE_STORAGE_PATH_BINDING_MISMATCH");
  return [...new Set(reasons)];
}

export function mobileStorageAtomicAllowedPath(path, evidence) {
  return evidence?.paths?.includes(path) === true;
}
