# Lossless Luna and Spot matching boundary

## Family activities with additional catering (2026-10-31)

Prompt revision 10 represents an activity and its additional catering as separate
activity entities at the same venue. Required food alternatives remain `ANY`;
explicit conjunctions remain `ALL`. Shared anchors bound to one alternative do
not create a cross-branch conflict. The matcher never repairs a missing model OR
or silently moves a requirement to another entity.

Matching revision 24 recognizes catalogue family-activity synonyms and bounded
meal/snack concepts in `food.meal` or `food.option`, including the editor's
`food.meal_extent` evidence. A child's menu alone does not prove an activity;
separate venues do not satisfy same-place requirements. Existing room, age,
availability, diet and budget constraints retain their scopes and authority.
The failed live model output is retained as a regression fixture. Acceptance
requires a fresh model run, not only a hand-authored corrected meaning plan.

Matching revision 25 also reads the same meal/snack extent when the model emits
an equivalent consumption activity alongside `food.meal`. The real revision-10
model output is replayed unchanged against meals-only and snacks-only venues
through matching and the active HTTP route. Non-food activities do not gain
catering evidence, and the original OR branches and subject scopes are retained.

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


### Runtime performance and regional transport

The Decision route is database-heavy. Both Web forwarding and Mobile invoke the
same `decision-v13` function with `x-region: eu-central-2`, matching the production
database in Zürich. The SDK's older enum does not include this region; the
supported HTTP header avoids changing dependencies. Browser preflight permits
that transport header only within the existing configured-origin boundary.
Explicit region routing does not provide automatic cross-region failover; an
outage remains an honest unavailable state.

After authentication, rate limiting and request parsing, Luna understanding and
the service-only context read may overlap when a typed target city exists. The
prepared context is request-local, single-use and bound to the complete request,
actor/session, release identity and abort signal. The full Luna city/meaning
validation still runs before evaluation, and every existing before/after control
check remains. No prose-derived prefetch, shared response cache or second model
call is added. All outstanding operations are aborted when the handler finishes.
`INTERPRETATION.operationMs` now measures the overlapping preparation window,
not Luna alone. Context authority time remains the time of its verified read.

Matching retains the exact existing first 256 compatible witness states and the
existing overflow/unknown behavior, but stops allocating combinations that would
be discarded. Sort tie hashes are calculated once per state. Availability proofs
are reused only within one immutable world/scenario/visit window. Product reuses
the snapshots already validated by that same search instead of parsing them again.
These changes preserve selection, evidence and hash results; they do not weaken
eligibility, change source rights or raise the 20-second deadline.

Local synthetic comparison (100 spots, each with 10 offers and 6 areas, three
samples, model/database mocked): published matcher median 3,176 ms elapsed /
4,691 ms process CPU; optimized 559 ms / 706 ms, with identical complete results.
Fourteen additional comparisons against the published implementation and ten
full-response sequential/parallel comparisons passed. These are local measurements,
not production latency or a guarantee for the hosted 2-second CPU limit. Actual
production acceptance must repeat the previously CPU-terminated child/climbing
case and the Saturday-evening timeout case.


### Hosted CPU follow-up: production-only module entrypoints

The first regional/parallel release (f60bccf, Function 210) completed 13 of
14 authenticated acceptance requests, but the last wine-bar repeat still
exceeded the hosted 2-second CPU budget. This is not a passed reliability gate.
The remaining startup closure imported the complete World/User package barrels,
including synthetic calibration fixtures and historical research initialization.

Decision's Deno import map now targets `server-runtime.js` entrypoints in those
two packages. They only re-export the existing canonical implementations used
by the Product route. The ordinary package entrypoints, policy/registry hashes,
Luna contract, matching, consent, authorization and 20-second deadline are
unchanged. The deploy-closure verifier requires these entrypoints and rejects
historical barrels/synthetic initialization in Decision's reachable graph.

Ten synthetic full HTTP responses match byte-for-byte through the old and new
import maps, with one model call and one catalog read per request. In five local
cold-import samples, median process CPU was 291 ms through the full barrels and
51 ms through the production entrypoints (Node measurement, not hosted CPU).
Hosted acceptance must be repeated after deployment. The production-state file
records only the already verified f60bccf deployment/OTA, not this pending fix.


### Occasion-bound offer eligibility (matching revision 26, development only)

An offer type proves its activity, but does not erase a prerequisite in the offer's caption. Organised birthday, wedding, company and private-celebration service packages cannot establish a confirmed general outing without a compatible explicit `experience.occasion` fact (or explicitly requested celebration activity/kind) in the active request branch. This does not invent an occasion requirement in the original meaning plan. The selected offer receives an auditable `OFFER_OCCASION_CONTEXT_NOT_PROVEN` eligibility assessment and stays outside confirmed recommendations. An explicitly excluded matching occasion receives `OFFER_OCCASION_EXCLUDED`.

The finite caption vocabulary applies to service/package catalogue modules (instructed, movement, sport, food, work, plus private celebrations). Exhibition/programme themes do not imply a private booking. Optional or negated occasion examples do not establish restrictions. Registration alone never establishes an occasion restriction. A regular course remains eligible, and a venue with both birthday packages and regular play can be confirmed through the regular offer. Occasion facts attached to a different activity do not authorise the selected offer; inactive alternatives cannot supply the occasion either.

Product explanations name the selected family activity as well as its food offer and describe the unresolved special occasion in plain language. No new schema, model call, production write, ranking weight or spot-specific exception is used. Unknown prose remains outside this bounded caption recognition; this is not a universal event-language parser. This revision is developed and verified locally, pending a later combined release.


### Family and parent accompaniment (matching revision 27, prompt revision 11; development only)

Backyrd interprets a family outing as adults accompanying children. The meaning contract retains this as `people.relationship=adult_accompanied`, CONTEXT, INFERRED. A caller undertaking an activity with their child is retained as a separate PERSON (`people.role=self`); the child's age keeps its own PERSON scope. No exact adult age or complete party count is fabricated. Mere co-presence is not an arbitrary person's adulthood: explicit minor companions and explicitly unaccompanied children take precedence. Existing structured family relationship labels also carry the product default; generic `children_activity` alone does not.

The librarian can satisfy an adult-accompaniment exception to `UNACCOMPANIED_MINIMUM` from this context without requiring everyone's exact age and a headcount. It records the request evidence and an `ADULT_ACCOMPANIMENT_CONTEXT_CONFIRMED` assessment. Product explanations identify this as CONTEXT, so the additional gate cannot inflate venue evidence or ranking. `GENERAL_MINIMUM`, scoped offer admission ages, uncertain time/area applicability, and explicit absence of required adult supervision remain enforced. This is developed locally for a later combined release, not deployed.

### Provider boundary and activity scope (prompt revision 12; development only)

The first real prompt-11 preview of a family indoor outing with food returned no
confirmed matches: the model emitted `people.relationship` as REQUIRED and omitted
the separate physical ACTIVITY entities. Historical meaning remains immutable.
The active model schema now permits `people.relationship` only as CONTEXT; the
active validator independently rejects a violation instead of silently weakening
a requirement. Explicit companion exclusions are represented as context such as
`unaccompanied`; actual venue admission and supervision rules remain enforced.

The prompt specifies separate ACTIVITY subjects for the outing and its additional
food offer, including an explicit structural example. Indoor applies to the
outing's subject, food-or-snacks to a separate subject, joined by SAME_PLACE.
The matcher is unchanged: it still requires evidence for every requested duty.
Tests cover indoor play plus a separate cafe, snacks-only versus meals-only,
an outdoor activity with an indoor cafe (rejected), and explicitly indoor dining
at an outdoor food area (rejected). No venue-specific exception is introduced.

## Internal preview of unpublished understanding and matching

### Own consumption and family Zoo visits (prompt 15, matching 29, knowledge policy 2; development)

Own food/drinks are `participation.permission=own_food/own_drinks`, not a supplied
dish, meal or priced service. The active model validator rejects that erroneous
additional supply duty; historical meaning plans remain unchanged. Permission
uses the actual visited activity's scope, so a restaurant request cannot borrow
permission from an unrelated outside area. Explicitly needed heating/storage
services remain separate requirements. The source plan names `rule.external_food`
or `rule.external_drink` as appropriate, separately from scoped permissions.

Matching reads current verified HARD_CONSTRAINTS-authorized canonical consumption
rules and recognized scoped permissions. Missing rules stay unknown; explicit
denials, conflicting statements and unresolved conditions do not become permission.
A general permission does not erase a scoped restriction. Food and drink rules
remain independent. Own consumption does not prove venue food supply or introduce
a food purchase/price. Arbitrary custom-detail prose is not promoted to a rule.

The bounded exception grammar recognizes exclusions of dining establishments,
optionally followed by named dining examples. A selected dining offer/area is
excluded; known separate visit areas remain usable. Unknown areas, qualifications,
fees, time conditions or other uninterpretable exceptions stay unknown. Canonical
offer/area modules locate dining; no venue-name-specific exception is installed.
Exceptions remain visible in product explanations and traceable to their source.

A verified Zoo classification plus a VISIT offer participates in the existing
family-leisure proof: documented all-ages suitability and family atmosphere must
still hold at that offer's actual area and visit conditions. Zoo classification
or family-friendly food alone cannot establish a child experience. Admission and
opening rules retain their independent gates. The regression fixture is an
unchanged public canonical Zoo Basel projection, not amended test venue knowledge.
These changes are internal development; no spot data, SQL or consumer deployment
is changed by this fix.

### General outing purpose (prompt 14; development)

Generic wording such as making an outing or spending a day is visit purpose
(`experience.purpose`, CONTEXT), not a second required offer named "Ausflug".
A family outing retains its required child-compatible activity. Explicit concrete
activities such as hiking, a boat excursion, a guided excursion or a museum remain
binding. The model instruction changes; the matcher never silently relaxes a
previously emitted required activity. At the founder's request this correction
does not change own-food permission matching, legacy descriptive evidence, spot
data, weather rules or consumer deployment. Own-food permission remains required
when the user brings food and may still be unproven after this isolated fix.

### Weather policy (prompt 13, matching 28, experience language 13; development)

Weather entries have an explicit `role`: CONTEXT means weather stated by the user
for their visit, CONDITIONAL means a genuine unresolved if/else trigger. Context
is not a verified forecast and never gates the entire request. It cannot be an IF
or FACT reference. Historical entries without a role remain conditional; the new
provider schema requires the role and its validator enforces that boundary.
The evaluation plan records USER_VISIT_CONTEXT versus EXTERNAL_EVIDENCE_REQUIRED.
Actual conditional alternatives still require bound, fresh weather evidence;
without it their separate plans remain unresolved rather than guessing a branch.

For a general outing in stated rain, the model retains the weather context and
derives `offer.weather_suitability=rain_suitable` as an inferred requirement at the
requested activity. Explicit intent to experience rain/get wet overrides this
default. An explicit outdoor requirement is retained. Indoor use is not invented.
The matcher proves rain suitability through a documented indoor area/setting or
known rain protection at the activity's area. An unrelated indoor cafe, shade,
unknown protection, out-of-condition protection, or an ambiguous area type cannot
provide proof. Explicitly contradictory evidence remains unresolved or fails.
The shared language contains the finite `rain_suitable` concept; the matcher does
not parse user prose, alter incoming duties or invent catalogue values.

SUN, HEAT, COLD, WIND, SNOW and THUNDERSTORM are distinct contexts. Their presence
alone does not fabricate cooling, heating, shade, wind or storm safety. Explicit
requests for shade, temperature equipment or further weather suitability retain
their separate requirements; missing evidence stays unknown. This change does
not add a weather API or claim real-time forecast or safety verification.
No consumer deployment, SQL or spot data modification is part of the internal
preview. A later combined release must include the shared language and matcher.

Deferred at the founder's explicit request (2026-10-31): connect a real weather
provider later; continue request diagnostics first. Preferred candidate is
Open-Meteo (https://open-meteo.com/en/docs; commercial terms at
https://open-meteo.com/en/pricing). Future integration must fetch weather for the
destination and requested visit window server-side, cache by location/time,
retain source and retrieval timestamp, preserve forecast uncertainty, and supply
bound condition evidence to the current librarian. A provider failure must not
invent weather or override user-stated visit context. No subscription, provider
credentials or live weather adapter has been created; this remains deferred.

`scripts/decision/run-local-diagnostic.mjs` executes the canonical current evaluator
and ranker against an exported, verified regional catalog. It does not persist
decisions or learning and uses a neutral local identity, not an app user's profile.

For a real model call while the provider key remains in Supabase, build the isolated
`decision-internal-meaning-preview` artifact with
`node scripts/decision/build-internal-preview.mjs /tmp/backyrd-internal-preview-current`
after `npm run decision-vnext:build`. Deploy only that named function from the
generated temporary project. The consumer release configuration disables it.
JWT verification remains enabled; the handler additionally requires the genuine
server service credential and rejects browser origins. It accepts only a query,
uses the canonical provider and prompt, and exposes no prompt or model override.
Each invocation makes one bounded model call with a 30-second timeout. Treat this
as a privileged developer operation with provider usage charges, not a public API.

Run the local diagnostic with `--query`, `--catalog`, optional `--events`,
`--server-env` pointing to a private server environment file, and `--output`.
The runner verifies the remote runtime hash against its current compiled modules
and verifies the untouched meaning hash before evaluation. A mismatch fails the
test. No SQL migration, authorization grant, consumer function or runtime control
is changed by this workflow. Never expose the server environment to a browser.

Reports distinguish `REAL_SERVER_PREVIEW_MODEL_CALL`, `REAL_MODEL_CALL`, and
`INJECTED_PROVIDER_TEST`. Historical meaning replays and manually amended meaning
are not proof of current prompt behavior. Record model output, exclusions,
ranking, timing, usage and catalog provenance separately from fixture tests.

### Independent fit, eligibility and proof obligations (matching 30)

The canonical evaluator now uses `backyrd.librarian-proof-policy@1` and evaluation
plan version 2. Every candidate carries a hashed decision proof, with separate
experience, semantic criteria, additional requirements, availability and access
verdicts. Each entry records the original user-plan or visit-check origin,
modality, inference basis, participant/activity scope, selected offers/areas,
blocking status, exact reason and evidence hashes. The matcher uses this ledger
to determine failed and unknown duties; the Product projection independently
checks that every required/excluded duty is MET before ranking. Personal taste
cannot repair a failed or unknown duty.

Participant age is context for applying documented rules. An absent restriction
record, including an empty UNKNOWN minimum-age authoring field, does not create
a new mandatory demand to prove unrestricted admission. It produces an honest
non-confirmed notice, never an assertion of age suitability or unrestricted
entry. A documented minimum age, unresolved condition on that restriction,
members/guest-only access, or a specific user request for suitability still
requires source evidence. With unknown participant ages, an applicable documented
minimum permits discovery with an unconfirmed, non-blocking limitation naming
the exact minimum and its offer or venue scope. This does not assert age
compliance. A known age below the minimum remains ineligible; uncertain age
ranges and restriction applicability remain unresolved. Adult accompaniment
satisfies only an accompaniment rule, never a general minimum age.

Known participant ages are checked against the actual identified party; an
otherwise sufficient party does not need an invented exact headcount form.
Unnamed ages for explicitly mentioned participants disclose the documented limit without claiming compliance. If a
documented conditional restriction would be satisfied whether it applies or
not, uncertainty about its trigger creates no additional failure. Generated
mandatory entry checks require non-empty source evidence in their TypeScript
contract. Positive context checks do not purchase extra World ranking votes.

A facility used as the visit itself needs scoped activity evidence. An amenity
flag alone can qualify another requested experience but cannot turn its meal
into a playground visit. Catalogued visit areas or the specific facility together
with an actual compatible play/children offering provide that evidence. Roles
come from active typed activity scopes and the shared area catalogue, not query
text, venue names or candidate-specific exceptions. No indoor/outdoor preference
is invented when the request does not contain one.

Availability remains independent of semantic fit: a dated matching experience
with missing opening hours has confirmed experience coverage, unknown actual
availability, an unconfirmed tier and no rank. It is not labelled closed or
semantically irrelevant, nor silently promoted to an open recommendation. A
known venue closure, offer validity/weekday/time restriction or kitchen closure
is evaluated before returning an unrelated missing timetable. Opening hours
still inherit only under the existing explicit fallback policy.

Conditional weather plans retain separate branch proofs. An unresolved external
condition cannot combine mutually exclusive activities into an AND, and a
failure in only one possible branch is not universal rejection. No forecast
provider has been added.

Use `run-local-diagnostic.mjs --recorded <original-report>` instead of
`--server-env` for a controlled software comparison. It validates the source
query, reference time and original meaning hash, retains the full raw plan,
makes zero model calls and labels output `RECORDED_MEANING_REPLAY`. The report
includes both original and current catalogue provenance; a replay does not
certify a new model interpretation. When the prompt configuration changed, the
original hashed record is verified first and its unchanged raw meaning is bound
to the current evaluator configuration; both provenance values are retained.
Prefer an unchanged catalogue when measuring
software effects, and fresh real model runs to evaluate understanding.

The cross-category acceptance suite is `librarian-proof-policy.test.mjs`. It
checks added age/date context across meals, museums, play and parks; supporting
facilities; missing vs documented age restrictions; preserved prohibitions;
unknown schedules vs known closure; active alternatives and weather branches.
The historical child-entry tests intentionally changed: they had encoded the
invented universal duty as expected behavior. The event minimum-age case now discloses its documented minimum for unknown ages,
while a known age below that minimum still excludes the event.
No production spot data, schema or consumer deployment accompanies this change.
Mobile and Web explicitly render the deterministic age-documentation notice and
own-consumption exceptions, including for otherwise confirmed candidates.

### Service semantics and relative price preferences (matching 31)

The restaurant control exposed another conjunction error: general venue hours
could substantiate an inherited LUNCH offering in the evening. Inherited hours
now intersect with the semantic service period of BREAKFAST (MORNING), BRUNCH
(MORNING/MIDDAY), LUNCH (MIDDAY) or DINNER (EVENING), using the existing daypart
policy. These defaults are not stored as researched hours. Outside that default,
the offering remains unconfirmed rather than being declared closed. An explicit
offer schedule or authored service dayparts can substantiate atypical periods,
such as all-day breakfast. Generic gastronomy and snacks acquire no invented
meal-time restriction.

Required monetary budgets still need actual price evidence. A PREFERRED
qualitative price wish now uses the already defined PRICE_LEVEL policy against
verified venue-level price knowledge, instead of asking for a cash ceiling as
if it were mandatory. The canonical vocabulary maps inexpensive to LOW and not
too expensive to MEDIUM; no francs, currency conversion or offer-level price is
inferred. HIGH alternatives remain eligible when price is only a preference,
but receive no positive price-preference match. Missing price knowledge remains
unknown. The relative level and its limitation are rendered in Mobile and Web;
required undefined qualitative ceilings still need clarification.


### Translation admission: meaning roles v2 (prompt 18 / provider 4)

Schema-valid model output is not necessarily executable meaning. The canonical
`product-luna-meaning-contract.ts` now supplies both the model instructions and
pre-search checks for exact shared catalogue concepts: activities, food, mood,
facility, access/permission and booking. The frozen historical schema and raw
historical meaning plans are unchanged. An animal-observation activity is
separate from animal-keeping/contact conditions and bringing a pet. Unknown
wording is never coerced into a known activity by substring matching.

Normal requests use one model call. A diagnosed concept/family mismatch allows
one correction under the same abort deadline. Only the diagnosed fact keys may
change to the listed executable families. IDs, values, basis, modality, scopes,
entities, logic, alternatives, weather and uncertainty records must remain
unchanged. If correction fails or a required/excluded family has no
built-in evaluator, return an understanding-unresolved error before catalog
search. This is not an empty result and not evidence that no suitable places
exist. Context and NOT_REQUIRED are not matching duties. Historical replay and
the separate reviewed semantic-registry matcher remain lossless and unchanged.
The active product provider uses the built-in capability contract; custom
registry execution requires explicit provider-capability integration before it
can be enabled there.

The private internal preview records both model outputs and diagnosed issues
in memory, actual model-call count and every usage record. Neither source text
nor intermediate meaning is added to public product responses or persistent
learning. The local runner preserves these diagnostics. Consumers are not
released by updating the isolated server-only internal preview.

Regression validation must include independent real model calls for identical
requests, semantic paraphrases and contrasting meanings. Compare required
meaning and eligibility sets against one unchanged catalog and clock context;
ranking tie order may vary. Unit fixtures alone, caching, a single successful
call or deterministic JSON shape do not establish interpretation stability.
This guard diagnoses known role/capability errors; it does not prove that every
possible natural-language wish was retained correctly. Repeated real-call
results and remaining semantic variance must be reported explicitly.

Active prompt 17 also constrains all declared person/source/purpose context
families to CONTEXT in the provider schema and validator. A source ordering
word is not a venue requirement; real ordering uses SEQUENCE between concrete
activities. Booking's ambiguous NOT_REQUIRED/booking_required combination is
excluded by the active schema. Absence of a booking prerequisite means a
positive spontaneous-access duty; NOT_REQUIRED/spontaneous is reserved for
explicit indifference. Historical plans are not modified. This closes two
additional variants found by the first real repetition suite, which is retained
as a failed stability baseline rather than presented as all-green.

Prompt 18 adds a versioned explicit-preference evidence vocabulary, shared by
provider schema and runtime admission. Without an explicit supported optionality
marker, PREFERRED is removed from the request-specific model schema (including
ANY strength). Concrete wishes, including unquantified relative price wishes,
may not be relaxed solely because they are hard to prove. No numeric budget is
invented and the existing required qualitative-budget clarification remains.
The full base active schema hash plus preference policy hash and source bind
this deterministic schema derivation. A marker only authorizes the corresponding
optional clause, not weakening unrelated requirements. The finite vocabulary is
German/English/French/Italian; unfamiliar optionality phrasing remains an
explicit limitation and must not be claimed universally understood. The first
18-call suite exposed a final restaurant call with a relaxed budget; that failed
baseline is preserved. Re-test against fresh independent calls before claiming
stability. This rule is evidence for relaxation, not a substitute for language
understanding or an assurance that all omissions can be detected.

Matching 32 accepts a leading declared optionality qualifier in a PREFERRED
relative-price value only when the entire remainder is an already recognized
price meaning. For example, `möglichst nicht zu teuer` and `nicht zu teuer`
then read the same verified price-level evidence. Hard wishes are not relaxed,
negations are not removed, unrelated prose stays unknown, and no currency or
monetary ceiling is introduced. The 20-call prompt-18 repetition suite is
retained with its exact matching-31 identity; recorded-meaning replays validate
the deterministic matching-32 change separately. Provider/network errors also
remain distinguishable from rejected model interpretations.


### Documented minimum-age discovery (matching 33; development)

Approved product policy: an unknown participant age does not hide an otherwise
matching offer. The shared eligibility assessment emits `AGE_REQUIREMENT_TO_CHECK`
as UNKNOWN/CONTEXT, with the verified minimum and selected offer label (or venue
scope), retaining its source hash. Presentation says e.g. “Bewegungslandschaft
für Kinder: ab 1 Jahr. Bitte prüfe die Altersgrenze vor dem Besuch.” Mobile and Web
keep this limitation visible even on a confirmed recommendation. It is neither
age-compliance proof nor a positive ranking signal. Known younger participants,
conflicting minimums, unknown applicability, missing required supervision and
booking-person restrictions retain their existing checks. No catalogue data,
prompt, schema or public deployment is changed by this local revision.


### Explicit all-ages suitability (matching 34; development)

`participation.age_suitability=Alle Altersgruppen` (including the accepted
English/French labels) is positive child/age-suitability evidence without an
additional family-atmosphere tag or an offer-type whitelist. It introduces no
minimum or maximum participant age. The property must be KNOWN and applicable
to the visit. Its witness stays attached to the actual offer and linked area;
the canonical age-suitability property is offer-scoped, so another offer
cannot inherit its age proof even when both share an area. An unrelated cafe
cannot qualify an animal activity. This establishes suitability, not the presence of animals,
a playground or food; those requested activities still need independent,
coherent evidence. Documented admission minimums, adult supervision, booking,
opening and other restrictions keep their own checks. No Spot facts are edited.

This supersedes the former FAMILY_LEISURE_ALL_AGES shortcut, which required
both all-ages suitability and family atmosphere and excluded unlisted activity
types such as ANIMAL_OBSERVATION.

### Founder-accepted discovery references

The active Product librarian retains human-accepted development references in
its existing domain-evaluation fixtures and tests. These are feedback about
recommendation quality, not app-user taste signals, online weight updates or
automatic model training. Historical Decision Lab golden scenarios and Nuknuk
research-training intake have different purposes and are not used as runtime
learning paths for these references.

`test/fixtures/founder-approved-playground-daughter.json` records the founder's
explicit 2026-10-31 acceptance of “Spielplatz mit meiner tochter”: one unique
request, three real model runs, seven accepted positive spots. It retains the
original structured outputs, code/prompt configuration, source-report hashes,
catalogue hash, frozen public knowledge for those seven spots, and the approval
quote. The record hash detects accidental changes; it is not authentication or
permission to change production.

`librarian-domain-evaluation.test.mjs` replays all three recorded meanings through
the active Product composition and asserts that all seven accepted spots remain
confirmed without an invented child age. This portable positive-only replay
does not recheck all 432 spots or 25 events from the original runs and cannot
certify all exclusions. The observed order is retained as evidence, not a
universal ranking target. These repeats are not three independent accepted
requests or a blind holdout.

The missing ELYS “ab 1 Jahr” notice in runs 1 and 3 remains an OPEN issue. The
founder accepted the recommendations; the missing warning must not become an
approved training target or a requirement that future code preserve the bug.

### Immersion bathing versus steam treatment (matching 35, experience language 15; development)

An actual `SWIMMING` offer can satisfy ordinary `bathing`; this is a directed
activity relation, not synonym equivalence. A shallow/thermal bathing offer does
not establish sports swimming in the reverse direction. The derived bathing
witness retains its actual linked area.

The broad historical `BATHING` kind and an additional generic “Baden” property
cannot by themselves establish immersion bathing for an offer explicitly
scoped to a sauna/treatment room or declared as Hamam/Dampfbad. Every positive
witness passes the same scope check, including type, property and caption
matches. A `POOL_AREA` linked to that exact witness supports actual water bathing;
a different pool elsewhere at the spot cannot rescue its steam-treatment offer.
No venue-name exception, new user obligation, invented child age or production
profile edit is introduced. Negated steam captions are not positive steam proof.

For the recorded request “morgen baden mit meiner tochter”, the unchanged
meaning/catalogue replay now selects aquabasilea's Badewelt and Hallenbad Rialto's
swimming offer. DAMPF°BAD remains outside recommendations with
`STEAM_BATH_NOT_IMMERSION_EVIDENCE`, not a fabricated closure. Bachgraben's recorded
closure and St. Jakob's season restriction still exclude them; Eglisee's winter
swimming offer is understood but remains unresolved on the requested opening
date. These checks are independent of the activity relation. The rules are
covered by `librarian-water-activities.test.mjs` in the existing core test command.

### Required relative price (matching 36, knowledge policy 3; development)

Required and preferred qualitative price wishes use the same existing relative
mapping: “günstig”/“preiswert” up to LOW; “nicht zu teuer”/“bezahlbar” up to MEDIUM.
Required wishes retain REQUIRED modality: HIGH/PREMIUM fail, and missing,
conflicting or unsupported evidence stays unknown for that candidate. Optional
wishes still influence ranking rather than exclude alternatives. No currency,
personal monetary ceiling or affordability guarantee is inferred. Explicit
monetary budgets keep their separate actual-price evaluation.

This supersedes the earlier policy that forced clarification for every REQUIRED
qualitative price phrase even when the phrase and venue price level were known.
The active default is PRICE_LEVEL; the old CLARIFY override is not selected by
request modality. An unknown candidate no longer prevents otherwise proven
alternatives from being recommended. Presentation distinguishes missing price
evidence from an unbound price scope instead of always asking for CHF/person.

For a selected food/drink offer, the general venue price level is usable as a
gastronomy default only when verified discovery classification identifies a
food/drink/cafe venue without contradictory non-food venue types. The authorized
price-level evidence remains mandatory and its classification provenance is
included in the assessment. A zoo, pool, museum or hotel price level cannot
qualify its embedded restaurant. No new offer-price fields or cash-to-relative
thresholds are fabricated; embedded gastronomy without its own usable relative
price context remains unknown. Concrete dish prices alone do not acquire an
invented LOW/MEDIUM label.

For “essen gehen, nicht zu teuer, und wir haben einen veganer dabei”, the original
meaning/catalogue replay yields five confirmed food-and-vegan candidates with
usable relative price evidence. VITO/Tibits remain unresolved on missing price
levels; Zoo Basel, aquabasilea and Bachgraben on unbound gastronomy price scope.
The vegan person's requirement stays person-scoped and does not require the
whole restaurant to be exclusively vegan. Regression coverage lives in
`librarian-relative-price.test.mjs` in the existing core test command.

### Matcher 37: explicit products in authored food-offer titles

Food/drink offer titles may establish explicitly named products through the existing bounded item-list grammar, preserving offer and area scope. “Kaffee und Kuchen aus eigener Bio-Backstube” proves coffee and cake. Generic bakery goods do not prove cake; negated or qualified availability does not become unconditional product evidence. Missing atmosphere remains unknown. The first sequential discovery case reproduced the previous missed product evidence; same-meaning replay confirms the correction without inventing a cozy atmosphere or changing spot data.

### Explicit external-participation uncertainty

Selected offer notes that explicitly require checking external guest participation remain visible as a sourced limitation in the canonical response, Mobile and Web. This does not prohibit hotel breakfasts or infer a guest-only rule. It preserves the recorded uncertainty rather than presenting external admission as confirmed. Discovery may still suggest the offer with the check-before-visiting notice.

### Prompt 19 / meaning roles 3: co-diner dietary needs

A dietary need during a typed food visit must be executable, not context that silently disappears. The provider asks Luna to preserve the person and desired food option, normally REQUIRED unless the user explicitly made it optional. A meal with a vegan companion does not mean a wholly vegan venue. A CONTEXT food.diet next to a known meal intent triggers the existing single bounded correction: the model may classify only that diet into an executable modality using the original request. Values, people, logic, other duties and all unrelated modalities remain immutable. No raw-query keyword rewriting or automatic promotion by the librarian occurs. Diet context without a food visit is not turned into a venue requirement.

### Matcher 38: co-diner diet belongs to the requested meal

Brunch, snacks and apéritif use the same meal-witness join as breakfast, lunch and dinner. A person's dietary requirement inherits the sole explicitly requested meal activity when no separate activity scope is given. An explicit separate activity scope remains authoritative. A vegan lunch elsewhere in the venue cannot prove a vegan brunch. This was reproduced by the third sequential discovery query and is checked with both person-only and person-plus-activity dietary scopes.

### Prompt 20 / meaning roles 4: field identifiers are not content

A TEXT value equal to a known request field identifier is an invalid placeholder, not a genuine activity with no matching spots. It triggers the same bounded single correction before retrieval. Only the diagnosed placeholder TEXT value may be repaired from the original request; its family, subject, modality and all other facts remain unchanged. Still-invalid placeholders stop as an understanding failure, never a fabricated zero-result search.

### Matcher 39 / experience language 16: dietary option labels

The authored option labels “Glutenfreie Option” and “Laktosefreie Option” express the corresponding dietary option and may witness food.diet at the same offer. The mapping is finite and shared, not fuzzy prose matching. Generic ingredient information or adaptation on request proves neither option. A separate lunch option cannot qualify dinner. This mapping does not assert allergy safety, cross-contamination protection or a wholly free-from kitchen.

### Prompt 21 / meaning roles 5: no invented missing child age

A daughter/son without an age produces no age fact. In particular APPROX 0 is not an encoding of unknown age. The source-bound provider detects this placeholder when the request does not mention zero and asks the single bounded correction to remove only the diagnosed placeholder. Other facts and logic remain immutable; unsafe linked removals fail understanding validation. The prompt also reiterates that rain alone supplies no visit date. This is not a claim of complete source grounding for every possible numeric/date output; the genuine museum query is retained as development evidence.

### Matcher 40: an accompanying adult cannot hide a child's age notice

A typed child/family participation context remains relevant when Luna omitted a separate child entity or attached the relationship globally. The known/assumed accompanying adult's age alone cannot establish that a documented offer minimum is met by the child. An unknown child age retains the existing non-blocking, source-bound minimum-age notice. Explicitly younger children remain excluded; a known eligible child does not acquire an unnecessary notice. The three historical founder-approved playground meanings retain the same seven results and now all show ELYS's documented minimum of one year. The fixture's historical open-issue record is preserved, not rewritten as if its original runs already contained the notice.

### Matcher 41 / prompt 22 / meaning roles 6: free activity and price parameters

budget.scope is a context-only price parameter in the active structured-output contract, never a second venue duty. Zero full activity cost is independent of currency conversion or group division. A selected, applicable, unrestricted full tariff with a positive minimum cannot satisfy a free request and is marked failed rather than hidden as missing currency. Missing tariffs, partial prices, age restrictions and fee uncertainty remain unconfirmed; missing price does not mean free. The actual Pingpong query exposed the parameter-as-duty failure and an absent Kannenfeldpark activity tariff.

### Matcher 42 / prompt 23 / meaning roles 7: companion count versus group-capacity request

Incidental companion headcount (“wir beide”, “mit einer Freundin”) is people.count CONTEXT. It remains available for prices, known capacity limits and participation, without inventing a separate demand for a bookable group slot. An expressly requested group booking or minimum number of places remains REQUIRED and uses the existing capacity proof. Explicit offer capacities apply independently even to contextual headcount; missing capacity is not assumed to mean sold out. This overrides the older overly broad instruction that every complete headcount must be a required group-capacity request.

### Matcher 43: coherent offer and unaccompanied age prerequisites

A selected offer with a documented minimum at least as high as the venue's unaccompanied threshold already entails that lower threshold. The offer's exact non-blocking age notice remains visible when ages are unknown; the same missing age must not additionally block discovery under a weaker supervision rule. This does not waive any minimum, override a known younger participant or substitute a lower minimum from another offer. Reproduced at ELYS: selected bouldering minimum 14 and venue unaccompanied threshold 13.

### Matcher 44 / experience language 17: take-away is an executable service requirement

food.delivery with the finite take-away/to-go concept reads the existing authorized operation.takeaway fact, deferred until the actual food/drink offer is selected. A verified gastronomy venue default may qualify its selected food offers; an unrelated hotel/museum service does not. False and missing facts remain false/unknown. Take-away does not establish home delivery. This adds the missing canonical reader rather than discarding the user's coffee-to-go requirement.

### Matcher 45: authored free admission is evidence, optional metadata is not a veto

A selected passive admission-based visit can use its own explicit zero admission tariff even when fee-completeness metadata was not filled in. Admission wording may be in the tariff label when includes is empty. The rule is bounded to admission-based visit offers and exact admission labels; age-limited prices, partial/sample services, explicitly excluded mandatory fees and contradictory positive tariffs do not qualify. Mobile/Web display that the selected admission is free and optional extras are not included. No free price is copied from another activity or inferred from an absent tariff. Reproduced at Tierpark Lange Erlen.

### Matcher 46: venue parking remains visible with an authored profile

A verified, DISCOVERY-authorized amenity.features PARKING fact can establish general parking presence even when an experience profile exists. A profile no longer hides this existing venue source. Explicit scoped parking values, including unknown, retain priority; no indoor/covered parking location is inferred. Positive parking presence uses its authorized discovery purpose, like venue type; exclusions, admission and accessibility guarantees are not inferred from it. The source proves neither a free bay, reservation, fee level nor parking inside the selected room. Reproduced in the overnight/breakfast/parking query at Ibis, Wettstein and other hotels.

When an overnight-stay offer is actually selected at the same hotel, the separate warning about external breakfast guests is not shown: the planned visitor is a hotel guest. Breakfast-only discovery retains that warning. Both paths are covered through the active Product chain.

### Matcher 47 / experience language 18 / prompt 24 / meaning roles 8: laptop work and WiFi

Finite laptop-work labels map to the actual COWORKING offer concept. A café or WiFi alone never proves permission to work. Verified venue WIFI is a positive discovery amenity alongside parking, retained when an experience profile exists unless explicit scoped knowledge overrides it. It does not guarantee signal quality or invent another room's facilities. The meaning instruction keeps work in a café, café type, quiet and WiFi on the same spatial activity rather than constructing an independent office beside a café. Reproduced in sequential case 30.

### Prompt 25 / meaning roles 9: known duplicates are not unsupported new duties

A required/excluded extension whose exact finite concept is already represented by a fact with identical subjects, modality and basis is diagnosed as a redundant extension. The existing single correction may remove only that diagnosed duplicate; all real facts and unknown extra needs remain immutable. Different participants, different modality or an unmapped description is not a duplicate. The model does not silently lose genuine unsupported wishes. Reproduced when correctly emitted coworking was duplicated as “Arbeiten mit dem eigenen Laptop” in case 30.

### General atmosphere preference policy (prompt 26)
Ordinary cozy, relaxed and romantic atmosphere requests remain explicit ranking preferences. They are not confirmed without scoped mood evidence. Emphatic must/only wording disables this default. Noise, conversation, music, activities, meals, diet, price, location, access and time remain mandatory unless explicitly softened. The schema and provider both enforce the bounded exception. No spot data is inferred or edited.

### Primary gastronomy purpose ranking (matching 48)
A food/drink-only request gives positive primary-purpose evidence to verified EAT/DRINKS/COFFEE_DAYTIME venues. Other venues with proven food remain eligible; this is ordering, never an exclusion or proof of independent access. A simultaneous non-food activity (including a playground or children activity) disables this gastronomy priority. Existing meals, diets, access and availability still require their own scoped evidence.

### Concrete activity with a child (prompt 27)
A named museum visit, animal observation, playground, bathing or sport retains that activity and typed companions/ages. Child accompaniment alone must not add a separate generic children_activity requirement: existing age and admission rules assess the actual activity. Generic family outings without a specified activity still require children_activity; an explicitly requested special child programme also remains mandatory. No age, date or child suitability is fabricated.

### Escape-room offer format (matching 49)
The ESCAPE_GAME catalogue kind is labelled Escape Room. An offer explicitly named as a portable puzzle box/Rätselkiste cannot prove that room activity even if stored under the same broad kind. Other actual escape-room offers at the venue remain eligible. No venue names or preferred result IDs are encoded.

### Bounded transport recovery (provider 5)
HTTP 502/503/504 may consume one retry across the entire translation, including an optional meaning correction. All calls share the existing abort budget. Permanent HTTP failures, rate limits, network ambiguity, refusal and malformed outputs are not retried by this transport policy. The protected internal diagnostic records HTTP statuses and a sanitised failure code without provider response bodies, keys or public exposure.

### Separate takeaway and route requests (prompt 28 / matching 50)
A route activity plus takeaway does not imply that the walk must take place in the café. Preserve distinct activities; do not invent SAME_PLACE without an explicit common venue. If no single-venue result exists, the current engine reports MULTI_PLACE_SEARCH_UNSUPPORTED instead of disguising the missing multi-stop planner as ordinary absence of places. This is an honest capability boundary, not implementation of multi-stop recommendations or a successful matching result.
