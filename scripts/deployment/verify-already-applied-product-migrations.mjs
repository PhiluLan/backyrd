#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const required = (value, reason) => { if (!value) throw new Error(reason); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function verifyAlreadyAppliedProductMigrations({ listing, expectedVersions, pendingMigrations, root }) {
  required(Array.isArray(pendingMigrations) && pendingMigrations.length === 13, "preapplied_product_scope_invalid");
  for (const item of pendingMigrations) {
    required(/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(item.path)
      && sha256(readFileSync(resolve(root, item.path))) === item.sha256, `preapplied_migration_bytes_invalid:${item.path}`);
  }
  const rows = listing.split("\n").filter((line) => /^\s*\d{14}\s*\|/.test(line)).map((line) => line.split("|").map((part) => part.trim()));
  required(rows.length === expectedVersions.length, "preapplied_migration_count_drift");
  required(rows.every(([local, remote], index) => local === expectedVersions[index] && remote === expectedVersions[index]), "preapplied_migration_lineage_drift");
  const pendingVersions = pendingMigrations.map((item) => item.path.match(/\d{14}/)[0]);
  required(JSON.stringify(expectedVersions.slice(-13)) === JSON.stringify(pendingVersions), "preapplied_migration_set_drift");
  return { status: "PASS_ALREADY_APPLIED_NO_SQL", migrationCount: rows.length, tip: expectedVersions.at(-1), pendingCount: 13 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, values) => value.startsWith("--") ? [...all, [value.slice(2), values[index + 1]]] : all, []));
    required(args.plan && args.listing, "preapplied_plan_and_listing_required");
    const root = resolve(args.root ?? new URL("../..", import.meta.url).pathname);
    const plan = JSON.parse(readFileSync(resolve(args.plan), "utf8"));
    const files = execFileSync("git", ["ls-tree", "-r", "--name-only", plan.canonicalMainSha, "--", "supabase/migrations"], { cwd: root, encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
    const expectedVersions = files.map((path) => path.match(/^supabase\/migrations\/(\d{14})_[a-z0-9_]+\.sql$/)?.[1]);
    required(expectedVersions.every(Boolean), "preapplied_repository_migration_path_invalid");
    const result = verifyAlreadyAppliedProductMigrations({ listing: readFileSync(resolve(args.listing), "utf8"), expectedVersions, pendingMigrations: plan.pendingMigrations, root });
    process.stdout.write(`${JSON.stringify({ ...result, canonicalMainSha: plan.canonicalMainSha, planHash: plan.planHash })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
