#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-d3-1.XXXXXX")"
project_id="backyrd-d3-1-${$}"
port_base=$((57400 + ($$ % 50) * 20))
started=false

cleanup() {
  if test "$started" = true; then supabase stop --workdir "$lab_root" --no-backup >/dev/null 2>&1 || true; fi
  case "$lab_root" in
    "${TMPDIR:-/tmp}"/backyrd-d3-1.*|/tmp/backyrd-d3-1.*) rm -rf "$lab_root" ;;
    *) printf 'Refusing unexpected cleanup path: %s\n' "$lab_root" >&2 ;;
  esac
}
trap cleanup EXIT

mkdir -p "$lab_root/supabase" "$lab_root/generated"
cp "$repo_root/supabase/config.toml" "$lab_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$lab_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$lab_root/supabase/canonical"

# D3.1 needs the same canonical zero-data bootstrap contract as Database CI.
# Immutable, hash-certified Production data operations require historical rows
# by design and are not schema bootstrap steps. Validate their identities before
# excluding only the registered files from this disposable synthetic database.
node "$repo_root/scripts/ci/validate-database-lineage.mjs"
"$repo_root/scripts/ci/validate-migrations.sh"
while IFS= read -r operation; do
  rm "$lab_root/supabase/migrations/$operation"
done < <(jq -r '.[].file' "$repo_root/supabase/historical-data-operations.json")
printf 'Excluded %s hash-certified historical Production data operations from D3.1 bootstrap.\n' \
  "$(jq 'length' "$repo_root/supabase/historical-data-operations.json")"

sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$lab_root/supabase/config.toml"
sed -i.bak \
  -e "s/port = 54321/port = $((port_base + 1))/" \
  -e "s/port = 54322/port = $((port_base + 2))/" \
  -e "s/shadow_port = 54320/shadow_port = $port_base/" \
  -e "s/port = 54329/port = $((port_base + 9))/" \
  -e "s/port = 54323/port = $((port_base + 3))/" \
  -e "s/port = 54324/port = $((port_base + 4))/" \
  -e "s/port = 54327/port = $((port_base + 7))/" \
  "$lab_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$lab_root/supabase/config.toml"
rm -f "$lab_root/supabase/config.toml.bak"
test ! -e "$lab_root/supabase/.temp/project-ref"
if rg -q '^[[:space:]]*[^#].*(hjgcrrzfjchzqoegcywn|supabase\.co)' "$lab_root/supabase/config.toml"; then printf 'Production-like identifier detected.\n' >&2; exit 1; fi

supabase start --workdir "$lab_root" --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta --agent=no >/dev/null
started=true
supabase status --workdir "$lab_root" -o env --agent=no > "$lab_root/status.env"
set -a
# shellcheck disable=SC1090
source "$lab_root/status.env"
set +a

node "$repo_root/decision-lab/src/cli.mjs" seed --config "$repo_root/decision-lab/config/smoke-v1.json" --output "$lab_root/generated" > "$lab_root/seed.json"
seed_sql="$(jq -r .sqlPath "$lab_root/seed.json")"
world_root="$(jq -r .output "$lab_root/seed.json")"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$seed_sql" >/dev/null
node "$repo_root/decision-lab/src/d3.1-treatment-users-sql.mjs" "$world_root/world.json" > "$lab_root/treatment-users.sql"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$lab_root/treatment-users.sql" >/dev/null

export DECISION_LAB_ALLOW_LOCAL=1
export DECISION_LAB_DB_URL="$DB_URL"
export DECISION_LAB_SUPABASE_URL="$API_URL"
export DECISION_LAB_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export DECISION_LAB_JWT_SECRET="$JWT_SECRET"
export DECISION_LAB_WORLD_PATH="$world_root/world.json"
export DECISION_LAB_WORKDIR="$lab_root"
node "$repo_root/decision-lab/src/d3.1-coverage-smoke.mjs"
printf 'D3.1 bounded coverage acceptance completed; disposable environment destroyed.\n'
