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
- `product-v1-evaluator.ts` — typed legacy UI guards and consent-bound taste evidence
- `product-luna-provider.ts` — one bounded server-side model call
- `product-luna-librarian.ts` and `product-luna-librarian-assets.ts` — frozen meaning contract
- `product-librarian-{language,world-language,semantics,time,eligibility,matching,evaluator}.ts` — scoped deterministic matching and Product assessment
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

Browser consumers of World Knowledge import `@backyrd/world-knowledge-core/browser`.
This entry exposes UI catalogs and validators without Founder handoffs, research
or server HTTP entrypoints. Canonical serialization is shared; the package's
browser mapping selects the bundler-compatible SHA-256 adapter while Node/Edge
keep `node:crypto`. Hashes, validation rules and server authority are unchanged.
The default package entry and the existing Edge `server-runtime` mapping remain
compatible. Do not restore the old Admin alias to the default `dist/index.js`.

## Lossless Luna composition

The 2026-10-16 implementation candidate connects the existing single handler
to the frozen Luna contract and scoped Bibliothekar. Production activation is
tracked separately by the certified artifact and production state; a source
change is not evidence of a successful live deployment.

Authentication, rate limiting and release checks precede the one model call.
The provider keeps the tested model, prompt revision and schema, supplies a
trusted Europe/Zurich reference once, and sends only the wish plus explicit
UI context. Request identifiers, account identifiers and Spot inventory are
not sent to the model. Incomplete, refused, invalid or omitted typed mandatory
context fails honestly; there is no repair model call or old interpreter fallback.

The complete, original-bound plan travels through a server-only `understand`
port into canonical evaluation. It is never projected through the old intent/
facet vocabulary. The public context is a bounded display/learning summary,
identified as such; it does not drive matching. Raw source, participant labels
and provider output are neither public response fields nor durable decision
records. The old `product-ai-interpretation.ts` remains compatibility/test
coverage only and is not imported by the installed Edge composition.

The existing context v5 RPC supplies one authorized, manifest-bound full-city
cohort and the consent-bound User projection. The Bibliothekar preserves offers,
linked areas, participant scope, alternatives, conditions, price coverage and
source-use permission. Unsupported knowledge remains unknown. Known hard
contradictions exclude before ranking. The whole cohort (up to 1,000) is assessed
before rejected candidates, personalization and the final presentation window.

Classification-only evidence authorized for DISCOVERY can select a provisional
venue of the requested type. This never upgrades it to a confirmed hard fact.
The narrowly version-bound exception accepts only `DISCOVERY_ONLY_SPOT_TYPE`;
any unknown mandatory price, age, access, weather or time duty still prevents a
primary recommendation. Legal/price/opening permissions are unchanged. Known
venue identity is independently required: a drink does not turn an arbitrary
bar into a wine bar or prove a hotel has a restaurant.

Visitor explanations use fixed family wording and actual selected offer names
only where World permits EXPLANATION. Conditional or partial evidence is not
worded as an unconditional confirmation. No minimum age is inferred from an
unrelated offering. Confirmed diet, area and budget must form one coherent
visit. UI controls from older clients remain binding; their compatibility guard
reads typed explicit fields only, never the original prose.

The deployed composition requires `BACKYRD_DECISION_AI_INTENT_ENABLED=true`
and the existing actor enablement configuration. Disabled/unavailable Luna fails
closed; interaction events still use the same authenticated route. The model
is pinned by the frozen configuration, not the former AI_INTENT_MODEL setting.
There is no broad-plan cache yet: the narrower legacy cache cannot safely store
this different contract or omit reference-date/participant bindings. Existing
sealed idempotency and consent-bound learning controls remain enforced.

Limitations: the authorized context currently handles one city per request;
a cross-city alternative is not silently reduced to its first city. Unobserved
weather, unsupported bindings and missing scoped facts remain unresolved.
Exact-hour confirmation requires joint verified venue and offer schedules.
Matching never asserts booking availability.

Evaluation release v10 and ranking policy v4 bind this material composition and
the classification-only provisional selection rule. Public request/response
contract versions remain compatible. No schema or owner-authored Spot edits are
part of this change.

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

The fixed timing stages distinguish interpretation from canonical evaluation.
CPU-only integration benchmarks use synthetic catalogs and explicit model/DB
test doubles; they are not end-to-end live latency or price measurements.

## Semantic alignment revision 3 (implementation candidate)

Task class: PRODUCT_RELEASE. Production still requires the exact certified Main
artifact and explicit release authorization. No schema migration, permission,
consent, rate limit, model or reasoning-effort change is part of this correction.

Luna prompt revision `backyrd.luna-prompt@3` preserves the original frozen prompt,
schema and 127 meaning families. The appended instruction distinguishes actual
offer duties from general experiential purpose and companion context. It uses
canonical IDs from the same finite World vocabulary as matching; unknown terms
remain free values and never fall back to a similar known category. Named water,
view and area requirements remain separate, without duplicating a waterbody as
an additional free-text location duty. There is still one provider call and no
repair model call. Keep prompt, matching (`@10`) and shared World language (`@6`)
hashes bound to the certified release.

Undated dayparts describe a generic meal/experience window. They preserve the
original fact, respect any documented offer schedule and remain explicit context
in the assessment, without a dated opening or booking claim. Actual dates, weekdays, clocks and exclusions remain explicit. A known
contradiction at the requested time still excludes a candidate. A valid visit
window with unknown venue/offer hours preserves factual fit and reports unknown
availability; it does not claim that the offer is open. Unresolved or
contradictory requested time expressions remain unresolved. A meal must not fall back to
venue opening alone. Product availability remains `not_requested` when no
calendar availability is being claimed.

A documented consumable coffee can witness coffee drinking on that same offer;
it cannot establish a venue type, meal or workshop. Indoor/outdoor requirements
under either `offer.area` or `location.setting` use the linked activity area,
never an unrelated cafe. The engine does not re-read source prose or downgrade
unknown activity values to preferences/context.

All explicitly supplied participant ages remain visible even if a model group
lists only some people. A partial member list is not authority for headcount,
capacity or a total-price calculation. Per-offer minimum ages remain scoped to
the actual participants, global entry restrictions still apply, and missing child
entry documentation still remains unknown rather than claiming unrestricted
admission. A companion relationship is context; a genuine partner requirement
continues to need supporting offer evidence.

Acceptance covers the ten diagnostic wishes on a fixed, previously authorized
canonical Spot snapshot with a neutral synthetic actor, plus deterministic
positive/negative regressions and the active handler contract tests. Real model
captures stay outside Git. Such local replay is not a production HTTP/auth test,
a general language accuracy estimate, or proof of on-device availability.

### Confirmed identity and independent availability

Verified, current venue identity uses its existing DISCOVERY authorization for
positive category matching, including a required category. This is not a new
HARD_CONSTRAINTS grant: a Wine Bar identity cannot prove admission, meal, price,
accessibility or any other service. Exclusions retain their separate source
use-case check. Missing, conflicting, stale or unauthorized category evidence
stays unconfirmed. The former provisional-category ranking exception is removed.

Without a time wish, the evaluator does not infer a visit now from the system
clock, current opening state or weekday. A spot's publication/safety and actual
entry restrictions remain independent. With a valid requested window, unknown
hours are a nonblocking availability notice. Attributes retain their factual
witnesses; unavailable slots that are actually documented remain exclusions.
The response distinguishes confirmed fit from `actualAvailability: unknown` and
includes a readable unconfirmed-time notice. No opening claim is synthesized.
