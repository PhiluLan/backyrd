#!/usr/bin/env bash
set -euo pipefail
base="${CI_BASE_SHA:-origin/main}"
changed="$(git diff --name-only "$base"...HEAD)"
protected="$(printf '%s\n' "$changed" | grep -E '^(supabase/functions/decision-v13/|supabase/migrations/.*(decision|gate3)|packages/(canonical-semantics|decision-input-runtime|decision-orchestrator-runtime|n6-shadow-runtime)/src/|mobile/.*decision|web/.*decision)' || true)"
recertification_contract='decision-lab/config/decision-v13-production-recertification-v19.json'

# The current contract names every protected semantic source and every item of
# certification evidence. Changes to any named path, to the contract itself,
# or to a dependent freeze are protected even when they sit outside a Product
# directory. This closes the old wrapper/path gap: admission is by the exact
# validated source/evidence set, never by directory or glob.
if [[ -f "$recertification_contract" ]]; then
  while IFS= read -r bound_path; do
    if printf '%s\n' "$changed" | grep -Fx "$bound_path" >/dev/null; then
      protected="$(printf '%s\n%s\n' "$protected" "$bound_path" | sed '/^$/d' | sort -u)"
    fi
  done < <(jq -r '.protectedSemanticSourceSet.paths[], .certificationEvidenceSet.paths[]' "$recertification_contract")
fi
for bound_path in \
  "$recertification_contract" \
  'decision-lab/config/decision-quality-v1.1.freeze.json' \
  'decision-lab/config/personalization-treatment-v1.json' \
  'decision-lab/config/personalization-treatment-v1.freeze.json' \
  'decision-lab/config/d3.1-diagnostic-coverage-v1.json' \
  'decision-lab/src/d3.1-readiness.mjs'; do
  if printf '%s\n' "$changed" | grep -Fx "$bound_path" >/dev/null; then
    protected="$(printf '%s\n%s\n' "$protected" "$bound_path" | sed '/^$/d' | sort -u)"
  fi
done

# Downstream, byte-pinned Product integrations may rely on either the original
# unchanged D2 engine or the exact Production baseline admitted by the full
# D2 re-certification contract. The latter validates the Engine, protected
# semantic source set, evidence set, Production identity and freeze manifest;
# any later drift remains fail-closed.
engine_baseline_accepted=false
if git diff --quiet "$base"...HEAD -- supabase/functions/decision-v13/index.ts; then
  engine_baseline_accepted=true
elif node decision-lab/src/d2-cli.mjs validate-freeze | jq -e '.frameworkValidity == "PASS" and .freezeValidation.valid == true' >/dev/null; then
  engine_baseline_accepted=true
  echo "D2 scope guard: exact re-certified Production engine baseline accepted"
fi

# A Founder-authorized semantic change is admitted only when the complete
# chain validates together: D2 Engine + source/evidence/Production identity,
# D2.1 freeze, D2.2 treatment freeze, and D3.1 parent identities. Once valid,
# remove only the exact paths enumerated by that contract and the exact
# dependent freeze files. Any additional source remains protected.
full_recertification_accepted=false
if [[ -f "$recertification_contract" ]] \
  && node decision-lab/src/d2-cli.mjs validate-freeze | jq -e '.frameworkValidity == "PASS" and .freezeValidation.valid == true' >/dev/null \
  && node decision-lab/src/personalization-treatment-freeze.mjs validate | jq -e '.valid == true' >/dev/null \
  && node decision-lab/src/d3.1-readiness.mjs | jq -e '.status == "PASS"' >/dev/null; then
  full_recertification_accepted=true
  while IFS= read -r admitted_path; do
    protected="$(printf '%s\n' "$protected" | grep -Fvx "$admitted_path" || true)"
  done < <(jq -r '.protectedSemanticSourceSet.paths[], .certificationEvidenceSet.paths[]' "$recertification_contract")
  for admitted_path in \
    "$recertification_contract" \
    'decision-lab/config/decision-quality-v1.1.freeze.json' \
    'decision-lab/config/personalization-treatment-v1.json' \
    'decision-lab/config/personalization-treatment-v1.freeze.json' \
    'decision-lab/config/d3.1-diagnostic-coverage-v1.json' \
    'decision-lab/src/d3.1-readiness.mjs'; do
    protected="$(printf '%s\n' "$protected" | grep -Fvx "$admitted_path" || true)"
  done
  echo "D2 scope guard: complete v19 Engine/Source/Evidence/Freeze/Production re-certification accepted"
fi

# Sprint 1 intentionally adds a narrowly bounded, behavior-neutral N2 memory
# bridge to the existing Decision screen. Keep the historical D2 guard strict:
# only this exact provenance patch is exempt; any other Product/Decision change
# remains a failure.
memory_bridge_path='mobile/app/(tabs)/decision.tsx'
if printf '%s\n' "$protected" | grep -Fx "$memory_bridge_path" >/dev/null; then
  read -r additions deletions _ < <(git diff --numstat "$base"...HEAD -- "$memory_bridge_path")
  memory_bridge_diff="$(git diff --unified=0 "$base"...HEAD -- "$memory_bridge_path")"
  if [[ "$additions" == "3" && "$deletions" == "1" ]] \
    && printf '%s\n' "$memory_bridge_diff" | grep -F '+import { recordMemoryProductAction } from "@/lib/memory-bridge";' >/dev/null \
    && printf '%s\n' "$memory_bridge_diff" | grep -F '+      void recordMemoryProductAction({ actionType: "spot_opened", spotId, decisionId, entrySurface: "decision" });' >/dev/null \
    && printf '%s\n' "$memory_bridge_diff" | grep -F -- '-      router.push(`/spot/${spotId}` as any);' >/dev/null \
    && printf '%s\n' "$memory_bridge_diff" | grep -F '+      router.push(`/spot/${spotId}?entrySource=decision` as any);' >/dev/null; then
    protected="$(printf '%s\n' "$protected" | grep -Fvx "$memory_bridge_path" || true)"
    echo "D2 scope guard: exact Product-to-N2 Decision provenance bridge accepted"
  fi
fi

# The first-live Decision incident requires one bounded Product fix in the same
# screen: remove internal retrieval instructions from the client request and
# suppress the uncalibrated percentage only for a server-confirmed North-Star
# response. Accept the reviewed cumulative patch byte-for-byte; any subsequent
# Product change produces a different hash and remains protected.
incident_mobile_diff_sha='53bca8ec232a388c412417237e0a0ccf6bba15872503a22489f29ae6bb7db125'
if printf '%s\n' "$protected" | grep -Fx "$memory_bridge_path" >/dev/null; then
  actual_mobile_diff_sha="$(git diff "$base"...HEAD -- "$memory_bridge_path" | sha256sum | awk '{print $1}')"
  if [[ "$actual_mobile_diff_sha" == "$incident_mobile_diff_sha" ]]; then
    protected="$(printf '%s\n' "$protected" | grep -Fvx "$memory_bridge_path" || true)"
    echo "D2 scope guard: exact first-live Decision UI incident patch accepted"
  fi
fi

# The first internal-live activation paths remain named for historical
# one-time marker checks below. They no longer receive a baseline-wide path
# exemption; current changes require the complete v16 contract above.
live_wrapper='supabase/functions/decision-v13/live-index.ts'
live_adapter='supabase/functions/decision-v13/north-star-live.ts'

# Git-backed Supabase deployment may add only the exact deployment entrypoint
# already bound by the complete Production re-certification contract. This is
# deliberately a one-time addition, not a path exception: subsequent edits,
# deletion, a different source/hash, config drift or an invalid freeze remain
# protected and fail closed.
production_entrypoint='supabase/functions/decision-v13/index.deploy.ts'
if printf '%s\n' "$protected" | grep -Fx "$production_entrypoint" >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx "$production_entrypoint" >/dev/null \
  && git diff --diff-filter=A --name-only "$base"...HEAD -- "$production_entrypoint" | grep -Fx "$production_entrypoint" >/dev/null \
  && [[ -f "$production_entrypoint" ]] \
  && node decision-lab/src/d2-cli.mjs validate-freeze | jq -e '.frameworkValidity == "PASS" and .freezeValidation.valid == true' >/dev/null; then
  expected_entrypoint_sha="$(jq -r '.production.entrypointSha256' "$recertification_contract")"
  actual_entrypoint_sha="$(sha256sum "$production_entrypoint" | awk '{print $1}')"
  configured_entrypoint="$(sed -n '/^\[functions\.decision-v13\]$/,/^\[/s/^[[:space:]]*entrypoint[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' supabase/config.toml)"
  if [[ "$actual_entrypoint_sha" == "$expected_entrypoint_sha" \
    && "$configured_entrypoint" == "./functions/decision-v13/index.deploy.ts" ]]; then
    protected="$(printf '%s\n' "$protected" | grep -Fvx "$production_entrypoint" || true)"
    echo "D2 scope guard: exact re-certified Production deployment entrypoint accepted"
  fi
fi

# Founder-authorized canonical Community Mood integration. Admit only the two
# exact protected Decision files bound by the complete v6 re-certification,
# and only when the canonical migration plus focused SQL and Decision evidence
# are part of the same reviewed change. This is not a path-wide exception.
canonical_mood_marker='docs/decision/D2_D3_CANONICAL_MOOD_RECERTIFICATION_2026_08_31.md'
canonical_mood_module='supabase/functions/decision-v13/community-mood-signal.mjs'
if [[ "$engine_baseline_accepted" == true ]] \
  && printf '%s\n' "$changed" | grep -Fx "$canonical_mood_marker" >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx 'supabase/migrations/20260831220000_create_canonical_product_mood_v1.sql' >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx 'supabase/tests/canonical_product_mood_v1.sql' >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx 'decision-lab/test/community-mood-decision.test.mjs' >/dev/null; then
  protected="$(printf '%s\n' "$protected" \
    | grep -Fvx 'supabase/functions/decision-v13/index.ts' \
    | grep -Fvx "$canonical_mood_module" || true)"
  echo "D2 scope guard: exact v6 canonical Community Mood integration accepted"
fi

# Mobile Production Rebuild retires three obsolete client/debug Decision paths.
# Their deletion is safe only while the canonical v13 implementation is the
# accepted baseline; reintroducing or modifying any of them remains a
# protected-path failure.
retired_mobile_decision_paths=(
  'mobile/app/(tabs)/decision-debug.tsx'
  'mobile/lib/decision/backyrdDecision.ts'
  'mobile/supabase/functions/semantic-bridge-decision/index.ts'
)
if [[ "$engine_baseline_accepted" == true ]]; then
  for retired_path in "${retired_mobile_decision_paths[@]}"; do
    if [[ ! -e "$retired_path" ]]; then
      protected="$(printf '%s\n' "$protected" | grep -Fvx "$retired_path" || true)"
    fi
  done
  echo "D2 scope guard: retired Mobile Decision clients removed; accepted v13 baseline"
fi

# Production Decision final closure is an explicitly versioned exception to
# the historical research freeze. It may touch only the canonical v13 source
# and its existing live wrapper/adapter, and only together with the additive
# trace migration plus the real-incident regressions. Once merged, the marker
# is part of the base and cannot exempt later unrelated Decision changes.
closure_marker='supabase/migrations/20260824010000_close_production_decision_engine_v1.sql'
if printf '%s\n' "$changed" | grep -Fx "$closure_marker" >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx 'packages/decision-input-runtime/test/live-product-boundary.test.mjs' >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx 'packages/decision-orchestrator-runtime/test/canonical-semantic-conformance.test.mjs' >/dev/null; then
  protected="$(printf '%s\n' "$protected" | grep -Fvx "$live_wrapper" | grep -Fvx "$live_adapter" | grep -Fvx 'supabase/functions/decision-v13/index.ts' || true)"
  echo "D2 scope guard: versioned Production Decision closure accepted"
fi

# The controlled Fresh User cutover is a versioned Product integration around
# the byte-identical frozen v13 engine. Permit only its active Mobile Decision
# surface and the existing response transport when the additive cutover marker
# and both dedicated regression suites are present in the same reviewed diff.
# The marker becomes part of the base after merge, so it cannot exempt a later
# unrelated Product or Decision change.
fresh_user_cutover_marker='supabase/migrations/20260824213000_fresh_user_north_star_cutover_v1.sql'
if printf '%s\n' "$changed" | grep -Fx "$fresh_user_cutover_marker" >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx 'packages/decision-input-runtime/test/fresh-user-product-cutover.test.mjs' >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx 'supabase/tests/fresh_user_north_star_cutover_v1.sql' >/dev/null; then
  protected="$(printf '%s\n' "$protected" \
    | grep -Fvx 'mobile/app/(tabs)/decision.tsx' \
    | grep -Fvx 'mobile/app/(tabs)/decision-onboarding.tsx' \
    | grep -Fvx 'supabase/functions/decision-v13/live-response.mjs' || true)"
  echo "D2 scope guard: versioned Fresh User North-Star cutover accepted"
fi

# Canonical Semantic Alignment v1 changes only the onboarding RPC version so
# selected Spots are interpreted once through the canonical N4-backed adapter.
# Keep the exemption byte-exact; any additional onboarding or Decision UI
# change remains protected.
canonical_onboarding_path='mobile/app/(tabs)/decision-onboarding.tsx'
canonical_onboarding_diff_sha='3dba9e096ce541b2646baf3b09bdf28e35f03d9b096754ae5a6874cfc3797ff3'
if printf '%s\n' "$protected" | grep -Fx "$canonical_onboarding_path" >/dev/null; then
  actual_onboarding_diff_sha="$(git diff "$base"...HEAD -- "$canonical_onboarding_path" | sha256sum | awk '{print $1}')"
  if [[ "$actual_onboarding_diff_sha" == "$canonical_onboarding_diff_sha" ]]; then
    protected="$(printf '%s\n' "$protected" | grep -Fvx "$canonical_onboarding_path" || true)"
    echo "D2 scope guard: exact canonical onboarding adapter patch accepted"
  fi
fi

# Consumer Web Design Closure adds a presentation-only Web client for the
# accepted Production Decision contract. This is a one-time, byte-exact
# exception: all four reviewed paths must match their pinned diff hashes, the
# Product contract evidence must be in the same change, and v13 must remain
# untouched. Any later byte, fifth adjacent path, or Engine change fails closed.
web_closure_marker='web/docs/WEB_PRODUCT_CONTRACT_MATRIX.md'
web_closure_contract='web/tests/consumer-contracts.test.mjs'
web_closure_paths=(
  'web/app/decision/page.tsx'
  'web/app/settings/decision-history/page.tsx'
  'web/components/consumer/decision-experience.tsx'
  'web/lib/decision-web-api.ts'
)
web_closure_hashes=(
  '32586d071517305da5c60c47ef65f1f87729695c370adad7901b32c56e6f7778'
  'b45be6558834bcdc848afda24e4e64b2dfdde4b022539b0b68df1054f6908702'
  '4d4f9d22766e0f37b7c05c17f56ad5366e58f6e0bbaa105e3a689432abaa767d'
  '4e75221e576df4564c7db0d6fefb6b6a7dcb5529d6877b1a346825906959e548'
)
if printf '%s\n' "$changed" | grep -Fx "$web_closure_marker" >/dev/null \
  && printf '%s\n' "$changed" | grep -Fx "$web_closure_contract" >/dev/null \
  && [[ "$engine_baseline_accepted" == true ]]; then
  web_closure_valid=true
  for i in "${!web_closure_paths[@]}"; do
    web_path="${web_closure_paths[$i]}"
    web_hash="$(git diff "$base"...HEAD -- "$web_path" | sha256sum | awk '{print $1}')"
    if [[ "$web_hash" != "${web_closure_hashes[$i]}" ]]; then
      web_closure_valid=false
      echo "D2 scope guard: Consumer Web hash mismatch: $web_path expected=${web_closure_hashes[$i]} actual=$web_hash"
      break
    fi
  done
  if [[ "$web_closure_valid" == true ]]; then
    for i in "${!web_closure_paths[@]}"; do
      web_path="${web_closure_paths[$i]}"
      protected="$(printf '%s\n' "$protected" | grep -Fvx "$web_path" || true)"
      echo "D2 scope guard: accepted reviewed Consumer Web presentation: $web_path hash=${web_closure_hashes[$i]}"
    done
  fi
fi

if [[ -n "$protected" ]]; then
  echo "D2 scope guard: protected Decision Engine/Product path changed"
  printf '%s\n' "$protected"
  exit 1
fi
echo "D2 scope guard: additive Lab/evaluation scope confirmed"
