#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const EXPECTED_NODE_MAJOR = 20;
const EVALUATOR_PATH = "packages/decision-vnext-core/sandbox/evaluate-dark-request-week2.mjs";
const BUILD_COMMAND = ["npm", "run", "decision-vnext:build"];
const EVALUATOR_COMMAND = ["node", EVALUATOR_PATH];
const INPUT_PATHS = Object.freeze([
  "package-lock.json",
  "package.json",
  "packages/decision-vnext-core/package.json",
  "packages/decision-vnext-core/tsconfig.json",
  "packages/decision-vnext-core/src/dark-request-contracts.ts",
  "packages/decision-vnext-core/src/dark-request-fixtures.ts",
  "packages/decision-vnext-core/src/dark-request.ts",
  "packages/decision-vnext-core/src/index.ts",
  EVALUATOR_PATH,
]);
const OUTPUT_FIELDS = Object.freeze([
  "contractVersion", "sourceSha", "sourceTreeHash", "controlHash", "oracleCatalogHash",
  "thresholdTemplateHash", "authorityHash", "sourceTrustHash", "worldHash", "cohortHash",
  "evaluationCohortHash", "resultHash", "reportHash", "replayHash", "counters", "killSwitch",
  "sampleRateBasisPoints", "executionAuthorized", "productionAuthorized", "productOutputProduced", "status",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const git = (root, args) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function findNode20() {
  const candidates = [
    process.env.BACKYRD_NODE20_BIN,
    Number(process.versions.node.split(".")[0]) === EXPECTED_NODE_MAJOR ? process.execPath : null,
    "/opt/homebrew/opt/node@20/bin/node",
    "/usr/local/opt/node@20/bin/node",
  ].filter(Boolean);
  const node = candidates.find((path) => existsSync(path));
  requireValue(node, "week2_decision_node20_missing");
  const major = Number(execFileSync(node, ["-p", "process.versions.node.split('.')[0]"], { encoding: "utf8" }).trim());
  requireValue(major === EXPECTED_NODE_MAJOR, `week2_decision_node_major_mismatch:${major}`);
  return node;
}

export function linkIsolatedDependencies(root, checkout) {
  const source = resolve(root, "node_modules");
  const target = join(checkout, "node_modules");
  mkdirSync(target);
  for (const name of readdirSync(source)) {
    if (name === "@backyrd") continue;
    symlinkSync(join(source, name), join(target, name));
  }
  const scope = join(target, "@backyrd");
  mkdirSync(scope);
  for (const name of readdirSync(join(source, "@backyrd"))) {
    const workspace = join(checkout, "packages", name);
    if (name === "founder-live-control-plane") {
      requireValue(existsSync(resolve(root, "mobile/packages/founder-live-control-plane")), "week2_decision_mobile_founder_workspace_missing");
      continue;
    }
    requireValue(existsSync(workspace), `week2_decision_workspace_dependency_missing:${name}`);
    symlinkSync(workspace, join(scope, name), "dir");
  }
}

export function expectedDecisionInputBlobs(root, headSha) {
  return Object.fromEntries(INPUT_PATHS.map((path) => [path, git(root, ["rev-parse", `${headSha}:${path}`])]));
}

export function verifyDecisionEvidenceAuthority({ root, candidate, evidence, execution }) {
  requireValue(candidate?.track === "DECISION", "week2_decision_candidate_missing");
  requireValue(evidence?.provenance?.contractVersion === "backyrd.week2-decision-provenance@1.0", "week2_decision_provenance_contract_invalid");
  requireValue(evidence.provenance.nodeMajor === EXPECTED_NODE_MAJOR, "week2_decision_provenance_node_major_invalid");
  requireValue(evidence.provenance.sourceSha === candidate.headSha, "week2_decision_provenance_head_mismatch");
  requireValue(evidence.provenance.sourceTreeHash === candidate.treeSha, "week2_decision_provenance_tree_mismatch");
  requireValue(git(root, ["rev-parse", `${candidate.headSha}^{tree}`]) === candidate.treeSha, "week2_decision_candidate_tree_mismatch");
  requireValue(evidence.provenance.evaluatorPath === EVALUATOR_PATH, "week2_decision_evaluator_path_mismatch");
  requireValue(sameJson(evidence.provenance.buildCommand, BUILD_COMMAND), "week2_decision_build_command_mismatch");
  requireValue(sameJson(evidence.provenance.evaluatorCommand, EVALUATOR_COMMAND), "week2_decision_evaluator_command_mismatch");

  const expectedInputs = expectedDecisionInputBlobs(root, candidate.headSha);
  requireValue(sameJson(Object.keys(evidence.provenance.inputBlobs), INPUT_PATHS), "week2_decision_input_path_set_mismatch");
  for (const path of INPUT_PATHS) {
    requireValue(evidence.provenance.inputBlobs[path] === expectedInputs[path], `week2_decision_input_blob_mismatch:${path}`);
  }
  requireValue(evidence.provenance.evaluatorBlobSha === expectedInputs[EVALUATOR_PATH], "week2_decision_evaluator_blob_mismatch");
  requireValue(git(root, ["hash-object", "package-lock.json"]) === expectedInputs["package-lock.json"], "week2_decision_canonical_lockfile_mismatch");

  requireValue(evidence.output?.sourceSha === candidate.headSha, "week2_decision_output_head_mismatch");
  requireValue(evidence.output?.sourceTreeHash === candidate.treeSha, "week2_decision_output_tree_mismatch");
  requireValue(sameJson(Object.keys(evidence.output), OUTPUT_FIELDS), "week2_decision_output_shape_mismatch");
  requireValue(evidence.output.executionAuthorized === false && evidence.output.productionAuthorized === false && evidence.output.productOutputProduced === false, "week2_decision_output_authority_open");
  requireValue(evidence.output.counters?.persistenceWrites === 0 && evidence.output.counters?.networkCalls === 0 && evidence.output.counters?.productOutputs === 0, "week2_decision_output_side_effect_boundary_failed");
  requireValue(evidence.output.status === "PASS" && evidence.output.reportHash === evidence.output.replayHash, "week2_decision_output_not_replay_stable");
  requireValue(evidence.provenance.outputSha256 === sha256(`${JSON.stringify(evidence.output)}\n`), "week2_decision_evidence_output_hash_mismatch");

  requireValue(execution?.nodeMajor === EXPECTED_NODE_MAJOR, "week2_decision_execution_node_major_mismatch");
  requireValue(execution.sourceSha === candidate.headSha && execution.sourceTreeHash === candidate.treeSha, "week2_decision_execution_source_mismatch");
  requireValue(execution.evaluatorPath === EVALUATOR_PATH, "week2_decision_execution_evaluator_path_mismatch");
  requireValue(execution.evaluatorBlobSha === expectedInputs[EVALUATOR_PATH], "week2_decision_execution_evaluator_blob_mismatch");
  requireValue(execution.outputSha256 === evidence.provenance.outputSha256, "week2_decision_execution_output_hash_mismatch");
  requireValue(sameJson(execution.output, evidence.output), "week2_decision_execution_output_mismatch");
  return { nodeMajor: EXPECTED_NODE_MAJOR, evaluatorPath: EVALUATOR_PATH, evaluatorBlobSha: expectedInputs[EVALUATOR_PATH], outputSha256: execution.outputSha256 };
}

export function executeFrozenDecisionEvidence({ root, candidate }) {
  const node = findNode20();
  const npm = join(dirname(node), "npm");
  requireValue(existsSync(npm), "week2_decision_node20_npm_missing");
  requireValue(existsSync(resolve(root, "node_modules")), "week2_decision_dependencies_missing");
  const parent = mkdtempSync(join(tmpdir(), "backyrd-week2-decision-provenance-"));
  const checkout = join(parent, "checkout");
  let added = false;
  try {
    git(root, ["worktree", "add", "--detach", checkout, candidate.headSha]);
    added = true;
    const sourceSha = git(checkout, ["rev-parse", "HEAD^{commit}"]);
    const sourceTreeHash = git(checkout, ["rev-parse", "HEAD^{tree}"]);
    requireValue(sourceSha === candidate.headSha, "week2_decision_isolated_head_mismatch");
    requireValue(sourceTreeHash === candidate.treeSha, "week2_decision_isolated_tree_mismatch");
    requireValue(git(checkout, ["status", "--porcelain"]) === "", "week2_decision_isolated_checkout_dirty");
    linkIsolatedDependencies(root, checkout);
    const isolatedHome = join(parent, "home");
    mkdirSync(isolatedHome);
    const env = {
      PATH: `${dirname(node)}:/usr/local/bin:/usr/bin:/bin`,
      HOME: isolatedHome,
      CI: "true",
      npm_config_offline: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
      NO_PROXY: "*",
      no_proxy: "*",
    };
    try {
      execFileSync(npm, BUILD_COMMAND.slice(1), { cwd: checkout, env, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const details = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
      throw new Error(`week2_decision_isolated_build_failed:${details}`);
    }
    const stdout = execFileSync(node, [EVALUATOR_PATH], { cwd: checkout, env, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    requireValue(stdout.endsWith("\n") && stdout.trim().split("\n").length === 1, "week2_decision_evaluator_output_not_canonical_jsonl");
    let output;
    try { output = JSON.parse(stdout); } catch { throw new Error("week2_decision_evaluator_output_invalid_json"); }
    return {
      nodeMajor: EXPECTED_NODE_MAJOR,
      sourceSha,
      sourceTreeHash,
      evaluatorPath: EVALUATOR_PATH,
      evaluatorBlobSha: git(checkout, ["rev-parse", `HEAD:${EVALUATOR_PATH}`]),
      outputSha256: sha256(stdout),
      output,
    };
  } finally {
    if (added) {
      try { git(root, ["worktree", "remove", "--force", checkout]); } catch { /* preserve primary failure */ }
    }
    rmSync(parent, { recursive: true, force: true });
  }
}

export const DECISION_PROVENANCE_CONSTANTS = Object.freeze({
  nodeMajor: EXPECTED_NODE_MAJOR,
  evaluatorPath: EVALUATOR_PATH,
  buildCommand: BUILD_COMMAND,
  evaluatorCommand: EVALUATOR_COMMAND,
  inputPaths: INPUT_PATHS,
  outputFields: OUTPUT_FIELDS,
});
