#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
supabase_cli="$repo_root/node_modules/.bin/supabase"
if test ! -x "$supabase_cli"; then supabase_cli="$(command -v supabase || true)"; fi
test -x "$supabase_cli" || { printf 'Supabase CLI is missing.\n' >&2; exit 1; }
test "$($supabase_cli --version)" = "2.80.0" || { printf 'Expected Supabase CLI 2.80.0 for verified ACL denial runtime.\n' >&2; exit 1; }

base_sha="${BASE_SHA:-}"
if test -n "$base_sha"; then
  git -C "$repo_root" merge-base --is-ancestor "$base_sha" HEAD || { printf 'Database candidate does not descend from base.\n' >&2; exit 1; }
fi
if test -n "$base_sha"; then
  node "$repo_root/scripts/ci/validate-database-lineage.mjs" --base-sha "$base_sha"
else
  node "$repo_root/scripts/ci/validate-database-lineage.mjs"
fi
"$repo_root/scripts/ci/validate-migrations.sh"
"$repo_root/scripts/ci/validate-trust-platform-consumers.sh"

validation_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-current-db.XXXXXX")"
project_suffix="${GITHUB_RUN_ID:-$$}"
project_id="backyrd-current-${project_suffix//[^a-zA-Z0-9-]/-}"
numeric_suffix="${project_suffix//[^0-9]/}"; numeric_suffix="${numeric_suffix:-$$}"
port_base=$((57000 + (numeric_suffix % 30) * 20))
started=false
keep_running="${BACKYRD_KEEP_SUPABASE_RUNNING:-false}"
cleanup() {
  if test "$keep_running" = true; then
    printf 'Disposable local Supabase kept running at %s. Stop it with: %s stop --workdir %s --no-backup\n' "$API_URL" "$supabase_cli" "$validation_root"
    return
  fi
  if test "$started" = true; then "$supabase_cli" stop --workdir "$validation_root" --no-backup >/dev/null 2>&1 || true; fi
  case "$validation_root" in
    "${TMPDIR:-/tmp}"/backyrd-current-db.*|/tmp/backyrd-current-db.*) rm -rf "$validation_root" ;;
    *) printf 'Refusing unexpected cleanup path: %s\n' "$validation_root" >&2 ;;
  esac
}
trap cleanup EXIT

mkdir -p "$validation_root/supabase"
cp "$repo_root/supabase/config.toml" "$validation_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$validation_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$validation_root/supabase/canonical"
cp -R "$repo_root/supabase/tests" "$validation_root/supabase/tests"
while IFS= read -r operation; do rm "$validation_root/supabase/migrations/$operation"; done < <(jq -r '.[].file' "$repo_root/supabase/historical-data-operations.json")

mv "$validation_root/supabase/migrations" "$validation_root/supabase/migrations.pending"
mkdir "$validation_root/supabase/migrations"
sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$validation_root/supabase/config.toml"
sed -i.bak \
  -e "s/port = 54321/port = $((port_base + 1))/" \
  -e "s/port = 54322/port = $((port_base + 2))/" \
  -e "s/shadow_port = 54320/shadow_port = $port_base/" \
  -e "s/port = 54329/port = $((port_base + 9))/" \
  -e "s/port = 54323/port = $((port_base + 3))/" \
  -e "s/port = 54324/port = $((port_base + 4))/" \
  -e "s/port = 54327/port = $((port_base + 7))/" \
  "$validation_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$validation_root/supabase/config.toml"
rm -f "$validation_root/supabase/config.toml.bak"
if rg -q 'hjgcrrzfjchzqoegcywn' "$validation_root/supabase/config.toml" "$validation_root/supabase/.temp" 2>/dev/null; then
  printf 'Production project reference detected in disposable workspace.\n' >&2; exit 1
fi

start_log="$validation_root/supabase-start.log"
if ! "$supabase_cli" start --workdir "$validation_root" --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta --agent=no >"$start_log" 2>&1; then
  sed -E -e 's#postgresql://[^[:space:]]+#postgresql://[REDACTED]#g' -e 's#sb_(publishable|secret)_[A-Za-z0-9_-]+#[REDACTED_LOCAL_KEY]#g' "$start_log" >&2
  exit 1
fi
started=true
db_image="$(docker inspect --format '{{.Config.Image}}' "supabase_db_$project_id")"
case "$db_image" in *:17.6.1.095) ;; *) printf 'Unverified ACL-test runtime: %s\n' "$db_image" >&2; exit 1 ;; esac
status_env="$validation_root/supabase-status.env"
"$supabase_cli" status --workdir "$validation_root" -o env --agent=no >"$status_env"
set -a
# shellcheck disable=SC1090
source "$status_env"
set +a
: "${DB_URL:?Supabase local status did not return DB_URL}"
ADMIN_DB_URL="$(printf '%s' "$DB_URL" | sed 's#postgresql://postgres:#postgresql://supabase_admin:#')"

psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
alter default privileges for role postgres in schema public revoke all on functions from anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated,service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated,service_role;
SQL
while IFS= read -r file; do mv "$file" "$validation_root/supabase/migrations/"; done < <(
  find "$validation_root/supabase/migrations.pending" -maxdepth 1 -type f -name '*.sql' | while IFS= read -r file; do
    version="$(basename "$file" | cut -d_ -f1)"; if [[ "$version" < 20260808120518 ]]; then printf '%s\n' "$file"; fi
  done | sort
)
"$supabase_cli" migration up --workdir "$validation_root" --local --include-all --agent=no
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
SQL
while IFS= read -r file; do mv "$file" "$validation_root/supabase/migrations/"; done < <(find "$validation_root/supabase/migrations.pending" -maxdepth 1 -type f -name '*.sql' | sort)
rmdir "$validation_root/supabase/migrations.pending"
"$supabase_cli" migration up --workdir "$validation_root" --local --include-all --agent=no

psql "$ADMIN_DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction --file "$validation_root/supabase/canonical/storage.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction --file "$validation_root/supabase/canonical/auth_hooks.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction --file "$validation_root/supabase/canonical/realtime.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
select vault.create_secret('ci-placeholder', 'backyrd_project_url');
select vault.create_secret('ci-placeholder', 'backyrd_publishable_key');
select vault.create_secret('ci-placeholder', 'backyrd_service_role_key');
select vault.create_secret('ci-placeholder', 'backyrd_safety_text_worker_secret');
select vault.create_secret('ci-placeholder', 'backyrd_safety_image_worker_secret');
select vault.create_secret('ci-placeholder', 'backyrd_message_push_webhook_secret');
SQL
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction --file "$validation_root/supabase/canonical/cron.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction --file "$validation_root/supabase/canonical/webhooks.sql"

actual_acl="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --file "$repo_root/scripts/ci/public-acl-fingerprint.sql")"
schema_result="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --file "$repo_root/scripts/ci/application-schema-fingerprint.sql")"
actual_schema="${schema_result##*|}"
test "$(jq -r '.supabase.migrationTip' "$repo_root/delivery/production-state.json")" = "20260909073004_close_review_capture_trust_v2"
test "$(jq -r '.mobile.productionVerified' "$repo_root/delivery/production-state.json")" = "$(jq -r '.reviewMediaIncident.productionVerified' "$repo_root/delivery/production-state.json")"
if test -n "${BACKYRD_DATABASE_SNAPSHOT_OUTPUT:-}"; then
  jq -n --arg publicAclSha256 "$actual_acl" --arg applicationSchemaSha256 "$actual_schema" \
    '{schemaVersion:"backyrd-database-clean-boot-snapshot-v1",publicAclSha256:$publicAclSha256,applicationSchemaSha256:$applicationSchemaSha256}' \
    >"$BACKYRD_DATABASE_SNAPSHOT_OUTPUT"
fi
node "$repo_root/scripts/ci/validate-database-release.mjs" \
  --base-sha "${base_sha:-HEAD}" --head-sha HEAD \
  --actual-public-acl "$actual_acl" --actual-application-schema "$actual_schema"

find "$validation_root/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | sed -E 's/^([0-9]{14})_.*/\1/' | sort >"$validation_root/expected-versions.txt"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command 'select version from supabase_migrations.schema_migrations order by version;' >"$validation_root/actual-versions.txt"
diff -u "$validation_root/expected-versions.txt" "$validation_root/actual-versions.txt"

psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and not c.relrowsecurity
      and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  ) then raise exception 'anon-accessible public table without RLS'; end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and not c.relrowsecurity
      and has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  ) then raise exception 'authenticated-accessible public table without RLS'; end if;
end $$;
SQL

core_tests=(
  sprint8_integrity_case_lifecycle.sql sprint8_review_authenticity_acceptance.sql
  sprint9_account_trust_engine.sql sprint9_1_identity_trust_signals.sql sprint9_2_behaviour_trust_signals.sql
  sprint9_3_network_trust_signals.sql sprint9_4_security_trust_signals.sql sprint9_5_owner_trust_signals.sql
  sprint9_6_reputation_trust_signals.sql sprint9_final_account_trust_integration.sql
  sprint10_distribution_trust_foundation.sql sprint10_distribution_policy_consumption.sql sprint10_final_trust_platform_acceptance.sql
  sprint11_governance_acceptance.sql sprint12_adversarial_platform_validation.sql sprint_decision_product_eligibility.sql
  decision_lab_foundation.sql decision_wave3a_taste_foundation.sql decision_n2_memory_user_intelligence.sql decision_n4_spot_intelligence.sql
  founder_control_center_v1.sql basel_gold_data_foundation.sql city_bootstrap_spot_intelligence_v1.sql
  spot_research_entity_scope_v2_5.sql spot_research_entity_instance_scope_v2_6.sql spot_research_entity_redirect_v2_7.sql
  spot_research_redirect_runtime_v2_8.sql city_bootstrap_website_identity_v1.sql
  spot_intelligence_machine_acceptance_v1.sql intelligence_operational_revalidation_v1.sql intelligence_population_automation_v1.sql
  spot_research_run_scoped_claim_v1.sql spot_research_provider_concurrency_bound_v1.sql
  canonical_product_mood_v1.sql mood_founder_acceptance_closure_v1.sql mood_final_founder_closure_v1.sql
  events_v1_basel_pilot.sql events_v1_manual_recurrence_horizon.sql
  restaurant_information_v1_positive.sql restaurant_information_v1_negative.sql review_media_atomic_v1.sql
)
executed_tests="$validation_root/executed-tests.txt"
: >"$executed_tests"
for test_name in "${core_tests[@]}"; do
  psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$validation_root/supabase/tests/$test_name"
  printf 'supabase/tests/%s\n' "$test_name" >>"$executed_tests"
done
if test -n "${BACKYRD_CHANGED_DATABASE_TESTS_FILE:-}" && test -f "$BACKYRD_CHANGED_DATABASE_TESTS_FILE"; then
  while IFS= read -r test_path; do
    test -z "$test_path" && continue
    [[ "$test_path" =~ ^supabase/tests/[a-z0-9_]+\.sql$ ]] || { printf 'Invalid selected database test: %s\n' "$test_path" >&2; exit 1; }
    grep -Fx "$test_path" "$executed_tests" >/dev/null || psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$validation_root/$test_path"
  done <"$BACKYRD_CHANGED_DATABASE_TESTS_FILE"
fi
DB_URL="$DB_URL" bash "$repo_root/scripts/ci/validate-world-knowledge-rebuild-race.sh"
DB_URL="$DB_URL" bash "$repo_root/scripts/ci/validate-review-same-day-race.sh"

lint_json="$validation_root/db-lint.json"
"$supabase_cli" db lint --workdir "$validation_root" --local --schema public --level error --fail-on none --agent=no >"$lint_json"
jq -r '.[] | .function as $function | .issues[] | [$function, .sqlState, .message] | @tsv' "$lint_json" | sort >"$validation_root/db-lint-actual.txt"
printf '%s\n' \
  $'public.follow_spot_v1\t42702\tcolumn reference "spot_id" is ambiguous' \
  $'public.upsert_my_owned_spot_content_v1\t42702\tcolumn reference "spot_id" is ambiguous' >"$validation_root/db-lint-expected.txt"
diff -u "$validation_root/db-lint-expected.txt" "$validation_root/db-lint-actual.txt"
printf 'Current candidate clean boot passed: migration lineage, semantic schema/ACL, SQL behavior, negative authorization and DB lint.\n'
if test "$keep_running" = true; then
  # The disposable database is owned by supabase_admin. Use that local-only
  # administrative connection for the opt-in database setting; application
  # roles still cannot alter or bypass the gate.
  psql "$ADMIN_DB_URL" -X --set ON_ERROR_STOP=1 --command "alter database postgres set app.world_knowledge_founder_authoring_enabled='on'" >/dev/null
  # PostgREST keeps pooled database sessions. Restart only this disposable
  # project's REST container so every new request inherits the opt-in setting.
  docker restart "supabase_rest_$project_id" >/dev/null
  for attempt in {1..20}; do
    # The image does not declare a Docker healthcheck. Any HTTP response from
    # the local REST endpoint proves that the listener and DB pool are ready.
    if curl --silent --output /dev/null "$REST_URL/"; then break; fi
    if test "$attempt" = 20; then printf 'Local PostgREST did not become ready after enabling Founder authoring.\n' >&2; exit 1; fi
    sleep 0.5
  done
  env API_URL="$API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" ANON_KEY="$ANON_KEY" node "$repo_root/scripts/world-knowledge/seed-local-authoring.mjs"
  runtime_env="${TMPDIR:-/tmp}/backyrd-world-authoring-local.env"
  umask 077
  {
    printf 'NEXT_PUBLIC_SUPABASE_URL=%q\n' "$API_URL"
    printf 'NEXT_PUBLIC_SUPABASE_ANON_KEY=%q\n' "$ANON_KEY"
    printf 'SUPABASE_SERVICE_ROLE_KEY=%q\n' "$SERVICE_ROLE_KEY"
    printf 'BACKYRD_LOCAL_SUPABASE_WORKDIR=%q\n' "$validation_root"
  } >"$runtime_env"
  printf 'Local app environment written with owner-only permissions: %s\n' "$runtime_env"
fi
