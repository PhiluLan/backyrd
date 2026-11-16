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

export const NOV16_EAT_MIGRATIONS = [
  {
    path: "supabase/migrations/20261116144626_world_admin_bulk_complete_eat_rules.sql",
    sha256: "11d2167bab16777d2fc3dd361355e7adf820d151619aba1daf066c9a3ab805e4",
  },
  {
    path: "supabase/migrations/20261116145630_world_service_rebuild_eat_defaults.sql",
    sha256: "242a01dbb069a8e64d089a6e4e6befbaa0c8b293d94182a7bf35a299d873c2b7",
  },
];

function verifyAdminLedger(rows, migrations, scope) {
  if (!Array.isArray(rows) || rows.length !== migrations.length) {
    throw new Error(scope + "_remote_ledger_scope_mismatch");
  }
  for (const [index, entry] of migrations.entries()) {
    const [, version, name] = /\/(\d{14})_([a-z_]+)\.sql$/.exec(entry.path);
    const row = rows[index];
    if (row.version !== version || row.name !== name || Number(row.statement_count) !== 1
      || row.statement_sha256 !== entry.sha256) throw new Error(scope + "_remote_ledger_identity_mismatch:" + version);
  }
}

export function verifyNov14AdminLedger(rows) {
  verifyAdminLedger(rows, NOV14_ADMIN_MIGRATIONS, "nov14_admin");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [planPath, workdir] = process.argv.slice(2);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const scopes = [
    ["nov14_admin", plan.preappliedNov14AdminMigrations, NOV14_ADMIN_MIGRATIONS],
    ["nov16_eat", plan.preappliedNov16EatMigrations, NOV16_EAT_MIGRATIONS],
  ];
  for (const [scope, planned, expected] of scopes) {
    if (!planned?.length) continue;
    if (JSON.stringify(planned) !== JSON.stringify(expected)) throw new Error(scope + "_plan_scope_invalid");
    const versions = expected.map(({ path }) => "'" + path.split("/").at(-1).slice(0, 14) + "'").join(",");
    const query = `select version,name,cardinality(statements) as statement_count,
      encode(sha256(convert_to(array_to_string(statements,chr(10)),'UTF8')),'hex') as statement_sha256
      from supabase_migrations.schema_migrations where version in (${versions}) order by version`;
    const args = ["db", "query", "--linked", "--agent=no", "--output", "json", query];
    if (workdir) args.unshift("--workdir", workdir);
    const output = JSON.parse(execFileSync("supabase", args, { encoding: "utf8" }));
    verifyAdminLedger(Array.isArray(output) ? output : output.result, expected, scope);
    console.log(`${expected.length} existing ${scope} migration hashes verified read-only`);
  }
}
