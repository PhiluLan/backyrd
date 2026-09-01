#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyMigrationDryRun(plan, output) {
  const expected = (plan.migrations ?? []).map((entry) => {
    if (
      typeof entry?.path !== "string" ||
      !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry.path)
    ) {
      throw new Error("invalid_planned_migration");
    }
    return basename(entry.path);
  });
  if (new Set(expected).size !== expected.length) {
    throw new Error("duplicate_planned_migration");
  }

  const actual = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("• "))
    .map((line) => line.slice(2).trim());
  if (new Set(actual).size !== actual.length) {
    throw new Error("duplicate_dry_run_migration");
  }
  if (actual.some((name) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(name))) {
    throw new Error("invalid_dry_run_migration");
  }

  const reportsUpToDate = output.includes("Remote database is up to date.");
  const reportsPending = output.includes("Would push these migrations:");
  if (expected.length === 0 && !reportsUpToDate) {
    throw new Error("dry_run_did_not_confirm_up_to_date");
  }
  if (expected.length > 0 && !reportsPending) {
    throw new Error("dry_run_did_not_report_pending_scope");
  }
  if (reportsUpToDate && actual.length > 0) {
    throw new Error("contradictory_dry_run_output");
  }

  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  if (JSON.stringify(expectedSorted) !== JSON.stringify(actualSorted)) {
    throw new Error(
      `pending_migration_scope_mismatch:expected=${expectedSorted.join(",")}:actual=${actualSorted.join(",")}`,
    );
  }
  return { result: "PASS", migrations: expectedSorted };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [planPath, outputPath] = process.argv.slice(2);
    if (!planPath || !outputPath) throw new Error("plan_and_dry_run_paths_required");
    const plan = JSON.parse(await readFile(resolve(planPath), "utf8"));
    const output = await readFile(resolve(outputPath), "utf8");
    process.stdout.write(`${JSON.stringify(verifyMigrationDryRun(plan, output))}\n`);
  } catch (error) {
    process.stderr.write(`supabase_migration_dry_run_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
