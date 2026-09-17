#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChange } from "./classify-change.mjs";
import { loadWeek2Documents, runWeek2ContractRehearsal, validateWeek2Documents } from "./week2-dark-wiring.mjs";
import { buildProductionPlan } from "../deployment/supabase-production-plan.mjs";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const requireValue = (condition, reason) => { if (!condition) throw new Error(reason); };

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    requireValue(item.startsWith("--"), `unexpected_argument:${item}`);
    const key = item.slice(2);
    if (key === "final") args.final = true;
    else {
      requireValue(argv[index + 1] && !argv[index + 1].startsWith("--"), `argument_value_missing:${key}`);
      args[key] = argv[index + 1];
      index += 1;
    }
  }
  return args;
};

const fieldValue = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);

export function verifyDomainCandidates(root, manifest, decisionEvidence) {
  for (const candidate of manifest.domainCandidates.filter(({ headSha }) => headSha)) {
    requireValue(git(root, ["merge-base", "--is-ancestor", candidate.baseSha, candidate.headSha]) === "", `week2_candidate_not_descendant:${candidate.track}`);
    requireValue(git(root, ["rev-parse", `${candidate.headSha}^{tree}`]) === candidate.treeSha, `week2_candidate_tree_mismatch:${candidate.track}`);
    for (const binding of candidate.bindings) {
      const content = git(root, ["show", `${candidate.headSha}:${binding.path}`]);
      if (binding.type === "TEXT_CONTAINS") requireValue(content.includes(binding.expected), `week2_candidate_binding_mismatch:${candidate.track}:${binding.name}`);
      else if (binding.type === "JSON_FIELD_EQUALS") requireValue(fieldValue(JSON.parse(content), binding.field) === binding.expected, `week2_candidate_binding_mismatch:${candidate.track}:${binding.name}`);
      else throw new Error(`week2_candidate_binding_type_unknown:${candidate.track}:${binding.name}`);
    }
    if (candidate.evidence) {
      requireValue(candidate.evidence.path === "delivery/integration/week2-decision-frozen-evidence.json", `week2_candidate_evidence_path_invalid:${candidate.track}`);
      requireValue(sha256(readFileSync(resolve(root, candidate.evidence.path))) === candidate.evidence.fileHash, `week2_candidate_evidence_file_hash_mismatch:${candidate.track}`);
      requireValue(decisionEvidence.sourceSha === candidate.headSha && decisionEvidence.sourceTreeHash === candidate.treeSha, `week2_candidate_evidence_source_mismatch:${candidate.track}`);
      for (const binding of candidate.evidence.bindings) {
        for (const field of binding.fields) requireValue(fieldValue(decisionEvidence, field) === binding.expected, `week2_candidate_evidence_binding_mismatch:${candidate.track}:${binding.name}:${field}`);
      }
    }
  }
}

export function verifySupabaseCompatibilitySources(migrations) {
  const combined = migrations.map(({ source }) => source).join("\n");
  requireValue(!/\b(?:create|alter|drop)\s+(?:table|schema|function|type)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:auth|realtime|storage)\./i.test(combined), "week2_forbidden_protected_schema_mutation");
  requireValue(!/\bcreate\s+extension\b[^;]*\bversion\b|\balter\s+extension\b[^;]*\bupdate\s+to\b/i.test(combined), "week2_extension_version_pinning_forbidden");
  requireValue(!/logs\.all/i.test(combined), "week2_logs_all_dependency_forbidden");
  for (const { path, source: sql } of migrations) {
    if (!/\bcreate\s+table\b/i.test(sql)) continue;
    requireValue(/enable\s+row\s+level\s+security/i.test(sql), `week2_rls_missing:${path}`);
    requireValue(/\brevoke\b/i.test(sql) && /\bgrant\b/i.test(sql), `week2_explicit_grants_missing:${path}`);
  }
  return {
    postgresMajor: 17,
    explicitGrantsAndRls: true,
    forbiddenSchemaMutations: false,
    extensionVersionPinning: false,
    logsAllDependency: false,
  };
}

function verifySupabaseCompatibility(root, pendingMigrations) {
  return verifySupabaseCompatibilitySources(pendingMigrations.map(({ path }) => ({ path, source: readFileSync(resolve(root, path), "utf8") })));
}

function hashControlPlane(root) {
  const paths = [
    "delivery/integration/week2-dark-wiring-manifest.json",
    "delivery/integration/week2-dependency-ownership-compatibility-matrix.json",
    "delivery/integration/week2-dark-wiring-flags.json",
    "delivery/integration/week2-daily-status.json",
    "delivery/integration/fixtures/week2-dark-wiring-synthetic.json",
    "scripts/ci/week2-dark-wiring.mjs",
    "scripts/ci/week2-dark-wiring-preflight.mjs",
  ];
  return sha256(JSON.stringify(paths.map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) }))));
}

export function runWeek2Preflight({ root = ROOT, baseSha: requestedBase, headSha: requestedHead, final = false }) {
  const documents = loadWeek2Documents(root);
  const documentState = validateWeek2Documents(documents);
  verifyDomainCandidates(root, documents.manifest, documents.decisionEvidence);
  if (final) requireValue(documentState.boundDomainCandidates === 3 && documentState.rehearsalReady, "week2_final_domain_or_rehearsal_not_ready");

  const baseSha = git(root, ["rev-parse", `${requestedBase ?? documents.manifest.canonicalBaseSha}^{commit}`]);
  const headSha = git(root, ["rev-parse", `${requestedHead ?? "HEAD"}^{commit}`]);
  const canonicalMainSha = git(root, ["rev-parse", "origin/main^{commit}"]);
  requireValue(baseSha === documents.manifest.canonicalBaseSha && canonicalMainSha === documents.manifest.canonicalBaseSha, "week2_base_or_canonical_main_drift");
  requireValue(git(root, ["merge-base", "--is-ancestor", baseSha, headSha]) === "", "week2_integration_candidate_not_descendant");
  if (final) {
    requireValue(git(root, ["merge-base", "--is-ancestor", documents.evidence.integrationHeadSha, headSha]) === "", "week2_rehearsed_integration_head_not_ancestor");
    const allowedSealPaths = new Set([
      "delivery/integration/week2-dark-wiring-rehearsal-evidence.json",
      "delivery/integration/week2-daily-status.json",
    ]);
    const postRehearsalPaths = git(root, ["diff", "--name-only", `${documents.evidence.integrationHeadSha}..${headSha}`]).split("\n").filter(Boolean);
    requireValue(postRehearsalPaths.length > 0 && postRehearsalPaths.every((path) => allowedSealPaths.has(path)), `week2_post_rehearsal_scope_invalid:${postRehearsalPaths.join(",")}`);
  }

  const policy = JSON.parse(readFileSync(resolve(root, "delivery/change-policy.json"), "utf8"));
  const changePlan = classifyChange({
    root,
    context: {
      schemaVersion: "backyrd-change-context-v1",
      eventName: "local",
      baseSha,
      headSha,
      checkoutSha: headSha,
      checkoutKind: "exact-head",
      canonicalMainSha,
      baseIsCanonicalTip: true,
      baseIsCanonicalAncestor: true,
      staleBase: false,
    },
    policy,
  });
  requireValue(changePlan.blockedReasons.length === 0, `week2_change_plan_blocked:${changePlan.blockedReasons.join(",")}`);
  for (const gate of ["repository-security", "mobile", "web", "admin", "shared", "database", "decision", "delivery-contract"]) requireValue(changePlan.requiredGates.includes(gate), `week2_required_gate_missing:${gate}`);

  const productionPlan = buildProductionPlan({ repo: root, baseSha: documents.manifest.productionPlan.shippedSourceSha, headSha });
  requireValue(productionPlan.pendingMigrations.length === 9, `week2_pending_migration_count_mismatch:${productionPlan.pendingMigrations.length}`);
  requireValue(productionPlan.pendingMigrations.every(({ path }) => /world_knowledge|world_founder/.test(path)), "week2_non_world_inherited_migration");
  requireValue(productionPlan.deployFunctions.length === 0 && productionPlan.authConfig?.deploy === false, "week2_unexpected_function_or_auth_deploy");
  const supabaseCompatibility = verifySupabaseCompatibility(root, productionPlan.pendingMigrations);

  const off = runWeek2ContractRehearsal({ fixture: documents.fixture, configuration: {} });
  requireValue(Object.values(off.counters).every((value) => value === 0) && off.productOutput === null && off.persisted === false, "week2_off_rehearsal_not_zero");
  const testOn = runWeek2ContractRehearsal({
    fixture: documents.fixture,
    configuration: {
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
    },
  });
  requireValue(testOn.state.enabled && testOn.counters.writes === 0 && testOn.counters.networkCalls === 0 && testOn.counters.productOutputs === 0 && testOn.productOutput === null && testOn.persisted === false, "week2_test_on_side_effect_boundary_failed");

  const status = documentState.boundDomainCandidates === 3 && documentState.rehearsalReady ? "GREEN" : "YELLOW";
  requireValue(!final || status === "GREEN", "week2_final_status_not_green");
  return {
    contractVersion: "backyrd.week2-dark-wiring-preflight-result@1.0",
    status,
    executionAuthorized: false,
    candidate: { baseSha, headSha, treeSha: git(root, ["rev-parse", `${headSha}^{tree}`]) },
    canonicalMainSha,
    controlPlaneHash: hashControlPlane(root),
    releaseTrainStatus: documentState.releaseTrainStatus,
    domainCandidates: documents.manifest.domainCandidates,
    rehearsal: documents.evidence,
    offInvariant: off.counters,
    controlledTestOn: testOn.counters,
    supabaseCompatibility,
    productionPlan: {
      planHash: productionPlan.planHash,
      pendingMigrationCount: productionPlan.pendingMigrations.length,
      pendingMigrationClass: "WORLD_INHERITED",
      deployFunctions: productionPlan.deployFunctions,
      authDeploy: productionPlan.authConfig?.deploy ?? false,
      runtimeDeploymentRequired: productionPlan.runtimeDeploymentRequired,
      executionAuthorized: false,
    },
    changePlan: { classes: changePlan.classes, requiredGates: changePlan.requiredGates },
    finalMode: final,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runWeek2Preflight({
      root: resolve(args.root ?? ROOT),
      baseSha: args["base-sha"],
      headSha: args["head-sha"],
      final: Boolean(args.final),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`week2_dark_wiring_preflight_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
