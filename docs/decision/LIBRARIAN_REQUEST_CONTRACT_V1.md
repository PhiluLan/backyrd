# Lossless Luna and Spot matching boundary

Status (2026-10-16): single-route implementation candidate; production activation pending.
Task class: PRODUCT_RELEASE because the existing production adapter shares its
catalog read with the new library boundary.

## What is now in the canonical codebase

The previously isolated development implementation is integrated into
`packages/decision-vnext-core`: the frozen Luna request contract, deterministic
compiler, scoped matcher and server-only catalog adapter. Its earlier dirty
worktree is not a deployment source. Only these specific modules, their frozen
assets and their tests were imported, not its older interpretation repairs,
conversation schema or experimental client changes.

The request has 127 meaning families (126 fact families plus weather), typed
numbers, units, dates, participant bindings, duties, preferences, exclusions,
alternatives and conditions. The source text and raw model output are retained
exactly in the request-local plan, not published in recommendations or sent to
the catalog RPC. The engine never interprets the source sentence. Unrecognized
terms and unsupported duties remain unknown, rather than turning into a nearby
category. No follow-up chat, second model call, production data write or new
endpoint is introduced.

`product-luna-librarian-assets.ts` pins the approved v7 base prompt, model,
schema and catalog. The imported compiler preserves the existing development
prompt revision 2, which atomizes distinct activities. Neither prompt revision,
model, reasoning setting nor provider schema is changed by this integration.
Tests pin their hashes. A new model/prompt experiment needs its own comparison.

## Spot evidence and matching

The matcher uses the same World taxonomy as Admin and Owner. It reads reviewed,
current, verified, manifest-bound profiles and preserves source-use permission.
It joins actual offers and linked areas, not flattened spot-wide tags. Every
result retains the evidence hashes, offer/area identifiers, failed duties and
unresolved duties. Positive feature lists never prove the absence of a feature.

- A meal's diet, price, age rules, area and schedule must belong to a coherent
  visit. An unrelated cheap drink cannot prove an affordable dinner.
- A sport's minimum age cannot exclude a separately documented child activity.
- Mandatory venue identity needs its own evidence. A drink does not prove a
  wine bar, and a hotel does not prove a restaurant or spa.
- Hard contradictions exclude; missing evidence stays partial/unresolved.
  Preferences influence order after eligibility.
- Unknown weather keeps conditional alternatives visible internally. Exact
  dates and times are not silently converted to the current visit.
- Arbitrary free text is not automatically semantic evidence. Optional reviewed
  meaning links are accepted by server-configured content hash only. Owners
  cannot approve their own new equivalences.

Matching revision 7 closed a domain-family mismatch: a recognized meal request
emitted as `food.meal` can use the same real meal offer as an activity request.
A generic `food.drink` request can use a drinks offer. The original family,
modality, subject IDs and values do not change. Wine still requires wine
information. An unrecognized meal value remains unknown.

`createDecisionProductLibrarianRpcEvaluationProvider` uses the existing service
context v5 RPC exactly once, with actor/release/city/cancellation checks. The RPC
returns the full authorized city cohort independently of its mandatory legacy
intent transport hint. Both evaluators share one context transport helper.
The library does not independently authorize an HTTP caller or a release.

## Reproducible verification

Run:

```sh
npm test --workspace @backyrd/decision-vnext-core
npm run typecheck --workspace @backyrd/decision-vnext-core
npm run decision-vnext:single-route
node packages/decision-vnext-core/test/benchmark-librarian-matching.mjs
```

On the initial import, 139/142 contract and matching tests passed. Three failed
because the corresponding server adapter was not present in canonical main.
Integrating it through the shared context reader closed those failures.

Ten new domain-family regression expectations were written and run before implementation:
3/10 passed before the revision, 10/10 after. They cover meal kinds, generic
versus specific drinks, museum dining, diet/offer coherence, scoped budgets and
unknown values. A further test replays recorded Luna output unchanged through
the compiler and catalog matcher, preserving Baden, date, evening and mood.
These are synthetic and replay tests, not new live model calls or a measured
production recommendation success rate.

The final complete current Decision suite passes 247/247, including the
recorded-output integration case. Strict TypeScript and the single-route gate pass.
A local warm CPU benchmark with five facts and five repetitions measured medians
of 3/21/171 ms for 10/100/1,000 synthetic spots. The corresponding pre-correction
medians were 3/18/154 ms; these samples do not establish a speed improvement.
They exclude model, database, network and UI time. Matching makes zero model
calls. No production spot content was changed.

## Single-route runtime integration (matching v8)

The existing Edge handler now composes `createDecisionProductLunaProvider` and
requires its lossless result in `createDecisionProductRpcEvaluationProvider`.
The HTTP boundary revalidates both the exact original and plan hash. No raw
meaning is added to the public request or response shape. The legacy interpreter
is not an active fallback. Disabled Luna returns unavailable.

`product-librarian-evaluator.ts` adapts all assessments to the existing Product
ranking/presentation contracts, independently of its display context summary.
Classification has DISCOVERY rights, not hard eligibility rights. An explicitly
matching type can therefore be a disclosed provisional selection; any other
unknown hard duty still blocks primary selection. This rule is bound to the new
evaluator version, evaluation release v10 and ranking policy v4. No World source
policy rights were expanded.

The matcher can assess all 1,000 city candidates before final selection. Prices,
scopes and logical alternatives are evaluated before UI summary limits. Those
limits never discard a matching duty. Unsupported older typed hard filters stay
unconfirmed rather than disappearing. Numeric UI age/count/date/budget inputs
must survive model interpretation; omission fails before any catalog query.

The new active-route suite contains 24 cases, including ten independent
wish/catalog scenarios: linked atmosphere, vegan dinner versus vegan lunch,
food.meal, scoped numeric and group budgets, indoor area, excluded music,
river-area linkage, evening service and child/adult climbing separation. It
also covers auth, source rebinding, truncation without retry, OR, discovery
versus hard permissions, legacy UI guards, both actual client validators and
80 candidates with the first 50 rejected. A temporal regression verifies that
an older location-only UI filter cannot apply today’s closure to tomorrow’s visit.
A separate budget regression proves that an unconditionally retained, scoped
meal budget cannot be overridden by an old venue-wide price range. The provider is controlled in these
tests: they verify composition, not new live language-understanding accuracy.

Local current Decision scope: 271/271 tests pass. Product/Mobile release contract
scope: 39/39 pass. Strict types and single-route checks pass. A CPU integration
benchmark with mocked model/database/auth/control measured medians of
7/43/402 ms for 10/100/1,000 spots (five warm samples). Each request made one
mock model call and one mock catalog read. No paid API calls or production
writes occurred. Actual model, database and full-client latency/cost remain
unmeasured for this candidate: no OpenAI key is present in the local runtime.

Reproduce the integration benchmark:

```sh
node packages/decision-vnext-core/test/benchmark-librarian-http.mjs
```

Remaining operational acceptance: certify the exact release artifact, publish
through the existing manual release controls, then execute fresh authenticated
live requests using the server-held provider key. Verify real model responses,
actual current Spot knowledge, visible explanations, latency and token usage.
A green local/CI suite is not evidence of a deployed or accepted live model run.


### Identical World projection entries

The SQL Product projection can repeat a fully identical, provenance-bound fact
through compatibility branches. The reader treats an identical complete row as
idempotent and validates it once. Duplicate keys with any difference in value,
scope, trust, resolution, validity or provenance still fail closed. This does
not merge competing evidence or overwrite Owner data.
