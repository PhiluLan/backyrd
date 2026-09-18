#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";
import { buildFounderLiveArtifact } from "./founder-live-artifact.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

export function buildFounderLiveEdgeImplementationEvidence({ root = ROOT, source = "HEAD" } = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 20) throw new Error("founder_live_edge_evidence_node20_required");
  const sourceSha = git(root, ["rev-parse", `${source}^{commit}`]);
  const sourceTreeSha = git(root, ["rev-parse", `${source}^{tree}`]);
  const productionState = JSON.parse(readFileSync(resolve(root, "delivery/production-state.json"), "utf8"));
  const plan = buildProductionPlan({ repo: root, baseSha: productionState.supabase.shippedSourceSha, headSha: sourceSha });
  if (JSON.stringify(plan.deployFunctions) !== JSON.stringify(["decision-founder-live"])) throw new Error("founder_live_edge_plan_scope_invalid");
  if (plan.authConfig?.deploy !== false) throw new Error("founder_live_edge_auth_scope_open");
  const artifact = buildFounderLiveArtifact({ root, source: sourceSha });
  const body = {
    contractVersion: "backyrd.founder-live-edge-implementation-evidence@1.0",
    sourceSha,
    sourceTreeSha,
    sourceSetHash: artifact.sourceSetHash,
    artifactHash: artifact.artifactHash,
    productionPlanHash: plan.planHash,
    deployFunctions: plan.deployFunctions,
    edgeBoundaryVersion: "backyrd.decision-vnext.founder-live-edge-boundary@1.0",
    verifyJwt: true,
    corsPolicy: "EXACT_SERVER_CONFIGURED_ORIGIN_ALLOWLIST",
    runtimeAuthority: "NOT_AUTHORIZED",
    defaultState: "OFF",
    killSwitch: "ENGAGED_BY_ABSENT_RUNTIME_AUTHORITY",
    worldPort: "CANONICAL_WORLD_READER_ONLY",
    userPort: "CANONICAL_RELEVANT_USER_PROJECTION_ONLY",
    idempotencyPort: "DURABLE_RPC_ONLY",
    rateLimitPort: "GATE_7_DURABLE_RPC_ONLY",
    deploymentAuthorized: false,
    executionAuthorized: false,
    productionQueries: 0,
    migrationsExecuted: 0,
    functionsDeployed: 0,
    runtimeActivations: 0,
  };
  return Object.freeze({ ...body, evidenceHash: sha256(body) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(buildFounderLiveEdgeImplementationEvidence({ root: resolve(process.argv[2] ?? ROOT), source: process.argv[3] ?? "HEAD" }), null, 2)}\n`); }
  catch (error) { process.stderr.write(`founder_live_edge_evidence_blocked:${error.message}\n`); process.exitCode = 1; }
}
