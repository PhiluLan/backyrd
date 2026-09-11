#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

npm run world-knowledge:typecheck
npm run world-knowledge:test
npm run typecheck --workspace web
npx tsc --noEmit -p admin-dashboard/tsconfig.json
(
  cd web
  npx eslint app/owner/world-knowledge/page.tsx app/api/world-knowledge/shadow/route.ts e2e/world-knowledge-authoring.spec.ts
)
(
  cd admin-dashboard
  npx eslint app/world-knowledge/page.tsx app/api/world-knowledge/shadow/route.ts components/intelligence/Sidebar.tsx lib/worldKnowledgeSession.ts
)
node --test admin-dashboard/test/world-knowledge-*.test.mjs
node --test scripts/ci/classify-change.test.mjs
