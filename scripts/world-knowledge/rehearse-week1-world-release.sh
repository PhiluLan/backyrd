#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
supabase_cli="$repo_root/node_modules/.bin/supabase"
test -x "$supabase_cli"
test "$($supabase_cli --version)" = 2.80.0

rehearsal_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-world-week1.XXXXXX")"
project_id="backyrd-world-week1-$$"
port_base=$((58000 + ($$ % 200) * 20))
started=false
cleanup() {
  if test "$started" = true; then "$supabase_cli" stop --workdir "$rehearsal_root" --no-backup >/dev/null 2>&1 || true; fi
  case "$rehearsal_root" in
    "${TMPDIR:-/tmp}"/backyrd-world-week1.*|/tmp/backyrd-world-week1.*) rm -rf "$rehearsal_root" ;;
    *) printf 'Refusing to remove unexpected rehearsal path: %s\n' "$rehearsal_root" >&2 ;;
  esac
}
trap cleanup EXIT

mkdir -p "$rehearsal_root/supabase" "$rehearsal_root/timings"
cp "$repo_root/supabase/config.toml" "$rehearsal_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$rehearsal_root/supabase/migrations.pool"
cp -R "$repo_root/supabase/tests" "$rehearsal_root/supabase/tests"
mkdir "$rehearsal_root/supabase/migrations"

sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$rehearsal_root/supabase/config.toml"
sed -i.bak -e "s/port = 54321/port = $((port_base + 1))/" -e "s/port = 54322/port = $((port_base + 2))/" -e "s/shadow_port = 54320/shadow_port = $port_base/" -e "s/port = 54329/port = $((port_base + 9))/" -e "s/port = 54323/port = $((port_base + 3))/" -e "s/port = 54324/port = $((port_base + 4))/" -e "s/port = 54327/port = $((port_base + 7))/" "$rehearsal_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$rehearsal_root/supabase/config.toml"
rm -f "$rehearsal_root/supabase/config.toml.bak"
if rg -q 'hjgcrrzfjchzqoegcywn' "$rehearsal_root/supabase/config.toml" "$rehearsal_root/supabase/.temp" 2>/dev/null; then
  printf 'Production project reference detected in rehearsal workspace.\n' >&2; exit 1
fi

while IFS= read -r operation; do rm "$rehearsal_root/supabase/migrations.pool/$operation"; done < <(jq -r '.[].file' "$repo_root/supabase/historical-data-operations.json")

plan="$rehearsal_root/plan.json"
node "$repo_root/scripts/world-knowledge/build-week1-production-release-foundation.mjs" --output "${plan#$repo_root/}" 2>/dev/null || cp "$repo_root/.local/world-week1/release-foundation.json" "$plan"
pending=()
while IFS= read -r pending_name; do pending+=("$pending_name"); done < <(jq -r '.migrations[].path | split("/")[-1]' "$plan")
test "${#pending[@]}" = 9

"$supabase_cli" start --workdir "$rehearsal_root" --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta --agent=no >"$rehearsal_root/start.log" 2>&1
started=true
"$supabase_cli" status --workdir "$rehearsal_root" -o env --agent=no >"$rehearsal_root/status.env"
set -a; source "$rehearsal_root/status.env"; set +a
: "${DB_URL:?missing disposable DB_URL}"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
alter default privileges for role postgres in schema public revoke all on functions from anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated,service_role;
SQL
while IFS= read -r file; do mv "$file" "$rehearsal_root/supabase/migrations/"; done < <(find "$rehearsal_root/supabase/migrations.pool" -maxdepth 1 -type f -name '*.sql' | while read -r file; do version="$(basename "$file" | cut -d_ -f1)"; if [[ "$version" < 20260808120518 ]]; then printf '%s\n' "$file"; fi; done | sort)
"$supabase_cli" migration up --workdir "$rehearsal_root" --local --include-all --agent=no >/dev/null
psql "$DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
SQL

for file in "$rehearsal_root"/supabase/migrations.pool/*.sql; do
  name="$(basename "$file")"; skip=false
  for pending_name in "${pending[@]}"; do if test "$name" = "$pending_name"; then skip=true; break; fi; done
  if test "$skip" = false; then mv "$file" "$rehearsal_root/supabase/migrations/"; fi
done
"$supabase_cli" migration up --workdir "$rehearsal_root" --local --include-all --agent=no >/dev/null

# Production-shaped public Spot volume. No private or Production data is used.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
insert into public.spots(id,name,lat,lng,status,city,country,data_origin)
select (substr(md5('world-week1-'||n),1,8)||'-'||substr(md5('world-week1-'||n),9,4)||'-4'||substr(md5('world-week1-'||n),14,3)||'-8'||substr(md5('world-week1-'||n),18,3)||'-'||substr(md5('world-week1-'||n),21,12))::uuid,
       'Synthetic World Week 1 '||n,47.5+(n%20)/1000.0,7.5+(n%20)/1000.0,'approved','Basel','CH','TEST'
from generate_series(1,1000) n;
SQL

timings='[]'
for index in "${!pending[@]}"; do
  name="${pending[$index]}"; source_file="$rehearsal_root/supabase/migrations.pool/$name"
  test -f "$source_file"; mv "$source_file" "$rehearsal_root/supabase/migrations/"
  before="$(node -e 'process.stdout.write(String(Date.now()))')"
  "$supabase_cli" migration up --workdir "$rehearsal_root" --local --include-all --agent=no >/dev/null
  after="$(node -e 'process.stdout.write(String(Date.now()))')"
  duration=$((after-before))
  timings="$(jq -c --arg path "supabase/migrations/$name" --argjson order "$((index+1))" --argjson duration "$duration" '. + [{order:$order,path:$path,durationMilliseconds:$duration}]' <<<"$timings")"
done
rmdir "$rehearsal_root/supabase/migrations.pool"

for test_file in world_knowledge_slice3b.sql world_knowledge_slice4a_authoring.sql world_knowledge_slice4a_legacy_import.sql world_knowledge_slice4a_product_readiness.sql world_knowledge_slice4a_registry2.sql world_knowledge_slice4b_contextual.sql; do
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 --file "$rehearsal_root/supabase/tests/$test_file" >/dev/null
done
DB_URL="$DB_URL" "$repo_root/scripts/ci/validate-world-knowledge-rebuild-race.sh" >/dev/null

ledger_count="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atc "select count(*) from supabase_migrations.schema_migrations where version >= '20260910174419';")"
private_exposure="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atc "select count(*) from information_schema.role_table_grants where table_schema='world_knowledge_private' and grantee in ('PUBLIC','anon','authenticated');")"
definer_without_empty_path="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='world_knowledge_private' or (n.nspname='public' and p.proname like 'world_%')) and p.prosecdef and not coalesce(p.proconfig,'{}') @> array['search_path=\"\"'];")"
test "$ledger_count" = 9
test "$private_exposure" = 0
test "$definer_without_empty_path" = 0

# Exact replay must be a no-op.
replay_output="$("$supabase_cli" migration up --workdir "$rehearsal_root" --local --include-all --agent=no 2>&1)"
grep -q 'Local database is up to date' <<<"$replay_output"

backup_restore='NOT_REQUESTED'
backup_bytes=0
if test "${WORLD_WEEK2_BACKUP_RESTORE:-false}" = true; then
  backup_file="$rehearsal_root/world-week2-backup.dump"
  database_container="supabase_db_$project_id"
  docker exec "$database_container" pg_dump -U postgres -d postgres --schema=world_knowledge_private --format=custom --no-owner --no-acl --file=/tmp/world-week2-backup.dump
  docker cp "$database_container:/tmp/world-week2-backup.dump" "$backup_file" >/dev/null
  backup_bytes="$(wc -c <"$backup_file" | tr -d ' ')"
  original_world_tables="$(docker exec "$database_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atc "select count(*) from information_schema.tables where table_schema='world_knowledge_private';")"
  original_claims="$(docker exec "$database_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from world_knowledge_private.claims;')"
  docker exec "$database_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -c 'drop schema world_knowledge_private cascade;' >/dev/null
  docker exec "$database_container" pg_restore -U postgres -d postgres --no-owner --no-acl /tmp/world-week2-backup.dump
  restored_ledger="$(docker exec "$database_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atc "select count(*) from supabase_migrations.schema_migrations where version >= '20260910174419';")"
  restored_world_tables="$(docker exec "$database_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atc "select count(*) from information_schema.tables where table_schema='world_knowledge_private';")"
  restored_claims="$(docker exec "$database_container" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from world_knowledge_private.claims;')"
  test "$restored_ledger" = 9
  test "$restored_world_tables" = "$original_world_tables"
  test "$restored_claims" = "$original_claims"
  backup_restore='PASS'
fi

result="$(jq -n --arg project "$project_id" --arg image "$(docker inspect --format '{{.Config.Image}}' "supabase_db_$project_id")" --argjson syntheticSpots 1000 --argjson timings "$timings" --argjson ledger "$ledger_count" --argjson privateExposure "$private_exposure" --argjson unsafeDefiners "$definer_without_empty_path" --arg backupRestore "$backup_restore" --argjson backupBytes "$backup_bytes" '{schemaVersion:"backyrd.world-knowledge.week1-rehearsal@1",environment:"DISPOSABLE_LOCAL",productionConnection:false,projectId:$project,databaseImage:$image,syntheticSpotCount:$syntheticSpots,migrationTimings:$timings,migrationLedgerCount:$ledger,privateClientGrantCount:$privateExposure,securityDefinerWithoutEmptySearchPath:$unsafeDefiners,worldSqlSuites:6,parallelRebuildCases:["SAME_KEY","CROSS_KEY_SAME_INPUT","DISTINCT_INPUT_MONOTONE_POINTER"],replay:"NO_OP",backupRestore:$backupRestore,backupBytes:$backupBytes,executionAuthorized:false}')"
printf '%s\n' "$result"
