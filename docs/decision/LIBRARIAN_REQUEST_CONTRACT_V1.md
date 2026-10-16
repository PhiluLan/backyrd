# Lossless Luna and Spot matching boundary

Status (2026-10-16): canonical library integration, not production activation.
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

Matching revision 7 closes a domain-family mismatch: a recognized meal request
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
node scripts/decision/benchmark-librarian-matching.mjs
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

## Remaining activation work — do not confuse library tests with live behavior

The installed `decision-v13` handler still composes the narrower ai-query@3.8
interpreter and existing Product assessment/presentation contracts. This PR does
not switch that composition. It must not be deployed as though it activated all
127 families.

The next release must carry the lossless plan request-locally from the one Luna
call into this matcher, bind its assessments to the existing release-controlled
ranking and visitor explanations, and retain consent-bound learning and replay
semantics. Do not project the plan back through the narrow intent/facet shape.
Validate the single authenticated route and both client transports with fresh
end-to-end requests, report actual model/database/total latency and costs, then
consume a certified exact Main artifact for production activation. No new chat
route, parallel Decision host or plaintext request persistence is authorized.
