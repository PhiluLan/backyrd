import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { contentHash } from "../src/canonical-json.mjs";
import { generateCandidateEvidence } from "../src/recertification-generate.mjs";
import { verifyCandidateEvidence } from "../src/recertification-verify.mjs";
import { applyCandidateEvidence } from "../src/recertification-apply.mjs";
import { validateActiveAdditiveRecertification } from "../src/recertification-consumer.mjs";
import { validateEngineRecertification } from "../src/d2-freeze.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = async (root, path, value) => { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
const mutateJson = async (root, path, mutate) => { const value = JSON.parse(await readFile(join(root, path), "utf8")); mutate(value); await put(root, path, value); };
const V45_PATH = "decision-lab/config/decision-v13-production-recertification-v45.json";

async function fixture(change = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), "backyrd-recert-v1-")); git(root, ["init", "-q"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  const protectedPaths = ["supabase/functions/decision-v13/index.ts", "supabase/functions/decision-v13/index.deploy.ts", "packages/decision-orchestrator-runtime/src/ranking.mjs"];
  await put(root, protectedPaths[0], "export const decision = 'v13';\n"); await put(root, protectedPaths[1], 'import "./live-index.ts";\n'); await put(root, protectedPaths[2], "export const rank = true;\n");
  const d2 = { freezeManifestHash: "d2-freeze", engineRecertificationVersion: "decision-v13-production-recertification-v44", engineRecertificationHash: "d2-recert" };
  const d22 = { freezeManifestHash: "d22-freeze", parentFreezeManifestHash: "d2-freeze" }; const d3 = { parentFreezeManifestHash: "d2-freeze", personalizationTreatmentFreezeHash: "d22-freeze" };
  await put(root, "decision-lab/config/decision-quality-v1.1.freeze.json", d2); await put(root, "decision-lab/config/personalization-treatment-v1.freeze.json", d22); await put(root, "decision-lab/config/d3.1-diagnostic-coverage-v1.json", d3);
  await put(root, "docs/decision/evidence.md", "base evidence\n"); await put(root, "mobile/app/home.tsx", "export default 'base';\n"); await put(root, "docs/decision/base-certification.md", "certified\n");
  const prebase = commit(root, "prebase");
  const { createHash } = await import("node:crypto"); const h = createHash("sha256"); for (const path of [...protectedPaths].sort()) h.update(await readFile(join(root, path))); const protectedHash = h.digest("hex");
  const entrypointPath = "supabase/functions/decision-v13/index.deploy.ts"; const decisionPath = "supabase/functions/decision-v13/index.ts";
  const engineHash = createHash("sha256").update(await readFile(join(root, entrypointPath))).digest("hex");
  const decisionHash = createHash("sha256").update(await readFile(join(root, decisionPath))).digest("hex");
  const production = { supabaseProjectRef: "project", functionSlug: "decision-v13", activeVersion: 124, verifyJwt: true, bundleHash: "bundle", entrypointPath, entrypointSha256: engineHash, sourceIdentity: "identity", deploymentSourceSetHash: "sources", deploymentConfigHash: "config", eszipBodySha256: "eszip", eszipEvidenceHash: "evidence", deploymentControlMainSha: prebase };
  const certificationHash = createHash("sha256").update(await readFile(join(root, "docs/decision/base-certification.md"))).digest("hex");
  const baseManifest = { version: "decision-v13-production-recertification-v44", status: "AUTHORIZED", authorization: { authorizedEngineSourceHash: decisionHash }, production, protectedSemanticSourceSet: { paths: protectedPaths, hash: protectedHash }, certificationEvidenceSet: { paths: ["docs/decision/base-certification.md"], hash: certificationHash } };
  await put(root, "decision-lab/config/decision-v13-production-recertification-v44.json", baseManifest); const base = commit(root, "valid v44 base");
  await change(root); const candidate = commit(root, "candidate");
  const artifact = await generateCandidateEvidence({ root, baseVersion: "v44", baseMainSha: base, candidateSha: candidate, evidencePaths: ["docs/decision/evidence.md"], requestedScope: "presentation" });
  return { root, base, candidate, artifact };
}

test("v44 to synthetic v45 presentation-only passes with a changed Product tree", async () => {
  const x = await fixture((root) => put(root, "mobile/app/home.tsx", "export default 'candidate';\n"));
  const receipt = await verifyCandidateEvidence({ root: x.root, artifact: x.artifact, trustedBaseSha: x.base }); assert.equal(receipt.valid, true, receipt.reasons.join(",")); assert.notEqual(x.artifact.candidateProductTree, git(x.root, ["rev-parse", `${x.base}^{tree}`])); assert.equal(x.artifact.scopeInventory["mobile/app/home.tsx"], "presentation");
});

for (const [name, mutate, reason] of [
  ["Decision Engine secretly changed", (r) => put(r, "supabase/functions/decision-v13/index.ts", "drift\n"), "DECISION_SOURCE_DRIFT"],
  ["Production identity changed without binding", (r) => put(r, "supabase/functions/decision-v13/index.deploy.ts", "drift\n"), "PRODUCTION_ENTRYPOINT_DRIFT"],
  ["D2/D3 parent freeze is wrong", (r) => put(r, "decision-lab/config/personalization-treatment-v1.freeze.json", { freezeManifestHash: "wrong", parentFreezeManifestHash: "d2-freeze" }), "D2_D3_PARENT_FREEZE_DRIFT"],
  ["evidence file manipulated", (r) => put(r, "docs/decision/evidence.md", "manipulated\n"), null],
  ["scope outside allowlist", (r) => put(r, "README.md", "outside\n"), "SCOPE_OUTSIDE_ALLOWLIST:README.md"]
]) test(name + " fails closed", async () => {
  const x = await fixture(mutate); if (name === "evidence file manipulated") x.artifact.evidence.derivedHash = "0".repeat(64);
  const receipt = await verifyCandidateEvidence({ root: x.root, artifact: x.artifact, trustedBaseSha: x.base }); assert.equal(receipt.valid, false); if (reason) assert.ok(receipt.reasons.includes(reason), receipt.reasons.join(","));
});

test("post-generation mutation and stale base fail", async () => {
  const x = await fixture((root) => put(root, "mobile/app/home.tsx", "changed\n")); const tampered = structuredClone(x.artifact); tampered.requestedScope = "evidence-only";
  assert.ok((await verifyCandidateEvidence({ root: x.root, artifact: tampered, trustedBaseSha: x.base })).reasons.includes("ARTIFACT_HASH_MISMATCH"));
  assert.ok((await verifyCandidateEvidence({ root: x.root, artifact: x.artifact, trustedBaseSha: x.candidate })).reasons.includes("STALE_BASE"));
});

test("apply requires independent receipt and replay is idempotent", async () => {
  const x = await fixture((root) => put(root, "mobile/app/home.tsx", "changed\n")); const receipt = await verifyCandidateEvidence({ root: x.root, artifact: x.artifact, trustedBaseSha: x.base });
  const first = await applyCandidateEvidence({ root: x.root, artifact: x.artifact, receipt, trustedBaseSha: x.base }); const second = await applyCandidateEvidence({ root: x.root, artifact: x.artifact, receipt, trustedBaseSha: x.base }); assert.equal(first.recertificationHash, second.recertificationHash);
  await assert.rejects(() => applyCandidateEvidence({ root: x.root, artifact: x.artifact, receipt: { ...receipt, verificationHash: "tampered" }, trustedBaseSha: x.base }), /VERIFICATION_REQUIRED/);
});

test("an applied additive record is a valid parent for the next version", async () => {
  const x = await fixture((root) => put(root, "mobile/app/home.tsx", "v45\n")); const receipt = await verifyCandidateEvidence({ root: x.root, artifact: x.artifact, trustedBaseSha: x.base });
  await applyCandidateEvidence({ root: x.root, artifact: x.artifact, receipt, trustedBaseSha: x.base }); const v45Base = commit(x.root, "apply v45");
  await put(x.root, "web/app/home.tsx", "v46\n"); const v46Candidate = commit(x.root, "v46 candidate");
  const v46 = await generateCandidateEvidence({ root: x.root, baseVersion: "v45", baseMainSha: v45Base, candidateSha: v46Candidate, evidencePaths: ["docs/decision/evidence.md"], requestedScope: "presentation" });
  const v46Receipt = await verifyCandidateEvidence({ root: x.root, artifact: v46, trustedBaseSha: v45Base }); assert.equal(v46Receipt.valid, true, v46Receipt.reasons.join(",")); assert.match(v46.version, /v46$/);
  await applyCandidateEvidence({ root: x.root, artifact: v46, receipt: v46Receipt, trustedBaseSha: v45Base }); commit(x.root, "apply v46"); const consumed = await validateActiveAdditiveRecertification({ root: x.root, trustedBaseSha: v45Base }); assert.equal(consumed.valid, true, consumed.reasons.join(",")); assert.equal(consumed.chainLength, 2);
});

async function appliedFixture() {
  const x = await fixture((root) => put(root, "mobile/app/home.tsx", "consumed v45\n")); const receipt = await verifyCandidateEvidence({ root: x.root, artifact: x.artifact, trustedBaseSha: x.base }); await applyCandidateEvidence({ root: x.root, artifact: x.artifact, receipt, trustedBaseSha: x.base }); commit(x.root, "apply consumed v45"); return { ...x, receipt };
}

test("consumer accepts valid synthetic v44 to v45 presentation chain", async () => {
  const x = await appliedFixture(); const result = await validateActiveAdditiveRecertification({ root: x.root, trustedBaseSha: x.base }); assert.equal(result.valid, true, result.reasons.join(",")); assert.equal(result.activeVersion, "decision-v13-production-recertification-v45");
});

for (const [name, mutate, expectedReason] of [
  ["missing receipt", (record) => { delete record.verificationReceipt; }, "VERIFICATION_RECEIPT_MISSING"],
  ["wrong receipt", (record) => { record.verificationReceipt.verificationHash = "0".repeat(64); }, "VERIFICATION_RECEIPT_INVALID"],
  ["artifact changed after verify", (record) => { record.candidateArtifact.requestedScope = "evidence-only"; }, "VERIFICATION_RECEIPT_INVALID"],
  ["wrong parent hash", (record) => { record.parent.manifestHash = "0".repeat(64); record.candidateArtifact.parent.manifestHash = "0".repeat(64); }, "PARENT_IDENTITY_MISMATCH"],
  ["skipped version", (record) => { record.version = "decision-v13-production-recertification-v47"; }, "PARENT_VERSION_NOT_CONTIGUOUS"],
  ["Decision source drift claim", (record) => { record.candidateArtifact.protectedSourceSet.candidateHash = "0".repeat(64); }, "VERIFICATION_RECEIPT_INVALID"],
  ["Production identity drift claim", (record) => { record.candidateArtifact.production.identity.activeVersion = 125; }, "VERIFICATION_RECEIPT_INVALID"],
  ["D3 parent freeze drift claim", (record) => { record.candidateArtifact.d2D3Parents.candidate.d3ParentFreezeManifestHash = "wrong"; }, "VERIFICATION_RECEIPT_INVALID"],
  ["stale candidate", (record) => { record.candidateArtifact.candidateSha = "0".repeat(40); record.candidateSha = "0".repeat(40); }, "STALE_CANDIDATE"]
]) test(`consumer rejects ${name}`, async () => {
  const x = await appliedFixture(); await mutateJson(x.root, V45_PATH, mutate); const result = await validateActiveAdditiveRecertification({ root: x.root, trustedBaseSha: x.base }); assert.equal(result.valid, false); assert.ok(result.reasons.includes(expectedReason), result.reasons.join(","));
});

test("consumer rejects competing fork entries", async () => {
  const x = await appliedFixture(); await mutateJson(x.root, "docs/operations/DECISION_RECERTIFICATION_LINEAGE_V1.json", (lineage) => lineage.entries.push({ ...lineage.entries[0], recertificationHash: "fork" })); const result = await validateActiveAdditiveRecertification({ root: x.root, trustedBaseSha: x.base }); assert.equal(result.valid, false); assert.ok(result.reasons.includes("FORK_CHAIN_DETECTED"), result.reasons.join(","));
});

test("D2 and D3 consume a valid additive presentation chain while legacy v44 evidence drifts", async () => {
  const source = new URL("../..", import.meta.url).pathname; const root = await mkdtemp(join(tmpdir(), "backyrd-recert-consumer-integration-"));
  execFileSync("git", ["clone", "--quiet", "--shared", source, root]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]); if (process.env.CI_BASE_SHA) git(root, ["checkout", "--quiet", "--detach", process.env.CI_BASE_SHA]); const base = git(root, ["rev-parse", "HEAD"]);
  const presentationPath = "mobile/app/(tabs)/feed.tsx"; await writeFile(join(root, presentationPath), `${await readFile(join(root, presentationPath), "utf8")}\n// synthetic presentation-only recertification fixture\n`); const candidate = commit(root, "synthetic presentation candidate");
  const activeFreeze = JSON.parse(await readFile(join(root, "decision-lab/config/additive-recertification-v1.freeze.json"), "utf8"));
  const baseVersion = activeFreeze.currentVersion.match(/v\d+$/)?.[0]; assert.ok(baseVersion, "active additive base version must be explicit");
  const artifact = await generateCandidateEvidence({ root, baseVersion, baseMainSha: base, candidateSha: candidate, evidencePaths: [presentationPath], requestedScope: "presentation" }); const receipt = await verifyCandidateEvidence({ root, artifact, trustedBaseSha: base }); assert.equal(receipt.valid, true, receipt.reasons.join(",")); await applyCandidateEvidence({ root, artifact, receipt, trustedBaseSha: base }); commit(root, "apply synthetic additive recertification");
  const d2 = JSON.parse(execFileSync(process.execPath, ["decision-lab/src/d2-cli.mjs", "validate-freeze", "--trusted-base", base], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })); assert.equal(d2.freezeValidation.legacyV44Valid, false); assert.equal(d2.freezeValidation.additiveContinuityValid, true); assert.equal(d2.frameworkValidity, "PASS");
  const d3 = JSON.parse(execFileSync(process.execPath, ["decision-lab/src/d3.1-readiness.mjs"], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, env: { ...process.env, CI_BASE_SHA: base } })); assert.equal(d3.legacyParentFreezeValid, false); assert.equal(d3.additiveRecertification.valid, true, d3.additiveRecertification.reasons.join(",")); assert.equal(d3.status, "PASS");
});

test("current repository v44 or its valid additive successor remains valid", async () => {
  const args = ["decision-lab/src/d2-cli.mjs", "validate-freeze"];
  if (process.env.CI_BASE_SHA) args.push("--trusted-base", process.env.CI_BASE_SHA);
  const result = JSON.parse(execFileSync(process.execPath, args, { cwd: new URL("../..", import.meta.url), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
  if (result.additiveRecertification.mode === "ADDITIVE_CHAIN") {
    const legacy = await validateEngineRecertification();
    assert.equal(legacy.valid, false);
    assert.deepEqual(legacy.reasons, ["CERTIFICATION_EVIDENCE_SET_MISMATCH"]);
    assert.equal(result.freezeValidation.legacyV44Valid, false);
    assert.equal(result.freezeValidation.additiveContinuityValid, true);
  }
  assert.equal(result.freezeValidation.valid, true, result.freezeValidation.reasons.join(","));
});
