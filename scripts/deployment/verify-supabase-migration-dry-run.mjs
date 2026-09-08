#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/;
const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+\.sql$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

function parseActualMigrations(output) {
  const actual = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("• "))
    .map((line) => line.slice(2).trim());
  if (new Set(actual).size !== actual.length) {
    throw new Error("duplicate_dry_run_migration");
  }
  if (actual.some((name) => !MIGRATION_NAME.test(name))) {
    throw new Error("invalid_dry_run_migration");
  }
  return actual;
}

export function resolveInheritedPendingMigrations(plan, output, baseSha, options = {}) {
  if (!COMMIT_SHA.test(baseSha ?? "") || baseSha !== plan.baseSha) {
    throw new Error("inherited_migration_base_mismatch");
  }
  if (!COMMIT_SHA.test(plan.canonicalMainSha ?? "")) {
    throw new Error("invalid_candidate_sha");
  }
  if ((plan.pendingMigrations ?? plan.migrations ?? []).length !== 0 || plan.runtimeDeploymentRequired) {
    throw new Error("candidate_runtime_scope_not_empty");
  }

  const actual = parseActualMigrations(output);
  const runGit = options.runGit ?? ((args) => execFileSync("git", args, {
    cwd: options.repoRoot ?? process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }));
  const checkedOutHead = runGit(["rev-parse", "HEAD"]).trim();
  if (checkedOutHead !== plan.canonicalMainSha) {
    throw new Error("candidate_checkout_mismatch");
  }

  for (const name of actual) {
    const path = `supabase/migrations/${name}`;
    try {
      runGit(["cat-file", "-e", `${baseSha}:${path}`]);
    } catch {
      throw new Error(`inherited_migration_missing_from_base:${name}`);
    }
    try {
      runGit(["diff", "--quiet", baseSha, plan.canonicalMainSha, "--", path]);
    } catch {
      throw new Error(`inherited_migration_changed_by_candidate:${name}`);
    }
  }
  return actual;
}

export function verifyMigrationDryRun(plan, output, options = {}) {
  const expected = (plan.pendingMigrations ?? plan.migrations ?? []).map((entry) => {
    if (
      typeof entry?.path !== "string" ||
      !MIGRATION_PATH.test(entry.path)
    ) {
      throw new Error("invalid_planned_migration");
    }
    return basename(entry.path);
  });
  if (new Set(expected).size !== expected.length) {
    throw new Error("duplicate_planned_migration");
  }

  const actual = parseActualMigrations(output);
  const inherited = options.inheritedMigrations ?? [];
  if (new Set(inherited).size !== inherited.length || inherited.some((name) => !MIGRATION_NAME.test(name))) {
    throw new Error("invalid_inherited_migration");
  }
  const accepted = [...expected, ...inherited];
  if (new Set(accepted).size !== accepted.length) {
    throw new Error("overlapping_pending_migration_scope");
  }

  const reportsUpToDate = output.includes("Remote database is up to date.");
  const reportsPending = output.includes("Would push these migrations:");
  if (accepted.length === 0 && !reportsUpToDate) {
    throw new Error("dry_run_did_not_confirm_up_to_date");
  }
  if (accepted.length > 0 && !reportsPending) {
    throw new Error("dry_run_did_not_report_pending_scope");
  }
  if (reportsUpToDate && actual.length > 0) {
    throw new Error("contradictory_dry_run_output");
  }

  const expectedSorted = [...accepted].sort();
  const actualSorted = [...actual].sort();
  if (JSON.stringify(expectedSorted) !== JSON.stringify(actualSorted)) {
    throw new Error(
      `pending_migration_scope_mismatch:expected=${expectedSorted.join(",")}:actual=${actualSorted.join(",")}`,
    );
  }
  return {
    result: "PASS",
    migrations: [...expected].sort(),
    inheritedPendingMigrations: [...inherited].sort(),
    releaseState: inherited.length > 0 ? "AWAITING_EXPLICIT_RELEASE" : "VERIFIED",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [planPath, outputPath, ...args] = process.argv.slice(2);
    if (!planPath || !outputPath) throw new Error("plan_and_dry_run_paths_required");
    const inheritedFlag = args.indexOf("--allow-inherited-from-base");
    if (inheritedFlag !== -1 && (!args[inheritedFlag + 1] || args.length !== 2)) {
      throw new Error("invalid_inherited_migration_arguments");
    }
    if (inheritedFlag === -1 && args.length > 0) {
      throw new Error("unknown_arguments");
    }
    const plan = JSON.parse(await readFile(resolve(planPath), "utf8"));
    const output = await readFile(resolve(outputPath), "utf8");
    const inheritedMigrations = inheritedFlag === -1
      ? []
      : resolveInheritedPendingMigrations(plan, output, args[inheritedFlag + 1]);
    process.stdout.write(`${JSON.stringify(verifyMigrationDryRun(plan, output, { inheritedMigrations }))}\n`);
  } catch (error) {
    process.stderr.write(`supabase_migration_dry_run_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
