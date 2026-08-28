#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

search_quiet() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pattern" "$file"
  else
    grep -Eq "$pattern" "$file"
  fi
}

search_runtime() {
  local pattern="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -n "$pattern" "$@" \
      --glob '!**/node_modules/**' --glob '!*.backup*' --glob '!**/*.backup*'
  else
    grep -Ern --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
      --exclude-dir=build --exclude='*.backup*' -- "$pattern" "$@"
  fi
}

require_pattern() {
  local pattern="$1"
  local file="$2"
  local label="$3"
  if ! search_quiet "$pattern" "$file"; then
    printf 'Trust Platform consumer validation failed: %s\n' "$label" >&2
    exit 1
  fi
}

require_pattern 'distribution_trust_filter_entities_v1' \
  'supabase/functions/decision-v13/index.ts' 'Decision must use canonical Distribution eligibility'
require_pattern 'distribution_trust_spot_catalog_v1' \
  'supabase/functions/decision-v13/index.ts' 'Decision must use trusted fallback candidates'
require_pattern 'fetchCatalog\(null\)' \
  'supabase/functions/decision-v13/index.ts' 'Decision must expand to a global trusted fallback'
require_pattern 'distribution_trust_filter_entities_v1' \
  'supabase/functions/semantic-spot-search/index.ts' 'Semantic Search must use canonical Distribution eligibility'
require_pattern 'distribution_trust_filter_entities_v1' \
  'mobile/lib/distributionTrust.ts' 'Mobile must use the central client-safe contract'
require_pattern 'distribution_trust_spot_catalog_v1' \
  'mobile/app/search.tsx' 'Search must provide trusted alternatives after Distribution filtering'
require_pattern 'filterDistributedSpots' \
  'mobile/lib/useSpotsStore.ts' 'Maps must use canonical Distribution filtering'
require_pattern 'loadDiscoverySpots' \
  'mobile/app/(tabs)/index.tsx' 'Discovery Home must use the shared Product-visible catalog'
require_pattern 'distribution_trust_spot_catalog_v1' \
  'mobile/lib/spot-images.ts' 'Discovery images must use canonical Distribution filtering'
require_pattern 'get_social_feed_v2' \
  'mobile/app/(tabs)/feed.tsx' 'Feed must use the Distribution-aware canonical RPC'
require_pattern 'get_my_personalized_home_v1|get_discovery_overview_v1' \
  'web/lib/backyrd-api.ts' 'Web Home must use Distribution-aware contracts'
require_pattern 'backyrd_web_city_spots_v1' \
  'web/lib/public-web-api.ts' 'Public Web discovery must use the canonical contract'

if search_runtime \
  'distribution_trust_(states|history|events|overrides|policy_rules|evaluation_queue)' \
  mobile web admin-dashboard supabase/functions; then
  printf 'Runtime consumer reads private Distribution internals directly.\n' >&2
  exit 1
fi

if search_runtime 'get_social_(feed|user_posts)_v1' \
  mobile web admin-dashboard supabase/functions; then
  printf 'An active runtime path still uses a pre-Distribution social RPC.\n' >&2
  exit 1
fi

printf 'Trust Platform runtime consumer boundary validation passed.\n'
