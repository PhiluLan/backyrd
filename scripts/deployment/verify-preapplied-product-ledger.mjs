#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Only migration metadata is read; no application rows or SQL bodies leave DB.
const query = `select version,name,coalesce(array_length(statements,1),0) as statement_count,
 encode(sha256(convert_to(array_to_string(statements,E'\\n'),'UTF8')),'hex') as statement_sha256,
 (select count(*) from supabase_migrations.schema_migrations) as total_count,
 (select max(version) from supabase_migrations.schema_migrations) as ledger_tip
 from supabase_migrations.schema_migrations
 where version between '20260910174419' and '20260919090423' order by version`;

export function verifyPreappliedProductLedger(plan, rows) {
  const scope = plan.productPreappliedImport;
  if (!scope) return { status: "NOT_APPLICABLE" };
  if (!Array.isArray(rows) || rows.length !== 13 || scope.migrations?.length !== 13) {
    throw new Error("product_preapplied_remote_scope_mismatch");
  }
  for (let index = 0; index < 13; index += 1) {
    const expected = scope.migrations[index];
    const actual = rows[index];
    const version = expected.path.match(/^supabase\/migrations\/(\d{14})_([a-z0-9_]+)\.sql$/);
    if (!version || actual.version !== version[1] || actual.name !== version[2]
      || Number(actual.statement_count) !== expected.productionStatementCount
      || actual.statement_sha256 !== expected.productionStatementSha256
      || Number(actual.total_count) !== scope.remoteMigrationCount
      || actual.ledger_tip !== scope.remoteMigrationTip) {
      throw new Error(`product_preapplied_remote_identity_mismatch:${index}`);
    }
  }
  return {
    status: "VERIFIED_READ_ONLY",
    remoteMigrationCount: scope.remoteMigrationCount,
    remoteMigrationTip: scope.remoteMigrationTip,
    preappliedCount: 13,
    pendingPaths: plan.pendingMigrations.map(({ path }) => path),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [planPath, outputPath] = process.argv.slice(2);
    if (!planPath || !outputPath) throw new Error("plan_and_audit_paths_required");
    const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
    if (!plan.productPreappliedImport) throw new Error("product_preapplied_import_required");
    const stdout = execFileSync("supabase", ["db", "query", "--linked", "--agent=no", "--output", "json", query], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 2 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed) ? parsed : parsed?.result;
    const result = verifyPreappliedProductLedger(plan, rows);
    writeFileSync(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    process.stdout.write(`product preapplied remote ledger verified: ${result.preappliedCount} entries, ${result.remoteMigrationCount} total\n`);
  } catch (error) {
    process.stderr.write(`product_preapplied_remote_ledger_blocked:${error.message}\n`);
    process.exitCode = 1;
  }
}
