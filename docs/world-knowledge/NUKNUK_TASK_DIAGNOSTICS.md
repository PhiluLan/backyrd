# Local Nuknuk task diagnostics

Task class: FAST_PR. This is a bounded local-model comprehension diagnostic,
not the website-to-profile pipeline, not a training run and not a release gate.

## Inputs and boundaries

`scripts/world-knowledge/nuknuk-task-benchmark.mjs` reads the separately frozen
`model-inputs.json` and its direct-human task-review receipt. It verifies the
approved file hash and each task-input hash before any generation. It never
reads the answer key or reference-review pack. The receipt records development
consent, not authorization for catalogue writes or a protected training export.

The v1 task-input hash uses sorted JSON with raw Unicode code points, matching
the approved task-authoring format. Do not replace it with NFC-normalized hashing
or alter source text silently. Payload shape is bounded and web-only tasks may
not receive USER_MESSAGE segments. Original source integrity was checked during
reference preparation; the runner binds the approved excerpts and does not fetch
new pages or claim current website completeness.

The runner uses the pinned local 9B/27B selector, the existing loopback endpoint
and the current Backyrd method instructions. It checks the loaded model path and
requires no loaded adapter. Each call is a fresh two-message request, with no
previous-task conversation, temperature 0 and thinking disabled. A generic JSON
answer/evidence/open-points envelope makes the diagnostic auditable; it is not
the canonical authoring schema. This does not test catalogue projection or every
production prompt. Model-returned catalogue codes are not schema-validated here.

At most 50 input tasks are accepted. One generation per task, no retry or provider
fallback, at most 90 seconds per call and 15 minutes for the run. Three calls with
no returned model content stop remaining tasks as NOT_RUN. Incomplete generation
and malformed JSON are visible failures, not success. Output goes to a new local
ignored directory with restricted permissions; prior runs are not overwritten.
No credentials, remote AI provider, database client or weight-write path is used.

## Run

Build the affected runtime first, then provide an approved input file, its review
receipt, a supported pinned model path and a **new** output directory:

```sh
npm run build --workspace @backyrd/spot-research-runtime
node scripts/world-knowledge/nuknuk-task-benchmark.mjs INPUTS_JSON APPROVAL_JSON PINNED_MODEL_PATH NEW_OUTPUT_DIRECTORY
```

Keep real task inputs, raw outputs and reviewer metadata under ignored local
research storage. Git contains only the runner, synthetic tests and documentation.
Do not commit the source corpus or turn raw model responses into training targets.

## Assessment

1. Keep the approved answer key unchanged and outside all model requests.
2. Review every required and forbidden criterion against the whole response,
   including its openPoints. A right sentence followed by its negation is not
   an unqualified pass.
3. Distinguish factual understanding, scope/conditions, output granularity and
   evidence-copy integrity. Literal text matching alone does not prove truth.
4. Exact citation mismatch remains visible. An additional formatting-only
   diagnostic may identify whitespace/NFC differences, but never repairs or
   approves the original quotation silently. Abbreviated quotes are not exact
   source excerpts even if their underlying fact is sound.
5. Bind the assessment to report, response, input and approved-key hashes. State
   the assessor and limitations; agent grading is not independent human review.
6. Show per-task elapsed time and honest run totals. Do not call the result a
   website-research speed measurement.

The known Volta Bräu tasks are one development venue, not 16 independent venues
and not a blind holdout. Results do not estimate general accuracy or certify an
adapter, the complete pipeline, source rights, privacy or unattended imports.
Training and canonical writes remain disabled throughout the diagnostic.

## Validation

Synthetic tests protect approval binding, raw Unicode preservation, answer-key
separation, web/user provenance separation, local-model/adapter identity,
truncation handling and catalogue-write prohibition. Run:

```sh
node --test packages/spot-research-runtime/test/nuknuk-task-benchmark.test.mjs
```

A change to the runner or request protocol creates a new diagnostic version/run;
do not tune prompts during a frozen run or overwrite a baseline after seeing its
answers. Add genuine task-level reproductions before changing the canonical
research pipeline.

## First approved development run: 21 October 2026

The 16 human-approved Volta Bräu tasks were run against the pinned local 27B
model with no adapter and no prompt changes during the run. All 16 returned
complete JSON; there were no transport failures or timeouts. Agent assessment
against the unchanged criteria found 13 content passes, two partial answers and
one failure. These counts concern one known venue and free-text comprehension,
not 16 independent venues or canonical profile output.

- VB-04 copied the right weekly times but narrowed their scope to the banket
  offering and unnecessarily questioned the venue's Sunday rule.
- VB-12 recognized ordinary vegan options and then called them unproven in its
  open-points list, contradicting the same response.
- VB-16 inferred active cooling from a heading despite body text establishing
  ventilation and heating only; it also invented a banket-specific scope.

Eight answers had only exact evidence excerpts (including the valid empty
citation list in the web-only abstention task). Of the other eight, three had
formatting/NFC-only deviations and five had edited or abbreviated excerpts.
Formatting normalization was diagnostic only; original quotes were not repaired.
Seven answers passed content and exact-evidence checks together. This quote
protocol is specific to the diagnostic; production stages already use source
block IDs in parts and were not all tested by this wrapper.

The source-only and explicit-user-context tasks behaved as intended: missing
public evidence stayed open, while supplied user claims retained their origin.
Some otherwise passing answers still had wording/granularity caveats; full notes
and every required/forbidden criterion are recorded in the local assessment.

Total run time was 471.084 seconds. Mean per bounded question: 29.442 seconds;
median: 25.335 seconds; minimum: 13.792; maximum: 77.903. This is not a per-venue
research time or a measured speed improvement.

Ignored local artifacts: `.local/nuknuk-research/volta-braeu-task-diagnostic-20261021/`.
The frozen run plan, task responses, report and assessment retain prompt/input,
key, approval and response hashes. The assessment is by the current assistant,
not independent human certification; the model outputs are not human-approved
training targets. No adapter training, catalogue writes, model reset, source
retrieval test or production release was performed.

The next measured change should address scope attribution, contradictory
uncertainty, heading-based inference and source-ID evidence handling. No such
fix or rerun is claimed by this baseline record.

## Method 1.1 comparison: 21 October 2026

The exact 16 approved development inputs and evaluation key were reused with
method 1.1 on the same pinned 27B model, without an adapter. Runner/input/model
hashes match the baseline; the method instructions changed. No retries, prompt
changes during the run, training or canonical writes occurred. This generic
answer wrapper tests the method prompt, not the deterministic heading safeguard
in profile-candidate projection or the full retrieval pipeline.

All 16 answers completed, with no transport/format failures. Agent review against
the unchanged required/forbidden checks found 13 PASS, three PARTIAL, zero FAIL.
These labels follow the baseline rule: FAIL is a triggered listed forbidden
inference; PARTIAL is an unmet required check without such an inference. VB-02
meets zero of two required checks and is unusable despite its PARTIAL label.
Do not summarize zero FAIL as zero understanding errors.

- VB-04, VB-12 and VB-16 improved: venue hours are no longer restricted to
  banquets; ordinary vegan options are no longer contradicted by open points;
  ventilation/heating no longer become active cooling from a heading.
- VB-01 regressed: regular snacks/apéro are not independently represented;
  apéro appears only within group events, unlike the baseline's explicit
  ordinary snacks offering. This is a missing offer intent, not merely a
  demand for six separately schema-validated objects in this free-text test.
- VB-02 regressed severely: German `belegt` is read as reserved/occupied rather
  than evidenced. The model answers room bookings instead of physical areas.
- VB-08 regressed: CHF 17 is preserved, but the model invents that Marinara is
  among the cover favourites and misconnects the user clarification. This is
  beyond the baseline's already noted imprecise start-price wording.

Further caveats remain outside the narrow frozen checks: VB-05 unnecessarily
binds Food & Drinks to regular venue hours despite leaving kitchen hours open;
VB-14 calls missing official support a contrast to user statements; VB-15 omits
staff surcharges while retaining permit cost and the private-event exception.
These issues remain visible rather than silently corrected in model output.

Only seven answers have exclusively exact excerpts, down from eight; five pass
both content and exact evidence, down from seven. Three responses differ only
in formatting/Unicode, six contain edited excerpts. No quotation is repaired.

Run time: 515.627 seconds; mean 32.226 seconds/task, median 27.754, minimum
17.846, maximum 61.331. Baseline mean was 29.442 seconds; this run total is
9.46% longer. Single-run timing is not a reproducible performance result or a
per-venue research time. Server/hardware load is not experimentally controlled.

Conclusion: targeted problems improved, but new regressions prevent a general
quality-advance claim. No model, training or unattended research readiness is
certified. Corrected baseline learning targets stay unchanged; these new outputs
are not automatically human-approved learning examples. A known development
venue remains unsuitable as an independent holdout.

Private artifacts: `.local/nuknuk-research/volta-braeu-task-diagnostic-method11-20261021/`.
The comparison assessment binds raw response, report, baseline, approval and
unchanged-key hashes. The local review page shows every response and criterion.

## Commissioned new-venue diagnostics

`runTaskBenchmark` additionally supports explicit
`authorizationMode: 'USER_COMMISSIONED_DIAGNOSTIC'`. This is for a human request
to test a different venue before that person has reviewed its newly authored
questions or expected answers. It does not relabel assistant-authored criteria
as approved by the human. Default `TASK_REVIEWED` mode and its existing exact
Volta-task approval requirements remain unchanged.

Commissioned mode requires the distinct `backyrd.commissioned-task-inputs@1`
input format, `taskCriteriaHumanReviewed:false`, exact input/task hashes, and a
receipt recording the actual human request/thread with
`USER_COMMISSIONED_UNREVIEWED_DIAGNOSTIC`. That receipt is local provenance,
not authenticated training/export authority. Existing task-reviewed files
cannot silently use this mode, and the reviewed-mode validator rejects these
commissioned files. Model/adapter checks, key isolation, source-mode checks,
output bounds, timeouts and write prohibitions are shared unchanged.

Diagnostic report v2 records the mode, venue group and unreviewed reference
status. It remains `blindTest:false`: a venue not found in prior local runs is
not evidence of absence from model pretraining or a statistically independent
holdout. All expected criteria and source snapshots must be frozen before the
first model request; the key is never read by the runner. A commissioned case
cannot become a human-approved learning target merely because it passes.

Source capture limitations must remain visible. A cached official-site excerpt
can support a bounded comprehension test, but cannot be described as a successful
live source-retrieval test, full website coverage, or confirmation of current
production facts. Web-tool line/table rendering is not original HTML character
position. Full-page hashes/offsets must not be fabricated for excerpts.

Three additional synthetic tests cover distinct mode/approval identity, changed
inputs, source/answer-key isolation and explicit unreviewed report status.
Affected runtime suite: 528 tests pass, including build/type compilation.

## Pantheon new-venue test: 21 October 2026

The human commissioned a test on another venue. Pantheon Basel, Muttenz, was
chosen after no prior Pantheon match was found in the local research artifacts.
That search is not proof of absence from model pretraining or an independent
holdout. Sixteen new questions and assistant-authored expectations were frozen
before generation. They have not been factually approved by the human.

Direct official-site fetches timed out for tickets, events, menu and catering.
The comprehension test therefore used explicitly labelled cached official-page
excerpts returned by web search/open. The cached representations range from days
to months old. No full live-site retrieval success, freshness, original HTML
positions or full-page hashes are asserted. This source limitation remains in
the pre-run manifest and user-facing report; no profile facts were written.

Same pinned local 27B model, no adapter, method 1.1 and the existing generic
answer/evidence envelope. No retries or prompt changes during the run. All16
responses completed, no transport/format failures. Agent assessment against the
pre-frozen criteria: 12 PASS, two PARTIAL, two FAIL.

- PT-01: ordinary museum admission recognized and then questioned despite
  explicit spontaneous ticket purchase. Partial due to contradictory uncertainty.
- PT-04: both schedules copied correctly, then Sunday closing wrongly summarized
  as 17:00 for both; the museum excerpt states 16:30. Fail despite exact citations.
- PT-08: `pauschal` treated as explicit proof of admission included in a school
  tour. The excerpt does not say so. Fail despite exact citations.
- PT-09: six-year boundary recognized as unclear, while another sentence already
  assigns the child to the seven-franc category. Partial due to mixed certainty.

Other required checks passed, with wording caveats preserved in the assessment.
Room evidence used the question word `nachgewiesen`, so it does not demonstrate
that the prior `belegt`/reserved ambiguity has been repaired. Capacity-context
separation passes the narrow criteria but its final confident reconciliation is
not independently proven. Tour-price open points contain an unnecessary question
about groups below11; no actual exclusion was made.

Ten responses have exclusively exact returned excerpts; seven pass both content
and exact-evidence checks. Run time465.109seconds, mean29.069seconds/question,
median28.521, min15.758, max53.470. The question set and source lengths differ from
Volta's: these values are not an isolated model-quality or performance comparison,
and are never a full per-venue research time.

Private artifacts: `.local/nuknuk-research/pantheon-transfer-20261021/` with
separate frozen inputs/key/commission/source-capture/pre-run manifest and
`run/assessment.json` bound to original outputs. No new answer became a training
target or inherited the human's Volta factual approval. No release or DB change.

## Second new-venue test: discOWer Seilpark Melchsee-Frutt

The next human request commissioned another new venue. No discOWer/Melchsee-Frutt
match was found in prior local research JSON. Sixteen assistant-authored questions
and keys were frozen before generation, with the exact human request recorded
as commissioning only, not factual task approval. No method, runner, model,
adapter or generation setting changed for this run.

Direct GETs to the five official pages timed out. A rendered official-site web-tool
snapshot was preserved verbatim, then deterministically converted into text with
source-hash/offset bindings. Offsets address that frozen rendering, not HTML.
The additional parcours open returned 429; information/prices/hours/arrival
snapshots were sufficient for the bounded questions. Dynamic Today banners were
excluded. Current 2026 and older 2024 schedules remained labelled in the inputs.
No complete live-retrieval or freshness claim is made.

Of 16 attempts, 15 returned complete answers and DC-14 hit the 90-second limit
without complete content. There was no retry; its seasonal-hours/last-entry
question has no semantic result. The transport/model root cause was not diagnosed.

DC-03 has a curator reference defect: it asks for separating park tariffs but
supplies only the price list, without the explanation that Pfideri names the
separate children's park. The prices/ages were copied correctly. The unsupported
reference requirement was detected after reading the response and the whole
case was excluded from the overall semantic score, neither passed nor marked as
a model failure. Original frozen files were not amended and no replacement was
run. This post-response exclusion is explicit and precludes a 16-of-16 or unbiased
accuracy claim. Other cases receiving that context cannot supply it retroactively
to a fresh independent request.

The 14 fully assessable answers meet their frozen content criteria. They preserve
park separation, ticket duration and day surcharge, explicitly included risotto
package components versus unknown fondue price, recommended supervision ratios,
guardian consent despite adult pricing, weather restrictions and differentiated
accessibility statements. They are not flawless prose: DC-01 initially abbreviates
the four-year recommendation; DC-12 calls sold-out status the only exception to
usual spontaneous visits; DC-15 incorrectly adds a ten-person minimum to the
special-opening option, although ten is explicit only for the group tariff.
The last statement does not actually exclude small groups from ordinary visits,
so it does not trigger that narrow frozen forbidden check. These extra issues
remain visible, not silently repaired or retroactively added to the rubric.

Only five of 15 returned answers have exclusively exact citations; four pass both
content and exact-evidence checks. Across citations: 18 exact, 9 formatting/NFC-only,
4 edited/not-found. Original text is not normalized into an approved quotation.

Total 562.904 seconds; mean 35.181 seconds across all 16 attempts including timeout;
mean 31.526 seconds across the 15 complete answers; median 26.774 seconds across all
attempts. Not per-venue research time and not a controlled comparison to other
question sets. No full-source research or canonical-profile projection tested.

Private artifacts: `.local/nuknuk-research/discower-transfer-20261021/` with
immutable rendered snapshots, source segments, separate question/key/commission
files, pre-run hashes, responses and an explicit reference-exclusion assessment.
No training, canonical writes, publication or inherited human approval of targets.

## Silo Hostel Basel: real official-site research, 22 October 2026

The human requested a new full source-to-profile test. This differs from the
bounded-question diagnostics: only Silo Hostel, Basel and the official homepage
were seeded. `STAY` was explicit profile-schema context inferred from the request's
venue type, not a confirmed existing category. No phone, email, address, hours,
control answer or prepared source text was injected into the research function.
Six official pages were captured separately before generation for independent
assistant source review; this reference is not human-approved learning material.

The existing `researchSpotV2` path followed official links and fetched live pages
with normal public-source protections. Twelve fields were requested, including
public email, phone, address, general/kitchen hours and the scoped experience
profile. Budget: 900 seconds, 12 requests, 48 model calls, depth 3. No menu-image
or vision run, no Admin export/current-profile conflict check, no DB or training
write. Search in this run means official-link discovery, not an external search
engine. The existing profile pipeline's bounded model-call timeouts remain.

A reporting-only defect was fixed before freezing this run: `researchPlan.revision`
was hard-coded to 4.0 despite method 1.1/runtime 4.1. It now takes the existing
`SPOT_RESEARCH_REVISION` constant; an integration assertion ties report and plan.
Build/type compilation and 35 focused planner tests passed. No model/extraction
rules were tuned for Silo during this run or for this reporting correction.

Actual result: time budget exhausted at 900.005 seconds, four successful live
fetches, 17 model calls. Pages visited: homepage, contact, private double rooms,
LivingRoom. Five of 12 fields yield review proposals; seven are unresolved.
Proposals: public email `info@silobasel.com`, locality Basel, category STAY,
place type HOSTEL, partial experience profile. The profile has breakfast and
café/snacks, six properties, zero areas and zero explicit offer-area relationships.
The accommodation offering itself is missing. These counts are coverage evidence,
not five correct fields out of 12 or a percentage accuracy score.

Confirmed problems from the unmodified run:

- The actual downloaded homepage HTML contains the venue's phone and street
  address. Neither appears in any of the four selected model-source texts;
  only the generic email is carried over. This is a source-preparation loss,
  not evidence that the model cannot understand the published contact details.
- Several alternate entity names are held as `ENTITY_NAME_NOT_LITERAL` and
  others have insufficient entity evidence. Other candidates use invalid
  JSON-encoded strings, invalid property scopes or null identity/address values.
  The projection rejects invalid canonical values rather than storing them.
- LivingRoom/garden candidates remain unverified at the budget limit. Breakfast
  inclusion/times, Wi-Fi and diet options are available in independently checked
  hostel/guest-info pages, but those pages are not reached. Guest-info remains
  in the frontier. Meeting details likewise are not reached.
- The contact page's explicit no-onsite-parking statement is recorded as a
  negative held fact, not as positive parking availability. It does not become
  a complete practical profile. General weekly hostel/reception hours and
  precise check-in hours must stay open where not explicitly supported;
  missing scoped time extraction is a separate failure from justified abstention.
- Model calls consume 898.499 seconds in total, while all four successful network
  fetches together consume 1.349 seconds. Two flat-field stages take 124.366 and
  119.462 seconds; two scoped critics 97.305 and 89.327 seconds. This is an expensive
  multi-stage run, not comparable to the earlier 29–35 second individual questions.

No published profile, readiness certification or training approval resulted.
The model service was absent initially, started offline for this test with the
same pinned 27B revision/no adapter, and the owned process stopped afterwards.
Other processes or services were not stopped.

Private artifacts: `.local/nuknuk-research/silo-live-20261022/` containing the
separate pre-run controls/reference, hash-bound plan, live transport/HTML receipts,
checkpoint/report/model audits and the assistant's coverage assessment. Sources
and reference answers remain out of Git. The next useful repair concerns
branch-owned contact preservation, reliable typed field/entity mapping, critical
page priority and bounded prompt/stage size before repeating the same test.

## Silo chain repair and bounded validation — 22 October 2026

Delivery class: FAST_PR. Owned runtime paths are the local research agent,
source reader, scoped planner/projection and research evidence helpers, with
focused regression tests and these research documents. No canonical writes,
training, authorization changes, production deployment or Decision changes.

The repair preserves bounded published contact panels, gives flat identity
fields their own original blocks and native values, checks literal name/address
values, carries established nodes and resolved fields between pages, restricts
property grammar to canonical node/control types, rejects bicycle/car spaces as
camping, and parses explicit offer-owned weekly times through the existing time
parser before the independent critic. Compatible weekly rows merge; overlaps,
conditions, dated/holiday exceptions and missing days do not become certainty.
Observed translations remain reachable but are deprioritized behind novel pages.

The completed live full comparison used runtime 4.3, the identical twelve
requested fields/options, original frozen Silo reference, same pinned 27B model
and no adapter. It fetched **6 pages**, made **30 model calls**, and exhausted the
same **900,006 ms** budget. The baseline fetched 4 pages in 900,005 ms with 17
calls. This is greater source coverage within the cap, not a shorter end-to-end
research time or evidence of general accuracy. Actual pages were home, German
guest info, hostel overview, meeting, contact, then a partly processed English
meeting page. The Living Room page remained unread. Three earlier development
runs were explicitly interrupted when concrete defects were found; their saved
artifacts are not counted as completed benchmarks.

The full run proposed 8 fields, including one incorrect breakfast-to-kitchen
mapping accepted by the model critic. The final **4.4** guard now requires an
explicit kitchen context and rejects shared/guest-kitchen or breakfast evidence.
A source-bound deterministic replay removes that original false proposal while
leaving the other scoped projections unchanged: **7 field drafts**, **3 offers**
(overnight, breakfast, cafe), **5 areas**, and **0 explicit offer-area links**.
The original report is immutable; this replay is not presented as a new model run.

The WLAN false negative was an overly narrow facility-assertion phrase filter.
The small extension accepts an explicit whole-house/building WiFi assertion,
retains room/area and unassigned hotel-list counterexamples, and does not allow
other guessed amenities. A fresh **focused 4.4** run on the previously observed
official guest-info page requested only `amenity.features` and `hours.kitchen`:
**1 request, 3 model calls, 103,128 ms**, `WIFI` proposed with its literal source,
kitchen hours unresolved. This is an additional field test, not a second full
4.4 benchmark and not silently combined into a single full-run score. An earlier
focused run is retained separately; the final focused plan binds the narrowed
source helper bytes and all four relevant runtime source hashes.

Current validation: strict TypeScript build and **551 runtime tests pass**;
repository sanity, canonical secret scan, client-secret boundary and production
state checks pass locally. The tests cover positive and negative source/ownership,
node/type, empty-hours, service-vs-kitchen, camping, schedule merge/conflict,
translation-priority and national-phone cases. CI/production release is not
claimed. Unrelated Admin preview changes remain untouched.

Remaining limitations are material: full 15-minute runtime; missing weekend and
holiday breakfast rows, room usage times/24-hour room and Bravo Ricky name;
missing meal inclusions and service-area links; a missing separate meeting
service; some cafe details regressed versus the baseline; additive descriptive
text still sometimes treated as a conflict. National phone `061 555 06 06` is
retained as `PHONE_COUNTRY_REQUIRED` evidence rather than guessed E.164. Negative
onsite parking evidence stays in the review ledger. No invented room price,
whole-venue accessibility, kitchen schedule or reception hours is justified by
these gaps. Model outputs still need human review.

Private evidence: `.local/nuknuk-research/silo-chain-v43-20261022/` (completed
full run), `silo-field-recheck-v44-final-20261022/` (fresh focused run), and
`silo-chain-repair-assessment-20261022/` (bound validator replay and assistant
assessment). The same reference remains under `silo-live-20261022/`. No Silo
result has human factual/training approval; learning remains quarantined and
readiness/import certification stays false.

## Integrated source-pack comprehension mode

A model-capability question must not be evaluated under the default system
instruction saying not to fill an entire profile. The optional
`answerMode: 'RESEARCH_COMPREHENSION'` allows the supplied task's actual scope,
including a combined research draft. It is available only with
`USER_COMMISSIONED_DIAGNOSTIC`; it cannot silently inherit historical reviewed
single-question approval. The default bounded request text remains unchanged.

This mode records diagnostic version 3 and the actual answer mode/scope. It uses
the same structured free-text answer/evidence/open-points envelope, frozen input
hashes, local-model/adapter check, fresh contexts, temperature, thinking setting,
90-second request limit and output limit. It still does not test independent
navigation or canonical authoring-schema projection. Provided complete source
packs are an explicitly easier task than unattended website research. A failed
or incomplete response is not by itself proof of intrinsic model incapability.

Bind the new protocol's runner/source hashes to the unchanged inputs and rubric.
A development run started under contradictory instructions must be retained and
marked invalid for the integrated capability verdict, never silently rescored as
a model failure. Unreviewed criteria remain unreviewed; no model output becomes
training data, human approval or a catalogue write.
