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
- Web transport: `web/lib/decision-web-api.ts` through the authenticated, same-origin `web/app/api/decision/route.ts` proxy to the single `decision-v13` function.
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
- `product-request-context.ts` — bounded request-local context extraction and shared exact-time detection
- `product-request-understanding.ts` — validated model requirements, minimized private-cache representation, request/policy binding and supported-context projection
- `product-ai-interpretation.ts` — optional, server-only, request-bound intent interpretation; World and ranking remain authoritative
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

Decision evidence calibration: a confirmed category or indoor venue type does
not by itself confirm the requested company or occasion. Where the request
names a companion or date and matching visit-situation evidence is absent, the
candidate remains a visible `UNCONFIRMED_FALLBACK`, not `ELIGIBLE_CONFIRMED`.
This is a ranking and disclosure distinction, not an age restriction or a new
hard exclusion. Query explanations describe only the verified criteria; they
must not imply that every part of the person's request was verified. A request
for an open-ended activity with company must not be narrowed to a category
guessed by the model, even if it suggests just one. Those category suggestions
are ranking
preferences; the closed Product intent ontology determines the eligible
experience types. A named, specific venue type remains a requirement. This
preserves discovery of genuinely suitable activities outside the model's first
guesses while leaving family suitability and other unverified context visible.
A request for a low price similarly remains a fallback when no low price level is
verified; even a verified low level is not a promise of a particular CHF price.
For an open-ended social wish without a stated activity, a null primary intent
is not automatically an empty result. A provisional result is allowed only
when the request names a canonical visit situation and the specific Spot has
matching, scoped, verified World evidence for it. Hotels and non-experience
categories cannot fill the gap; unknown or disputed situation evidence cannot
rank. The UI must disclose that the concrete activity was not established.
The AI interpreter also accounts for material request parts that the current
catalog cannot verify. Canonical, non-raw codes for music during the visit,
a precise clock time, or another unmapped core need travel with the interpreted
request. They make candidates provisional and produce explicit user-facing
limitations; they do not assert Spot facts or discard otherwise useful places.
The current opening evaluation is day/daypart based, so it must not claim that
an exact requested hour was checked. Conversely, the model may not label a
daypart such as "heute Abend" as an unverified precise clock time; that code is
grounded in the raw request even when an interpretation came from cache. These
limitations remain until matching
versioned World evidence and evaluation support are shipped.

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

Decision-v13 emits fixed-shape duration diagnostics for each canonical runtime
boundary (control check before, operation, control check after). These timings
contain no user text, actor identity, Spot identity, credentials, or model
payload; they are operational evidence for latency work and cannot affect a
Decision response.

AI query prompt v4 distinguishes a concrete activity from its broad category:
when the activity entails specific canonical place types, the interpreter
requests those as alternatives in one hard query group. A broad wish does not
gain such a gate. This changes query interpretation, not Spot facts; subjective
atmosphere and companionship remain unverified unless World evidence confirms
them for the Spot. A requested drink or dish is not proof that the person
requires a brewery, taproom or restaurant. For eating, coffee, drinks and
nightlife, model-proposed venue types are hard only if the user actually names
that type; the requested offering remains independently testable against World
Knowledge. The venue-name guard is a catalog-level safety rule, not a list of
user phrases.

The server-side AI query cache is keyed by the sentence and explicit request
context, plus its authenticated-user, provider-model, interpreter-policy,
catalog and release bindings. The database model-version key includes a short
hash of the interpreter version so a new policy cannot replay a previous
policy's hard constraints even when the provider model and release control
identity stay unchanged. Fresh transport IDs and alternative-page IDs do not change the
semantics and therefore do not trigger a new provider call. The cache stores
only the validated structured interpretation, never the raw sentence.
