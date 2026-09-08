#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST = "docs/operations/PRODUCTION_PRODUCT_LINEAGE.json";
const MARKER_PREFIX = "docs/operations/production-lineage-candidates/";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const isHash = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export function productionLineageCandidateProblems({ marker, manifest, markerPath, markerChanges, manifestChanged, deployedAdminTree, deployedMigrationCount, deployedMigrationSha256, deployedSourceIntegrated }) {
  const problems = [];
  if (markerChanges.length !== 1 || markerChanges[0]?.status !== "A" || markerChanges[0]?.path !== markerPath) problems.push("exactly one new versioned candidate marker is required");
  if (!manifestChanged) problems.push("Production lineage manifest is unchanged");
  if (marker.schemaVersion !== "backyrd-production-lineage-candidate-v1") problems.push("marker schema version differs");
  if (!/^[a-z0-9-]+$/.test(marker.id ?? "")) problems.push("marker id is invalid");
  if (!isSha(marker.deployedSourceCommit) || !isSha(marker.admin?.tree)) problems.push("source or Admin tree identity is invalid");
  if (!isHash(marker.deploymentAudit?.auditHash) || !isHash(marker.deploymentAudit?.planHash) || !isHash(marker.database?.migrationSha256)) problems.push("deployment audit hash is invalid");
  if (marker.deploymentAudit?.result !== "PASS") problems.push("deployment audit did not pass");
  if (!Number.isInteger(marker.deploymentAudit?.runId) || marker.deploymentAudit.runId <= 0) problems.push("deployment run id is invalid");
  if (!Number.isInteger(marker.admin?.githubDeploymentId) || marker.admin.githubDeploymentId <= 0) problems.push("Admin deployment id is invalid");
  if (!Number.isInteger(marker.database?.migrationCount) || marker.database.migrationCount <= 0) problems.push("migration count is invalid");
  if (!deployedSourceIntegrated) problems.push("deployed source is not an ancestor of the exact PR head");
  if (marker.admin?.tree !== deployedAdminTree) problems.push("Admin tree does not match deployed source");
  if (marker.database?.migrationCount !== deployedMigrationCount) problems.push("migration count does not match deployed source");
  if (marker.database?.migrationSha256 !== deployedMigrationSha256) problems.push("migration bytes do not match deployed source");

  const admin = manifest.surfaces?.admin_intelligence_web;
  const database = manifest.surfaces?.database;
  if (admin?.commit !== marker.deployedSourceCommit || admin?.tree !== marker.admin?.tree || admin?.github_deployment_id !== marker.admin?.githubDeploymentId) problems.push("Admin shipped lineage differs from marker");
  if (admin?.canonical_source?.commit !== marker.deployedSourceCommit || admin?.canonical_source?.tree !== marker.admin?.tree || admin?.canonical_source?.production_verified !== true) problems.push("Admin canonical source differs from verified marker");
  if (database?.source_commit !== marker.deployedSourceCommit || database?.migration_tip !== marker.database?.migrationTip || database?.migration_count !== marker.database?.migrationCount) problems.push("database shipped lineage differs from marker");
  if (database?.canonical_source?.source_commit !== marker.deployedSourceCommit || database?.canonical_source?.migration_tip !== marker.database?.migrationTip || database?.canonical_source?.migration_count !== marker.database?.migrationCount || database?.canonical_source?.production_verified !== true) problems.push("database canonical source differs from verified marker");
  if (!(manifest.required_ancestry ?? []).includes(marker.deployedSourceCommit)) problems.push("deployed source is absent from required ancestry");
  return problems;
}

export function pendingProductionLineageCandidateProblems({
  marker,
  manifest,
  baseManifest,
  markerPath,
  markerChanges,
  manifestChanged,
  sourceMobileTree,
  sourceIntegrated,
  migrationExistsAtSource,
}) {
  const problems = [];
  if (markerChanges.length !== 1 || markerChanges[0]?.status !== "A" || markerChanges[0]?.path !== markerPath) problems.push("exactly one new versioned pending marker is required");
  if (!manifestChanged) problems.push("Production lineage manifest is unchanged");
  if (marker.schemaVersion !== "backyrd-production-lineage-pending-release-v1") problems.push("pending marker schema version differs");
  if (!/^[a-z0-9-]+$/.test(marker.id ?? "")) problems.push("pending marker id is invalid");
  if (!isSha(marker.sourceCommit) || !isSha(marker.mobileTree)) problems.push("pending source or Mobile tree identity is invalid");
  if (marker.releaseState !== "AWAITING_EXPLICIT_RELEASE") problems.push("pending release state differs");
  if (marker.channel !== "production" || marker.runtimeVersion !== "1.1.0") problems.push("pending Mobile release contract differs");
  if (!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(marker.requiredMigration ?? "")) problems.push("pending migration path is invalid");
  if (!sourceIntegrated) problems.push("pending source is not an ancestor of the exact PR head");
  if (marker.mobileTree !== sourceMobileTree) problems.push("pending Mobile tree does not match source");
  if (!migrationExistsAtSource) problems.push("pending migration is absent from source");

  const mobile = manifest.surfaces?.mobile;
  if (mobile?.canonical_source?.commit !== marker.sourceCommit || mobile?.canonical_source?.tree !== marker.mobileTree || mobile?.canonical_source?.production_verified !== false) problems.push("pending Mobile canonical source differs from marker");
  const shippedMobile = structuredClone(mobile ?? {});
  const baseShippedMobile = structuredClone(baseManifest.surfaces?.mobile ?? {});
  delete shippedMobile.canonical_source;
  delete baseShippedMobile.canonical_source;
  if (JSON.stringify(shippedMobile) !== JSON.stringify(baseShippedMobile)) problems.push("shipped Mobile identity changed before release");
  if (JSON.stringify(manifest.surfaces?.database) !== JSON.stringify(baseManifest.surfaces?.database)) problems.push("database lineage changed before release");
  if (JSON.stringify(manifest.required_ancestry ?? []) !== JSON.stringify(baseManifest.required_ancestry ?? [])) problems.push("required ancestry changed before release");
  return problems;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const value = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : process.argv[index + 1];
  };
  const root = resolve(value("--root") ?? new URL("../..", import.meta.url).pathname);
  const base = value("--base-sha");
  const head = value("--head-sha");
  if (!base || !head) throw new Error("--base-sha and --head-sha are required");
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const isAncestor = (ancestor, descendant) => spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" }).status === 0;
  const baseCommit = git(["rev-parse", `${base}^{commit}`]);
  const headCommit = git(["rev-parse", `${head}^{commit}`]);
  if (!isAncestor(baseCommit, headCommit)) throw new Error("exact PR head does not descend from exact PR base");
  const changed = git(["diff", "--name-status", `${baseCommit}..${headCommit}`, "--", MANIFEST, MARKER_PREFIX])
    .split("\n").filter(Boolean).map((line) => {
      const [status, path] = line.split("\t");
      return { status, path };
    });
  const manifestChanged = changed.some(({ path }) => path === MANIFEST);
  const markerChanges = changed.filter(({ path }) => path.startsWith(MARKER_PREFIX));
  if (!markerChanges.length) {
    if (manifestChanged) throw new Error("Production lineage changed without an explicit versioned candidate marker");
    process.stdout.write(`${JSON.stringify({ mode: "base", targetSha: baseCommit })}\n`);
    process.exit(0);
  }
  const markerPath = markerChanges[0].path;
  const marker = JSON.parse(git(["show", `${headCommit}:${markerPath}`]));
  const manifest = JSON.parse(git(["show", `${headCommit}:${MANIFEST}`]));
  const baseManifest = JSON.parse(git(["show", `${baseCommit}:${MANIFEST}`]));
  if (marker.schemaVersion === "backyrd-production-lineage-pending-release-v1") {
    let sourceMobileTree = null;
    let migrationExistsAtSource = false;
    try {
      sourceMobileTree = git(["rev-parse", `${marker.sourceCommit}:mobile`]);
      git(["cat-file", "-e", `${marker.sourceCommit}:${marker.requiredMigration}`]);
      migrationExistsAtSource = true;
    } catch {
      // Stable fail-closed problems are emitted below.
    }
    const problems = pendingProductionLineageCandidateProblems({
      marker,
      manifest,
      baseManifest,
      markerPath,
      markerChanges,
      manifestChanged,
      sourceMobileTree,
      sourceIntegrated: isSha(marker.sourceCommit) && isAncestor(marker.sourceCommit, headCommit),
      migrationExistsAtSource,
    });
    if (problems.length) throw new Error(`Pending Production lineage candidate is invalid: ${problems.join(", ")}`);
    process.stdout.write(`${JSON.stringify({ mode: "candidate", releaseState: marker.releaseState, targetSha: headCommit, markerPath, pendingSourceCommit: marker.sourceCommit })}\n`);
    process.exit(0);
  }
  const migrationPath = `supabase/migrations/${marker.database?.migrationTip}.sql`;
  let deployedAdminTree = null;
  let deployedMigrationCount = null;
  let deployedMigrationSha256 = null;
  try {
    deployedAdminTree = git(["rev-parse", `${marker.deployedSourceCommit}:admin-dashboard`]);
    deployedMigrationCount = git(["ls-tree", "-r", "--name-only", marker.deployedSourceCommit, "--", "supabase/migrations"])
      .split("\n").filter((path) => path.endsWith(".sql")).length;
    deployedMigrationSha256 = sha256(execFileSync("git", ["show", `${marker.deployedSourceCommit}:${migrationPath}`], { cwd: root }));
  } catch {
    // Report stable validation problems below rather than exposing raw Git errors.
  }
  const problems = productionLineageCandidateProblems({
    marker,
    manifest,
    markerPath,
    markerChanges,
    manifestChanged,
    deployedAdminTree,
    deployedMigrationCount,
    deployedMigrationSha256,
    deployedSourceIntegrated: isSha(marker.deployedSourceCommit) && isAncestor(marker.deployedSourceCommit, headCommit),
  });
  if (problems.length) throw new Error(`Production lineage candidate is invalid: ${problems.join(", ")}`);
  process.stdout.write(`${JSON.stringify({ mode: "candidate", targetSha: headCommit, markerPath, deployedSourceCommit: marker.deployedSourceCommit })}\n`);
}
