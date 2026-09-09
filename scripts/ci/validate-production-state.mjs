#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const git = (repo, args) => execFileSync("git", args, {
  cwd: repo,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const commit = (repo, value) => {
  const sha = git(repo, ["rev-parse", `${value}^{commit}`]);
  if (!SHA.test(sha)) throw new Error(`invalid_commit:${value}`);
  return sha;
};
const isAncestor = (repo, ancestor, descendant) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: repo, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

export function validateProductionState({ repo, headSha = "HEAD", statePath = "delivery/production-state.json" }) {
  const head = commit(repo, headSha);
  const state = JSON.parse(git(repo, ["show", `${head}:${statePath}`]));
  if (state.schemaVersion !== "backyrd-production-state-v1") throw new Error("production_state_schema_invalid");
  if (state.projectRef !== "hjgcrrzfjchzqoegcywn") throw new Error("production_state_project_invalid");

  const shipped = state.supabase?.shippedSourceSha;
  if (!SHA.test(shipped ?? "")) throw new Error("shipped_supabase_source_invalid");
  commit(repo, shipped);
  if (!isAncestor(repo, shipped, head)) throw new Error("shipped_supabase_source_not_in_candidate_lineage");
  if (state.supabase.technicalStatus !== "SHIPPED") throw new Error("shipped_supabase_status_invalid");
  if (!Number.isInteger(state.supabase.deploymentRunId) || state.supabase.deploymentRunId <= 0) throw new Error("shipped_supabase_run_invalid");
  if (!Number.isInteger(state.supabase.migrationCount) || state.supabase.migrationCount <= 0) throw new Error("shipped_migration_count_invalid");
  if (!/^\d{14}_[a-z0-9_]+$/.test(state.supabase.migrationTip ?? "")) throw new Error("shipped_migration_tip_invalid");
  const migrationPath = `supabase/migrations/${state.supabase.migrationTip}.sql`;
  const shippedMigrations = git(repo, ["ls-tree", "-r", "--name-only", shipped, "--", "supabase/migrations"])
    .split("\n").filter((path) => path.endsWith(".sql"));
  if (shippedMigrations.length !== state.supabase.migrationCount) throw new Error("shipped_migration_count_mismatch");
  if (!shippedMigrations.includes(migrationPath)) throw new Error("shipped_migration_tip_missing");
  if (git(repo, ["rev-parse", `${shipped}:${migrationPath}`]) !== git(repo, ["rev-parse", `${head}:${migrationPath}`])) {
    throw new Error("shipped_migration_bytes_changed");
  }

  const mobileSource = state.mobile?.shippedSourceSha;
  if (!SHA.test(mobileSource ?? "") || !isAncestor(repo, mobileSource, head)) throw new Error("shipped_mobile_source_invalid");
  if (git(repo, ["rev-parse", `${mobileSource}:mobile`]) !== state.mobile.tree) throw new Error("shipped_mobile_tree_mismatch");
  if (!SHA.test(state.mobile.productSourceSha ?? "") || !isAncestor(repo, state.mobile.productSourceSha, mobileSource)) {
    throw new Error("mobile_product_source_invalid");
  }
  if (state.mobile.productionVerified !== false || state.mobile.technicalStatus !== "SHIPPED_PRODUCT_UNVERIFIED") {
    throw new Error("review_media_product_failure_must_remain_unverified");
  }
  const incident = state.reviewMediaIncident;
  if (incident?.status !== "OPEN_PAUSED" || incident.productionVerified !== false || incident.historicalPartialTestStatesPreserved !== true || incident.productFixInScope !== false) {
    throw new Error("review_media_incident_state_invalid");
  }
  return {
    schemaVersion: "backyrd-production-state-validation-v1",
    candidateSha: head,
    shippedSupabaseSourceSha: shipped,
    shippedMobileSourceSha: mobileSource,
    migrationTip: state.supabase.migrationTip,
    migrationCount: state.supabase.migrationCount,
    productIncident: incident.id,
    productionVerified: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const headIndex = process.argv.indexOf("--head-sha");
    const result = validateProductionState({
      repo: resolve(new URL("../..", import.meta.url).pathname),
      headSha: headIndex >= 0 ? process.argv[headIndex + 1] : "HEAD",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`production_state_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
