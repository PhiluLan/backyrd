import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { findNode20, linkIsolatedDependencies } from "./week2-decision-provenance.mjs";
import { sha256 } from "./week3-internal-prodlike.mjs";

const EVALUATOR = "packages/decision-vnext-core/sandbox/evaluate-internal-dark-shadow-week3.mjs";
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();

export function executeWeek3DecisionEvidence({ root, candidate }) {
  requireValue(Number(process.versions.node.split(".")[0]) === 20, "week3_decision_node20_required");
  const node = findNode20(); const npm = join(dirname(node), "npm");
  requireValue(existsSync(resolve(root, "node_modules")), "week3_decision_dependencies_missing");
  const parent = mkdtempSync(join(tmpdir(), "backyrd-week3-decision-")); const checkout = join(parent, "checkout"); let added = false;
  try {
    git(root, ["worktree", "add", "--detach", checkout, candidate.headSha]); added = true;
    linkIsolatedDependencies(root, checkout); const home = join(parent, "home"); mkdirSync(home);
    const env = { PATH: `${dirname(node)}:/usr/local/bin:/usr/bin:/bin`, HOME: home, CI: "true", npm_config_offline: "true", npm_config_audit: "false", npm_config_fund: "false", NO_PROXY: "*", no_proxy: "*" };
    execFileSync(npm, ["run", "decision-vnext:build"], { cwd: checkout, env, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const outputText = execFileSync(node, [EVALUATOR], { cwd: checkout, env, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
    const output = JSON.parse(outputText);
    return { sourceSha: git(checkout, ["rev-parse", "HEAD"]), sourceTreeSha: git(checkout, ["rev-parse", "HEAD^{tree}"]), evaluatorBlobSha: git(checkout, ["rev-parse", `HEAD:${EVALUATOR}`]), outputCanonicalHash: sha256(output), output };
  } finally {
    if (added) try { git(root, ["worktree", "remove", "--force", checkout]); } catch { /* preserve failure */ }
    rmSync(parent, { recursive: true, force: true });
  }
}

export function verifyWeek3DecisionEvidence({ candidate, sealed, execution }) {
  requireValue(execution.sourceSha === candidate.headSha && execution.sourceTreeSha === candidate.treeSha, "week3_decision_source_mismatch");
  requireValue(sealed.sourceSha === candidate.headSha && sealed.sourceTreeSha === candidate.treeSha && sealed.nodeMajor === 20, "week3_decision_seal_source_mismatch");
  requireValue(sealed.evaluatorBlobSha === execution.evaluatorBlobSha && sealed.outputCanonicalHash === execution.outputCanonicalHash, "week3_decision_provenance_mismatch");
  for (const field of ["releaseHash", "controlHash", "allowlistHash", "reportHash", "replayHash", "postDeployEvidenceHash", "postDeployStatus"]) requireValue(sealed[field] === execution.output[field], `week3_decision_output_mismatch:${field}`);
  requireValue(execution.output.reportHash === execution.output.replayHash && execution.output.executionAuthorized === false && execution.output.productionAuthorized === false && execution.output.status === "PASS", "week3_decision_output_boundary_invalid");
  requireValue(execution.output.testOn.productOutputProduced === false && execution.output.testOn.counters.persistenceWrites === 0 && execution.output.testOn.counters.networkCalls === 0 && execution.output.testOn.counters.productOutputs === 0, "week3_decision_side_effect_boundary_invalid");
  return { evaluatorBlobSha: execution.evaluatorBlobSha, outputCanonicalHash: execution.outputCanonicalHash, releaseHash: execution.output.releaseHash, reportHash: execution.output.reportHash };
}

export const WEEK3_DECISION_PROVENANCE = Object.freeze({ evaluatorPath: EVALUATOR });
