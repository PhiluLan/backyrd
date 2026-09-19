# Backyrd Product v1 — Active Surface

Status: **FROZEN**
Owner: CTO

This is the complete active Decision product. Anything not listed here has no
runtime, release or gate authority.

## Runtime

- Mobile: `mobile/app/(tabs)/wohin.tsx` (the hidden historical `decision.tsx`
  route redirects here; it does not evaluate or display a second Product path)
- Mobile contract: `mobile/packages/product-decision-contract/`
- Mobile transport: `mobile/lib/decision/productDecision.ts`
- Web transport: `web/lib/decision-web-api.ts`
- Edge entrypoint: `supabase/functions/decision-v13/index.deploy.ts`
- Edge implementation: `supabase/functions/decision-v13/vnext-only.ts`

There is one route and one contract: Decision vNext Product v1 over
`decision-v13`. Legacy fallback, dual-run, Founder-only routing and parallel
Decision hosts are forbidden.

## Decision core

- `canonical.ts`
- `schema.ts`
- `opening-state.ts`
- `product-v1-contracts.ts`
- `product-v1-authority.ts`
- `product-v1-evaluator.ts`
- `product-decision.ts`
- `product-decision-production-adapter.ts`

The package index exports only this Product surface. Historical Phase, Lab,
Dark/Shadow and Founder modules are retired history and must not be imported.

## Canonical dependencies

- World data only through `WorldKnowledgeReaderPort`.
- User data only through the minimized `RelevantUserProjection` and the
  consent-bound Product learning port.
- Product control, Auth, rate limit, idempotency and learning authority remain
  server-side and fail closed.

## Required gates

Every change runs repository/security baseline and the fail-closed change
classifier. The classifier selects the union of the affected Mobile, Web,
Admin, Shared, User, World, Decision, Database, supply-chain, delivery and
release gates. A required skipped or missing gate fails.

Product Decision changes run exactly:

1. canonical World/User/Decision build and type boundary;
2. current Product contract, ranking, learning, runtime and isolation tests;
3. single-route repository invariant;
4. Mobile/Web Product contract checks;
5. one current Product end-to-end journey.

Database changes additionally run immutable lineage, exact migration coverage,
clean boot, RLS/grants, authorization allow/deny and database lint. Evidence-
only repairs resume from an input-bound receipt instead of rerunning clean boot.

Production remains manual and deploys the exact CI-certified Release Manifest
artifact. No rebuild between certification and deployment is permitted.

## Retired history

Decision Lab waves, Phase‑1/2/3 harnesses, Week‑1/2/3 control planes, Founder
activation paths, synthetic shadow runtimes and their evidence have no current
authority. Their root commands are removed. Their repository paths are
read-only and fail closed on modification; deletion is allowed in a dedicated
cleanup change after remaining references are eliminated. Git is the archive.
