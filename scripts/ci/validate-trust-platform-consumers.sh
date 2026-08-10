#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

require_pattern() {
  local pattern="$1"
  local file="$2"
  local label="$3"
  if ! rg -q "$pattern" "$file"; then
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
require_pattern 'filterDistributedSpots' \
  'mobile/app/(tabs)/explore.tsx' 'Discovery must use canonical Distribution filtering'
require_pattern 'get_social_feed_v2' \
  'mobile/app/(tabs)/feed.tsx' 'Feed must use the Distribution-aware canonical RPC'
require_pattern 'get_my_personalized_home_v1|get_discovery_overview_v1' \
  'web/lib/backyrd-api.ts' 'Web Home must use Distribution-aware contracts'
require_pattern 'backyrd_web_city_spots_v1' \
  'web/lib/public-web-api.ts' 'Public Web discovery must use the canonical contract'

if rg -n \
  'distribution_trust_(states|history|events|overrides|policy_rules|evaluation_queue)' \
  mobile web admin-dashboard supabase/functions \
  --glob '!**/node_modules/**' --glob '!*.backup*' --glob '!**/*.backup*'; then
  printf 'Runtime consumer reads private Distribution internals directly.\n' >&2
  exit 1
fi

if rg -n 'get_social_(feed|user_posts)_v1' mobile web admin-dashboard supabase/functions \
  --glob '!**/node_modules/**' --glob '!*.backup*' --glob '!**/*.backup*'; then
  printf 'An active runtime path still uses a pre-Distribution social RPC.\n' >&2
  exit 1
fi

printf 'Trust Platform runtime consumer boundary validation passed.\n'
