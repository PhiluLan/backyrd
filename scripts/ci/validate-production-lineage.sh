#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="$repo_root/docs/operations/PRODUCTION_PRODUCT_LINEAGE.json"

fail() {
  printf 'Production lineage validation failed: %s\n' "$1" >&2
  exit 1
}

test -f "$manifest" || fail "missing Production lineage manifest"
jq -e '
  .version == "backyrd-production-product-lineage-v1" and
  (.repository | type == "string") and
  (.integration_anchor.commit | test("^[0-9a-f]{40}$")) and
  (.integration_anchor.parents | length == 2) and
  (.surfaces.mobile.commit | test("^[0-9a-f]{40}$")) and
  (.surfaces.mobile.tree | test("^[0-9a-f]{40}$")) and
  (.surfaces.consumer_web.commit | test("^[0-9a-f]{40}$")) and
  (.surfaces.consumer_web.tree | test("^[0-9a-f]{40}$")) and
  (.surfaces.database.migration_tip | test("^[0-9]{14}_[a-z0-9_]+$")) and
  (.required_ancestry | length >= 7) and
  (.edge_functions | length == 24) and
  ([.edge_functions[].slug] | unique | length == 24) and
  all(.edge_functions[];
    (.version | type == "number" and . > 0) and
    (.verify_jwt | type == "boolean") and
    (.ezbr_sha256 | test("^[0-9a-f]{64}$")))
' "$manifest" >/dev/null || fail "manifest schema or inventory is invalid"

while IFS= read -r commit; do
  git -C "$repo_root" cat-file -e "$commit^{commit}" 2>/dev/null \
    || fail "required commit is unavailable: $commit"
  git -C "$repo_root" merge-base --is-ancestor "$commit" HEAD \
    || fail "required Production lineage is not reachable from HEAD: $commit"
done < <(jq -r '.required_ancestry[]' "$manifest")

anchor="$(jq -r '.integration_anchor.commit' "$manifest")"
expected_parents="$(jq -r '.integration_anchor.parents | join(" ")' "$manifest")"
actual_parents="$(git -C "$repo_root" show -s --format='%P' "$anchor")"
test "$actual_parents" = "$expected_parents" \
  || fail "integration anchor parents do not match the audited merge"
git -C "$repo_root" merge-base --is-ancestor "$anchor" HEAD \
  || fail "audited integration anchor is not reachable from HEAD"

for surface in mobile consumer_web; do
  path="$(jq -r ".surfaces.${surface}.path" "$manifest")"
  expected_tree="$(jq -r ".surfaces.${surface}.tree" "$manifest")"
  actual_tree="$(git -C "$repo_root" rev-parse "HEAD:$path")"
  test "$actual_tree" = "$expected_tree" \
    || fail "$surface tree drift: expected $expected_tree, got $actual_tree"
done

tip="$(jq -r '.surfaces.database.migration_tip' "$manifest")"
test -f "$repo_root/supabase/migrations/${tip}.sql" \
  || fail "Production migration tip is absent from HEAD: $tip"

"$repo_root/scripts/ci/validate-migrations.sh" >/dev/null

printf 'Production lineage is represented by canonical HEAD: Mobile %s, Web %s, DB %s, Edge inventory %s.\n' \
  "$(jq -r '.surfaces.mobile.commit[0:7]' "$manifest")" \
  "$(jq -r '.surfaces.consumer_web.commit[0:7]' "$manifest")" \
  "$tip" \
  "$(jq '.edge_functions | length' "$manifest")"
