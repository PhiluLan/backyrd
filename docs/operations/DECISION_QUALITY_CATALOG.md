# Decision quality: fixed wishes and candidate diagnostics

Task class: FAST_PR. This extends the existing Product Decision tests. It does
not change matching, ranking, prompts, production telemetry or database state.

## What is measured

`packages/decision-vnext-core/test/request-understanding/decision-quality-catalog.mjs`
owns 40 fixed synthetic everyday wishes in twelve groups: pubs, wine bars,
hotel plus dinner, price limits, climbing with a child, coffee, atmosphere and
areas, dated visits, undated visits, accessibility and facilities, alternatives,
and unknown terms/excluded properties/instruction injection. German and English
variants exercise the same intended decisions. This is an initial regression
corpus, not a representative accuracy estimate for every Spot category.

Each group declares an independently authored meaning, positive and negative
World fixtures, and expected candidate outcomes. In particular:

- A documented 11–26 CHF meal fits a maximum of 20 CHF per person even when
  mandatory-fee completeness is unknown. A documented minimum of 25 does not.
- A child activity with minimum age one cannot inherit the adult bouldering
  offer's age fourteen restriction. Global admission remains separate.
- Unknown soft preferences, access details and facilities must not remove a
  factual visit match. Their absence must not become a positive confirmation.
- Without a calendar wish, missing hours do not invent a dated closure.
- Documented incompatible offer hours for an actual requested visit exclude.
- Hotel, dinner and restaurant identity are distinct; overnight stays need
  an overnight offering when explicitly requested.
- Coffee OR tea must remain an alternative rather than two mandatory drinks.

The trusted reference is fixed at 14 October 2026, 10:00 Europe/Zurich. Relative
dates therefore remain reproducible. Synthetic actor and neutral projection
are used throughout; no account/profile read, personalization accuracy claim,
learning write or production fixture write occurs.

## Run

```sh
npm run decision:quality -- --mode golden --output /tmp/decision-quality-golden.json
OPENAI_API_KEY=... npm run decision:quality -- --mode live --output /tmp/decision-quality-live.json --save-captures /tmp/decision-quality-captures.json
npm run decision:quality -- --mode replay --captures /tmp/decision-quality-captures.json --output /tmp/decision-quality-replay.json
```

Supply the key through the protected shell environment; never commit it or put
it in a client variable. `live` calls the existing canonical Luna provider once
per wish, sequentially, with a 30-second limit and no repair/retry model call.
It uses the installed source configuration; the report records source SHA,
dirty-worktree flag, corpus hash, model configuration, and World/result hashes.
It is a local model-and-engine evaluation, **not a production HTTP/Auth test**.

`golden` bypasses the model and explicitly reports understanding `NOT_TESTED`.
`replay` checks the capture's exact query, timezone and reference instant before
validating its output through the canonical meaning parser. A replay is not a
new model call or independent language sample. Extra generated facts are not
exhaustively judged by the partial understanding oracle. Failed partial-oracle
checks require inspection; legitimate ambiguous language or a faulty fixture
must be distinguished from a model error before changing runtime behavior.

Reports and captures stay outside Git with mode 0600. They contain only fixed
synthetic wishes, validated meaning/World evidence and technical diagnostics;
the runner never saves provider bodies, tokens, arbitrary exception messages
or stacks. Capture storage is optional. The report is checkpointed after each
case; only a completed report has a final summary/outcome. Nonzero exit means
at least one understanding assertion, chain assertion or execution failed.

## Read a missing-candidate diagnosis

`scripts/product/decision-quality.mjs` invokes the same canonical matcher,
Product evaluator and Product execution builder. It does not implement its own
eligibility or ranking comparator. The actual Mobile `visibleWohinCandidates`
helper determines the visible set, including its order validation.

For each candidate the local report includes status, fact family/state/reason,
evidence hashes, linked offer/area IDs, failed/unknown duties, availability and
the rank vector/deciding reason where returned. Conditional branches remain
visible rather than being flattened into an unconditional visit.

| Stage | Meaning |
| --- | --- |
| `NOT_IN_COHORT` | Expected ID was not in the supplied authorized cohort. This alone does not prove a retrieval defect; check publication, city and snapshot freshness. |
| `VISIT_EVIDENCE` | Matching lacks the positive visit/type evidence needed to suggest this Spot. Inspect the fact reasons. |
| `ELIGIBILITY` | Canonical evaluation rejects the visit. Inspect the failed duties and their scoped evidence. |
| `PRODUCT_RANKABILITY` | Matching retained the Spot, but the Product ranker does not admit it. Inspect the tier and unresolved duties. |
| `PRESENTATION_WINDOW` | Rankable, but outside the server response window. Its true global rank is recovered using the same ranker with prior-presented IDs. |
| `MOBILE_WINDOW` | Returned by the server, but outside the Mobile helper's visible window. |
| `DISPLAYED` | Included in the actual Mobile selection helper's result. This is not proof of pixels on a physical device. |

Understanding failures are reported separately from these stages. Do not call
a missing Spot a data problem until the interpreted wish is correct.

## Recorded canonical World snapshots

Optional `--catalog /tmp/catalogs.json --targets /tmp/targets.json` replays the
same wishes against supplied authorized reader snapshots. Both arguments are
required together. Catalog shape: `{ "Basel": [resolverBindings], "Zurich":
[resolverBindings] }`. Targets shape per case ID: `{ "included": [spotIds],
"excluded": [spotIds], "unconfirmed": [spotIds], "first": null }`.

Targets must be declared for every executed case; use `--case pub-1` to run one
case. `included` means admitted somewhere in ranking, not necessarily visible
in the initial five. `excluded` means must not be admitted; `unconfirmed` means
must not claim confirmed fit. `first` optionally tests the primary choice.

External World data is parsed by the canonical binding validator. The report
labels it `SUPPLIED_SNAPSHOT_NOT_FRESHNESS_VERIFIED`; it must never be presented
as a current production read. The tool cannot attribute a missing row to a
specific database query without separate authorized retrieval evidence.

## Maintenance

Keep user expectations independent of the model. Never rewrite a failed
expectation merely to make a score green. If a fixture or oracle is wrong,
record the reason, retain the original report locally, and replay the same
captures against the corrected corpus; this avoids paying for repeated model
calls and makes the distinction explicit. Add real bugs as fixed regressions.
Do not add real users' queries, raw profiles or model captures to this corpus.

The deterministic tests are part of the existing Decision package test command
and existing Product Decision CI test step. No duplicate release gate or
second product route is introduced. Model-network evaluations remain explicit
and separate from deterministic PR checks.

## Initial evaluation, 17 October 2026

Forty new calls to the current canonical Luna provider completed without a
transport/parser failure. The first report was retained at
`/tmp/backyrd-quality-live.json`; captures at
`/tmp/backyrd-quality-captures.json`. All World inputs in this evaluation were
synthetic. No current production cohort or real account was queried.

Review found defects in the initial oracle/fixtures: Zürich/Zurich spelling,
an explicitly requested dinner being represented as a generic meal, an
overnight wish being incorrectly required to name a hotel, missing restaurant
identity/overnight offering in the positive hotel fixture, explicit versus
preferred atmosphere, bar identity versus an inferred drink, terrace versus
generic outdoor space, the English night phase, equivalent quiet/noise labels,
and a valid free typed unknown term being expected only as an extension.
These were corrected in the test data and oracle, not in the engine. Replaying
the same forty captured answers used zero additional model calls. The initial
report's 15 understanding flags and two chain flags are not an engine error
rate: they included those oracle/fixture defects.

After review, `/tmp/backyrd-quality-replay-final.json` reports 38/40 cases with
no tested assertion failure. Two cases remain deliberately flagged:

| Case | Observed issue | Consequence in this fixture |
| --- | --- | --- |
| `dated-2`: Donnerstag in Basel zum Abendessen | Date and dinner survive, but the expected evening window is absent. | The midday-only dinner offer is admitted; both the understanding and chain checks fail. |
| `access-3`: Eine Bar in Basel, bitte nicht zu laut | `loud` is excluded under `atmosphere.bustle`, not `atmosphere.noise`. | Understanding check fails. Candidate admission is unchanged because this is a ranking criterion. |

This is a partial-oracle result on one response per wish, not a 95% general
language accuracy claim. The intended evening interpretation and distinct
noise/bustle families remain explicit review points for the next semantic
change. Neither issue was hidden by changing runtime policy in this PR.

The golden chain passes all forty independently provided meanings. The
diagnostic regression tests also deliberately inject the two observed defects
and verify that they remain detectable. Full provider outputs and captured
meanings are not committed. Local report paths are operational evidence and
may disappear when temporary files are cleaned.
