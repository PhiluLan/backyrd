#!/usr/bin/env bash
set -euo pipefail
base="${CI_BASE_SHA:-origin/main}"
changed="$(git diff --name-only "$base"...HEAD)"
protected="$(printf '%s\n' "$changed" | grep -E '^(supabase/functions/decision-v13/|supabase/migrations/.*decision.*(v11|v12|v13)|mobile/.*decision|web/.*decision)' || true)"

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

# The first internal-live activation is a server-only wrapper around the
# byte-identical frozen v13 engine. Permit only these two integration files,
# and only while the canonical v13 source itself has no diff from the base.
live_wrapper='supabase/functions/decision-v13/live-index.ts'
live_adapter='supabase/functions/decision-v13/north-star-live.ts'
if git diff --quiet "$base"...HEAD -- supabase/functions/decision-v13/index.ts; then
  protected="$(printf '%s\n' "$protected" | grep -Fvx "$live_wrapper" | grep -Fvx "$live_adapter" || true)"
  echo "D2 scope guard: frozen v13 unchanged; internal-live server wrapper accepted"
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

if [[ -n "$protected" ]]; then
  echo "D2 scope guard: protected Decision Engine/Product path changed"
  printf '%s\n' "$protected"
  exit 1
fi
echo "D2 scope guard: additive Lab/evaluation scope confirmed"
