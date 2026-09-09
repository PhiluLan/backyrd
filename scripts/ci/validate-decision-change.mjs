#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_EVALUATIONS = [
  "decision-lab:test",
  "decision-lab:smoke",
  "decision-lab:d2:acceptance",
  "decision-lab:d2:recertify",
  "decision-lab:d2.2:validate",
  "decision-lab:d3.1:preflight",
  "decision-lab:d3-a:validate"
];
const RELEASE_PREFIX = "decision-lab/releases/";
const git = (root, args, buffer = false) => execFileSync("git", args, {
  cwd: root,
  encoding: buffer ? undefined : "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});
const text = (root, args) => git(root, args).trim();
const protectedHash = (root, headSha, paths) => {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) hash.update(git(root, ["show", `${headSha}:${path}`], true));
  return hash.digest("hex");
};

export function validateDecisionChange({ root, baseSha, headSha, trustAnchorPath }) {
  const anchor = JSON.parse(text(root, ["show", `${baseSha}:${trustAnchorPath}`]));
  const paths = [...new Set(anchor.protectedSemanticSourceSet?.paths ?? [])].sort();
  if (!paths.length) throw new Error("decision_trust_anchor_has_no_protected_sources");
  const changed = text(root, ["diff", "--name-only", `${baseSha}..${headSha}`]).split("\n").filter(Boolean);
  const changedProtectedPaths = changed.filter((path) => paths.includes(path) || [
    "packages/canonical-semantics/src/",
    "packages/decision-input-runtime/src/",
    "packages/decision-orchestrator-runtime/src/",
    "packages/n6-shadow-runtime/src/",
    "supabase/functions/decision-v13/",
  ].some((prefix) => path.startsWith(prefix))).sort();
  if (!changedProtectedPaths.length) return { decisionSemanticsChanged: false, changedProtectedPaths: [], releaseRecord: null };

  const releaseChanges = text(root, ["diff", "--name-status", `${baseSha}..${headSha}`, "--", RELEASE_PREFIX]).split("\n").filter(Boolean);
  if (releaseChanges.length !== 1 || !releaseChanges[0].startsWith("A\t")) throw new Error("exactly_one_new_decision_release_record_required");
  const releasePath = releaseChanges[0].slice(2);
  if (!/^decision-lab\/releases\/[a-z0-9][a-z0-9-]*\.json$/.test(releasePath)) throw new Error("decision_release_path_invalid");
  const record = JSON.parse(text(root, ["show", `${headSha}:${releasePath}`]));
  if (record.schemaVersion !== "backyrd-decision-release-v1") throw new Error("decision_release_schema_invalid");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(record.id ?? "")) throw new Error("decision_release_id_invalid");
  if (record.baselineSha !== baseSha) throw new Error("decision_release_baseline_mismatch");
  if (record.decisionSemanticsChanged !== true) throw new Error("decision_release_semantic_flag_required");
  if (JSON.stringify(record.changedProtectedPaths) !== JSON.stringify(changedProtectedPaths)) throw new Error("decision_release_changed_paths_mismatch");
  if (record.protectedSourceHash !== protectedHash(root, headSha, paths)) throw new Error("decision_release_source_hash_mismatch");
  if (JSON.stringify(record.requiredEvaluations) !== JSON.stringify(REQUIRED_EVALUATIONS)) throw new Error("decision_release_evaluations_mismatch");
  if (typeof record.authorizationReference !== "string" || !record.authorizationReference.trim()) throw new Error("decision_release_authorization_reference_required");
  return { decisionSemanticsChanged: true, changedProtectedPaths, releaseRecord: releasePath, protectedSourceHash: record.protectedSourceHash };
}

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, values) => {
  if (value.startsWith("--")) items.push([value.slice(2), values[index + 1]]);
  return items;
}, []));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    const result = validateDecisionChange({
      root,
      baseSha: text(root, ["rev-parse", `${args["base-sha"]}^{commit}`]),
      headSha: text(root, ["rev-parse", `${args["head-sha"] ?? "HEAD"}^{commit}`]),
      trustAnchorPath: args["trust-anchor"] ?? "decision-lab/config/decision-v13-production-recertification-v44.json",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`decision_semantic_gate_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
