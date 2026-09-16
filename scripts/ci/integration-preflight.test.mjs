import test from "node:test";
import assert from "node:assert/strict";
import { loadControlPlaneDocuments, validateControlPlaneDocuments } from "./integration-preflight.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

test("Week-1 control-plane documents are internally consistent and fail closed", () => {
  const result = validateControlPlaneDocuments(loadControlPlaneDocuments());
  assert.equal(result.boundDomainCandidates, 0);
  assert.equal(result.sharedArtifactHash, null);
});

test("missing flag configuration cannot become enabled", () => {
  const documents = clone(loadControlPlaneDocuments());
  documents.flags.missingConfigurationBehavior = "ON";
  assert.throws(() => validateControlPlaneDocuments(documents), /dark_release_not_fail_closed/);
});

test("domain candidates must be completely hash-bound and share one artifact", () => {
  const documents = clone(loadControlPlaneDocuments());
  documents.manifest.domainCandidates[0].headSha = "a".repeat(40);
  assert.throws(() => validateControlPlaneDocuments(documents), /domain_candidate_partially_bound:WORLD/);

  for (const [index, candidate] of documents.manifest.domainCandidates.entries()) Object.assign(candidate, {
    pr: index + 1,
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    artifactHash: String(index).repeat(64),
    status: "READY",
  });
  assert.throws(() => validateControlPlaneDocuments(documents), /domain_candidates_do_not_share_one_artifact/);
});

test("execution authority is false in every release identity", () => {
  const documents = clone(loadControlPlaneDocuments());
  documents.manifest.productionPlan.executionAuthorized = true;
  assert.throws(() => validateControlPlaneDocuments(documents), /manifest_execution_must_be_false/);
});
