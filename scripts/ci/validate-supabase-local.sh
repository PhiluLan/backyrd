#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
supabase_cli="$repo_root/node_modules/.bin/supabase"
if test ! -x "$supabase_cli"; then
  supabase_cli="$(command -v supabase || true)"
fi
if test -z "$supabase_cli" || test ! -x "$supabase_cli"; then
  printf 'Supabase CLI is missing; install the repository dependency or the CI-pinned CLI.\n' >&2
  exit 1
fi
if test "$($supabase_cli --version)" != "2.80.0"; then
  printf 'Uncertified Supabase CLI version; expected exactly 2.80.0.\n' >&2
  exit 1
fi
validation_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-supabase-ci.XXXXXX")"
project_suffix="${GITHUB_RUN_ID:-$$}"
project_id="backyrd-ci-${project_suffix//[^a-zA-Z0-9-]/-}"
numeric_suffix="${project_suffix//[^0-9]/}"
numeric_suffix="${numeric_suffix:-$$}"
port_base=$((56000 + (numeric_suffix % 40) * 20))
started=false

cleanup() {
  if test "$started" = true; then
    "$supabase_cli" stop --workdir "$validation_root" --no-backup >/dev/null 2>&1 || true
  fi
  case "$validation_root" in
    "${TMPDIR:-/tmp}"/backyrd-supabase-ci.*|/tmp/backyrd-supabase-ci.*)
      rm -rf "$validation_root"
      ;;
    *)
      printf 'Refusing to remove unexpected validation path: %s\n' "$validation_root" >&2
      ;;
  esac
}
trap cleanup EXIT

"$repo_root/scripts/ci/validate-migrations.sh"
"$repo_root/scripts/ci/validate-trust-platform-consumers.sh"

mkdir -p "$validation_root/supabase"
cp "$repo_root/supabase/config.toml" "$validation_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$validation_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$validation_root/supabase/canonical"
cp -R "$repo_root/supabase/tests" "$validation_root/supabase/tests"

# Exact-row Production cleanups are immutable historical evidence, not schema
# bootstrap steps. Their hashes and later schema reconciliation are validated by
# validate-migrations.sh before this disposable zero-data bootstrap is built.
while IFS= read -r operation; do
  rm "$validation_root/supabase/migrations/$operation"
done < <(jq -r '.[].file' "$repo_root/supabase/historical-data-operations.json")
printf 'Excluded %s immutable historical Production data operations from zero-data bootstrap.\n' \
  "$(jq 'length' "$repo_root/supabase/historical-data-operations.json")"

# A pg_dump-style canonical baseline encodes ACL differences from PostgreSQL's
# standard defaults. Supabase local adds broad anon/authenticated defaults before
# migrations, which would silently grant privileges that the baseline never
# intended. Start empty and neutralize those defaults only through the canonical
# dump baseline. Restore the provider defaults before replaying forward-authored
# migrations, which were written and applied under the Supabase defaults.
mv "$validation_root/supabase/migrations" "$validation_root/supabase/migrations.pending"
mkdir "$validation_root/supabase/migrations"

sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" \
  "$validation_root/supabase/config.toml"
sed -i.bak \
  -e "s/port = 54321/port = $((port_base + 1))/" \
  -e "s/port = 54322/port = $((port_base + 2))/" \
  -e "s/shadow_port = 54320/shadow_port = $port_base/" \
  -e "s/port = 54329/port = $((port_base + 9))/" \
  -e "s/port = 54323/port = $((port_base + 3))/" \
  -e "s/port = 54324/port = $((port_base + 4))/" \
  -e "s/port = 54327/port = $((port_base + 7))/" \
  "$validation_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' \
  "$validation_root/supabase/config.toml"
rm -f "$validation_root/supabase/config.toml.bak"

test ! -e "$validation_root/supabase/.temp/project-ref"
if rg -q 'hjgcrrzfjchzqoegcywn' "$validation_root"; then
  printf 'Production project reference detected in disposable workspace.\n' >&2
  exit 1
fi

start_log="$validation_root/supabase-start.log"
if ! "$supabase_cli" start \
  --workdir "$validation_root" \
  --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta \
  --agent=no > "$start_log" 2>&1; then
  sed -E \
    -e 's#postgresql://[^[:space:]]+#postgresql://[REDACTED]#g' \
    -e 's#sb_(publishable|secret)_[A-Za-z0-9_-]+#[REDACTED_LOCAL_KEY]#g' \
    -e 's#(Publishable|Secret Key|Access Key|Secret)[[:space:]]+.*#\1 [REDACTED]#' \
    "$start_log" >&2
  exit 1
fi
printf 'Disposable Supabase stack started with project id %s.\n' "$project_id"
started=true

# postgres 17.6.1.104-.106 have a confirmed supautils SIGSEGV in the
# permission-denied path for Supabase's reserved anon/authenticated roles.
# Those runtime denials are security assertions here, so require the last
# verified clean local image instead of accepting a crashing test harness.
db_image="$(docker inspect --format '{{.Config.Image}}' "supabase_db_$project_id")"
case "$db_image" in
  *:17.6.1.095) ;;
  *) printf 'Uncertified local PostgreSQL ACL-test runtime detected: %s\n' "$db_image" >&2;exit 1 ;;
esac

status_env="$validation_root/supabase-status.env"
"$supabase_cli" status --workdir "$validation_root" -o env --agent=no > "$status_env"
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
while IFS= read -r baseline_file; do
  mv "$baseline_file" "$validation_root/supabase/migrations/"
done < <(
  find "$validation_root/supabase/migrations.pending" -maxdepth 1 -type f -name '*.sql' \
    | while IFS= read -r file; do
        version="$(basename "$file" | cut -d_ -f1)"
        if [[ "$version" < 20260808120518 ]]; then printf '%s\n' "$file"; fi
      done | sort
)
"$supabase_cli" migration up --workdir "$validation_root" --local --include-all --agent=no
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
SQL

while IFS= read -r forward_file; do
  mv "$forward_file" "$validation_root/supabase/migrations/"
done < <(find "$validation_root/supabase/migrations.pending" -maxdepth 1 -type f -name '*.sql' | sort)
rmdir "$validation_root/supabase/migrations.pending"
"$supabase_cli" migration up --workdir "$validation_root" --local --include-all --agent=no

psql "$ADMIN_DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction \
  --file "$validation_root/supabase/canonical/storage.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction \
  --file "$validation_root/supabase/canonical/auth_hooks.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction \
  --file "$validation_root/supabase/canonical/realtime.sql"

psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction >/dev/null <<'SQL'
select vault.create_secret('ci-placeholder', 'backyrd_project_url');
select vault.create_secret('ci-placeholder', 'backyrd_publishable_key');
select vault.create_secret('ci-placeholder', 'backyrd_service_role_key');
select vault.create_secret('ci-placeholder', 'backyrd_safety_text_worker_secret');
select vault.create_secret('ci-placeholder', 'backyrd_safety_image_worker_secret');
select vault.create_secret('ci-placeholder', 'backyrd_message_push_webhook_secret');
SQL

psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction \
  --file "$validation_root/supabase/canonical/cron.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --single-transaction \
  --file "$validation_root/supabase/canonical/webhooks.sql"

expected_acl_fingerprint="$(tr -d '[:space:]' < "$repo_root/supabase/canonical/public-acl.sha256")"
actual_acl_fingerprint="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --file "$repo_root/scripts/ci/public-acl-fingerprint.sql")"
acl_mismatch=false
test "$actual_acl_fingerprint" = "$expected_acl_fingerprint" || {
  printf 'Public ACL fingerprint: expected %s, got %s\n' \
    "$expected_acl_fingerprint" "$actual_acl_fingerprint" >&2
  if test "${BACKYRD_DIAGNOSTIC_CONTINUE_AFTER_ACL_MISMATCH:-false}" = true; then
    acl_mismatch=true
  else
    exit 1
  fi
}

expected_versions=()
while IFS= read -r version; do
  expected_versions+=("$version")
done < <(
  find "$validation_root/supabase/migrations" -maxdepth 1 -type f -name '*.sql' \
    -exec basename {} \; | sed -E 's/^([0-9]{14})_.*/\1/' | sort
)
actual_versions=()
while IFS= read -r version; do
  actual_versions+=("$version")
done < <(
  psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --command 'select version from supabase_migrations.schema_migrations order by version;'
)
diff -u \
  <(printf '%s\n' "${expected_versions[@]}") \
  <(printf '%s\n' "${actual_versions[@]}")

assert_count() {
  local expected="$1"
  local label="$2"
  local query="$3"
  local actual
  actual="$(psql "$DB_URL" -X --set ON_ERROR_STOP=1 --tuples-only --no-align --command "$query")"
  test "$actual" = "$expected" || {
    printf '%s: expected %s, got %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  }
}

assert_count 1 'auth.users lifecycle trigger' \
  "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where n.nspname='auth' and c.relname='users' and not t.tgisinternal and t.tgenabled <> 'D' and pn.nspname='public' and p.proname='handle_new_user';"
assert_count 10 'canonical cron jobs' \
  "select count(*) from cron.job where active and (command like '%/functions/v1/generate-spot-embeddings%' or command like '%/functions/v1/safety-text-worker%' or command like '%/functions/v1/safety-image-worker%' or jobname in ('backyrd-account-trust-identity-daily','backyrd-account-trust-behaviour-daily','backyrd-account-trust-network-daily','backyrd-account-trust-security-15m','backyrd-account-trust-owner-daily','backyrd-account-trust-reputation-daily','backyrd-distribution-trust-every-5m'));"
assert_count 1 'message push webhook trigger' \
  "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and c.relname='message_push_outbox' and not t.tgisinternal and t.tgenabled <> 'D' and p.proname='send_message_push_webhook_v1';"
assert_count 1 'Realtime messages publication' \
  "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages';"
assert_count 7 'canonical Storage buckets' \
  "select count(*) from storage.buckets where id in ('badges','chat-uploads','data-rights-exports','profile-photos','review-photos','social-post-media','spot-photos');"
assert_count 19 'canonical Storage policies' \
  "select count(*) from pg_policies where schemaname='storage' and tablename in ('buckets','objects');"
assert_count 1 'User Intelligence runtime settings RLS' \
  "select count(*) from pg_class where oid='public.backyrd_user_intelligence_runtime_settings_v1'::regclass and relrowsecurity;"
assert_count 0 'User Intelligence runtime settings client grants' \
  "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='backyrd_user_intelligence_runtime_settings_v1' and grantee in ('PUBLIC','anon','authenticated');"
assert_count 1 'fixture-safe Admin intelligence projection' \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_spots_intelligence_v1' and position('s.data_origin not in (''TEST'',''FIXTURE'')' in p.prosrc)>0;"
assert_count 1 'fixture-safe Admin readiness projection' \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_spot_readiness_worklist_v1' and position('s.data_origin not in (''TEST'',''FIXTURE'')' in p.prosrc)>0;"
assert_count 1 'Admin all-status Product Spot policy' \
  "select count(*) from pg_policies where schemaname='public' and tablename='spots' and policyname='spots_select_internal_admin_product_all_status_v1';"
assert_count 0 'client RLS calls to service-only arbitrary-user consent helper' \
  "select count(*) from pg_policies where schemaname='public' and coalesce(qual,'') like '%user_has_active_consent_v1%';"

psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint8_integrity_case_lifecycle.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint8_review_authenticity_acceptance.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_account_trust_engine.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_1_identity_trust_signals.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_2_behaviour_trust_signals.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_3_network_trust_signals.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_4_security_trust_signals.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_5_owner_trust_signals.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_6_reputation_trust_signals.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint9_final_account_trust_integration.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint10_distribution_trust_foundation.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint10_distribution_policy_consumption.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint10_final_trust_platform_acceptance.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint11_governance_acceptance.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint12_adversarial_platform_validation.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/sprint_decision_product_eligibility.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/decision_lab_foundation.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/decision_wave3a_taste_foundation.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/decision_n2_memory_user_intelligence.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/decision_n4_spot_intelligence.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/founder_control_center_v1.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/basel_gold_data_foundation.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/city_bootstrap_spot_intelligence_v1.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/spot_research_entity_scope_v2_5.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/spot_research_entity_instance_scope_v2_6.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/spot_research_entity_redirect_v2_7.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/spot_research_redirect_runtime_v2_8.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/city_bootstrap_website_identity_v1.sql"
# Exercise denied calls in isolated sessions. A permission failure is required;
# keeping these outside the main test transaction also detects backend crashes.
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role anon;select public.backyrd_machine_accept_v1('61000000-0000-4000-8000-000000000099'::uuid,'backyrd-machine-acceptance-v1'::text,repeat('0',64)::text);" >/dev/null 2>&1;then
  printf 'anon unexpectedly executed machine acceptance.\n' >&2;exit 1
fi
if ! psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'select 1' >/dev/null 2>&1;then
  printf 'Database backend became unhealthy after the anon denial probe.\n' >&2
  docker logs --tail 120 "supabase_db_$project_id" >&2 || true
  exit 1
fi
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role authenticated;select public.backyrd_machine_accept_v1('61000000-0000-4000-8000-000000000099'::uuid,'backyrd-machine-acceptance-v1'::text,repeat('0',64)::text);" >/dev/null 2>&1;then
  printf 'authenticated/admin browser unexpectedly executed machine acceptance.\n' >&2;exit 1
fi
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/spot_intelligence_machine_acceptance_v1.sql"
# Keep the new service-only gateway denial probes outside the fixture
# transaction so a backend crash can never be mistaken for an ACL PASS.
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role anon;select public.backyrd_revalidate_intelligence_operational_batch_v1('62000000-0000-4000-8000-000000000004'::uuid,'backyrd-machine-acceptance-v1',1);" >/dev/null 2>&1;then
  printf 'anon unexpectedly executed operational revalidation.\n' >&2;exit 1
fi
if ! psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'select 1' >/dev/null 2>&1;then
  printf 'Database backend became unhealthy after the operational revalidation anon denial probe.\n' >&2
  docker logs --tail 120 "supabase_db_$project_id" >&2 || true
  exit 1
fi
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role authenticated;select public.backyrd_revalidate_intelligence_operational_batch_v1('62000000-0000-4000-8000-000000000004'::uuid,'backyrd-machine-acceptance-v1',1);" >/dev/null 2>&1;then
  printf 'authenticated/admin browser unexpectedly executed operational revalidation.\n' >&2;exit 1
fi
if ! psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'select 1' >/dev/null 2>&1;then
  printf 'Database backend became unhealthy after the operational revalidation authenticated denial probe.\n' >&2
  docker logs --tail 120 "supabase_db_$project_id" >&2 || true
  exit 1
fi
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/intelligence_operational_revalidation_v1.sql"
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role anon;select public.backyrd_intelligence_population_tick_control_v1('61000000-0000-4000-8000-000000000099'::uuid,'CLAIM',gen_random_uuid());" >/dev/null 2>&1;then
  printf 'anon unexpectedly executed Population tick control.\n' >&2;exit 1
fi
if ! psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'select 1' >/dev/null 2>&1;then
  printf 'Database backend became unhealthy after the Population anon denial probe.\n' >&2
  docker logs --tail 120 "supabase_db_$project_id" >&2 || true
  exit 1
fi
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role authenticated;select public.backyrd_intelligence_population_tick_control_v1('61000000-0000-4000-8000-000000000099'::uuid,'CLAIM',gen_random_uuid());" >/dev/null 2>&1;then
  printf 'authenticated/admin browser unexpectedly executed Population tick control.\n' >&2;exit 1
fi
if ! psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'select 1' >/dev/null 2>&1;then
  printf 'Database backend became unhealthy after the Population authenticated denial probe.\n' >&2
  docker logs --tail 120 "supabase_db_$project_id" >&2 || true
  exit 1
fi
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/intelligence_population_automation_v1.sql"
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role anon;select public.backyrd_claim_spot_research_job_v2('anon',60,'71000000-0000-4000-8000-000000000006'::uuid);" >/dev/null 2>&1;then
  printf 'anon unexpectedly executed run-scoped research claim.\n' >&2;exit 1
fi
if ! psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'select 1' >/dev/null 2>&1;then
  printf 'Database backend became unhealthy after the run-scoped anon denial probe.\n' >&2
  docker logs --tail 120 "supabase_db_$project_id" >&2 || true
  exit 1
fi
if psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command "set role authenticated;select public.backyrd_claim_spot_research_job_v2('client',60,'71000000-0000-4000-8000-000000000006'::uuid);" >/dev/null 2>&1;then
  printf 'authenticated/admin browser unexpectedly executed run-scoped research claim.\n' >&2;exit 1
fi
if ! psql "$DB_URL" -X --set ON_ERROR_STOP=1 --command 'select 1' >/dev/null 2>&1;then
  printf 'Database backend became unhealthy after the run-scoped authenticated denial probe.\n' >&2
  docker logs --tail 120 "supabase_db_$project_id" >&2 || true
  exit 1
fi
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/spot_research_run_scoped_claim_v1.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 \
  --file "$validation_root/supabase/tests/spot_research_provider_concurrency_bound_v1.sql"

lint_json="$validation_root/db-lint.json"
"$supabase_cli" db lint \
  --workdir "$validation_root" \
  --local \
  --schema public \
  --level error \
  --fail-on none \
  --agent=no > "$lint_json"

jq -r '.[] | .function as $function | .issues[] | [$function, .sqlState, .message] | @tsv' \
  "$lint_json" | sort > "$validation_root/db-lint-actual.txt"
cat > "$validation_root/db-lint-expected.txt" <<'EOF'
public.follow_spot_v1	42702	column reference "spot_id" is ambiguous
public.spot_is_open_now_safe_v1	42703	column "open_now" does not exist
public.upsert_my_owned_spot_content_v1	42702	column reference "spot_id" is ambiguous
EOF

diff -u "$validation_root/db-lint-expected.txt" "$validation_root/db-lint-actual.txt"
if test "$acl_mismatch" = true; then
  printf 'Diagnostic checks completed, but canonical ACL certification still fails closed.\n' >&2
  exit 1
fi
printf 'Fresh canonical database boot and reviewed DB lint baseline passed.\n'
