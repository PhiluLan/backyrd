# Request understanding v1 — first work package

Status: **design proposal, executable baseline and first integrated context safeguards** (2026-10-10).
Owner: Decision Product. Work class: PRODUCT_RELEASE (runtime changes).
The full typed model contract below remains a proposal. The first implementation
extends the canonical interpreter/evaluator; it does not introduce a second
engine or a new CI gate. Production activation is a separate, explicit release.

### Implemented slice

- `product-request-context.ts` supplies a bounded German/English fallback for
  stated ages, CHF ceilings and exact-time detection. The evaluator uses it on
  both AI and non-AI paths; the interpreter shares exact-time detection on cache
  misses and hits. This is not general multilingual model comprehension.
- The youngest recognized age reaches the existing age assessment. Family words
  no longer invent a group size or independently prove an adult is present.
  Explicit structured group input retains precedence. Existing German parental
  wording still supplies an accompaniment inference; it does not prove guardianship.
- Integer inclusive CHF ceilings explicitly stated per person can be checked
  against verified World ranges in CHF. Other currencies cannot be compared.
  Strict bounds, fractions, ambiguous amounts and total/unspecified scope remain
  `BUDGET_SEMANTICS_UNVERIFIED`; amounts are never rounded. They cannot produce
  confirmed budget eligibility. Because budget is a hard constraint, this may
  leave no rankable results. The response-level limitation survives that case;
  current clients can show their generic limitation fallback.
- English relative days/weekdays use authoritative Swiss server time. Exact
  clock time stays `PRECISE_TIME_UNVERIFIED`, including without AI. This does not
  implement visit-time availability or resolve conflicting calendar phrases.
- Contradictory required/excluded model facets retain an unresolved core need
  instead of disappearing into a fully confirmed recommendation.
- Interpreter policy is `ai-query@3.9`, context resolver is
  `decision-vnext-product-context-resolver-v2`, evaluator is `@2.2`.

Privacy: no new raw text, age list, evidence spans or context fields enter the
query cache, learning events or diagnostics. The existing response/idempotency
record already includes minimum age and budget; extraction now populates those
existing fields for more recognized inputs. This is not zero retention. No
migration, consent rule, authorization boundary or transport shape changes.

Remaining work includes the typed model requirements contract, exact money and
scope representation, request corrections/negation, source-aware location,
all stated ages beyond the bounded fallback, scoped access-rule handling,
precise time/distance verification, and dedicated clarification UI. None of
those should be considered completed by the safeguards above.

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

## Proposed shared understanding contract

Contract identity: `backyrd.decision-vnext.request-understanding@1.0`.
This is a proposed **server-internal** successor to fragmented interpretation,
not a newly accepted client field and not authority to change the current API.

An understanding is bound to the source request hash and interpretation policy.
The request-local interpretation can refer to text offsets for review; raw text,
quoted evidence, offsets that reconstruct text, and child-specific context must
not automatically enter the semantic cache, learning records or telemetry.
Minimized persistence requires a separate explicit review of purpose, retention
and consent; do not reuse the current cache just because its JSON permits it.

Each requirement has:

| Field | Meaning |
| --- | --- |
| `id` | Request-local stable identifier, not a user identity |
| `dimension` | EXPERIENCE, ATMOSPHERE, COMPANY, AGE, TIME, LOCATION, MOBILITY, BUDGET, ACCESS, OFFERING, or OTHER |
| `importance` | HARD, ESSENTIAL, or PREFERRED; this classifies the person's need, not Spot truth |
| `operator` | REQUIRE or EXCLUDE |
| `origin` | EXPLICIT, INFERRED, or DEFAULT |
| `interpretationState` | UNDERSTOOD, AMBIGUOUS, or UNSUPPORTED |
| `value` | A dimension-specific normalized value, or null when not resolved |
| `alternatives` | Bounded alternative normalized meanings for AMBIGUOUS only |
| `evidenceSpans` | Bounded request-local start/end offsets; not persisted by default |
| `worldCheck` | SUPPORTED or NOT_IMPLEMENTED; understanding and ability to verify are distinct |

Requirements compose as an AND of bounded alternative groups (OR). Do not turn
"Museum or cinema" into two simultaneous demands. "Coffee and cake" preserves
both requirements. Contradictions are retained as unresolved conflicts; a
normalizer must not silently delete one side or turn both into preferences.
No implicit widening of requested alternatives is allowed.

Inferred preferences may affect discovery but cannot invent an exclusion,
legal restriction, exact number, age, alcohol intent, or guardianship. Explicit
venue type, requested offering, visit purpose and desired atmosphere remain
independent. Any promotion of an inference to a hard constraint must have a
separately versioned deterministic rule and counterexamples.

### Dimension-specific values

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
that distinction belongs to the proposed contract and future adapter tests.

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

This first commit establishes the starting measurement and proposed contract.
It does **not** complete the interpretation migration or repair the currently
reproduced Product defects. Launch remains unassessed.

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
