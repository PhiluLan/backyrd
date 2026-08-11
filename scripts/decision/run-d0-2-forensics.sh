#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
stack_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-d0-2-stack.XXXXXX")"
output_root="${1:-$(mktemp -d "${TMPDIR:-/tmp}/backyrd-d0-2-output.XXXXXX")}"
project_suffix="$$"
project_id="backyrd-d0-2-${project_suffix}"
port_base=$((58000 + (project_suffix % 40) * 20))
started=false

cleanup() {
  if test "$started" = true; then
    supabase stop --workdir "$stack_root" --no-backup >/dev/null 2>&1 || true
  fi
  case "$stack_root" in
    "${TMPDIR:-/tmp}"/backyrd-d0-2-stack.*|/tmp/backyrd-d0-2-stack.*)
      rm -rf "$stack_root"
      ;;
    *)
      printf 'Refusing to remove unexpected D0.2 stack path: %s\n' "$stack_root" >&2
      ;;
  esac
}
trap cleanup EXIT

mkdir -p "$output_root" "$stack_root/supabase"
cp "$repo_root/supabase/config.toml" "$stack_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$stack_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$stack_root/supabase/canonical"

sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" \
  "$stack_root/supabase/config.toml"
sed -i.bak \
  -e "s/port = 54321/port = $((port_base + 1))/" \
  -e "s/port = 54322/port = $((port_base + 2))/" \
  -e "s/shadow_port = 54320/shadow_port = $port_base/" \
  -e "s/port = 54329/port = $((port_base + 9))/" \
  -e "s/port = 54323/port = $((port_base + 3))/" \
  -e "s/port = 54324/port = $((port_base + 4))/" \
  -e "s/port = 54327/port = $((port_base + 7))/" \
  "$stack_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' \
  "$stack_root/supabase/config.toml"
rm -f "$stack_root/supabase/config.toml.bak"

if rg -q 'hjgcrrzfjchzqoegcywn' "$stack_root"; then
  printf 'Production project reference detected in disposable D0.2 workspace.\n' >&2
  exit 1
fi

if ! supabase start \
  --workdir "$stack_root" \
  --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta \
  --agent=no > "$stack_root/start.log" 2>&1; then
  cp "$stack_root/start.log" "$output_root/start-error.log"
  sed -n '1,160p' "$stack_root/start.log" >&2
  exit 1
fi
started=true

supabase status --workdir "$stack_root" -o env --agent=no > "$stack_root/status.env"
set -a
# shellcheck disable=SC1090
source "$stack_root/status.env"
set +a
: "${DB_URL:?Disposable Supabase status did not return DB_URL}"

psql "$DB_URL" -X --set ON_ERROR_STOP=1 --quiet --tuples-only --no-align \
  --file "$repo_root/scripts/decision/d0_2_trace_fixture.sql" \
  > "$output_root/traces-db.json"

supabase db dump --workdir "$stack_root" --local --schema public --agent=no \
  > "$output_root/canonical-public-schema.sql"

node "$repo_root/scripts/decision/d0_2_edge_harness.mjs" \
  < "$output_root/traces-db.json" \
  > "$output_root/traces-fused.json"

printf '%s\n' "$output_root"
