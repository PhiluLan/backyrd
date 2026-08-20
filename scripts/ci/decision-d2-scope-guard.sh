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

if [[ -n "$protected" ]]; then
  echo "D2 scope guard: protected Decision Engine/Product path changed"
  printf '%s\n' "$protected"
  exit 1
fi
echo "D2 scope guard: additive Lab/evaluation scope confirmed"
