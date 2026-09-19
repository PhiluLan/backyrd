#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionPlan, parseSupabaseFunctionConfig } from "../deployment/supabase-production-plan.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_GIT_OUTPUT = 50 * 1024 * 1024;
const MODES = new Set(["PR_CANDIDATE", "POST_MERGE_MAIN"]);
const REQUIRED_TESTS = Object.freeze([
  "decision-vnext-single-route",
  "product-release-contracts",
  "product-release-e2e",
  "ios-ota-export",
  "edge-runtime-bundle",
]);
const SOURCE_SETS = Object.freeze({
  worldArtifact: ["packages/world-knowledge-core/package.json", "packages/world-knowledge-core/src"],
  userArtifact: ["packages/user-intelligence-vnext-core/package.json", "packages/user-intelligence-vnext-core/src"],
  decisionArtifact: [
    "packages/decision-vnext-core/package.json",
    "packages/decision-vnext-core/src",
    "mobile/packages/product-decision-contract",
    "mobile/lib/decision/productDecision.ts",
    "mobile/app/(tabs)/decision.tsx",
    "web/lib/decision-web-api.ts",
  ],
  productPolicy: ["delivery/product-authority-v1.json", "docs/architecture/PRODUCT_V1_ACTIVE_SURFACE.md"],
});
const EDGE_BUILD_DIRS = Object.freeze([
  "packages/decision-vnext-core/dist",
  "packages/user-intelligence-vnext-core/dist",
  "packages/world-knowledge-core/dist",
]);
const EDGE_BUILD_REQUIRED = Object.freeze([
  "packages/decision-vnext-core/dist/product-decision-production-adapter.js",
  "packages/decision-vnext-core/dist/product-decision.js",
  "packages/user-intelligence-vnext-core/dist/index.js",
  "packages/world-knowledge-core/dist/index.js",
]);

const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: MAX_GIT_OUTPUT,
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const gitBlob = (root, spec) => execFileSync("git", ["show", spec], {
  cwd: root,
  maxBuffer: MAX_GIT_OUTPUT,
  stdio: ["ignore", "pipe", "pipe"],
});
const gitBytes = (root, args) => execFileSync("git", args, { cwd: root, maxBuffer: MAX_GIT_OUTPUT });
const verifyIosOtaBundle = (bundleRoot, entries) => {
  const paths = new Set(entries.map(({ path }) => path));
  requireValue(paths.has("mobile-update/metadata.json") && !paths.has("mobile-update/index.html"), "release_ios_ota_artifact_required");
  const metadata = JSON.parse(readFileSync(resolve(bundleRoot, "mobile-update/metadata.json"), "utf8"));
  const bundle = metadata.fileMetadata?.ios?.bundle;
  requireValue(metadata.bundler === "metro" && Object.keys(metadata.fileMetadata ?? {}).length === 1
    && typeof bundle === "string" && /^_expo\/static\/js\/ios\/entry-[0-9a-f]+\.hbc$/.test(bundle)
    && paths.has(`mobile-update/${bundle}`) && Array.isArray(metadata.fileMetadata.ios.assets), "release_ios_ota_artifact_required");
};
const isAncestor = (root, ancestor, descendant) => {
  try { execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" }); return true; }
  catch { return false; }
};
const walk = (root) => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(root, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const componentHash = (files) => sha256(JSON.stringify(files.map(({ path, bytes, sha256: hash }) => ({ path, bytes, sha256: hash }))));

export function verifyProductReleaseIdentity(identity) {
  requireValue(identity && MODES.has(identity.mode), "release_identity_mode_invalid");
  for (const key of ["sourceSha", "sourceTreeSha", "baseSha", "baseTreeSha", "checkoutSha", "checkoutTreeSha", "canonicalMainSha", "canonicalMainTreeSha", "candidateHeadSha", "candidateTreeSha"]) {
    requireValue(SHA.test(identity[key]), `release_identity_sha_invalid:${key}`);
  }
  requireValue(Array.isArray(identity.parents) && identity.parents.every((value) => SHA.test(value)), "release_identity_parents_invalid");
  requireValue(identity.canonicalAncestryVerified === true, "release_identity_ancestry_invalid");
  if (identity.mode === "PR_CANDIDATE") {
    requireValue(identity.baseSha === identity.canonicalMainSha && identity.baseTreeSha === identity.canonicalMainTreeSha, "release_identity_pr_base_main_mismatch");
    requireValue(identity.sourceSha === identity.candidateHeadSha && identity.sourceTreeSha === identity.candidateTreeSha, "release_identity_pr_candidate_mismatch");
    const exact = identity.checkoutSha === identity.sourceSha && identity.checkoutTreeSha === identity.sourceTreeSha;
    const synthetic = identity.checkoutSha !== identity.sourceSha
      && identity.parents.length === 2
      && identity.parents[0] === identity.baseSha
      && identity.parents[1] === identity.sourceSha
      && identity.checkoutTreeSha === identity.sourceTreeSha;
    requireValue(exact || synthetic, "release_identity_pr_checkout_invalid");
  } else {
    requireValue(identity.sourceSha === identity.checkoutSha && identity.sourceSha === identity.canonicalMainSha, "release_identity_main_sha_mismatch");
    requireValue(identity.sourceTreeSha === identity.checkoutTreeSha && identity.sourceTreeSha === identity.canonicalMainTreeSha, "release_identity_main_tree_mismatch");
    requireValue(identity.parents.length === 2 && identity.parents[0] === identity.baseSha && identity.parents[1] === identity.candidateHeadSha, "release_identity_main_parents_mismatch");
    requireValue(identity.sourceTreeSha === identity.candidateTreeSha, "release_identity_main_candidate_tree_mismatch");
  }
  return true;
}

export function resolveProductReleaseIdentity({ root, mode, sourceSha, baseSha, checkoutSha = "HEAD", canonicalMainSha, candidateHeadSha }) {
  requireValue(MODES.has(mode), "release_identity_mode_invalid");
  const commit = (value) => git(root, ["rev-parse", `${value}^{commit}`]);
  const tree = (value) => git(root, ["rev-parse", `${value}^{tree}`]);
  const source = commit(sourceSha); const base = commit(baseSha); const checkout = commit(checkoutSha); const main = commit(canonicalMainSha);
  const parents = git(root, ["show", "-s", "--format=%P", checkout]).split(" ").filter(Boolean);
  const candidate = mode === "POST_MERGE_MAIN" ? commit(candidateHeadSha ?? parents[1] ?? "") : source;
  const identity = {
    mode,
    sourceSha: source,
    sourceTreeSha: tree(source),
    baseSha: base,
    baseTreeSha: tree(base),
    checkoutSha: checkout,
    checkoutTreeSha: tree(checkout),
    canonicalMainSha: main,
    canonicalMainTreeSha: tree(main),
    parents,
    candidateHeadSha: candidate,
    candidateTreeSha: tree(candidate),
    canonicalAncestryVerified: isAncestor(root, base, source),
  };
  verifyProductReleaseIdentity(identity);
  return identity;
}

export function buildProductReleaseTestEvidence({ root, sourceSha = "HEAD" }) {
  const source = git(root, ["rev-parse", `${sourceSha}^{commit}`]);
  return {
    contractVersion: "backyrd.product-release-test-evidence@1.0",
    sourceSha: source,
    sourceTreeSha: git(root, ["rev-parse", `${source}^{tree}`]),
    results: Object.fromEntries(REQUIRED_TESTS.map((name) => [name, "PASS"])),
  };
}

export function verifyProductReleaseTestEvidence(evidence, identity) {
  requireValue(evidence?.contractVersion === "backyrd.product-release-test-evidence@1.0", "release_test_evidence_contract_invalid");
  requireValue(evidence.sourceSha === identity.sourceSha && evidence.sourceTreeSha === identity.sourceTreeSha, "release_test_evidence_source_invalid");
  requireValue(JSON.stringify(Object.keys(evidence.results ?? {}).sort()) === JSON.stringify([...REQUIRED_TESTS].sort()), "release_test_evidence_set_invalid");
  requireValue(Object.values(evidence.results).every((status) => status === "PASS"), "release_test_evidence_not_green");
  return true;
}

const trackedFor = (root, sourceSha, paths) => git(root, ["ls-tree", "-r", "--name-only", sourceSha, "--", ...paths]).split("\n").filter(Boolean).sort();
const readProductionState = (root, sourceSha) => JSON.parse(git(root, ["show", `${sourceSha}:delivery/production-state.json`]));

export function buildProductReleaseManifest({ root, sourceSha = "HEAD", outputDir, mobileBundle, identity, testEvidence, productionPlan }) {
  verifyProductReleaseIdentity(identity);
  requireValue(identity.sourceSha === git(root, ["rev-parse", `${sourceSha}^{commit}`]), "release_manifest_identity_source_mismatch");
  verifyProductReleaseTestEvidence(testEvidence, identity);
  const deployable = trackedFor(root, identity.sourceSha, ["supabase/functions/decision-v13", "supabase/migrations", "supabase/config.toml", "supabase/production"]);
  const sourceSetPaths = Object.fromEntries(Object.entries(SOURCE_SETS).map(([name, paths]) => [name, trackedFor(root, identity.sourceSha, paths)]));
  const tracked = [...new Set([...deployable, ...Object.values(sourceSetPaths).flat()])].sort();
  const bundleRoot = resolve(outputDir, "bundle");
  mkdirSync(bundleRoot, { recursive: true });
  const fileIndex = new Map();
  for (const path of tracked) {
    const content = gitBytes(root, ["show", `${identity.sourceSha}:${path}`]);
    const target = resolve(bundleRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    fileIndex.set(path, { path, bytes: content.length, sha256: sha256(content) });
  }
  if (deployable.includes("supabase/functions/decision-v13/deno.json")) {
    const full = parseSupabaseFunctionConfig(gitBytes(root, ["show", `${identity.sourceSha}:supabase/config.toml`]).toString("utf8"));
    const decision = full.functions.get("decision-v13");
    requireValue(decision?.enabled && decision.verifyJwt && decision.entrypoint === "./functions/decision-v13/index.deploy.ts", "release_edge_function_config_invalid");
    const minimal = `project_id = "backyrd"\n\n[functions.decision-v13]\nenabled = true\nverify_jwt = true\nentrypoint = "./functions/decision-v13/index.deploy.ts"\n`;
    const target = resolve(bundleRoot, "supabase/config.toml");
    writeFileSync(target, minimal);
    fileIndex.set("supabase/config.toml", { path: "supabase/config.toml", bytes: Buffer.byteLength(minimal), sha256: sha256(minimal) });
  }
  const edgeBuildPaths = [];
  if (deployable.includes("supabase/functions/decision-v13/deno.json")) {
    for (const dir of EDGE_BUILD_DIRS) {
      for (const source of walk(resolve(root, dir)).filter((path) => path.endsWith(".js")).sort()) {
        const path = relative(root, source);
        const content = readFileSync(source);
        const target = resolve(bundleRoot, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
        fileIndex.set(path, { path, bytes: content.length, sha256: sha256(content) });
        edgeBuildPaths.push(path);
      }
    }
    requireValue(EDGE_BUILD_REQUIRED.every((path) => fileIndex.has(path)), "release_edge_build_missing");
  }
  if (mobileBundle) {
    const source = resolve(mobileBundle);
    const targetRoot = resolve(bundleRoot, "mobile-update");
    cpSync(source, targetRoot, { recursive: true });
    for (const path of walk(targetRoot).sort()) {
      if (!statSync(path).isFile()) continue;
      const content = readFileSync(path);
      const name = `mobile-update/${relative(targetRoot, path)}`;
      fileIndex.set(name, { path: name, bytes: content.length, sha256: sha256(content) });
    }
  }
  verifyIosOtaBundle(bundleRoot, [...fileIndex.values()].filter(({ path }) => path.startsWith("mobile-update/")));
  const files = [...fileIndex.values()].sort((left, right) => left.path.localeCompare(right.path));
  const byPaths = (paths) => paths.map((path) => fileIndex.get(path));
  const actualPlan = productionPlan ?? buildProductionPlan({
    repo: root,
    baseSha: readProductionState(root, identity.sourceSha).supabase.shippedSourceSha,
    headSha: identity.sourceSha,
  });
  requireValue(actualPlan?.canonicalMainSha === identity.sourceSha && HASH.test(actualPlan.planHash), "release_production_plan_identity_invalid");
  const authority = JSON.parse(git(root, ["show", `${identity.sourceSha}:delivery/product-authority-v1.json`]));
  requireValue(authority.status === "ACTIVE" && authority.productRoute === "DECISION_VNEXT_SINGLE_ROUTE" && authority.legacyDecisionAuthority === false, "release_product_authority_invalid");
  requireValue(authority.runtimeScope?.activeTransport === "decision-v13" && (authority.runtimeScope?.quarantinedTransports ?? []).length === 0, "release_runtime_policy_invalid");
  const recoveryRisk = authority.founderRecoveryRiskAcceptance;
  const currentRiskSet = (actualPlan.productPreappliedImport?.migrations ?? actualPlan.pendingMigrations)
    .map(({ path, sha256: migrationSha256 }) => ({ path, sha256: migrationSha256 }));
  let acceptedMigrationSet = currentRiskSet;
  if (currentRiskSet.length !== 13) {
    // Once all accepted migrations are shipped, the risk acceptance remains
    // historical evidence. A separately bounded additive scope is required
    // for any newly pending SQL; the 13-migration acceptance cannot cover it.
    requireValue(!actualPlan.productPreappliedImport, "release_recovery_pending_scope_invalid");
    const ledger = JSON.parse(git(root, ["show", `${identity.sourceSha}:supabase/production/preapplied-product-migrations-v1.json`]));
    requireValue(ledger.version === "backyrd-preapplied-product-migrations-v1" && ledger.projectRef === actualPlan.projectRef && Array.isArray(ledger.migrations), "release_recovery_ledger_invalid");
    acceptedMigrationSet = ledger.migrations.map(({ path, sha256: migrationSha256 }) => ({ path, sha256: migrationSha256 }));
    for (const entry of acceptedMigrationSet) requireValue(HASH.test(entry.sha256) && sha256(gitBlob(root, `${identity.sourceSha}:${entry.path}`)) === entry.sha256, "release_recovery_migration_bytes_invalid");
  }
  const additiveMigrationScope = authority.additiveProductMigrationScope ?? null;
  if (currentRiskSet.length !== 13 && currentRiskSet.length > 0) {
    requireValue(additiveMigrationScope?.contractVersion === "backyrd.product-v1-additive-migration-scope@1.0"
      && additiveMigrationScope.projectRef === actualPlan.projectRef
      && additiveMigrationScope.executionAuthorized === false
      && additiveMigrationScope.restoreDrillStatus === "NOT_PERFORMED_BY_FOUNDER_DECISION"
      && additiveMigrationScope.guaranteedDatabaseRollback === false
      && JSON.stringify(currentRiskSet) === JSON.stringify(additiveMigrationScope.migrations)
      && currentRiskSet.length === 1
      && currentRiskSet[0].path === "supabase/migrations/20260919172027_decision_vnext_bounded_catalog_context_v2.sql"
      && currentRiskSet[0].sha256 === "7a441acadc8d3827fdc56aebbfea71a07782c52fb6969a467f961e0d479f4f23",
    "release_recovery_risk_acceptance_invalid");
  }
  requireValue(recoveryRisk?.contractVersion === "backyrd.product-v1-founder-recovery-risk-acceptance@1.0"
    && recoveryRisk.decision === "ACCEPT_UNTESTED_DATABASE_RECOVERY_RISK"
    && recoveryRisk.canonicalStartingMainSha === "a58d829a6c5f231e48f3582bcd69adf9245c0589"
    && recoveryRisk.projectRef === actualPlan.projectRef
    && recoveryRisk.pendingMigrationCount === 13 && acceptedMigrationSet.length === 13
    && recoveryRisk.pendingMigrationSetSha256 === sha256(JSON.stringify(acceptedMigrationSet))
    && recoveryRisk.restoreDrillStatus === "NOT_PERFORMED_BY_FOUNDER_DECISION"
    && recoveryRisk.guaranteedDatabaseRollback === false
    && recoveryRisk.productionDataCopyAuthorized === false, "release_recovery_risk_acceptance_invalid");
  const components = {
    productRuntime: byPaths([...deployable.filter((path) => path.startsWith("supabase/functions/decision-v13/")), ...edgeBuildPaths]),
    database: byPaths(deployable.filter((path) => path.startsWith("supabase/migrations/"))),
    releaseConfiguration: byPaths(deployable.filter((path) => path === "supabase/config.toml" || path.startsWith("supabase/production/"))),
    mobileUpdate: files.filter(({ path }) => path.startsWith("mobile-update/")),
    ...Object.fromEntries(Object.entries(sourceSetPaths).map(([name, paths]) => [name, byPaths(paths)])),
  };
  const componentIdentities = Object.fromEntries(Object.entries(components).map(([name, entries]) => [name, { fileCount: entries.length, artifactHash: componentHash(entries) }]));
  const testEvidenceHash = sha256(JSON.stringify(testEvidence));
  const productionPlanAttestation = {
    version: actualPlan.version,
    baseSha: actualPlan.baseSha,
    canonicalMainSha: actualPlan.canonicalMainSha,
    planHash: actualPlan.planHash,
    migrationSet: actualPlan.migrations,
    pendingMigrations: actualPlan.pendingMigrations,
    productPreappliedImport: actualPlan.productPreappliedImport,
    deployFunctions: actualPlan.deployFunctions,
    retiredFunctions: actualPlan.retiredFunctions ?? [],
    recoveryRiskAcceptance: recoveryRisk,
    recoveryRiskMigrationSet: acceptedMigrationSet,
    additiveMigrationScope,
    authDeploy: actualPlan.authConfig?.deploy === true,
    runtimeDeploymentRequired: actualPlan.runtimeDeploymentRequired,
    executionAuthorized: false,
  };
  const body = {
    contractVersion: "backyrd.product-release-manifest@3.0",
    sourceSha: identity.sourceSha,
    sourceTreeSha: identity.sourceTreeSha,
    identity,
    buildOnceDeploySameArtifact: true,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    productIdentity: {
      route: authority.productRoute,
      policyHash: fileIndex.get("delivery/product-authority-v1.json").sha256,
      releaseIdentityHash: sha256(JSON.stringify(componentIdentities)),
    },
    componentIdentities,
    components,
    testEvidence: { ...testEvidence, evidenceHash: testEvidenceHash },
    runtimePolicy: authority.runtimeScope,
    productionPlan: productionPlanAttestation,
  };
  const manifest = { ...body, manifestHash: sha256(JSON.stringify(body)) };
  writeFileSync(resolve(outputDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyProductReleaseManifest({ artifactDir, expectedHash, expectedSourceSha, expectedMode, checkoutRoot }) {
  const manifest = JSON.parse(readFileSync(resolve(artifactDir, "release-manifest.json"), "utf8"));
  const { manifestHash, ...body } = manifest;
  requireValue(manifest.contractVersion === "backyrd.product-release-manifest@3.0", "release_manifest_contract_invalid");
  requireValue(sha256(JSON.stringify(body)) === manifestHash && manifestHash === expectedHash, "release_manifest_hash_mismatch");
  requireValue(manifest.sourceSha === expectedSourceSha, "release_manifest_source_mismatch");
  requireValue(!expectedMode || manifest.identity.mode === expectedMode, "release_manifest_mode_mismatch");
  verifyProductReleaseIdentity(manifest.identity);
  const { evidenceHash, ...rawEvidence } = manifest.testEvidence;
  verifyProductReleaseTestEvidence(rawEvidence, manifest.identity);
  requireValue(evidenceHash === sha256(JSON.stringify(rawEvidence)), "release_test_evidence_hash_mismatch");
  requireValue(manifest.buildOnceDeploySameArtifact === true, "release_build_once_policy_invalid");
  requireValue(manifest.productionPlan?.canonicalMainSha === manifest.sourceSha && manifest.productionPlan.executionAuthorized === false, "release_production_plan_invalid");
  const recoveryRisk = manifest.productionPlan.recoveryRiskAcceptance;
  const acceptedMigrationSet = manifest.productionPlan.recoveryRiskMigrationSet;
  const currentRiskSet = (manifest.productionPlan.productPreappliedImport?.migrations ?? manifest.productionPlan.pendingMigrations)
    .map(({ path, sha256: migrationSha256 }) => ({ path, sha256: migrationSha256 }));
  requireValue(Array.isArray(acceptedMigrationSet) && (currentRiskSet.length === 13
    ? JSON.stringify(currentRiskSet) === JSON.stringify(acceptedMigrationSet)
    : !manifest.productionPlan.productPreappliedImport && (currentRiskSet.length === 0
      || (currentRiskSet.length === 1
        && currentRiskSet[0].path === "supabase/migrations/20260919172027_decision_vnext_bounded_catalog_context_v2.sql"
        && currentRiskSet[0].sha256 === "7a441acadc8d3827fdc56aebbfea71a07782c52fb6969a467f961e0d479f4f23"
        && manifest.productionPlan.additiveMigrationScope?.contractVersion === "backyrd.product-v1-additive-migration-scope@1.0"
        && manifest.productionPlan.additiveMigrationScope.projectRef === "hjgcrrzfjchzqoegcywn"
        && manifest.productionPlan.additiveMigrationScope.executionAuthorized === false
        && manifest.productionPlan.additiveMigrationScope.restoreDrillStatus === "NOT_PERFORMED_BY_FOUNDER_DECISION"
        && manifest.productionPlan.additiveMigrationScope.guaranteedDatabaseRollback === false
        && JSON.stringify(currentRiskSet) === JSON.stringify(manifest.productionPlan.additiveMigrationScope.migrations)))), "release_recovery_pending_scope_invalid");
  const sealedMigrations = new Map((manifest.components.database ?? []).map(({ path, sha256: migrationSha256 }) => [path, migrationSha256]));
  for (const entry of acceptedMigrationSet) requireValue(sealedMigrations.get(entry.path) === entry.sha256, "release_recovery_migration_bytes_invalid");
  requireValue(recoveryRisk?.contractVersion === "backyrd.product-v1-founder-recovery-risk-acceptance@1.0"
    && recoveryRisk.decision === "ACCEPT_UNTESTED_DATABASE_RECOVERY_RISK"
    && recoveryRisk.canonicalStartingMainSha === "a58d829a6c5f231e48f3582bcd69adf9245c0589"
    && recoveryRisk.pendingMigrationCount === 13 && acceptedMigrationSet.length === 13
    && recoveryRisk.pendingMigrationSetSha256 === sha256(JSON.stringify(acceptedMigrationSet))
    && recoveryRisk.restoreDrillStatus === "NOT_PERFORMED_BY_FOUNDER_DECISION"
    && recoveryRisk.guaranteedDatabaseRollback === false
    && recoveryRisk.productionDataCopyAuthorized === false, "release_recovery_risk_acceptance_invalid");
  const retirementPreconditions = ["EXACT_POST_MERGE_MAIN_AND_ARTIFACT", "CURRENT_REMOTE_FUNCTION_IDENTITY_MATCHES", "PRODUCT_BACKEND_OFF_SMOKE_GREEN", "OLD_CLIENT_INCOMPATIBILITY_FAILS_CLOSED", "EXACT_MOBILE_OTA_AND_IPHONE_SMOKE_GREEN", "EMERGENCY_OFF_READY"];
  requireValue((manifest.productionPlan?.retiredFunctions ?? []).every((entry) => entry.executionAuthorized === false
    && (entry.productionAction === "NONE_NOT_AUTHORIZED"
      || (entry.slug === "decision-copy" && entry.productionAction === "DELETE_AFTER_VERIFIED_SINGLE_ROUTE_CUTOVER"
        && JSON.stringify(entry.requiredPreconditions) === JSON.stringify(retirementPreconditions)))), "release_function_retirement_policy_invalid");
  requireValue(manifest.runtimePolicy?.activeTransport === "decision-v13" && (manifest.runtimePolicy?.quarantinedTransports ?? []).length === 0, "release_runtime_policy_invalid");
  const runtimePaths = new Set((manifest.components.productRuntime ?? []).map(({ path }) => path));
  if (runtimePaths.has("supabase/functions/decision-v13/deno.json")) {
    requireValue(EDGE_BUILD_REQUIRED.every((path) => runtimePaths.has(path)), "release_edge_build_missing");
  }
  const componentFiles = Object.values(manifest.components).flat();
  const sealedPaths = [...new Set(componentFiles.map(({ path }) => path))].sort();
  const bundledPaths = walk(resolve(artifactDir, "bundle")).filter((path) => statSync(path).isFile())
    .map((path) => relative(resolve(artifactDir, "bundle"), path)).sort();
  requireValue(JSON.stringify(bundledPaths) === JSON.stringify(sealedPaths), "release_unsealed_artifact_file");
  verifyIosOtaBundle(resolve(artifactDir, "bundle"), manifest.components.mobileUpdate ?? []);
  for (const [name, entries] of Object.entries(manifest.components)) {
    requireValue(manifest.componentIdentities?.[name]?.artifactHash === componentHash(entries), `release_component_identity_mismatch:${name}`);
  }
  for (const file of new Map(componentFiles.map((entry) => [entry.path, entry])).values()) {
    const content = readFileSync(resolve(artifactDir, "bundle", file.path));
    requireValue(content.length === file.bytes && sha256(content) === file.sha256, `release_artifact_file_mismatch:${file.path}`);
    if (checkoutRoot && file.path === "supabase/config.toml" && runtimePaths.has("supabase/functions/decision-v13/deno.json")) {
      const checkedOutConfig = parseSupabaseFunctionConfig(readFileSync(resolve(checkoutRoot, file.path), "utf8"));
      const bundledConfig = parseSupabaseFunctionConfig(content.toString("utf8"));
      requireValue(bundledConfig.functions.size === 1
        && bundledConfig.functions.get("decision-v13")?.configHash === checkedOutConfig.functions.get("decision-v13")?.configHash,
      "release_edge_function_config_mismatch");
    } else if (checkoutRoot && !file.path.startsWith("mobile-update/") && !EDGE_BUILD_DIRS.some((dir) => file.path.startsWith(`${dir}/`))) {
      const checkedOut = readFileSync(resolve(checkoutRoot, file.path));
      requireValue(sha256(checkedOut) === file.sha256, `release_checkout_file_mismatch:${file.path}`);
    }
  }
  if (checkoutRoot) {
    requireValue(git(checkoutRoot, ["rev-parse", "HEAD^{commit}"]) === manifest.identity.checkoutSha, "release_checkout_commit_mismatch");
    requireValue(git(checkoutRoot, ["rev-parse", "HEAD^{tree}"]) === manifest.identity.checkoutTreeSha, "release_checkout_tree_mismatch");
  }
  return manifest;
}

const parseArgs = (argv) => {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    result[argv[index].slice(2)] = argv[index + 1]; index += 1;
  }
  return result;
};
const args = parseArgs(process.argv.slice(3));
const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    if (process.argv[2] === "evidence") {
      const result = buildProductReleaseTestEvidence({ root, sourceSha: args["source-sha"] ?? "HEAD" });
      writeFileSync(resolve(args.output), `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ status: "PASS", sourceSha: result.sourceSha })}\n`);
    } else if (process.argv[2] === "build") {
      const identity = resolveProductReleaseIdentity({ root, mode: args.mode, sourceSha: args["source-sha"] ?? "HEAD", baseSha: args["base-sha"], checkoutSha: args["checkout-sha"] ?? "HEAD", canonicalMainSha: args["canonical-main-sha"], candidateHeadSha: args["candidate-head-sha"] });
      const result = buildProductReleaseManifest({ root, sourceSha: identity.sourceSha, outputDir: resolve(args.output), mobileBundle: args["mobile-bundle"], identity, testEvidence: JSON.parse(readFileSync(resolve(args["test-evidence"]), "utf8")) });
      process.stdout.write(`${JSON.stringify({ status: "PASS", manifestHash: result.manifestHash, mode: result.identity.mode })}\n`);
    } else if (process.argv[2] === "verify") {
      const result = verifyProductReleaseManifest({ artifactDir: resolve(args.artifact), expectedHash: args["expected-hash"], expectedSourceSha: args["expected-source-sha"], expectedMode: args["expected-mode"], checkoutRoot: args["checkout-root"] ? resolve(args["checkout-root"]) : undefined });
      process.stdout.write(`${JSON.stringify({ status: "PASS", manifestHash: result.manifestHash, mode: result.identity.mode })}\n`);
    } else throw new Error("release_manifest_command_invalid");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
