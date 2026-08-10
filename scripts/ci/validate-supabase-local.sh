#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
validation_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-supabase-ci.XXXXXX")"
project_suffix="${GITHUB_RUN_ID:-$$}"
project_id="backyrd-ci-${project_suffix//[^a-zA-Z0-9-]/-}"
numeric_suffix="${project_suffix//[^0-9]/}"
numeric_suffix="${numeric_suffix:-$$}"
port_base=$((56000 + (numeric_suffix % 40) * 20))
started=false

cleanup() {
  if test "$started" = true; then
    supabase stop --workdir "$validation_root" --no-backup >/dev/null 2>&1 || true
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

mkdir -p "$validation_root/supabase"
cp "$repo_root/supabase/config.toml" "$validation_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$validation_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$validation_root/supabase/canonical"
cp -R "$repo_root/supabase/tests" "$validation_root/supabase/tests"

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
if ! supabase start \
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

status_env="$validation_root/supabase-status.env"
supabase status --workdir "$validation_root" -o env --agent=no > "$status_env"
set -a
# shellcheck disable=SC1090
source "$status_env"
set +a
: "${DB_URL:?Supabase local status did not return DB_URL}"
ADMIN_DB_URL="$(printf '%s' "$DB_URL" | sed 's#postgresql://postgres:#postgresql://supabase_admin:#')"

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
assert_count 7 'canonical cron jobs' \
  "select count(*) from cron.job where active and (command like '%/functions/v1/generate-spot-embeddings%' or command like '%/functions/v1/safety-text-worker%' or command like '%/functions/v1/safety-image-worker%' or jobname in ('backyrd-account-trust-identity-daily','backyrd-account-trust-behaviour-daily','backyrd-account-trust-network-daily','backyrd-account-trust-security-15m'));"
assert_count 1 'message push webhook trigger' \
  "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and c.relname='message_push_outbox' and not t.tgisinternal and t.tgenabled <> 'D' and p.proname='send_message_push_webhook_v1';"
assert_count 1 'Realtime messages publication' \
  "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages';"
assert_count 7 'canonical Storage buckets' \
  "select count(*) from storage.buckets where id in ('badges','chat-uploads','data-rights-exports','profile-photos','review-photos','social-post-media','spot-photos');"
assert_count 19 'canonical Storage policies' \
  "select count(*) from pg_policies where schemaname='storage' and tablename in ('buckets','objects');"

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
  --file "$validation_root/supabase/tests/founder_control_center_v1.sql"

lint_json="$validation_root/db-lint.json"
supabase db lint \
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
printf 'Fresh canonical database boot and reviewed DB lint baseline passed.\n'
