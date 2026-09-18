import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { validateFounderLiveDocuments, verifyFounderCanonicalDescendantIdentity, verifyFounderDescendantMigrationChanges, verifyFounderIdentityMode, verifyFounderSealScope } from "./founder-live-control-plane.mjs";

const root = new URL("../..", import.meta.url);
const load = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const documents = { roadmap: load("delivery/integration/accelerated-production-roadmap.json"), matrix: load("delivery/integration/dependency-ownership-matrix.json"), manifest: load("delivery/integration/founder-live-manifest.json"), status: load("delivery/integration/founder-live-status.json") };
const sha = (digit) => digit.repeat(40); const tree = (digit) => digit.repeat(40);

test("machine-readable architecture is GREEN only with all three real domain candidates", () => {
  const result = validateFounderLiveDocuments(structuredClone(documents));
  assert.deepEqual(result, { boundCandidates: 3, status: "GREEN" });
});

test("partial and fabricated domain bindings fail closed", () => {
  const partial = structuredClone(documents); partial.manifest.domainCandidates[0].artifactHash = null;
  assert.throws(() => validateFounderLiveDocuments(partial), /partial_candidate/);
  const falselyPending = structuredClone(documents); falselyPending.manifest.status = "YELLOW_CANDIDATES_PENDING";
  assert.throws(() => validateFounderLiveDocuments(falselyPending), /bound_candidates_not_green/);
});

test("PR_CANDIDATE and POST_MERGE_MAIN identities are disjoint and exact", () => {
  const base = "f30eb153e35a979fb6b01e5bfd2bf7e42cb08dc6"; const candidate = sha("a"); const candidateTree = tree("b"); const merge = sha("c");
  assert.equal(verifyFounderIdentityMode({ mode: "PR_CANDIDATE", baseSha: base, headSha: candidate, checkoutSha: candidate, mainSha: base, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [] }), true);
  assert.equal(verifyFounderIdentityMode({ mode: "POST_MERGE_MAIN", baseSha: base, headSha: merge, checkoutSha: merge, mainSha: merge, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [base, candidate] }), true);
  assert.throws(() => verifyFounderIdentityMode({ mode: "POST_MERGE_MAIN", baseSha: base, headSha: merge, checkoutSha: merge, mainSha: merge, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [candidate, base] }), /parents_mismatch/);
  assert.throws(() => verifyFounderIdentityMode({ mode: "UNKNOWN", baseSha: base, headSha: candidate, checkoutSha: candidate, mainSha: base, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [] }), /mode_invalid/);
});

test("only one exact evidence-only seal commit is accepted", () => {
  const paths = ["delivery/integration/founder-live-status.json", "delivery/integration/founder-live-post-deploy-evidence.json", "delivery/integration/founder-live-production-plan.json", "delivery/integration/founder-live-rehearsal-evidence.json", "delivery/integration/founder-live-shared-artifact.json"];
  assert.equal(verifyFounderSealScope({ commitCount: 1, paths }), true);
  assert.throws(() => verifyFounderSealScope({ commitCount: 2, paths }), /commit_count_invalid/);
  assert.throws(() => verifyFounderSealScope({ commitCount: 1, paths: [...paths.slice(0, -1), "mobile/app/(tabs)/decision.tsx"] }), /scope_invalid/);
});

test("canonical descendants accept only newly added versioned migrations", () => {
  const additive = { status: "A", path: "supabase/migrations/20260918123000_founder_live_durable_idempotency_v1.sql" };
  assert.deepEqual(verifyFounderDescendantMigrationChanges({ descendant: true, entries: [additive] }), [additive.path]);
  assert.throws(() => verifyFounderDescendantMigrationChanges({ descendant: false, entries: [additive] }), /unexpected_database_change/);
  for (const entry of [
    { ...additive, status: "M" }, { ...additive, status: "D" }, { ...additive, status: "R100" },
    { status: "A", path: "supabase/migrations/not-versioned.sql" }
  ]) assert.throws(() => verifyFounderDescendantMigrationChanges({ descendant: true, entries: [entry] }), /migration_not_additive/);
});

test("canonical descendant PR and main identities preserve every sealed Founder-live blob", () => {
  const completion = "a76910f6da5b407dae6d4022528e644613caf5d8";
  const completionTree = "730a405788ffc70e2c8ee32caadcf3b5a39bbb30";
  const completionParents = ["f30eb153e35a979fb6b01e5bfd2bf7e42cb08dc6", "1db9b95e56a369ff5791a01884012718ee907c76"];
  const paths = ["delivery/integration/founder-live-status.json", "delivery/integration/founder-live-post-deploy-evidence.json", "delivery/integration/founder-live-production-plan.json", "delivery/integration/founder-live-rehearsal-evidence.json", "delivery/integration/founder-live-shared-artifact.json"];
  const bindings = () => paths.map((path) => ({ path, completionBlobSha: sha("a"), baseBlobSha: sha("a"), headBlobSha: sha("a"), checkoutBlobSha: sha("a"), mainBlobSha: sha("a") }));
  const base = sha("1"); const baseTree = tree("2"); const head = sha("3"); const headTree = tree("4"); const merge = sha("5");
  const pr = { mode: "CANONICAL_DESCENDANT_PR", eventName: "pull_request", completionSha: completion, completionTree, completionParents, baseSha: base, baseTree, headSha: head, headTree, checkoutSha: merge, checkoutTree: headTree, mainSha: base, mainTree: baseTree, parents: [base, head], candidateHead: head, candidateTree: headTree, completionIsAncestorOfBase: true, baseIsAncestorOfHead: true, sealedBlobBindings: bindings() };
  const main = { ...pr, mode: "CANONICAL_DESCENDANT_MAIN", eventName: "push", headSha: merge, checkoutSha: merge, mainSha: merge, mainTree: headTree, parents: [base, head], candidateHead: head };
  assert.equal(verifyFounderCanonicalDescendantIdentity(pr), true);
  assert.equal(verifyFounderCanonicalDescendantIdentity(main), true);
  assert.throws(() => verifyFounderCanonicalDescendantIdentity({ ...pr, eventName: "push" }), /event_mode_mismatch/);
  assert.throws(() => verifyFounderCanonicalDescendantIdentity({ ...pr, completionTree: tree("9") }), /completion_identity_mismatch/);
  assert.throws(() => verifyFounderCanonicalDescendantIdentity({ ...pr, checkoutSha: head, parents: [] }), /pr_merge_identity_mismatch/);
  assert.throws(() => verifyFounderCanonicalDescendantIdentity({ ...pr, baseIsAncestorOfHead: false }), /lineage_invalid/);
  assert.throws(() => verifyFounderCanonicalDescendantIdentity({ ...pr, sealedBlobBindings: pr.sealedBlobBindings.slice(1) }), /sealed_binding_set_invalid/);
  assert.throws(() => verifyFounderCanonicalDescendantIdentity({ ...pr, sealedBlobBindings: pr.sealedBlobBindings.map((entry, index) => index === 0 ? { ...entry, headBlobSha: sha("9") } : entry) }), /sealed_blob_drift/);
  assert.throws(() => verifyFounderCanonicalDescendantIdentity({ ...main, candidateTree: tree("9") }), /main_merge_identity_mismatch/);
});

test("mobile integration has no client activation toggle, raw telemetry, or second UI", () => {
  const client = readFileSync(new URL("mobile/lib/decision/founderLiveDecision.ts", root), "utf8");
  const clientContract = readFileSync(new URL("mobile/packages/founder-live-control-plane/src/index.mjs", root), "utf8");
  const serverAuthority = readFileSync(new URL("packages/decision-vnext-core/src/product-decision-production-adapter.ts", root), "utf8");
  const screen = readFileSync(new URL("mobile/app/(tabs)/decision.tsx", root), "utf8");
  const tabs = readFileSync(new URL("mobile/app/(tabs)/_layout.tsx", root), "utf8");
  assert.match(client, /freshAccessToken\(supabase\)/); assert.match(client, /supabase\.auth\.getSession\(\)/);
  assert.match(client, /Authorization:\s*`Bearer \$\{accessToken\}`/); assert.match(client, /body:\s*request/);
  assert.doesNotMatch(client, /expectedUserId|userData\.user\.id|\.auth\.getUser\(|\buuid\b|\bemail\b|user_metadata/i);
  assert.match(serverAuthority, /authClient\.getUser\(token, signal\)/); assert.match(serverAuthority, /verified\.user\.id\?\.toString\(\)\.toLowerCase\(\) !== claims\.subject/);
  assert.match(clientContract, /exactKeys\(value, \["contractVersion", "requestId", "idempotencyKey", "naturalLanguage", "explicit", "alternativeRequested", "previouslyPresentedCandidateIds", "rejectedCandidateIds"\]/);
  assert.doesNotMatch(clientContract.match(/export function validateDecisionProductRequest[\s\S]*?\n}\n/)?.[0] ?? "", /\buuid\b|\bemail\b|user_metadata|expectedUserId/i);
  assert.match(client, /DECISION_PRODUCT_RELEASE_BINDING/); assert.doesNotMatch(client, /AsyncStorage|EXPO_PUBLIC_.*VNEXT|clientToggle/i);
  assert.match(screen, /invokeDecisionProduct/); assert.match(screen, /result\.candidates/);
  assert.match(screen, /candidate_impression/); assert.match(screen, /candidate_opened/);
  assert.doesNotMatch(screen, /request_hash|console\.(?:log|debug)|trackAnalyticsEvent/);
  assert.doesNotMatch(`${screen}\n${tabs}`, /founder-demo|decision-vnext-demo/i);
});

test("Supabase public-client boundary remains explicit", () => {
  const mobile = readFileSync(new URL("mobile/lib/supabase.ts", root), "utf8");
  const admin = readFileSync(new URL("admin-dashboard/lib/supabaseClient.ts", root), "utf8");
  assert.match(mobile, /EXPO_PUBLIC_SUPABASE_ANON_KEY/); assert.doesNotMatch(`${mobile}\n${admin}`, /service[_-]?role|sb_secret_/i);
});

test("obsolete Founder Live edge host is absent from the deployable Product scope", () => {
  const config = readFileSync(new URL("supabase/config.toml", root), "utf8");
  assert.doesNotMatch(config, /\[functions\.decision-founder-live\]/);
  assert.match(config, /\[functions\.decision-v13\][\s\S]*entrypoint = "\.\/functions\/decision-v13\/index\.deploy\.ts"/);
  assert.equal(existsSync(new URL("supabase/functions/decision-v13/vnext-only.ts", root)), true);
});
