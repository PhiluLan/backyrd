#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260829200000_create_spot_engine_admin_operations_v1.sql"
delta="$repo_root/supabase/canonical/public-acl-spot-engine-admin-v1.delta"

fail() { printf 'Spot Engine admin ACL validation failed: %s\n' "$*" >&2; exit 1; }
test -f "$migration" || fail 'migration missing'
test -f "$delta" || fail 'expected delta missing'

expected=$'FUNCTION|backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer)|authenticated|EXECUTE\nFUNCTION|backyrd_admin_spot_engine_review_v1(uuid,text,text)|authenticated|EXECUTE\nFUNCTION|backyrd_admin_spot_engine_retry_job_v1(uuid)|authenticated|EXECUTE'
test "$(cat "$delta")" = "$expected" || fail 'expected delta is not the exact three-RPC allowlist'

test "$(rg -c '^grant execute on function ' "$migration")" = 1 || fail 'unexpected function grant count'
rg -q "grant execute on function public\.backyrd_admin_spot_engine_operations_v1\(text,uuid,text,integer,integer\),public\.backyrd_admin_spot_engine_review_v1\(uuid,text,text\),public\.backyrd_admin_spot_engine_retry_job_v1\(uuid\) to authenticated;" "$migration" || fail 'authenticated grant differs from reviewed functions'
rg -q "revoke all on function .* from public,anon,authenticated,service_role;" "$migration" || fail 'pre-grant revoke boundary missing'
if rg -qi '^grant .* on (table|sequence) ' "$migration"; then fail 'table or sequence grant detected';fi
if rg -qi '^grant .* to (anon|service_role|public)([,;]|$)' "$migration"; then fail 'unexpected role grant detected';fi
test "$(rg -c 'language plpgsql .*security definer' "$migration")" = 3 || fail 'three SECURITY DEFINER RPCs required'
test "$(rg -c "if v_actor is null then raise exception 'authentication_required'" "$migration")" = 3 || fail 'authentication guards missing'
test "$(rg -c "if v_role is null and not public.admin_is_admin_v1\(\) then raise exception 'admin_or_founder_required'" "$migration")" = 3 || fail 'Founder/Admin guards missing'
if rg -q 'p_(actor|user)(_id)?[[:space:]]' "$migration"; then fail 'caller-controlled actor parameter detected';fi

printf 'Spot Engine admin ACL delta is exactly three authenticated EXECUTE grants.\n'
