import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { REQUIRED_EVALUATIONS, validateDecisionChange } from "./validate-decision-change.mjs";

const git = (root, args, buffer = false) => execFileSync("git", args, { cwd: root, encoding: buffer ? undefined : "utf8" }).toString().trim();
const put = (root, path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const commit = (root, message) => { git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", message]); return git(root, ["rev-parse", "HEAD"]); };
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-decision-release-"));
  git(root, ["init", "--quiet", "-b", "main"]); git(root, ["config", "user.email", "fixture@example.invalid"]); git(root, ["config", "user.name", "Fixture"]);
  const source = "supabase/functions/decision-v13/index.ts";
  const anchor = "decision-lab/config/anchor.json";
  put(root, source, "export const ranking = 1;\n");
  put(root, anchor, JSON.stringify({ protectedSemanticSourceSet: { paths: [source] } }));
  const base = commit(root, "base");
  return { root, base, source, anchor };
};

test("unrelated work requires no Decision release record", () => {
  const { root, base, anchor } = fixture();
  put(root, "mobile/components/Card.tsx", "export const Card = true;\n");
  const head = commit(root, "presentation");
  const result = validateDecisionChange({ root, baseSha: base, headSha: head, trustAnchorPath: anchor });
  assert.equal(result.decisionSemanticsChanged, false);
});

test("genuine semantic change requires an exact machine-verifiable record", () => {
  const { root, base, source, anchor } = fixture();
  put(root, source, "export const ranking = 2;\n");
  const semanticHead = commit(root, "semantic source");
  assert.throws(() => validateDecisionChange({ root, baseSha: base, headSha: semanticHead, trustAnchorPath: anchor }), /exactly_one_new/);
  const hash = createHash("sha256").update(execFileSync("git", ["show", `${semanticHead}:${source}`], { cwd: root })).digest("hex");
  put(root, "decision-lab/releases/ranking-v2.json", `${JSON.stringify({
    schemaVersion: "backyrd-decision-release-v1",
    id: "ranking-v2",
    baselineSha: base,
    decisionSemanticsChanged: true,
    changedProtectedPaths: [source],
    protectedSourceHash: hash,
    requiredEvaluations: REQUIRED_EVALUATIONS,
    authorizationReference: "work-order-123",
  }, null, 2)}\n`);
  const head = commit(root, "release identity");
  const result = validateDecisionChange({ root, baseSha: base, headSha: head, trustAnchorPath: anchor });
  assert.equal(result.decisionSemanticsChanged, true);
  assert.equal(result.releaseRecord, "decision-lab/releases/ranking-v2.json");
});

test("manipulated semantic evidence fails closed", () => {
  const { root, base, source, anchor } = fixture();
  put(root, source, "export const ranking = 2;\n");
  put(root, "decision-lab/releases/ranking-v2.json", `${JSON.stringify({
    schemaVersion: "backyrd-decision-release-v1",
    id: "ranking-v2",
    baselineSha: base,
    decisionSemanticsChanged: true,
    changedProtectedPaths: [source],
    protectedSourceHash: "0".repeat(64),
    requiredEvaluations: REQUIRED_EVALUATIONS,
    authorizationReference: "work-order-123",
  })}\n`);
  const head = commit(root, "tampered release");
  assert.throws(() => validateDecisionChange({ root, baseSha: base, headSha: head, trustAnchorPath: anchor }), /source_hash_mismatch/);
});
