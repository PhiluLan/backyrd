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
  .version == "backyrd-production-product-lineage-v2" and
  (.repository | type == "string") and
  (.integration_anchor.commit | test("^[0-9a-f]{40}$")) and
  (.integration_anchor.parents | length == 2) and
  (.surfaces.mobile.commit | test("^[0-9a-f]{40}$")) and
  (.surfaces.mobile.tree | test("^[0-9a-f]{40}$")) and
  (.surfaces.mobile.canonical_source.commit | test("^[0-9a-f]{40}$")) and
  (.surfaces.mobile.canonical_source.tree | test("^[0-9a-f]{40}$")) and
  (.surfaces.mobile.canonical_source.production_verified | type == "boolean") and
  (.surfaces.consumer_web.commit | test("^[0-9a-f]{40}$")) and
  (.surfaces.consumer_web.tree | test("^[0-9a-f]{40}$")) and
  (.surfaces.consumer_web.canonical_source.commit | test("^[0-9a-f]{40}$")) and
  (.surfaces.consumer_web.canonical_source.tree | test("^[0-9a-f]{40}$")) and
  (.surfaces.consumer_web.canonical_source.production_verified | type == "boolean") and
  (.surfaces.database.migration_tip | test("^[0-9]{14}_[a-z0-9_]+$")) and
  (.surfaces.database.canonical_source.source_commit | test("^[0-9a-f]{40}$")) and
  (.surfaces.database.canonical_source.migration_tip | test("^[0-9]{14}_[a-z0-9_]+$")) and
  (.surfaces.database.canonical_source.migration_count | type == "number") and
  (.surfaces.database.canonical_source.production_verified | type == "boolean") and
  (.recertifications | length >= 1) and
  all(.recertifications[];
    (.id | test("^[a-z0-9_]+$")) and
    (.baseline_commit | test("^[0-9a-f]{40}$")) and
    (.source_commit | test("^[0-9a-f]{40}$")) and
    (.decision_semantics_changed == false) and
    (.authorized_surface_changes | length >= 1) and
    (.evidence | type == "string")) and
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

while IFS=$'\t' read -r baseline source evidence; do
  git -C "$repo_root" cat-file -e "$baseline^{commit}" 2>/dev/null \
    || fail "recertification baseline is unavailable: $baseline"
  git -C "$repo_root" cat-file -e "$source^{commit}" 2>/dev/null \
    || fail "recertification source is unavailable: $source"
  git -C "$repo_root" merge-base --is-ancestor "$baseline" "$source" \
    || fail "recertification source does not descend from its baseline"
  git -C "$repo_root" merge-base --is-ancestor "$source" HEAD \
    || fail "recertified source is not reachable from HEAD"
  test -f "$repo_root/$evidence" || fail "recertification evidence is missing: $evidence"
done < <(jq -r '.recertifications[] | [.baseline_commit,.source_commit,.evidence] | @tsv' "$manifest")

while IFS=$'\t' read -r recert_id baseline source; do
  actual_changes="$(git -C "$repo_root" diff --name-only "$baseline..$source" -- mobile web supabase | LC_ALL=C sort)"
  expected_changes="$(jq -r --arg id "$recert_id" '.recertifications[] | select(.id==$id) | .authorized_surface_changes[]' "$manifest" | LC_ALL=C sort)"
  test "$actual_changes" = "$expected_changes" \
    || fail "recertification $recert_id does not bind the exact Mobile/Web/database change set"
done < <(jq -r '.recertifications[] | [.id,.baseline_commit,.source_commit] | @tsv' "$manifest")

anchor="$(jq -r '.integration_anchor.commit' "$manifest")"
expected_parents="$(jq -r '.integration_anchor.parents | join(" ")' "$manifest")"
actual_parents="$(git -C "$repo_root" show -s --format='%P' "$anchor")"
test "$actual_parents" = "$expected_parents" \
  || fail "integration anchor parents do not match the audited merge"
git -C "$repo_root" merge-base --is-ancestor "$anchor" HEAD \
  || fail "audited integration anchor is not reachable from HEAD"

for surface in mobile consumer_web; do
  path="$(jq -r ".surfaces.${surface}.path" "$manifest")"
  source_commit="$(jq -r ".surfaces.${surface}.canonical_source.commit" "$manifest")"
  expected_tree="$(jq -r ".surfaces.${surface}.canonical_source.tree" "$manifest")"
  source_tree="$(git -C "$repo_root" rev-parse "$source_commit:$path")"
  test "$source_tree" = "$expected_tree" \
    || fail "$surface recertified source/tree binding is invalid"
  actual_tree="$(git -C "$repo_root" rev-parse "HEAD:$path")"
  test "$actual_tree" = "$expected_tree" \
    || fail "$surface tree drift: expected $expected_tree, got $actual_tree"
done

tip="$(jq -r '.surfaces.database.canonical_source.migration_tip' "$manifest")"
db_source_commit="$(jq -r '.surfaces.database.canonical_source.source_commit' "$manifest")"
git -C "$repo_root" merge-base --is-ancestor "$db_source_commit" HEAD \
  || fail "canonical database source is not reachable from HEAD"
test -f "$repo_root/supabase/migrations/${tip}.sql" \
  || fail "Production migration tip is absent from HEAD: $tip"
test "$(git -C "$repo_root" show "$db_source_commit:supabase/migrations/${tip}.sql" | git hash-object --stdin)" = \
  "$(git -C "$repo_root" hash-object "$repo_root/supabase/migrations/${tip}.sql")" \
  || fail "canonical database source does not bind the exact migration bytes"

"$repo_root/scripts/ci/validate-migrations.sh" >/dev/null

printf 'Production lineage and reviewed candidate are represented by canonical HEAD: Mobile %s, Web %s, DB %s, Edge inventory %s.\n' \
  "$(jq -r '.surfaces.mobile.canonical_source.commit[0:7]' "$manifest")" \
  "$(jq -r '.surfaces.consumer_web.canonical_source.commit[0:7]' "$manifest")" \
  "$tip" \
  "$(jq '.edge_functions | length' "$manifest")"
