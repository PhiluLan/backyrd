# Request understanding v1 — first work package

Status: **implementation integrated; live development evaluation running; independent acceptance pending** (2026-10-11).
Owner: Decision Product. Work class: PRODUCT_RELEASE. Active implementation stays
in the canonical Decision route. This is not a Production activation.

## Implemented path

`product-ai-interpretation.ts` requests structured semantic facets and up to
12 typed requirements in the same provider call. Each requirement retains its
dimension, importance, operator, origin, interpretation state, typed value,
alternatives and optional OR group. Literal evidence must occur in the source
sentence; it is discarded before persistence. This proves source provenance,
not correctness of the model's normalized meaning.

`product-request-understanding.ts` validates and minimizes that output, binds
it to the complete interpreted request and a versioned policy, and projects the
supported context into the existing public shape. The internal HTTP port carries
`{ request, understanding }`; clients cannot submit that envelope or override
server understanding. The production adapter passes it to the canonical World
evaluator without sending it to World/User context RPCs or learning.

Supported context includes the youngest explicitly stated age, group size and
explicit adult presence, integer inclusive CHF budgets per person, and an
absolute/relative/weekday visit date with daypart. Relative dates resolve only
against authoritative Swiss server time. A parsed future date suppresses stale
lexical OPEN_NOW inference (for example, "not now, tomorrow"). Structured UI
values remain authoritative; conflicts with the sentence remain visible.

Essential canonical atmosphere/offering/experience requirements have an
independent World-evidence check, even if the older facet normalizer marks them
optional. Same-dimension, same-policy groups are OR; independent groups are AND.
Scoped evidence must apply to the visit. Known explicit exclusions reject a
candidate. Unknown hard requirements cannot rank; unconfirmed essential needs
cannot produce ELIGIBLE_CONFIRMED. Canonical positive preferences still enter
ranking without becoming hard eligibility. Preferred exclusions are retained
but do not yet have a separate negative ranking contribution.

Unsupported conditions remain honest: fractional/strict/total/foreign-currency
budgets retain their exact internal representation but are not confirmed by the
public v1 money evaluator. Exact clock time, travel limits and group capacity remain unverified.
ACCESS has no typed model value in the current enum catalog and is retained as
UNSUPPORTED; existing deterministic accessibility checks still apply. Unsupported
hard conditions block ranking, including mandatory age suitability without evidence.
A destination conflicting with the authorized city blocks candidates from that
city; automatic source-aware redirection and clarification UI are still pending.

The previous bounded lexical fallback remains available when AI is disabled or
omits a supported field; its 160-case diagnostic is separate from model quality.
Provider failure does not silently fall back to an invented successful AI result.
Explicit ESSENTIAL exclusions normalize to HARD vetoes; optional exclusions keep
their optional strength. A group containing only one requirement normalizes to
no group without changing its meaning.

Versions: interpreter `ai-query@4.7`; understanding contract `@1.0`; understanding
policy `request-understanding-policy-v7`; AI and lexical context resolver v3; evaluator `@2.3`. Model output cap is 3600 tokens (previously 2400), with the
existing maximum of one malformed/incomplete-output retry. Existing server
allowlist, authentication, rate limits, deadline and release controls remain.
Latency and cost are measured by the development runner below; independent
quality acceptance is still required.

## Minimized persistence review

Purpose: stable interpretation of retries/alternatives for one actor and exact
request, avoiding repeated provider calls and nondeterministic replay. This is
operational processing of a submitted search, not personalization consent or a
new profile/learning signal. The existing private cache now contains a compact,
validated requirement representation in addition to canonical facets:

- Only canonical enums, bounded numbers, dates/times, group identifiers and typed
  alternatives. Location is restricted to Basel, Zurich or UNSUPPORTED_CITY;
  arbitrary place names, addresses or text cannot be stored in that field.
- At most one AGE requirement. Provider-only participant age lists reduce to the
  youngest age before the cache; ambiguous age alternatives retain only each
  possible minimum. No full age list, person name, source quote or offset is
  stored. Minimum age is personal context: this is not anonymous or zero-retention.
- Cache key remains actor/request/model/catalog/release/artifact/source/generation
  bound; it additionally includes the understanding policy in the model-policy
  hash. Old policy entries cannot supply the new shape. Existing service-only
  RPCs, RLS/revocations and account-deletion cascade are unchanged.
- Existing validity is at most 24 hours. Expired rows are removed through bounded
  existing cleanup; expiry is **not** a guarantee of physical deletion at hour 24.
  This distinction must remain in the release/privacy review.
- Keep the existing 4096-byte PostgreSQL JSONB-text limit. Oversize interpretations
  fail before persistence, without truncating requirements or retrying a write.
  Compact positional cache encoding is confined to this boundary and revalidated
  on reads; application code uses named typed properties.
- The full internal understanding is not added to the public response, decision
  learning events or diagnostics. Existing response/idempotency context fields
  can contain the recognized minimum age, group and representable budget. Their
  existing storage policy still applies.

No schema migration or Production write is part of this change.

## User outcome

Every material part of a person's request must survive interpretation. Backyrd
must either understand it, make the uncertainty visible, or ask a useful question.
A valid JSON response is not proof of understanding. A correctly understood
request is not proof that any Spot satisfies it.

The initial scope is a Basel development corpus in German/Swiss usage and
English. Multilingual coverage is a test objective, not a launch claim.
The 160 visible phrasings belong to 40 semantic families; they are not 160
independent observations. Expectations are agent-authored proposals requiring
human product review. No real user data was used. No holdout has been created
or inspected by the implementation team. Commission an independent holdout after
review; do not relabel this visible corpus as blind evaluation.

## Understanding contract and remaining design targets

Contract identity: `backyrd.decision-vnext.request-understanding@1.0`.
This is an implemented **server-internal** contract, not a client request field
and not authority to change authentication, World facts or the public API.

An understanding is bound to the full interpreted request hash and versioned policy.
The model supplies literal evidence only for request-local validation. The
explicit persistence review above defines the minimized cache representation.
The original richer design targets below are retained where they are not yet
implemented; they are not a claim that the model always extracts every need.

Each requirement has:

| Field | Meaning |
| --- | --- |
| identity | Stable array position within the request-bound understanding; no model-controlled identity |
| `dimension` | EXPERIENCE, ATMOSPHERE, COMPANY, AGE, TIME, LOCATION, MOBILITY, BUDGET, ACCESS, OFFERING, or OTHER |
| `importance` | HARD, ESSENTIAL, or PREFERRED; this classifies the person's need, not Spot truth |
| `operator` | REQUIRE or EXCLUDE |
| `origin` | EXPLICIT or INFERRED; DEFAULT provenance for profile/UI location remains a future client contract change |
| `interpretationState` | UNDERSTOOD, AMBIGUOUS, or UNSUPPORTED |
| `value` | A dimension-specific normalized value, or null when not resolved |
| `alternatives` | Bounded alternative normalized meanings for AMBIGUOUS only |
| source evidence | Exact request-local quote, discarded before cache; offset-based inspection remains a design target |
| World check | Derived by the evaluator, never accepted from the model; unsupported requirements stay disclosed |

Requirements compose as an AND of bounded alternative groups (OR). Do not turn
"Museum or cinema" into two simultaneous demands. "Coffee and cake" preserves
both requirements. Contradictions are retained as unresolved conflicts; a
normalizer must not silently delete one side or turn both into preferences.
No implicit widening of requested alternatives is allowed. Context alternatives
remain ambiguous rather than being resolved by guessing. Non-facet OR groups
are retained but are not yet executable context alternatives.

Inferred preferences may affect discovery but cannot invent an exclusion,
legal restriction, exact number, age, alcohol intent, or guardianship. Explicit
venue type, requested offering, visit purpose and desired atmosphere remain
independent. Any promotion of an inference to a hard constraint must have a
separately versioned deterministic rule and counterexamples.

### Dimension-specific targets (implementation limits above apply)

- **Experience/offering/atmosphere:** canonical identifiers when available;
  unsupported needs remain explicit OTHER requirements. The current World
  catalog does not define the complete set of legitimate human requests.
- **Age/company:** a bounded list of stated participant ages and stated group
  size, each with source. Compute the youngest age from all stated participants.
  A daughter has no inferred numeric age. Family does not imply exactly two
  participants. Adult presence and legal guardianship are separate claims.
- **Time:** date reference (absolute, relative day, weekday), time window,
  timezone source and optional visit duration. Resolve relative dates once
  against a server-authoritative timestamp and location timezone. Distinguish
  "morgen" (tomorrow) from "am Morgen" (morning). Retain excluded dates and
  overnight intervals. An exact hour remains unverified until the evaluator
  actually supports checking it.
- **Budget:** decimal amount, currency, comparison LT/LTE, and basis
  PER_PERSON/TOTAL/UNSPECIFIED. "Under 30" is LT, "at most 30" is LTE.
  Never compare a total-party budget directly to a per-person range. Do not
  infer currency from an unlabelled number or translate an ordinal price level
  into an amount.
- **Location/mobility:** explicit destination, optional neighborhood, maximum
  distance or travel time, mode and origin. A stored profile city is DEFAULT,
  not an explicit instruction overriding the sentence. Device coordinates
  remain separately permission-bound. City names are not geographic authority
  until resolved and validated through the existing Product boundary.
- **Access:** distinguish entrance, route, seating and other specifically
  required facilities. A broad need may expand only through the versioned
  accessibility policy, not guessed medical or personal attributes.

### Required invariants

1. Every material source span is represented, ambiguous or unsupported.
   A model's own assertion of completeness is insufficient: evaluate against
   reviewed expectations and adversarial omission tests.
2. No missing property becomes a confirmed value. Unknown and false differ.
3. No unrequested number, destination, restriction or group characteristic is
   invented. Conflicting structured UI input and text require visible resolution.
4. Every explicit essential or hard need survives normalization into the
   evaluator. Unsupported checks remain disclosed; they cannot yield a fully
   confirmed recommendation.
5. The interpreter has no authority over authentication, consent, release
   control, candidate identity, World evidence, ranking or learning.
6. A provider outage is a technical failure. With AI disabled, only supported
   deterministic understanding is available; uncertain needs require honest
   clarification/degradation, not an invented successful interpretation.

## Executable development baseline

Files live with the current Product tests in
`packages/decision-vnext-core/test/request-understanding/`:

- `corpus.json`: 40 families / 160 exact phrasings and proposed oracle checks.
- `evaluate.mjs`: independent comparison of declared expectations and observed
  fields; distinguishes missing fields, wrong values and technical errors.
- `acceptance.test.mjs`: negative and positive tests for evaluation integrity.
- `structured.test.mjs`: provider-output fixtures through cache, HTTP and canonical
  World evaluation, including invalid output, source binding and privacy cases.
  These are integration tests, not a live-model quality measurement.
- `baseline.mjs`: reads the existing Product context resolver with the same
  profile-city default as Mobile. No model, RPC, Production or stored-user read.

Run after the canonical build:

```sh
npm run decision-vnext:build
node packages/decision-vnext-core/test/request-understanding/baseline.mjs > /tmp/backyrd-understanding-baseline.json
node --test packages/decision-vnext-core/test/product-ai-interpretation.test.mjs
```

The baseline is diagnostic and exits successfully when a report was generated;
FAIL/ERROR cases remain explicit in the report. It is not a quality gate or
provider benchmark. CI checks the scorer's integrity, not an artificially green
interpretation result. Unknown operators, duplicate cases, missing expectations
and implicit/coerced values must fail evaluation validation.

The report binds corpus, resolver source, compiled resolver, Git commit and
working-tree state. Build immediately before running; differing source/build
hashes bind the inspected bytes, not a certification that compilation occurred.
It omits raw requests, model output and raw exceptions. Never use the report's
pass count as a complete-understanding or recommendation-success percentage:
only the declared checks are scored. For example, the budget corpus records
amounts through the current context shape, which cannot yet express LT vs LTE;
that distinction is covered by the internal contract and adapter fixtures,
not by this lexical-only score.

The corpus's `DISTANCE_UNVERIFIED` is a proposed expectation, not an accepted
Product code. An adapter must map unsupported mobility to the eventual versioned
contract and UI; it must not inject a new code into the current API unchecked.

## Implementation sequence and completion evidence

1. Review and finalize corpus expectations with Product. Expand coverage of
   AND/OR, multiple activities, conflicting instructions, weather, request
   injection, regional language and essential-vs-preferred distinctions. Keep
   family-level reporting so paraphrase counts do not inflate confidence.
2. Implement the typed server-internal contract, strict input validation,
   source binding and model projection in the existing interpreter. Bound
   tokens, deadline, retries and cost. Version prompt/model/catalog bindings.
3. Extend the existing evaluator boundary deliberately. Preserve explicit
   context, distinguish defaults, retain unsupported requirements, and migrate
   every consumer of changed request/response fields. Remove superseded text
   parsing only when equivalent behavior is tested.
4. Run actual-model evaluations on reviewed synthetic inputs in an isolated,
   authorized environment. Separately score requirement recall, invented needs,
   negation/alternative preservation, structured values, clarification and
   unsupported-needs honesty. The scorer interface accepts an interpretation
   callback; no provider implementation or secret is embedded here.
5. Evaluate the untouched independently authored holdout. Record model, prompt,
   policy, catalog and runtime version, cost, failures and latency. Model output
   fixtures test a boundary; they never establish model comprehension.
6. Run the affected Product, Mobile/Web, authority and privacy gates before a
   release candidate. Production deployment remains a separate exact-SHA action.

The initial commit established the starting measurement and proposed contract.
Steps 2 and 3 now have an integrated first implementation described above;
reviewed semantic accuracy and the listed evaluator gaps remain open. Launch
readiness has not been established.

## Validation of the first integrated safeguards (2026-10-10)

Local canonical build and Decision tests: 106/106; Product release contract
suite: 33/33; Decision TypeScript, single-route invariant, client secret boundary
and canonical secret scan passed. Tests use synthetic inputs and World evidence;
no provider call or Production write was made.

The unchanged development corpus reports 99/160 passing cases, 61 mismatches,
zero errors and no previously passing case regressed, compared with the original 72/160 baseline. This measures only
its declared assertions and is neither a holdout result nor a launch verdict.
The diagnostic now hashes the resolver and its extracted context/lexicon/query
modules, so helper changes are included in its source/build identity.

CI must certify the exact PR head, including the selected browser journey and
real Mobile bundle, before review can treat this as a certified Product change.


## Structured-contract validation (2026-10-10)

The active Decision suite passes 131/131 tests, including 25 new contract and
integration tests. The existing lexical-only diagnostic remains 99/160 with
zero errors and no regressions; it does not exercise the new provider prompt.
Product release contracts, TypeScript, single-route and security checks run
against this implementation; exact-head CI certification is required as usual.

A read-only PostgreSQL calculation using synthetic normalized requirements
confirmed the JSONB byte accounting (404 bytes on both sides); it queried no
user/Spot rows and wrote nothing. No live provider evaluation was run: the local
test process had no OpenAI API key. The new fixtures cannot substitute for that
measurement or an independently reviewed holdout. Exact budget verification,
scoped age-rule improvements, location provenance/redirection, travel/exact-time
checks and clarification UX remain separate work.

The Responses schema follows the [official Structured Outputs constraints](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses):
closed objects, required properties, explicit null alternatives and bounded
untrusted output. Schema validity is not evidence of semantic accuracy.


## Live development evaluation (2026-10-11)

The active interpreter can now be measured directly with
`test/request-understanding/run-model-evaluation.mjs`. This is a test adapter to
the canonical interpreter, not another runtime, Product route or historical lab.
It uses a new in-memory cache per case, synthetic authentication/release bindings,
and only the official Responses endpoint. No Supabase connection, real user or
Spot data is used. Request-local cache replay is covered separately by integration
tests; live latency measures cold application-cache interpretation, including any
bounded malformed-output retry. OpenAI prompt caching may still apply and is
reported separately.

Two development suites have different purposes:

- `context`: the unchanged 160 phrasings / 40 families, evaluating the public
  resolved context. Its original agent-authored expectations still need Product
  review and do not cover all supported structured semantics.
- `requirements`: 24 new phrasings / 12 families with a separate typed oracle.
  Measures missing/unexpected requirements, exact values, importance, exclusions
  and OR partition preservation, alongside context checks. Observed requirements
  form a multiset: one match cannot cover two needs. Group labels may differ;
  their relationships may not. Unexpected means unmatched by this oracle, not
  automatically a proven invented user need.

Both suites remain `PROPOSED_REQUIRES_HUMAN_REVIEW` and
`DEVELOPMENT_NOT_HOLDOUT`. Passing them is not a launch verdict. The independent
holdout in the acceptance plan has not been replaced by these visible cases.

### Running and bounded cost

After `npm run decision-vnext:build`, a command without `--live` is a network-free
preflight. Supply `OPENAI_API_KEY` only through the server process environment;
never through command-line arguments, a client variable, repository fixture or
report. Set `BACKYRD_DECISION_AI_INTENT_MODEL=gpt-6-luna` for this evaluation.
The runner currently permits this model only because its cost estimate has an
explicit dated price source; it never silently substitutes another model.

```sh
node packages/decision-vnext-core/test/request-understanding/run-model-evaluation.mjs --suite requirements
node packages/decision-vnext-core/test/request-understanding/run-model-evaluation.mjs --live --suite requirements --max-calls 48 --max-estimated-usd 1
node packages/decision-vnext-core/test/request-understanding/run-model-evaluation.mjs --live --suite context --max-calls 320 --max-estimated-usd 1
```

Defaults: eight provider calls, 20 seconds per case including retry, 3600 output
tokens per call, 100000 request bytes, one USD estimated spend guard. Hard maxima
are 400 calls and a 60-second case deadline. A conservative reservation for
128000 input tokens at the highest applicable short-context input rate plus
3600 output tokens precedes each call. Measured token bounds or missing usage
stop further calls. This estimate is not an account-level billing guarantee;
account limits, taxes, processing tier and later price changes are outside this
runner. The [dated model pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)
is recorded in every priced report. Usage includes retries, cache reads and
cache writes; the [Responses token guidance](https://developers.openai.com/api/docs/guides/token-counting)
explains why output usage includes more than visible text alone.

Authentication, rate-limit, model-availability and incompatible-request errors
stop the run. Cases not executed remain NOT_RUN, rather than passing or failing
semantic quality. Exit 0 means all declared checks executed and passed; exit 1
means semantic mismatches; exit 2 means configuration, technical failure or
incomplete execution. No exit code grants release authority. A missing or
unmeasured charge produces null cost, never a fabricated zero.

Reports bind Git/dirty state, source/build hashes, harness, corpus, oracle,
prompt, model, interpreter, catalog and understanding policy; they report family
outcomes and case latency p50/p95. Ordinary reports omit raw requests, model
output and provider errors. `--family <id>` supports a localized reproducer.
`--progress` emits case IDs and counters to stderr.
`--diagnostics` adds only validated normalized requirements for failures in the
bundled synthetic suite; it does not expose source quotes, provider payloads,
credentials or real users. Fixture transports are labelled FIXTURE, never LIVE.

### Findings and oracle changes

The first eight-call pilot used seven cases (one retry): six passed, one
mismatched, no technical failures. The first complete requirements run on policy
4.0 had 14 passes, eight mismatches and two technical errors. Those are development
observations on the original oracle, not an acceptance score.

Policy 4.1 removed a conflicting instruction that let requested atmosphere and
exclusions disappear behind legacy facets; it explicitly requires optional needs
to survive in the typed list. A subsequent run had 17 passes, five mismatches and
two errors. Policy 4.2 clarifies optional numeric ceilings, explicit OR versus
ambiguous interpretation, redundant primary intent and non-contextual injection
instructions. Safe requirement-validator codes survive the existing bounded
retry without exposing source content. These are measured development iterations,
not an independent test. Policy 4.3 / understanding policy v2 derives
dimension-specific provider schemas from the canonical catalog, preventing
cross-dimension values and arbitrary facet keys. Its 24-case development run
had 23 passes, one mismatch, zero technical errors and zero retries. Policy
4.4 / understanding policy v3 additionally normalizes explicit essential
exclusions to mandatory vetoes and removes singleton OR labels. Optional
exclusions remain optional. Final measurements follow below.

Two oracle corrections are recorded separately from model changes:

1. 15:30 may legitimately carry AFTERNOON or leave daypart null. MORNING or a
   changed exact clock value still fails. The original expectation was too narrow.
2. An ESSENTIAL, explicit canonical representation of the already requested coffee
   purpose/offering may occur once without constituting an invented extra need.
   Hardening it, duplicating it or inventing budget/age/context still fails.

Original reports retain their original oracle hashes and results. No earlier
result is relabelled as a pass. New scores must identify the revised oracle and
cannot isolate a prompt-only gain across that oracle change.

### Work-package acceptance still required

| Criterion | Evidence / status |
| --- | --- |
| Canonical typed interpretation and evaluator integration | Implemented; active integration tests |
| Boundary, cache, privacy and failure behavior | Implemented; active tests, explicit cache persistence limits above |
| Executable real-model diagnostic and integrity tests | Implemented; live development runs performed |
| Reviewed expectations and representative coverage | Proposed; Product review pending |
| Independent untouched holdout on a frozen candidate | Pending; development cases cannot substitute |
| Actual quality, latency and cost against reviewed acceptance criteria | Development measurements only; not yet accepted |
| Exact-head Product certification | Required on the final candidate |

Exact money evaluation, scoped age/guardianship rules, location-source handling,
precise visit intervals, route computation and clarification UI are subsequent
capabilities, as noted before this evaluation. Unsupported behavior must remain
explicit in this work package. Its overall status must not be marked COMPLETE
while independent acceptance is pending.


### Earlier measured candidate (interpreter 4.4 / understanding policy v3)

The first complete current requirements run passed 24/24 cases using 24 provider
calls, zero retries and zero technical errors. Cold interpretation latency was
p50 2678 ms, p95 3339 ms, maximum 3521 ms; token-based standard-rate cost estimate
was USD 0.00494253. This is interpreter latency, not end-to-end Decision latency.
An unchanged repeated run also passed the same 24 cases with 24 calls and no
retries/errors: p50 2871 ms, p95 3337 ms, maximum 3347 ms, estimated USD
0.00500503. These are repeated observations on 24 cases, not 48 independent cases.

The completed broad run for this candidate had 125 passes, 29 mismatches and six
technical errors across 160 cases, using 179 calls. p50 was 3028 ms and p95
7053 ms. One case timed out; four destination cases violated the normalized
state/value contract; one access case failed literal-evidence validation.
Unmeasured usage makes total cost unavailable. Public-shape mismatches include
unsupported decimal money, location-source ambiguity and proposed mobility
codes, alongside real extraction gaps. Do not equate this pass count with
complete model comprehension.

For comparison only, the completed broad context run on **policy 4.0** had 85
passes, 24 mismatches and 51 technical errors across 160 cases, using 230 provider
calls. Three errors were timeouts, 44 were rejected model output and four were
other interpretation failures. p95 was 18186 ms. Some billed usage could not be
measured, so total cost is null. This is the initial live baseline, not a score
for policy 4.4, and not comparable to the 99/160 lexical-only diagnostic as a
claim of overall recommendation quality.

Local validation at interpreter 4.4: 146 active Decision tests, 33 Product release contract
tests, Decision TypeScript, single-route, client-secret boundary and canonical
secret scan passed. Exact-head CI and independent acceptance remain pending.


### Final normalization safeguards (interpreter 4.6 / understanding policy v7)

Understanding policy v4 distinguishes explicit adult absence from unknown adult
presence and compares financial fields without treating a display-label change
as a budget conflict. Interpreter 4.5 / policy v5 makes provider schemas specific
to both dimension and interpretation state: UNDERSTOOD requires a typed value;
AMBIGUOUS requires alternatives; UNSUPPORTED cannot smuggle a resolved value.
Missing World evidence does not by itself mean the sentence was misunderstood.

Interpreter 4.6 / policy v6 projects explicit ALONE to one person without
inventing a family headcount, and recognizes bounded German/English access
need disclaimers. Policy v7 further restricts removal of a model ACCESS row to
an evidence quote consisting entirely of a recognized disclaimer. A broader
quote, an unknown facility (such as a hearing loop), another positive access
clause and explicit UI constraints are retained. Absence of an access need never
means exclusion of accessible venues. Evidence validation precedes normalization.

The interpreter-4.6/policy-v6 focused live run passed 24/24 with 24 calls,
zero retries/errors, p50 3071 ms, p95 3717 ms and estimated USD 0.005912965.
A localized four-case destination run had zero technical errors, but all four
still mismatched the proposed target-city expectation: public v1 treats the
profile city as explicit authority. That contract boundary remains unresolved.
Final policy-v7 affected-case checks and the broad v6 diagnostic are in progress.

Current local canonical Decision build/tests: 153/153 passed. The 33 Product
release contracts, Decision TypeScript, single-route, client-secret boundary
and canonical secret scan passed before the final narrow access-row correction;
exact-head CI must certify the final candidate. The unchanged lexical diagnostic
now has 102 passes, 58 mismatches and zero errors. This is a fallback diagnostic,
not live model accuracy. Reviewed expectations, independent holdout and Product
acceptance remain outstanding.


### Literal-evidence correction (interpreter 4.7 / understanding policy v7)

The policy-v7 access reproducer on interpreter 4.6 passed three cases and rejected
one source quote after two attempts. A bounded synthetic diagnostic identified
actual nonliteral quotes: inserted ellipses in a company quote and an added
sentence-final period in an access quote. The prompt still had an older, softer
instruction about evidence. Interpreter 4.7 makes all evidence rules consistent:
contiguous exact quotations, no ellipses, added punctuation, translation or case
changes; semantic normalization belongs only in the typed value. An explicitly
unneeded access property produces no ACCESS requirement; other access needs stay.
No evidence validator was loosened.

Targeted current live runs passed 4/4 access-negation and 4/4 written-age cases,
with one provider call per case and no technical errors. Access p95 was 3315 ms;
written-age p95 was 4340 ms. Estimated costs were USD 0.00072739 and 0.00126264.
The focused 24-case suite is still running. Earlier run failures remain recorded.
The active canonical Decision build/test suite again passed 153/153 after the
prompt change. Final exact-head CI is required; none of these development results
replace independent acceptance.
