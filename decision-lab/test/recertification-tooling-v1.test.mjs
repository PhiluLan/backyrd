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

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = async (root, path, value) => { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };

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
});

test("current repository v44 remains valid", async () => {
  const result = JSON.parse(execFileSync(process.execPath, ["decision-lab/src/d2-cli.mjs", "validate-freeze"], { cwd: new URL("../..", import.meta.url), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })); assert.equal(result.freezeValidation.valid, true, result.freezeValidation.reasons.join(","));
});
