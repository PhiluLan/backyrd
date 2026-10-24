#!/usr/bin/env bash
# Additional local synthetic test; never changes the canonical DB gate or production.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cli="${BACKYRD_TEST_SUPABASE_CLI:?pinned local Supabase CLI path required}"
test "$("$cli" --version)" = 2.80.0
fixture="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-isolated-research.XXXXXX")"
cleanup() { "$cli" stop --workdir "$fixture/workspace" --no-backup > /dev/null 2>&1 || true; rm -rf "$fixture"; }
trap cleanup EXIT
node "$repo_root/scripts/deployment/supabase-production-plan.mjs" --base-sha 018fd76c3c6b76c7e558fa5e6f84c89d421f05f9 --head-sha HEAD --output "$fixture/plan.json"
cd "$repo_root"
node scripts/deployment/isolated-research-migration.mjs "$fixture/plan.json" "$fixture/workspace"
local_root="$fixture/workspace"
python3 - "$local_root/supabase/config.toml" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]);s=p.read_text();s=re.sub(r'^project_id = .*','project_id = "backyrd-isolated-research-test"',s,flags=re.M)
for old,new in [(54321,57501),(54322,57502),(54320,57500),(54329,57509),(54323,57503),(54324,57504),(54327,57507)]:s=s.replace(f'= {old}',f'= {new}')
s=s.replace('[db.seed]\nenabled = true','[db.seed]\nenabled = false');p.write_text(s)
PY
# Historical data operations are excluded in the unchanged canonical harness too.
while IFS= read -r file; do rm "$local_root/supabase/migrations/$file"; done < <(jq -r '.[].file' supabase/historical-data-operations.json)
mv "$local_root/supabase/migrations" "$local_root/supabase/pending"
mkdir "$local_root/supabase/migrations"
"$cli" start --workdir "$local_root" --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta --agent=no
DB_URL=postgresql://postgres:postgres@127.0.0.1:57502/postgres
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'alter default privileges for role postgres in schema public revoke all on functions from anon,authenticated,service_role; alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated,service_role; alter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated,service_role;'
for file in "$local_root"/supabase/pending/*.sql; do name="$(basename "$file")"; if [[ "$name" < 20260808120518 ]]; then mv "$file" "$local_root/supabase/migrations/"; fi; done
"$cli" migration up --workdir "$local_root" --local --include-all --agent=no
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role; alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role; alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;'
for file in "$local_root"/supabase/pending/*.sql; do mv "$file" "$local_root/supabase/migrations/"; done
"$cli" migration up --workdir "$local_root" --local --include-all --agent=no
for test in world_research_current_profile_import_v3.sql world_research_reviewed_import_v2.sql; do psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$repo_root/supabase/tests/$test"; done
psql "$DB_URL" -X --set ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version in ('20261020184245','20261020185443','20261020192107','20261020195933')) then raise exception 'Booking migration unexpectedly applied'; end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261024113000') then raise exception 'Research migration missing'; end if;
end $$;
SQL
printf 'ISOLATED_RESEARCH_INSTALL_AND_IMPORT_PASS\n'
