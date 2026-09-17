import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { createInternalAllowlistEnvelope, loadWeek3Documents, rehearseInternalProductLike, resolveWeek3Controls, sha256, validateInternalAllowlistEnvelope, validateWeek3Documents } from "./week3-internal-prodlike.mjs";
import { resolveWeek3IdentityMode, verifySecurityDefinerSources, verifyWeek3IdentityMode } from "./week3-internal-prodlike-preflight.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const fixture = JSON.parse(readFileSync(resolve(ROOT, "delivery/integration/fixtures/week3-internal-prodlike-synthetic.json"), "utf8"));
const releaseHash = sha256("week3-test-release"); const requestHash = sha256(fixture.requestBody);
const envelope = () => createInternalAllowlistEnvelope({ ...fixture, releaseHash, requestHash });
const authority = () => ({ status: "SYNTHETIC_TEST_AUTHORITY", subjectPseudonym: fixture.subjectPseudonym, purpose: fixture.purpose, environment: fixture.environment, releaseHash });
const on = { environment: "PROD_LIKE_TEST", internalTestOn: true, globalKillSwitch: "DISENGAGED", WORLD_KILL_SWITCH: "DISENGAGED", USER_KILL_SWITCH: "DISENGAGED", DECISION_KILL_SWITCH: "DISENGAGED" };

test("Week 3 documents remain closed and internally consistent", () => assert.equal(validateWeek3Documents(loadWeek3Documents(ROOT)).boundDomainCandidates, 3));
test("missing and unknown configuration are OFF", () => { assert.equal(resolveWeek3Controls().enabled, false); assert.equal(resolveWeek3Controls({ surprise: true }).reason, "UNKNOWN_CONFIGURATION_DENIED"); });
for (const key of ["globalKillSwitch", "WORLD_KILL_SWITCH", "USER_KILL_SWITCH", "DECISION_KILL_SWITCH"]) test(`${key} independently aborts activation`, () => assert.equal(resolveWeek3Controls({ ...on, [key]: "ENGAGED" }).enabled, false));
test("valid synthetic allowlist envelope is accepted", () => assert.equal(validateInternalAllowlistEnvelope(envelope(), authority(), fixture.now), true));
test("NOT_CONFIGURED authority denies", () => assert.throws(() => validateInternalAllowlistEnvelope(envelope(), { ...authority(), status: "NOT_CONFIGURED" }, fixture.now), /not_configured/));
test("expired authority denies", () => assert.throws(() => validateInternalAllowlistEnvelope(envelope(), authority(), "2026-09-17T14:00:00.000Z"), /expired_or_not_current/));
for (const [name, change] of [["purpose", { purpose: "WRONG" }], ["environment", { environment: "LOCAL_TEST" }], ["release", { releaseHash: sha256("wrong") }]]) test(`${name} mismatch denies`, () => assert.throws(() => validateInternalAllowlistEnvelope(envelope(), { ...authority(), ...change }, fixture.now), /mismatch/));
test("request tamper denies", () => { const value = { ...envelope(), requestHash: sha256("tampered") }; assert.throws(() => validateInternalAllowlistEnvelope(value, authority(), fixture.now), /tampered/); });
test("unknown envelope field denies", () => assert.throws(() => validateInternalAllowlistEnvelope({ ...envelope(), extra: true }, authority(), fixture.now), /unknown_or_missing/));
test("OFF to TEST-ON to Emergency-OFF preserves zero side effects", () => { const result = rehearseInternalProductLike({ fixture, configuration: on, envelope: envelope(), authority: authority(), emergencyAfterWorldRead: true }); assert.equal(result.aborted, true); assert.deepEqual(result.phases.emergencyOff, { worldReads: 0, userProjections: 0, decisionEvaluations: 0, writes: 0, networkCalls: 0, productOutputs: 0 }); assert.equal(result.productOutput, null); });
test("repeated OFF is idempotent", () => assert.deepEqual(rehearseInternalProductLike({ fixture, configuration: {} }), rehearseInternalProductLike({ fixture, configuration: {} })));
test("reports are byte-identical twice", () => { const first = rehearseInternalProductLike({ fixture, configuration: on, envelope: envelope(), authority: authority() }); const second = rehearseInternalProductLike({ fixture, configuration: on, envelope: envelope(), authority: authority() }); assert.equal(JSON.stringify(first), JSON.stringify(second)); });
test("unsafe SECURITY DEFINER search path fails", () => assert.throws(() => verifySecurityDefinerSources([{ path: "bad.sql", source: "create function private.bad() returns void language sql security definer as $$ select 1 $$; revoke execute on function private.bad() from public;" }]), /search_path_unsafe/));
test("SECURITY DEFINER without revoke fails", () => assert.throws(() => verifySecurityDefinerSources([{ path: "bad.sql", source: "create function private.bad() returns void language sql security definer set search_path = '' as $$ select 1 $$;" }]), /execute_not_revoked/));
test("safe SECURITY DEFINER boundary passes", () => assert.deepEqual(verifySecurityDefinerSources([{ path: "safe.sql", source: "create function private.safe() returns void language sql security definer set search_path = '' as $$ select 1 $$; revoke execute on function private.safe() from public;" }]), { unsafeSecurityDefinerCount: 0 }));

const identityTuple = (overrides = {}) => ({
  mode: "PR_CANDIDATE",
  canonicalBaseSha: "1".repeat(40), baseSha: "1".repeat(40), headSha: "2".repeat(40), checkoutSha: "2".repeat(40), canonicalMainSha: "1".repeat(40),
  headTreeSha: "3".repeat(40), checkoutTreeSha: "3".repeat(40), canonicalMainTreeSha: "4".repeat(40), candidateHeadSha: "2".repeat(40), candidateTreeSha: "3".repeat(40), functionalHeadSha: "5".repeat(40),
  mergeParents: [], sealCommitCount: 1, sealPaths: ["delivery/integration/week3-rehearsal-evidence.json"], ...overrides,
});

test("Week 3 identity mode is mandatory and closed", () => {
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ mode: undefined })), /mode_invalid:missing/);
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ mode: "AUTO" })), /mode_invalid:AUTO/);
});
test("GitHub selects the Week 3 identity mode explicitly from the event", () => {
  const workflow = readFileSync(resolve(ROOT, ".github/workflows/risk-gate.yml"), "utf8");
  assert.match(workflow, /pull_request\) WEEK3_MODE=PR_CANDIDATE/);
  assert.match(workflow, /push\)[\s\S]*WEEK3_MODE=POST_MERGE_MAIN/);
  assert.match(workflow, /--mode "\$WEEK3_MODE"/);
  assert.match(workflow, /Unsupported Week-3 event/);
});
test("PR and post-merge tuples cannot be replayed across modes", () => {
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ mode: "POST_MERGE_MAIN" })), /post_merge_head_main_mismatch/);
  const post = identityTuple({ mode: "POST_MERGE_MAIN", headSha: "6".repeat(40), checkoutSha: "6".repeat(40), canonicalMainSha: "6".repeat(40), headTreeSha: "3".repeat(40), checkoutTreeSha: "3".repeat(40), canonicalMainTreeSha: "3".repeat(40), mergeParents: ["1".repeat(40), "2".repeat(40)] });
  assert.deepEqual(verifyWeek3IdentityMode(post).mergeParents, post.mergeParents);
  assert.throws(() => verifyWeek3IdentityMode({ ...post, mode: "PR_CANDIDATE" }), /pr_main_or_base_drift/);
});
test("wrong base, head, main, tree, artifact and unrelated descendant fail closed", () => {
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ baseSha: "9".repeat(40) })), /base_mismatch/);
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ headSha: "9".repeat(40) })), /candidate_identity_mismatch/);
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ canonicalMainSha: "9".repeat(40) })), /main_or_base_drift/);
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ checkoutTreeSha: "9".repeat(40) })), /checkout_identity_mismatch/);
  assert.throws(() => verifyWeek3IdentityMode(identityTuple({ sealCommitCount: 2 })), /candidate_scope_invalid/);
  const documents = structuredClone(loadWeek3Documents(ROOT)); documents.sharedArtifact.artifactHash = "0".repeat(64);
  assert.throws(() => validateWeek3Documents(documents), /shared_artifact_evidence_mismatch/);
  const domainDrift = structuredClone(loadWeek3Documents(ROOT)); domainDrift.manifest.domainCandidates[0].headSha = "8".repeat(40);
  assert.throws(() => validateWeek3Documents(domainDrift), /candidate_lineage_invalid:WORLD/);
  const mergeDrift = structuredClone(loadWeek3Documents(ROOT)); mergeDrift.manifest.domainCandidates[1].mergeParents[0] = "7".repeat(40);
  assert.throws(() => validateWeek3Documents(mergeDrift), /candidate_lineage_invalid:USER/);
  const releaseDrift = structuredClone(loadWeek3Documents(ROOT)); releaseDrift.manifest.domainCandidates[2].domainArtifactHash = "6".repeat(64);
  assert.throws(() => validateWeek3Documents(releaseDrift), /candidate_lineage_invalid:DECISION/);
});

test("real Git PR candidate and exact regular Main merge pass while legacy equality and tampering fail", () => {
  const root = mkdtempSync(join(tmpdir(), "backyrd-week3-mode-test-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Week3 Test", GIT_AUTHOR_EMAIL: "week3@example.invalid", GIT_COMMITTER_NAME: "Week3 Test", GIT_COMMITTER_EMAIL: "week3@example.invalid" } }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Week3 Test"); git("config", "user.email", "week3@example.invalid");
    writeFileSync(join(root, "README.md"), "base\n"); git("add", "README.md"); git("commit", "-qm", "base"); const base = git("rev-parse", "HEAD");
    mkdirSync(join(root, "scripts", "ci"), { recursive: true }); writeFileSync(join(root, "scripts", "ci", "control.mjs"), "export const closed = true;\n"); git("add", "."); git("commit", "-qm", "functional"); const functional = git("rev-parse", "HEAD");
    mkdirSync(join(root, "delivery", "integration"), { recursive: true }); const sealPath = join(root, "delivery", "integration", "week3-rehearsal-evidence.json"); writeFileSync(sealPath, "{\"status\":\"READY\"}\n"); git("add", "."); git("commit", "-qm", "seal"); const candidate = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", base);
    assert.equal(resolveWeek3IdentityMode({ root, mode: "PR_CANDIDATE", canonicalBaseSha: base, baseRef: base, headRef: candidate, checkoutRef: candidate, canonicalMainRef: "refs/remotes/origin/main", functionalHeadSha: functional }).candidateHeadSha, candidate);
    const merge = git("commit-tree", `${candidate}^{tree}`, "-p", base, "-p", candidate, "-m", "regular merge"); git("update-ref", "refs/remotes/origin/main", merge);
    assert.equal(resolveWeek3IdentityMode({ root, mode: "POST_MERGE_MAIN", canonicalBaseSha: base, baseRef: base, headRef: merge, checkoutRef: merge, canonicalMainRef: "refs/remotes/origin/main", functionalHeadSha: functional }).candidateHeadSha, candidate);
    assert.throws(() => { if (git("rev-parse", "refs/remotes/origin/main") !== base) throw new Error("week3_base_or_main_drift"); }, /base_or_main_drift/);
    assert.throws(() => resolveWeek3IdentityMode({ root, mode: "PR_CANDIDATE", canonicalBaseSha: base, baseRef: base, headRef: merge, checkoutRef: merge, canonicalMainRef: "refs/remotes/origin/main", functionalHeadSha: functional }), /candidate_scope_invalid|pr_main_or_base_drift/);
    git("update-ref", "refs/remotes/origin/main", base);
    assert.throws(() => resolveWeek3IdentityMode({ root, mode: "POST_MERGE_MAIN", canonicalBaseSha: base, baseRef: base, headRef: candidate, checkoutRef: candidate, canonicalMainRef: "refs/remotes/origin/main", functionalHeadSha: functional }), /candidate_missing|post_merge_head_main_mismatch|post_merge_parents_mismatch/);
    git("checkout", "-q", candidate); git("commit", "--allow-empty", "-qm", "unrelated descendant"); const unrelated = git("rev-parse", "HEAD");
    const unrelatedMerge = git("commit-tree", `${unrelated}^{tree}`, "-p", base, "-p", unrelated, "-m", "wrong merge"); git("update-ref", "refs/remotes/origin/main", unrelatedMerge);
    assert.throws(() => resolveWeek3IdentityMode({ root, mode: "POST_MERGE_MAIN", canonicalBaseSha: base, baseRef: base, headRef: unrelatedMerge, checkoutRef: unrelatedMerge, canonicalMainRef: "refs/remotes/origin/main", functionalHeadSha: functional }), /candidate_scope_invalid/);
    const wrongTreeMerge = git("commit-tree", `${base}^{tree}`, "-p", base, "-p", candidate, "-m", "wrong tree"); git("update-ref", "refs/remotes/origin/main", wrongTreeMerge);
    assert.throws(() => resolveWeek3IdentityMode({ root, mode: "POST_MERGE_MAIN", canonicalBaseSha: base, baseRef: base, headRef: wrongTreeMerge, checkoutRef: wrongTreeMerge, canonicalMainRef: "refs/remotes/origin/main", functionalHeadSha: functional }), /post_merge_tree_mismatch/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
