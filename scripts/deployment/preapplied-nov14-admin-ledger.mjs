import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const NOV14_ADMIN_MIGRATIONS = [
  {
    "path": "supabase/migrations/20261114135346_world_admin_missing_coordinates.sql",
    "sha256": "e694d1f8b468c8e9d854dcee36f327ef5126ef8fafec497435f5e956990e3745"
  },
  {
    "path": "supabase/migrations/20261114141446_world_admin_missing_opening_hours.sql",
    "sha256": "fa0dac12ccd0e12e7609eda4a670779bdb1eee73583bed05aa6de39606af9d53"
  },
  {
    "path": "supabase/migrations/20261114143944_world_admin_missing_contact_phone.sql",
    "sha256": "ce6c40fd174820ebe9ac9a48e1b64cd03dbc600bfd9b246f39c7bec8f4136a82"
  },
  {
    "path": "supabase/migrations/20261114144218_world_admin_apply_official_contact_phone.sql",
    "sha256": "329b15836873e30a99b8eaf82aebe1f93a3eacd43a8fccb31c4942e8b7119967"
  }
];

export const NOV14_ADMIN_EVIDENCE = "nov14-admin-ledger-reconciliation-v1";

export function verifyNov14AdminLedger(rows) {
  if (!Array.isArray(rows) || rows.length !== NOV14_ADMIN_MIGRATIONS.length) {
    throw new Error("nov14_admin_remote_ledger_scope_mismatch");
  }
  for (const [index, entry] of NOV14_ADMIN_MIGRATIONS.entries()) {
    const [, version, name] = /\/(\d{14})_([a-z_]+)\.sql$/.exec(entry.path);
    const row = rows[index];
    if (row.version !== version || row.name !== name || Number(row.statement_count) !== 1
      || row.statement_sha256 !== entry.sha256) throw new Error("nov14_admin_remote_ledger_identity_mismatch:" + version);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [planPath, workdir] = process.argv.slice(2);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (plan.preappliedNov14AdminMigrations?.length) {
    if (JSON.stringify(plan.preappliedNov14AdminMigrations) !== JSON.stringify(NOV14_ADMIN_MIGRATIONS)) {
      throw new Error("nov14_admin_plan_scope_invalid");
    }
    const versions = NOV14_ADMIN_MIGRATIONS.map(({ path }) => "'" + path.split("/").at(-1).slice(0, 14) + "'").join(",");
    const query = `select version,name,cardinality(statements) as statement_count,
      encode(sha256(convert_to(array_to_string(statements,chr(10)),'UTF8')),'hex') as statement_sha256
      from supabase_migrations.schema_migrations where version in (${versions}) order by version`;
    const args = ["db", "query", "--linked", "--agent=no", "--output", "json", query];
    if (workdir) args.unshift("--workdir", workdir);
    const output = JSON.parse(execFileSync("supabase", args, { encoding: "utf8" }));
    verifyNov14AdminLedger(Array.isArray(output) ? output : output.result);
    console.log("Four existing Admin migration hashes verified read-only");
  }
}
