#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const securityPattern = /\b(?:create|alter|drop)\s+policy\b|\brow\s+level\s+security\b|\b(?:grant|revoke)\b|\bsecurity\s+definer\b|\bauth\.|\bstorage\./i;
const destructivePattern = /\btruncate\b|\bdrop\s+(?:table|schema|column|type)\b|\bdelete\s+from\b|\balter\s+table\b[^;]*\bdrop\b/i;

export function validateDatabaseTestCoverage({ root, baseSha, headSha }) {
  const changes = git(root, ["diff", "--name-status", baseSha, headSha]).split("\n").filter(Boolean).map((line) => {
    const [status, first, second] = line.split("\t"); return { status, path: second ?? first };
  });
  const newMigrations = changes.filter(({ status, path }) => status === "A" && path.startsWith("supabase/migrations/")).map(({ path }) => path);
  const migrationMutations = changes.filter(({ status, path }) => status !== "A" && path.startsWith("supabase/migrations/"));
  if (migrationMutations.length) throw new Error(`published_migration_mutation:${migrationMutations.map(({ path }) => path).join(",")}`);
  const newMigrationSources = newMigrations.map((path) => git(root, ["show", `${headSha}:${path}`]));
  const newMigrationSource = newMigrationSources.join("\n");
  if (newMigrationSources.some((source) => destructivePattern.test(source))) throw new Error("destructive_database_change_requires_separate_authorization");
  const changedTests = changes.filter(({ status, path }) => status !== "D" && /^supabase\/tests\/.+\.sql$/.test(path)).map(({ path }) => path).sort();
  const authorizationFiles = changes.filter(({ path }) => ["supabase/canonical/auth_hooks.sql", "supabase/canonical/storage.sql"].includes(path));
  const authorizationBoundary = authorizationFiles.length > 0 || securityPattern.test(newMigrationSource);
  if (newMigrations.length && !changedTests.length) throw new Error("forward_migration_requires_changed_sql_acceptance_test");
  if (authorizationBoundary && !changedTests.length) throw new Error("authorization_change_requires_changed_sql_acceptance_test");
  if (authorizationBoundary) {
    const tests = changedTests.map((path) => git(root, ["show", `${headSha}:${path}`])).join("\n");
    if (!/^--\s*backyrd:authorization-positive\s*$/im.test(tests)) throw new Error("authorization_positive_marker_missing");
    if (!/^--\s*backyrd:authorization-negative\s*$/im.test(tests)) throw new Error("authorization_negative_marker_missing");
  }
  return { schemaVersion: "backyrd-database-test-plan-v1", newMigrations, authorizationBoundary, changedTests };
}

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, values) => {
  if (value.startsWith("--")) items.push([value.slice(2), values[index + 1]]); return items;
}, []));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    const plan = validateDatabaseTestCoverage({ root, baseSha: args["base-sha"], headSha: args["head-sha"] ?? "HEAD" });
    if (args.output) writeFileSync(resolve(args.output), `${plan.changedTests.join("\n")}${plan.changedTests.length ? "\n" : ""}`);
    process.stdout.write(`${JSON.stringify(plan)}\n`);
  } catch (error) {
    process.stderr.write(`database_test_coverage_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
