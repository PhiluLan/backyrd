#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REQUIRED_EVALUATIONS } from "./validate-decision-change.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, values) => {
  if (value.startsWith("--")) items.push([value.slice(2), values[index + 1]]);
  return items;
}, []));
const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
const git = (values, buffer = false) => execFileSync("git", values, { cwd: root, encoding: buffer ? undefined : "utf8", maxBuffer: 50 * 1024 * 1024 }).toString().trim();
const baseSha = git(["rev-parse", `${args["base-sha"]}^{commit}`]);
const headSha = git(["rev-parse", `${args["head-sha"] ?? "HEAD"}^{commit}`]);
const trustAnchorPath = args["trust-anchor"] ?? "decision-lab/config/decision-v13-production-recertification-v44.json";
const anchor = JSON.parse(git(["show", `${baseSha}:${trustAnchorPath}`]));
const protectedPaths = [...new Set(anchor.protectedSemanticSourceSet.paths)].sort();
const changed = git(["diff", "--name-only", `${baseSha}..${headSha}`]).split("\n").filter(Boolean);
const semanticPrefixes = ["packages/canonical-semantics/src/", "packages/decision-input-runtime/src/", "packages/decision-orchestrator-runtime/src/", "packages/n6-shadow-runtime/src/", "supabase/functions/decision-v13/"];
const changedProtectedPaths = changed.filter((path) => protectedPaths.includes(path) || semanticPrefixes.some((prefix) => path.startsWith(prefix))).sort();
if (!changedProtectedPaths.length) throw new Error("no_decision_semantic_change_detected");
if (!/^[a-z0-9][a-z0-9-]*$/.test(args.id ?? "")) throw new Error("valid_release_id_required");
if (!args.output) throw new Error("output_required");
if (!args.authorization?.trim()) throw new Error("authorization_reference_required");
const hash = createHash("sha256");
for (const path of protectedPaths) hash.update(execFileSync("git", ["show", `${headSha}:${path}`], { cwd: root }));
const record = {
  schemaVersion: "backyrd-decision-release-v1",
  id: args.id,
  baselineSha: baseSha,
  decisionSemanticsChanged: true,
  changedProtectedPaths,
  protectedSourceHash: hash.digest("hex"),
  requiredEvaluations: REQUIRED_EVALUATIONS,
  authorizationReference: args.authorization,
};
writeFileSync(resolve(root, args.output), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
