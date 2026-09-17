import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateFounderLiveDocuments, verifyFounderIdentityMode } from "./founder-live-control-plane.mjs";

const root = new URL("../..", import.meta.url);
const load = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const documents = { roadmap: load("delivery/integration/accelerated-production-roadmap.json"), matrix: load("delivery/integration/dependency-ownership-matrix.json"), manifest: load("delivery/integration/founder-live-manifest.json"), status: load("delivery/integration/founder-live-status.json") };
const sha = (digit) => digit.repeat(40); const tree = (digit) => digit.repeat(40);

test("machine-readable architecture remains YELLOW until all real domain candidates exist", () => {
  const result = validateFounderLiveDocuments(structuredClone(documents));
  assert.deepEqual(result, { boundCandidates: 0, status: "YELLOW" });
});

test("partial and fabricated domain bindings fail closed", () => {
  const partial = structuredClone(documents); partial.manifest.domainCandidates[0].headSha = sha("a");
  assert.throws(() => validateFounderLiveDocuments(partial), /partial_candidate/);
  const falselyGreen = structuredClone(documents); falselyGreen.manifest.status = "READY";
  assert.throws(() => validateFounderLiveDocuments(falselyGreen), /missing_candidates_not_yellow/);
});

test("PR_CANDIDATE and POST_MERGE_MAIN identities are disjoint and exact", () => {
  const base = "9c38946462c5698ee1ff6375d996463254dd829e"; const candidate = sha("a"); const candidateTree = tree("b"); const merge = sha("c");
  assert.equal(verifyFounderIdentityMode({ mode: "PR_CANDIDATE", baseSha: base, headSha: candidate, checkoutSha: candidate, mainSha: base, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [] }), true);
  assert.equal(verifyFounderIdentityMode({ mode: "POST_MERGE_MAIN", baseSha: base, headSha: merge, checkoutSha: merge, mainSha: merge, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [base, candidate] }), true);
  assert.throws(() => verifyFounderIdentityMode({ mode: "POST_MERGE_MAIN", baseSha: base, headSha: merge, checkoutSha: merge, mainSha: merge, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [candidate, base] }), /parents_mismatch/);
  assert.throws(() => verifyFounderIdentityMode({ mode: "UNKNOWN", baseSha: base, headSha: candidate, checkoutSha: candidate, mainSha: base, headTree: candidateTree, checkoutTree: candidateTree, candidateHead: candidate, candidateTree, parents: [] }), /mode_invalid/);
});

test("mobile integration has no client activation toggle, raw telemetry, or second UI", () => {
  const client = readFileSync(new URL("mobile/lib/decision/founderLiveDecision.ts", root), "utf8");
  const screen = readFileSync(new URL("mobile/app/(tabs)/decision.tsx", root), "utf8");
  const tabs = readFileSync(new URL("mobile/app/(tabs)/_layout.tsx", root), "utf8");
  assert.match(client, /freshAccessToken/); assert.match(client, /userData\.user\.id !== expectedUserId/);
  assert.match(client, /FOUNDER_LIVE_RELEASE_BINDING/); assert.doesNotMatch(client, /AsyncStorage|EXPO_PUBLIC_.*VNEXT|clientToggle/i);
  assert.match(screen, /invokeFounderLiveDecision/); assert.match(screen, /request_hash/); assert.doesNotMatch(`${screen}\n${tabs}`, /founder-demo|decision-vnext-demo/i);
});

test("Supabase public-client boundary remains explicit", () => {
  const mobile = readFileSync(new URL("mobile/lib/supabase.ts", root), "utf8");
  const admin = readFileSync(new URL("admin-dashboard/lib/supabaseClient.ts", root), "utf8");
  assert.match(mobile, /EXPO_PUBLIC_SUPABASE_ANON_KEY/); assert.doesNotMatch(`${mobile}\n${admin}`, /service[_-]?role|sb_secret_/i);
});
