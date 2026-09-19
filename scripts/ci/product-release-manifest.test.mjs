import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildProductReleaseManifest,
  buildProductReleaseTestEvidence,
  resolveProductReleaseIdentity,
  verifyProductReleaseIdentity,
  verifyProductReleaseManifest,
} from "./product-release-manifest.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const pendingMigrations = Array.from({ length: 13 }, (_, index) => ({ path: `supabase/migrations/202609190000${String(index).padStart(2, "0")}_fixture.sql`, sha256: hash(`migration-${index}`) }));
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-release-manifest-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  put(root, "supabase/config.toml", "project_id=\"fixture\"\n[functions.decision-v13]\nenabled = true\nverify_jwt = true\nentrypoint=\"./functions/decision-v13/index.deploy.ts\"\n");
  put(root, "supabase/functions/decision-v13/index.deploy.ts", "import './vnext-only.ts';\n");
  put(root, "supabase/functions/decision-v13/vnext-only.ts", "export default true;\n");
  put(root, "supabase/migrations/20260101000000_base.sql", "select 1;\n");
  put(root, "packages/world-knowledge-core/package.json", "{}\n"); put(root, "packages/world-knowledge-core/src/port.ts", "export const world = true;\n");
  put(root, "packages/user-intelligence-vnext-core/package.json", "{}\n"); put(root, "packages/user-intelligence-vnext-core/src/product-decision-learning.ts", "export const user = true;\n");
  put(root, "packages/decision-vnext-core/package.json", "{}\n"); put(root, "packages/decision-vnext-core/src/product-decision.ts", "export const decision = true;\n");
  put(root, "mobile/packages/product-decision-contract/index.mjs", "export const contract = true;\n");
  put(root, "mobile/lib/decision/productDecision.ts", "export const client = true;\n");
  put(root, "mobile/app/(tabs)/decision.tsx", "export default true;\n");
  put(root, "web/lib/decision-web-api.ts", "export const web = true;\n");
  put(root, "docs/architecture/PRODUCT_V1_ACTIVE_SURFACE.md", "# Product v1\n");
  put(root, "delivery/product-authority-v1.json", `${JSON.stringify({ status: "ACTIVE", productRoute: "DECISION_VNEXT_SINGLE_ROUTE", legacyDecisionAuthority: false, runtimeScope: { activeTransport: "decision-v13", quarantinedTransports: [] }, founderRecoveryRiskAcceptance: { contractVersion: "backyrd.product-v1-founder-recovery-risk-acceptance@1.0", decision: "ACCEPT_UNTESTED_DATABASE_RECOVERY_RISK", canonicalStartingMainSha: "a58d829a6c5f231e48f3582bcd69adf9245c0589", projectRef: "hjgcrrzfjchzqoegcywn", pendingMigrationCount: 13, pendingMigrationSetSha256: hash(JSON.stringify(pendingMigrations)), restoreDrillStatus: "NOT_PERFORMED_BY_FOUNDER_DECISION", guaranteedDatabaseRollback: false, productionDataCopyAuthorized: false } })}\n`);
  put(root, "mobile-export/_expo/static/js/ios/entry-abc123.hbc", "synthetic-ios-bundle\n");
  put(root, "mobile-export/metadata.json", `${JSON.stringify({ version: 0, bundler: "metro", fileMetadata: { ios: { bundle: "_expo/static/js/ios/entry-abc123.hbc", assets: [] } } })}\n`);
  const base = commit(root, "base");
  put(root, "packages/decision-vnext-core/src/product-decision.ts", "export const decision = 'candidate';\n");
  const head = commit(root, "candidate");
  return { root, base, head };
};
const plan = (baseSha, headSha) => ({
  version: "backyrd-supabase-production-deployment-plan-v1", baseSha, canonicalMainSha: headSha,
  projectRef: "hjgcrrzfjchzqoegcywn", functions: [], deployFunctions: [], migrations: [], pendingMigrations, authConfig: null,
  runtimeDeploymentRequired: false, planHash: "a".repeat(64),
});

function buildFixture() {
  const { root, base, head } = fixture();
  const output = join(root, "release"); mkdirSync(output);
  const identity = resolveProductReleaseIdentity({ root, mode: "PR_CANDIDATE", sourceSha: head, baseSha: base, checkoutSha: head, canonicalMainSha: base });
  const testEvidence = buildProductReleaseTestEvidence({ root, sourceSha: head });
  const manifest = buildProductReleaseManifest({ root, sourceSha: head, outputDir: output, mobileBundle: join(root, "mobile-export"), identity, testEvidence, productionPlan: plan(base, head) });
  return { root, base, head, output, manifest };
}

test("a release manifest binds source, tree, domain artifacts, evidence and every deployable byte", () => {
  const { root, head, output, manifest } = buildFixture();
  assert.equal(verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: head, expectedMode: "PR_CANDIDATE", checkoutRoot: root }).manifestHash, manifest.manifestHash);
  assert.deepEqual(manifest.components.productRuntime.map(({ path }) => path), ["supabase/functions/decision-v13/index.deploy.ts", "supabase/functions/decision-v13/vnext-only.ts"]);
  for (const name of ["worldArtifact", "userArtifact", "decisionArtifact", "productPolicy"]) assert.match(manifest.componentIdentities[name].artifactHash, /^[0-9a-f]{64}$/);
  assert.equal(manifest.testEvidence.results["product-release-e2e"], "PASS");
  assert.equal(manifest.productionPlan.executionAuthorized, false);
  put(output, "bundle/supabase/functions/decision-v13/unsealed.js", "export const unsealed = true;\n");
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: head }), /release_unsealed_artifact_file/);
  unlinkSync(join(output, "bundle/supabase/functions/decision-v13/unsealed.js"));
  put(output, "bundle/supabase/config.toml", "tampered\n");
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: head }), /release_artifact_file_mismatch/);
});

test("a Web export cannot be sealed as the iPhone OTA artifact", () => {
  const { root, base, head } = fixture();
  put(root, "mobile-export/index.html", "web-only\n");
  const identity = resolveProductReleaseIdentity({ root, mode: "PR_CANDIDATE", sourceSha: head, baseSha: base, checkoutSha: head, canonicalMainSha: base });
  const testEvidence = buildProductReleaseTestEvidence({ root, sourceSha: head });
  assert.throws(() => buildProductReleaseManifest({ root, sourceSha: head, outputDir: join(root, "release"), mobileBundle: join(root, "mobile-export"), identity, testEvidence, productionPlan: plan(base, head) }), /release_ios_ota_artifact_required/);
});

test("the Supabase deploy package seals generated JS and rejects missing build output", () => {
  const { root, base } = fixture();
  put(root, "supabase/functions/decision-v13/deno.json", JSON.stringify({ imports: {} }));
  const head = commit(root, "add deploy configuration");
  const identity = resolveProductReleaseIdentity({ root, mode: "PR_CANDIDATE", sourceSha: head, baseSha: base, checkoutSha: head, canonicalMainSha: base });
  const testEvidence = buildProductReleaseTestEvidence({ root, sourceSha: head });
  const output = join(root, "release");
  assert.throws(() => buildProductReleaseManifest({ root, sourceSha: head, outputDir: output, mobileBundle: join(root, "mobile-export"), identity, testEvidence, productionPlan: plan(base, head) }), /ENOENT|release_edge_build_missing/);
  for (const path of [
    "packages/decision-vnext-core/dist/product-decision-production-adapter.js",
    "packages/decision-vnext-core/dist/product-decision.js",
    "packages/user-intelligence-vnext-core/dist/index.js",
    "packages/world-knowledge-core/dist/index.js",
  ]) put(root, path, "export const sealed = true;\n");
  const manifest = buildProductReleaseManifest({ root, sourceSha: head, outputDir: output, mobileBundle: join(root, "mobile-export"), identity, testEvidence, productionPlan: plan(base, head) });
  assert.equal(verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: head, checkoutRoot: root }).manifestHash, manifest.manifestHash);
  put(output, "bundle/packages/decision-vnext-core/dist/product-decision.js", "export const sealed = false;\n");
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: head }), /release_artifact_file_mismatch/);
});

test("tree, artifact, evidence and mode manipulation fail closed", () => {
  const { head, output, manifest } = buildFixture();
  const original = readFileSync(join(output, "release-manifest.json"), "utf8");
  const attacks = [
    (value) => { value.identity.sourceTreeSha = "0".repeat(40); },
    (value) => { value.componentIdentities.decisionArtifact.artifactHash = "0".repeat(64); },
    (value) => { value.testEvidence.results["product-release-e2e"] = "SKIP"; },
    (value) => { value.identity.mode = "UNKNOWN"; },
  ];
  for (const attack of attacks) {
    const value = JSON.parse(original); attack(value); writeFileSync(join(output, "release-manifest.json"), `${JSON.stringify(value, null, 2)}\n`);
    assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: head }), /release_manifest_hash_mismatch/);
  }
});

test("PR and post-merge identities enforce canonical parents and candidate tree parity", () => {
  const { root, base, head } = fixture();
  const pr = resolveProductReleaseIdentity({ root, mode: "PR_CANDIDATE", sourceSha: head, baseSha: base, checkoutSha: head, canonicalMainSha: base });
  assert.equal(verifyProductReleaseIdentity(pr), true);
  git(root, ["switch", "--quiet", "-c", "integration", base]);
  git(root, ["merge", "--quiet", "--no-ff", head, "-m", "merge candidate"]);
  const merge = git(root, ["rev-parse", "HEAD"]);
  const main = resolveProductReleaseIdentity({ root, mode: "POST_MERGE_MAIN", sourceSha: merge, baseSha: base, checkoutSha: merge, canonicalMainSha: merge, candidateHeadSha: head });
  assert.equal(verifyProductReleaseIdentity(main), true);
  assert.throws(() => verifyProductReleaseIdentity({ ...main, parents: [head, base] }), /main_parents_mismatch/);
  assert.throws(() => verifyProductReleaseIdentity({ ...main, candidateTreeSha: "0".repeat(40) }), /candidate_tree_mismatch/);
  assert.throws(() => verifyProductReleaseIdentity({ ...pr, canonicalAncestryVerified: false }), /ancestry_invalid/);
});

test("a different release identity cannot replay the artifact", () => {
  const { head, output, manifest } = buildFixture();
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: "0".repeat(64), expectedSourceSha: head }), /release_manifest_hash_mismatch/);
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: "0".repeat(40) }), /release_manifest_source_mismatch/);
  assert.throws(() => verifyProductReleaseManifest({ artifactDir: output, expectedHash: manifest.manifestHash, expectedSourceSha: head, expectedMode: "POST_MERGE_MAIN" }), /release_manifest_mode_mismatch/);
});
