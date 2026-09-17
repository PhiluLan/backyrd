import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWeek2Documents,
  resolveWeek2DarkWiring,
  runWeek2ContractRehearsal,
  validateWeek2Documents,
} from "./week2-dark-wiring.mjs";
import { verifyDomainCandidates, verifySupabaseCompatibilitySources } from "./week2-dark-wiring-preflight.mjs";
import { verifyDecisionEvidenceAuthority } from "./week2-decision-provenance.mjs";
import { verifyFourTrackAuthority } from "./week2-four-track-authority.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const documents = () => loadWeek2Documents(ROOT);
const clone = (value) => JSON.parse(JSON.stringify(value));
const decisionInputs = (value = documents()) => {
  const candidate = value.manifest.domainCandidates.find(({ track }) => track === "DECISION");
  const evidence = value.decisionEvidence;
  return {
    candidate,
    evidence,
    execution: {
      nodeMajor: 20,
      sourceSha: candidate.headSha,
      sourceTreeHash: candidate.treeSha,
      evaluatorPath: evidence.provenance.evaluatorPath,
      evaluatorBlobSha: evidence.provenance.evaluatorBlobSha,
      outputSha256: evidence.provenance.outputSha256,
      output: clone(evidence.output),
    },
  };
};
const fourTrackInputs = (value = documents()) => ({
  manifest: value.manifest,
  evidence: value.evidence,
  reconstruction: {
    baseSha: value.evidence.baseSha,
    integrationHeadSha: value.evidence.integrationHeadSha,
    orderedHeads: clone(value.evidence.orderedHeads),
    steps: clone(value.evidence.steps),
    combinedCommitSha: value.evidence.combinedCommitSha,
    combinedTreeSha: value.evidence.combinedTreeSha,
    conflictCount: value.evidence.conflictCount,
    overlaps: clone(value.evidence.overlaps),
  },
  sealedArtifact: clone(value.sharedArtifact),
  execution: {
    combinedCommitSha: value.evidence.combinedCommitSha,
    combinedTreeSha: value.evidence.combinedTreeSha,
    artifact: clone(value.sharedArtifact),
    verifiedTracks: ["WORLD", "USER", "DECISION", "INTEGRATION"],
  },
});

test("Week-2 control-plane documents are internally consistent", () => {
  const value = documents();
  const result = validateWeek2Documents(value);
  assert.equal(result.boundDomainCandidates, 3);
  assert.equal(result.rehearsalReady, value.evidence.status === "READY");
  assert.equal(result.releaseTrainStatus, "YELLOW");
});

for (const name of ["USER_HANDOFF_HASH", "USER_NO_WRITE_PROOF_HASH"]) {
  test(`${name} rejects an individually tampered canonical User binding`, () => {
    const value = clone(documents());
    value.manifest.domainCandidates.find(({ track }) => track === "USER").bindings.find((binding) => binding.name === name).expected = "0".repeat(64);
    assert.throws(() => verifyDomainCandidates(ROOT, value.manifest, value.decisionEvidence), new RegExp(`week2_candidate_binding_mismatch:USER:${name}`));
  });
}

for (const name of ["DECISION_REPORT_HASH", "DECISION_RESULT_HASH", "DECISION_CONTROL_HASH", "DECISION_AUTHORITY_HASH", "DECISION_SOURCE_TRUST_HASH"]) {
  test(`${name} rejects an individually tampered frozen Decision evidence binding`, () => {
    const value = clone(documents());
    value.manifest.domainCandidates.find(({ track }) => track === "DECISION").evidence.bindings.find((binding) => binding.name === name).expected = "0".repeat(64);
    assert.throws(() => verifyDomainCandidates(ROOT, value.manifest, value.decisionEvidence), new RegExp(`week2_candidate_evidence_binding_mismatch:DECISION:${name}`));
  });
}

test("frozen Decision evidence is bound to the exact evaluator output and source blobs", () => {
  assert.deepEqual(
    verifyDecisionEvidenceAuthority({ root: ROOT, ...decisionInputs() }),
    {
      nodeMajor: 20,
      evaluatorPath: "packages/decision-vnext-core/sandbox/evaluate-dark-request-week2.mjs",
      evaluatorBlobSha: "74c2bab6383bec29ef4f90f9639fe0d9f701710c",
      outputSha256: "735135f171a542f6862971b521ac316b76cc1bdf6baaf6e76b4cce3faeaaaa25",
    },
  );
});

test("manipulated Decision evidence fails closed", () => {
  const input = decisionInputs();
  input.evidence.output.resultHash = "0".repeat(64);
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }), /week2_decision_evidence_output_hash_mismatch/);
});

test("wrong frozen Decision head fails closed", () => {
  const input = decisionInputs();
  input.candidate.headSha = input.candidate.baseSha;
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }));
});

test("wrong frozen Decision tree fails closed", () => {
  const input = decisionInputs();
  input.candidate.treeSha = "0".repeat(40);
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }), /week2_decision_provenance_tree_mismatch/);
});

test("alternate evaluator path fails closed", () => {
  const input = decisionInputs();
  input.evidence.provenance.evaluatorPath = "packages/decision-vnext-core/sandbox/run.mjs";
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }), /week2_decision_evaluator_path_mismatch/);
});

test("altered evaluator blob fails closed", () => {
  const input = decisionInputs();
  input.evidence.provenance.evaluatorBlobSha = "0".repeat(40);
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }), /week2_decision_evaluator_blob_mismatch/);
});

test("forged evaluator output fails closed", () => {
  const input = decisionInputs();
  input.execution.output.reportHash = "0".repeat(64);
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }), /week2_decision_execution_output_mismatch/);
});

test("incomplete evaluator output fails closed", () => {
  const input = decisionInputs();
  delete input.evidence.output.sourceTrustHash;
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }), /week2_decision_output_shape_mismatch/);
});

test("cross-head Decision replay fails closed", () => {
  const input = decisionInputs();
  const world = documents().manifest.domainCandidates.find(({ track }) => track === "WORLD");
  input.candidate.headSha = world.headSha;
  input.candidate.treeSha = world.treeSha;
  assert.throws(() => verifyDecisionEvidenceAuthority({ root: ROOT, ...input }), /week2_decision_provenance_head_mismatch/);
});

test("four-track evidence matches its complete reconstruction and shared artifact", () => {
  const result = verifyFourTrackAuthority(fourTrackInputs());
  assert.equal(result.combinedTreeSha, documents().evidence.combinedTreeSha);
  assert.equal(result.artifactHash, documents().evidence.sharedArtifactHash);
  assert.deepEqual(result.verifiedTracks, ["WORLD", "USER", "DECISION", "INTEGRATION"]);
});

for (const field of ["combinedCommitSha", "combinedTreeSha"]) {
  test(`manipulated ${field} fails four-track reconstruction`, () => {
    const input = fourTrackInputs();
    input.evidence[field] = "0".repeat(40);
    assert.throws(() => verifyFourTrackAuthority(input), /week2_rehearsal_/);
  });
}

test("wrong domain head fails four-track reconstruction", () => {
  const input = fourTrackInputs();
  input.reconstruction.orderedHeads[0].headSha = input.manifest.canonicalBaseSha;
  assert.throws(() => verifyFourTrackAuthority(input), /week2_rehearsal_ordered_heads_mismatch/);
});

test("wrong Integration head and cross-head replay fail four-track reconstruction", () => {
  const input = fourTrackInputs();
  input.reconstruction.integrationHeadSha = input.manifest.canonicalBaseSha;
  assert.throws(() => verifyFourTrackAuthority(input), /week2_rehearsal_integration_head_mismatch/);
});

test("missing and additional overlap fail four-track reconstruction", () => {
  const missing = fourTrackInputs();
  missing.reconstruction.overlaps.pop();
  assert.throws(() => verifyFourTrackAuthority(missing), /week2_rehearsal_overlaps_mismatch/);
  const additional = fourTrackInputs();
  additional.reconstruction.overlaps.push({ left: "WORLD", right: "INTEGRATION", files: ["forged"] });
  assert.throws(() => verifyFourTrackAuthority(additional), /week2_rehearsal_overlaps_mismatch/);
});

test("changed merge order fails four-track reconstruction", () => {
  const input = fourTrackInputs();
  input.reconstruction.orderedHeads.reverse();
  assert.throws(() => verifyFourTrackAuthority(input), /week2_rehearsal_ordered_heads_mismatch/);
});

test("wrong shared artifact hash fails closed", () => {
  const input = fourTrackInputs();
  input.evidence.sharedArtifactHash = "0".repeat(64);
  assert.throws(() => verifyFourTrackAuthority(input), /week2_shared_artifact_hash_mismatch/);
});

test("manipulated shared artifact manifest and file set fail closed", () => {
  const manipulated = fourTrackInputs();
  manipulated.sealedArtifact.sourceSetHash = "0".repeat(64);
  assert.throws(() => verifyFourTrackAuthority(manipulated), /week2_shared_artifact_manifest_hash_mismatch/);
  const incomplete = fourTrackInputs();
  incomplete.execution.artifact.files.pop();
  assert.throws(() => verifyFourTrackAuthority(incomplete), /week2_shared_artifact_manifest_mismatch/);
});

test("single-head artifact, wrong combined tree and cross-tree replay fail closed", () => {
  for (const tree of [documents().manifest.domainCandidates[2].treeSha, documents().manifest.canonicalBaseSha]) {
    const input = fourTrackInputs();
    input.execution.combinedTreeSha = tree;
    assert.throws(() => verifyFourTrackAuthority(input), /week2_artifact_combined_tree_mismatch/);
  }
});

for (const schema of ["auth", "realtime", "storage"]) {
  test(`${schema} schema mutation is blocked fail closed`, () => {
    assert.throws(
      () => verifySupabaseCompatibilitySources([{ path: `synthetic-${schema}.sql`, source: `alter table ${schema}.objects add column unsafe text;` }]),
      /week2_forbidden_protected_schema_mutation/,
    );
  });
}

test("compatibility contract names exactly auth, realtime and storage as protected schemas", () => {
  assert.deepEqual(documents().matrix.supabaseCompatibility.forbiddenSchemaMutations, ["auth", "realtime", "storage"]);
  const value = clone(documents());
  value.matrix.supabaseCompatibility.forbiddenSchemaMutations.pop();
  assert.throws(() => validateWeek2Documents(value), /week2_protected_schema_contract_invalid/);
});

test("technical rehearsal GREEN cannot promote the release train to GREEN", () => {
  const value = clone(documents());
  value.status.overall = "GREEN";
  value.status.yellowUntil = [];
  assert.throws(() => validateWeek2Documents(value), /week2_release_train_status_must_remain_yellow/);
});

test("missing and unknown configuration fail closed with zero work", () => {
  for (const configuration of [{}, { unknownToggle: true }, { WORLD_PRODUCT_READ: true }]) {
    const result = runWeek2ContractRehearsal({ fixture: documents().fixture, configuration });
    assert.equal(result.state.enabled, false);
    assert.deepEqual(result.counters, documents().fixture.expectedOffCounters);
    assert.equal(result.productOutput, null);
    assert.equal(result.persisted, false);
  }
});

test("activation order cannot be bypassed", () => {
  const common = {
    environment: "LOCAL_SYNTHETIC_TEST",
    globalKillSwitch: "DISENGAGED",
    WORLD_PRODUCT_READ: true,
    WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED",
    USER_LEARNING_RUNTIME: false,
    USER_LEARNING_KILL_SWITCH: "FORCED_OFF",
    relevantUserProjectionTestPort: true,
    DECISION_VNEXT_SHADOW_TRAFFIC: true,
    DECISION_VNEXT_SHADOW_KILL_SWITCH: "DISENGAGED",
    DECISION_VNEXT_PRODUCT_RANKING: false,
    DECISION_VNEXT_PRODUCT_KILL_SWITCH: "ENGAGED",
  };
  assert.equal(resolveWeek2DarkWiring({ ...common, globalKillSwitch: "ENGAGED" }).enabled, false);
  assert.equal(resolveWeek2DarkWiring({ ...common, WORLD_PRODUCT_READ: false }).enabled, false);
  assert.equal(resolveWeek2DarkWiring({ ...common, relevantUserProjectionTestPort: false }).enabled, false);
  assert.equal(resolveWeek2DarkWiring({ ...common, DECISION_VNEXT_PRODUCT_RANKING: true }).enabled, false);
  assert.equal(resolveWeek2DarkWiring(common).enabled, true);
});

test("controlled local Test-ON remains read-only, synthetic and invisible to Product", () => {
  const result = runWeek2ContractRehearsal({
    fixture: documents().fixture,
    configuration: {
      environment: "PROD_LIKE_SYNTHETIC_TEST",
      globalKillSwitch: "DISENGAGED",
      WORLD_PRODUCT_READ: true,
      WORLD_PRODUCT_READ_KILL_SWITCH: "DISENGAGED",
      USER_LEARNING_RUNTIME: false,
      USER_LEARNING_KILL_SWITCH: "FORCED_OFF",
      relevantUserProjectionTestPort: true,
      DECISION_VNEXT_SHADOW_TRAFFIC: true,
      DECISION_VNEXT_SHADOW_KILL_SWITCH: "DISENGAGED",
      DECISION_VNEXT_PRODUCT_RANKING: false,
      DECISION_VNEXT_PRODUCT_KILL_SWITCH: "ENGAGED",
    },
  });
  assert.equal(result.state.enabled, true);
  assert.equal(result.counters.worldReads, 1);
  assert.equal(result.counters.projectionBuilds, 1);
  assert.equal(result.counters.shadowEvaluations, 1);
  assert.equal(result.counters.writes, 0);
  assert.equal(result.counters.networkCalls, 0);
  assert.equal(result.counters.productOutputs, 0);
  assert.equal(result.productOutput, null);
  assert.equal(result.persisted, false);
});

test("all feature flags and authority fields remain closed", () => {
  const value = clone(documents());
  value.flags.flags[0].default = true;
  assert.throws(() => validateWeek2Documents(value), /week2_flag_not_off/);

  const authority = clone(documents());
  authority.manifest.executionAuthorized = true;
  assert.throws(() => validateWeek2Documents(authority), /week2_manifest_authority_must_be_false/);
});
