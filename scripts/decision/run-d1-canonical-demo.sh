#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-decision-lab.XXXXXX")"
project_id="backyrd-decision-lab-${$}"
started=false

cleanup() {
  if test "$started" = true; then supabase stop --workdir "$lab_root" --no-backup >/dev/null 2>&1 || true; fi
  case "$lab_root" in
    "${TMPDIR:-/tmp}"/backyrd-decision-lab.*|/tmp/backyrd-decision-lab.*) rm -rf "$lab_root" ;;
    *) printf 'Refusing unexpected cleanup path: %s\n' "$lab_root" >&2 ;;
  esac
}
trap cleanup EXIT

mkdir -p "$lab_root/supabase" "$lab_root/output"
cp "$repo_root/supabase/config.toml" "$lab_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$lab_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$lab_root/supabase/canonical"
sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$lab_root/supabase/config.toml"
sed -i.bak -e 's/port = 54321/port = 57221/' -e 's/port = 54322/port = 57222/' -e 's/shadow_port = 54320/shadow_port = 57220/' -e 's/port = 54329/port = 57229/' -e 's/port = 54323/port = 57223/' -e 's/port = 54324/port = 57224/' -e 's/port = 54327/port = 57227/' "$lab_root/supabase/config.toml"
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

node "$repo_root/decision-lab/src/cli.mjs" seed --config "$repo_root/decision-lab/config/smoke-v1.json" --output "$lab_root/generated" > "$lab_root/smoke-seed.json"
smoke_seed_sql="$(jq -r .sqlPath "$lab_root/smoke-seed.json")"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$smoke_seed_sql" >/dev/null

fixture="$lab_root/d1-engine-fixture.sql"
cp "$repo_root/scripts/decision/d0_2_trace_fixture.sql" "$fixture"
# Reuse the proven controlled D0.2 Product fixture, but commit it only inside this disposable stack.
sed -i.bak '$s/^rollback;$/commit;/' "$fixture"
rm -f "$fixture.bak"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$fixture" > "$lab_root/fixture-output.json"
psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$repo_root/decision-lab/fixtures/canonical-learning-acceptance.sql"

export DECISION_LAB_ALLOW_LOCAL=1
export DECISION_LAB_DB_URL="$DB_URL"
export DECISION_LAB_SUPABASE_URL="$API_URL"
export DECISION_LAB_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export DECISION_LAB_JWT_SECRET="$JWT_SECRET"
export DECISION_LAB_EMBEDDING_MODE="${DECISION_LAB_EMBEDDING_MODE:-FAST_SIMULATION}"
export DECISION_LAB_OUTPUT="$lab_root/output/canonical-demo.json"
export DECISION_LAB_WORKDIR="$lab_root"
node "$repo_root/decision-lab/src/full-engine-demo.mjs"
cp "$DECISION_LAB_OUTPUT" "$repo_root/decision-lab/.generated/canonical-demo.json"
printf 'Canonical D1 demonstration completed and disposable environment destroyed. Artifact: %s\n' "$repo_root/decision-lab/.generated/canonical-demo.json"
