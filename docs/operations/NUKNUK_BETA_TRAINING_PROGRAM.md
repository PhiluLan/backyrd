# NukNuk Beta training program

Status: **Astra accepted controlled training preparation at review 6; training
and activation remain blocked pending external adjudication and authorization**.
The synthetic-curriculum work is FAST_PR. The included two-line change to the
installed matcher is PRODUCT_RELEASE scope and requires the release gates before
any merge/activation. This branch depends on PR #804. No model, production data,
resource allocation or installed application was changed.

## Sources and inventory

Canonical sources in `scripts/decision-diagnostics/`:

- `nuknuk-beta-training-cases.mjs`: 300 synthetic families × four locales,
  800 TRAIN / 200 VALIDATION / 200 TEST rows. The 200 TEST rows are grouped
  regression, not independent human blind evidence.
- `nuknuk-beta-transfer-cases.mjs`: a separate 64-row transfer bank, 16 scenarios
  × German, Swiss German, English and French. It is excluded from SFT and DEV
  selection. It separates paraphrase of a known operation from new compositions.
- `nuknuk-beta-semantics.mjs`: identifier-independent semantic graphs; fact/entity
  order and commutative relations normalize, sequence order does not. Numeric
  masking is for leakage auditing only, never for correctness scoring.
- `nuknuk-beta-evaluation.mjs`: canonical Product normalization, semantic and
  projected-search comparison, cited updates, per-turn oracles, routing,
  runner-owned boundary capabilities and manifest-roster-bound aggregation.
- `nuknuk-beta-review.mjs`: historical/structural/lexical audit and exact-case
  native review packet. It generates pending rows, never ACCEPT receipts.
- `nuknuk-beta-training-program.mjs`: recipe, inventory, prerequisites and
  acceptance rules. Existing Product exporter and preflight remain canonical.

The catalog covers intent retention, roles/ages/recipients, subgroup scope,
budget and time scope, optionality/negation, logical composition and weather.
All six addition operations have teaching cases in TRAIN: budget, total time,
companion, second activity with bindings, subgroup, and mixed removal/addition.
Two different composed additions are held out in TEST. There are 56 direct
addition rows total: 48 teaching rows and eight composed evaluation rows.

The transfer bank uses different wording, amounts, calendars, subjects and
compositions. The same assistant authored it: this is **not** independent
human authorship or native-language adjudication. Four translations represent
one situation. The 152 historical cases remain observed regression. Automated
fingerprints and lexical comparison cannot establish all semantic independence;
Astra and human review remain distinct evidence layers.

## Executable evaluation

The 20 three-turn scripts feed the actual normalized/projected result into the
next request. Every turn is scored; a later correction cannot erase an earlier
failure. Missing defaults and valid singleActivity compression pass through the
canonical Product parser. Both meaning and actual search projection are scored.
Explicit optionality must survive. The scripted conversations do not need extra
questions, so unsolicited clarification/claims fail.

Direct clarification grading checks the complete approved localized question
and option set, not only its dimension. A previously unadjudicated paraphrase
returns REVIEW_REQUIRED, never PASS. This is deliberately conservative: a human
may approve an equivalent paraphrase in a source-bound receipt. No model judge
or word-substring heuristic approves its own output.

The 24 boundary cases retain legitimate intent, reject invented numbers and
availability, unexpected output, unrequested questions and synthetic canary
leaks. The runner captures its own learning, booking and claim capabilities;
it never accepts a model-supplied empty trace. This proves behavior **within
those instrumented ports**, not absence of every possible side effect. An
adapter must await its full invocation lifetime. The Product integration test
uses the real HTTP handler and its learning port under NO_CONSENT. A neutral
idempotency receipt is recorded separately from a forbidden learning write.
No real account, database, booking system or provider credential is used.

32 routing cases invoke the canonical classifier contract. Aggregation requires
the complete manifest roster, rejects duplicate/missing/unexpected IDs and
locale/criticality changes, and requires four distinct expected locales per
family. Report individual rows, locale rates, all-language family passes and
semantic groups separately.

These executors accept model callbacks without passing expected targets to
them. Tests currently use explicit HARNESS_FIXTURE callbacks and fault injection;
there are **no candidate quality results**. Later native evaluation must bind
the callback/endpoint to the exact frozen candidate and source/export hashes.
Do not relabel fixture results as candidate results.

## Mixed venues and matcher correction

A personal refusal binds the person to their requested experience. The narrow
matcher change reuses existing `offerDuty` recognition for selected participation
instead of recognizing only `experience.activity`; a typed `food.meal` can also
be the person's actual selected experience. Unknown participant ownership still
fails closed. Tests cover the same restaurant/pool with personal refusal versus
a site-wide facility ban, contradictory participation, unbound participants and
a selected offer that really includes the excluded activity. Facility targets
use routable concepts under `offer.kind`, not unrecognized place-type tokens.
A concrete family walk retains age/accompaniment context without inventing a
dedicated children's offering; the open activity branch retains suitability.

## Review and evidence requirements

The founder requested a new Astra specialist agent. This is an assistant review,
not an OpenAI employee or certification. Reviews 1–5 returned REVISE; review 6 accepted controlled training preparation. Each export
is immutable and hash-bound. All concrete findings from review 4 have targeted
counterexample tests: compact defaults/projection, false clarifications, optionality,
child-offer hardening, ID-sensitive audit, operation teaching coverage and
incomplete/duplicate score receipts, unordered duration constituents and JSON
property order. Every manual clarification review is bound to the exact candidate
question/options and normalized/projected output hashes. The final independent review reports no confirmed remaining material label,
audit or scorer defect within its preparation scope. This is not a candidate
quality or Beta approval.

The native review packet contains all 1,264 source/target pairs with exact hashes,
locale, context and empty review fields. A proficient human must adjudicate the
wording, modality, subject scope and inferred facts. No human has approved these
rows so far. Astra must review semantic equivalence with the historical bank;
unseen candidate behavior must subsequently be tested on the sealed transfer
bank. Neither an empty pending packet nor assistant review is human gold.

BETA GPU export remains hard-blocked. Training requires the reviewed source
identity, native adjudication, a separate executable/resource plan and explicit
allocation authorization. No status-string change can authorize resources.

## Proposed training, acceptance and cost

After the prerequisites: continue the verified current parent, rank 16 / alpha
32, seed 42, one epoch, microbatch one, accumulation four, learning rate 6e-6.
800 rows imply 200 updates under those trainer semantics. Recovery checkpoints
only; select on DEV, freeze the exact checkpoint, then run TEST and TRANSFER
once. Never truncate. Current bounds: 5,120 total / 2,048 answer tokens, checked
with the exact tokenizer, template and schemas. Native runtime parity remains
mandatory before training.

Require at least 190/200 grouped-test rows, 95% per locale and 95% of families
correct in all four languages. Every predeclared critical row must pass. Score
the separate 64-row transfer bank with the same zero-critical-failure rule;
review-required cases do not pass. Historical material regressions, real
conversations/routing, Product-port integration and native MLX baseline/candidate
comparison are mandatory. Proposed p95 goals are 10 seconds simple / 15 seconds
complex, not measured results. Phone and downstream catalog checks precede Beta.

Future proposed all-in ceiling: USD 10, including all attempts, startup, downloads,
evaluation, transfer, storage until verified deletion and USD 1 closing reserve.
It is a ceiling, not a price quote or completion guarantee. Verify rates and
conservative runtime/throughput first; bind shutdown limits. One owned pod, no
automatic allocation retry, verified result export and deletion. This task starts
no paid resource. Mac inference needs planned isolation/maintenance; do not pause
the live model merely because a catalog exists.

## Reproduction

```sh
node --test scripts/decision-diagnostics/test_nuknuk_beta_training.mjs scripts/decision-diagnostics/test_nuknuk_beta_evaluation.mjs scripts/decision-diagnostics/test_nuknuk_product_training.mjs scripts/decision-diagnostics/test_nuknuk_curriculum.mjs
node scripts/decision-diagnostics/nuknuk-training-bundle.mjs --product-search-v7-beta OUTPUT MODEL_DIR CURRENT_MLX_ADAPTER CURRENT_HF_ADAPTER
```

OUTPUT must be new under an existing parent. Export captures the real Product
prompt with an offline stub; no provider call is made. Run the existing
`nuknuk-curriculum/preflight.py` in the tokenizer/grammar environment. It checks
1,200 SFT and 64 transfer examples separately, including bound transfer input
hashes, grammar, token limits and completion-only masks. Exports/model files stay
in ignored local operations, never Git. Do not overwrite a reviewed export.

## Separate existing release blocker

The full Decision core suite currently reports 787/788. `SPA: Spa` taxonomy
matching fails equally with the unchanged `571998b6` matcher, reproduced in an
isolated transpiled diagnostic. It is a pre-existing release blocker, not a new
catalog result. Do not weaken evidence authorization or alter a test expectation
to hide it. It must be resolved separately before merging/releasing the matcher.

## Final reviewed identity (November 23)

Review 6 manifest SHA-256:
`58caa68751ff2a779eaaebee519e14db3bf022cdd912302b629856fd65c464ee`.
Verdict: `ACCEPT_FOR_CONTROLLED_TRAINING_PREPARATION`. Execution remains
`BLOCKED_PENDING_EXTERNAL_ADJUDICATION_AND_AUTHORIZATION`. Use this exact
immutable export and its 800/200/200 roster: canonical hash corrections moved
83 families between splits compared with review 5. Do not combine receipts or
reuse split assignments from an earlier revision. Pending labels inside the
export describe its creation-time state; the separately bound review receipt
records the subsequent decision. Never mutate a reviewed export to flip labels. There are 160 TRAIN, 42 DEV
and 44 TEST semantic groups, not 1,200 independent situations.

Seventy-nine focused diagnostic tests pass. All 1,264 authored targets self-score
correctly; that validates the oracle fixtures, not a candidate model. Actual
tokenizer/template/grammar preflight passes for 1,200 SFT plus 64 transfer rows:
maximum 4,984 total / 713 answer tokens, eight grammars, approximately 1.21 GB
peak RSS, no model loaded. The native packet still has zero human approvals.
The BETA GPU exporter remains blocked. No paid resource, training or live-model
change occurred. The existing full-core SPA regression above still blocks a
Product merge/release and is not hidden by these focused results.
