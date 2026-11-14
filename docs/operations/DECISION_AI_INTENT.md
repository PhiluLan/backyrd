# Decision Product intent interpretation

## NukNuk in the existing Backyrd app

Use the existing authenticated `decision-v13` Product route for the
unpublished Backyrd app, including its initial test phase.
Set `BACKYRD_DECISION_UNDERSTANDING_PROVIDER=nuknuk` on the target backend and
enable the existing `BACKYRD_DECISION_AI_INTENT_ENABLED` switch there. An unset
provider selects Luna. The route validates the NukNuk search instruction and
the canonical Librarian applies the evidence, eligibility and ranking policy.
App and Web can show a clarification alongside eligible spots or on its own
when the route cannot safely begin the search. The existing release and
Emergency-OFF controls apply.

For a personal app test, select `nuknuk-personal` as the provider and set
`BACKYRD_NUKNUK_PERSONAL_USER_ID` to the lowercase UUID of the verified Backyrd account. Other authenticated
accounts continue to use Luna. Keep this setting server-side and remove
the provider selection before taking a temporary inference host offline.

Configure `BACKYRD_NUKNUK_ENDPOINT` with the HTTPS
`/v1/chat/completions` URL, `BACKYRD_NUKNUK_API_KEY` as a server-only secret
and `BACKYRD_NUKNUK_MODEL` with the exact alias returned by that endpoint.
For the 35B app candidate, use the measured MLX base
`mlx-community/Qwen3.6-35B-A3B-4bit` at revision
`38740b847e4cb78f352aba30aa41c76e08e6eb46` with the selected step-175
adapter. The SHA-256 of its MLX weights is
`df9b4e7874a14260ab138038234e85df5cc2722040d35057c3646713f7ad6b73`.
Pin the base and adapter together on the inference host. Configure
the model alias returned by that host, then verify an authenticated
structured completion and both turns of the birthday regression against
the target Decision backend before publishing the app update.
For vLLM, enable LoRA serving and JSON-schema constrained output, disable
request payload logging, and provision context for the full prompt plus up to
2,048 output tokens. Use TLS and authenticated access. Verify the endpoint with
the actual provider request before enabling it. Requests default to a
30-second server deadline for NukNuk. The service receives the search text,
normalization reference and explicit structured search fields. User IDs,
sessions, spot records and ranking history stay in the Product backend.

For the first app verification, use an isolated backend with the canonical
Decision schema and approved spot fixtures. With a signed-in test account, check a
normal search, a search with both spots and a targeted question, a follow-up
answer, a question without a usable search instruction, and a provider timeout.
Capture the validated handoff, actual Librarian ordering and visible outcome
with end-to-end latency. Use the existing authenticated release process for any
later rollout.

### Local MacBook inference check

The 48 GiB M4 Pro ran the local 4-bit Qwen3.5-27B snapshot with a separate
MLX conversion of the selected adapter. All 496 LoRA projection pairs were
shape-checked against the local base weights. This used a different quantized
base representation from the Blackwell run. The loopback server was ready
in 5.7 s. Three sequential requests took 54.4, 82.9 and 77.7 s at the model,
with up to 19.3 GiB of process footprint and no observed swap growth or memory
warning. On these requests, the model spent about 24 s reading nearly 3,000
input tokens before generation. The two executable plans reached the
canonical Librarian against the saved test catalog. The third had an unbound
weather condition and was rejected before search. Evidence is under
`.local/nuknuk-understanding/mac-inference-xor5js`. The test server was stopped.

The local configuration is suitable for manual checks. All three model
requests exceeded the existing 30-second Product deadline.

Retesting the same queries with a memory-only MLX prefix cache reused 2,560
tokens in both warm requests at the same frozen calendar reference. Prompt
processing fell from about 24 s to 3.5 s. A separate tokenization check with
different reference times found a shared prefix of about 1,975 tokens, so the
warm result cannot be assumed for live requests. Model times for SBB, café
and play were 61.6, 66.2 and 58.0 s with the original instructions and cache.
The cold SBB result dropped travel from its explicit time coverage. The play
request reached search but made shelter mandatory even without rain.
With shorter output instructions and the same cache, model times were 54.5,
57.7 and 67.2 s. The café request lost its venue type and failed validation.
The play request also demoted the requested day to context. Keep both
experiments separate from the app configuration. Evidence is under
`.local/nuknuk-understanding/mac-cache-fPZMqi` and
`.local/nuknuk-understanding/mac-short-B8tSP7`.

Two further local output-format trials used the same adapter, three requests
and saved test catalog. A reversible short-key encoding preserved all fields
and validation outcomes in 40 saved responses. Despite this, fresh generation
with the encoded schema took 56.1, 48.4 and 44.2 s. The SBB response lacked
required subject references, the café response made party size a hard rule and
lost its ranked candidate, and the play response had an unbound rain rule.
Keeping canonical keys and changing only the grammar's JSON separators took
56.3, 42.4 and 63.6 s. Its SBB result lost explicit travel/visit coverage,
its café result changed the venue into a coffee request, and its play result
bound the rain branch but demoted the date and lost shelter as an offer
feature. These are single measurements per case, with a cold SBB request
followed by two warm requests. Both runs stayed below 19.2 GiB measured
process footprint, with normal memory pressure and no swap growth. The local
trials did not meet the existing 30 s deadline or preserve search semantics
well enough to connect either format to the app. Evidence is under
`.local/nuknuk-understanding/mac-wire-gKnz5t` and
`.local/nuknuk-understanding/mac-json-MveLUF`.

### Smaller model on the MacBook

The pinned 4-bit 9B model completed the original SBB and café generations in
12.4 and 15.1 s but omitted required fact references. The play request hit
the 2,048-token limit after 55.4 s. Requiring explicit identifiers and
subject references in the model schema brought all three cases to 15.6–22.6 s
with the existing Librarian validator.

A separate rank-8 adapter for the last two attention blocks completed 20
updates on the Mac using a derived subset of the reviewed v7 curriculum.
The three benchmark questions were excluded by exact text. Each adapter
comparison used the same prompt, schema, calendar reference and saved test
catalog. After training, model times were 17.9, 15.7 and 22.4 s, with a peak
process footprint of 7.84 GiB and no observed swap growth during inference.
The two executable searches each returned zero ranked candidates. SBB still
invented an indoor requirement and omitted travel from the 45-minute
coverage. The café request still invented a fixed start boundary and treated
the venue type as optional. The play request still failed on a duplicate
weather identifier and its generated date was wrong. Use the 9B model for
further development, with a disjoint evaluation set before app activation.
Evidence is under `.local/nuknuk-understanding/mac-9b-vECFJz`,
`.local/nuknuk-understanding/mac-9b-explicit-SYczQ3` and
`.local/nuknuk-understanding/mac-9b-trained-aO5M3D`.

An eight-case local comparison used three regression queries and five new
Swiss German requests with the same explicit model schema, date reference,
Librarian and test catalog. The trained 9B took 12.3–25.2 s including
validation and available search work, with three rejected handoffs and no
ranked spots or useful questions. The trained 27B took 32.3–61.3 s, with
seven executable handoffs and one clarification-only response. It preserved
the SBB travel budget and the optional terrace in the Rhine case. The
outdoor play request still lost Sunday and made shelter unconditional.
The exact results and rubric are in
`.local/nuknuk-understanding/mac-model-choice-psps9P`. Qwen3.6-35B-A3B
completed the same benchmark on the Mac after all 15 model files were
verified. The unadapted 4-bit model loaded in 4.1 s, peaked at 21.1 GiB
and had a median local chain time of 8.6 s. Seven of eight responses
finished within 30 s. Six search instructions were executable, and none
ranked a spot in the saved catalog or asked a clarification. The outdoor
play request failed because the rain condition was unbound. The Tierpark
request hit the generation limit at 36.1 s. The Jazz request reversed the
21:00 boundary and the open request invented a drinks requirement.
The speed makes this the preferred local fine-tuning candidate. Keep the
trained 27B for quality comparison and verify a trained 35B on fresh cases
before activating it in the app.

## Current access policy — 2026-10-19

The founder explicitly requested Decision for every authenticated Backyrd account
and removal of the account allowlist. The installed Luna provider and Edge
composition (`backyrd.luna-provider@2`) no longer read or enforce an actor list. Verified authentication
still rejects missing, anonymous, deleted and banned accounts before model calls.
Release authority, rate limits, timeouts, consent-bound personalization and
Emergency-OFF remain in force.

The existing protected manual control now provides only
`ENABLE_AUTHENTICATED_USERS` and `EMERGENCY_OFF`. It validates current Main, the
audited shipped Function digest and the server-side model key. For compatibility
with the already shipped artifact it sets the old allowlist setting to `*`; new
code ignores this setting. No user UUID is selected or granted special access.
The founder request supersedes the historical pilot-only scope below.
Authenticated App/Web checks remain required after activation.

The sections below record earlier release stages and are historical, not the
current access policy.

## Proposed query semantics v2 (not yet released)

The next Product release replaces the one-field intent classifier on the same
`decision-v13` route. Every AI-enabled request receives a compact, version-bound
projection of the canonical World Knowledge registry. The model returns one
primary and optionally one secondary purpose, up to 20 supported field/value
preferences with exact excerpts from the request, and whether the user needs
an indoor visit. The server validates all keys and values against that registry
projection. Only the enum selections are retained in a new service-only,
24-hour request-bound cache; copied excerpts and raw text are not stored.

`INDOOR_REQUIRED` is a query constraint, not a model-authored spot fact.
An unambiguous rain phrase in the request is also a deterministic lower bound
if the model overlooks it; indirect weather language remains for the model to
interpret.
The Product evaluator derives indoor suitability only from verified place
types. Museum and indoor climbing gym are indoor; park and zoo are outdoor;
mixed or unspecified types remain unknown and cannot satisfy the constraint.
Verified opening intervals must overlap an explicitly requested daypart.
The candidate RPC v5 evaluates the complete verified city cohort (bounded at
1,000), avoiding the previous category-first 48-spot truncation. The Product
ranking policy v3 puts request-context fit ahead of consented personal taste.
The new `NIGHTLIFE` intent is distinct from craft-beer or other drink searches.

These are source changes only until the Product, Database, mobile/web contract,
security and end-to-end gates pass and a manual exact-SHA Production release
is approved. The historical pilot and rollback evidence below remains valid
for the previously shipped v1 classifier, not proof of v2 live operation.

Status: opt-in Product release component; OFF by default. This is part of the
single `decision-v13` Product route, not a second Decision engine.

## Purpose and authority

After verified authentication, Product control and the existing Decision rate
limit, the server first uses the released deterministic lexicon. Only an
unresolved wish may be sent to OpenAI to map it to exactly one
of the seven released Product intent categories or `null`. The model receives
only the submitted wish. It receives no user identity, history, World Knowledge,
candidate list or service credential. The request sets `store: false`.

The model is **not** an authority for spot facts, age suitability, opening
hours, eligibility, or ranking. Its output is schema-bounded, locally checked,
then evaluated by the same canonical World/User/Decision Product path. An
unresolved main wish cannot authorize a ranked candidate. Provider, cache,
schema, and control failures fail closed; they never invoke a legacy route or
silently return unrelated spots.

The private cache binds one enum-only result to the authenticated user, exact
original request hash, model, release/artifact/source-set hashes and control
generation for at most 24 hours. It persists no raw text or provider response.
This makes repeated requests stable for the Product idempotency ledger. User
deletion cascades into the cache; expired rows are removed in bounded batches.

## Release and activation

This is a `PRODUCT_RELEASE` plus `DATABASE_PR`; Production remains a separate
manual `PRODUCTION_RELEASE` against the exact certified Main SHA. The new
versioned migration must pass clean boot, RLS/grants and allow/deny tests. Do
not apply it manually or bypass the recovery-risk gate. Deploy the certified
`decision-v13` artifact with `BACKYRD_DECISION_AI_INTENT_ENABLED` absent or
`false` first. Keep `OPENAI_API_KEY` server-side only.

On 2026-10-03 the Founder explicitly accepted the untested database-recovery
risk for migration `20261003111539_decision_ai_intent_cache_v1.sql` at SHA-256
`bb7f64fe1dfe2c99c920bae57eb3c50d1b6ccefddc63952b8560f310836c95b2`.
The Founder and CTO separately approved only its bounded deletion of expired
rows from the newly introduced private intent cache. This is not authority to
delete existing Product data or to execute the migration outside the manual
Production release.

The manual Production deployment run `37121530704` completed with `PASS` for
canonical Main `67296a000e7d82d15860b5e3a4d69bce8bce6c1c`; its immutable
audit lists only the migration above and `decision-v13`. Fresh read-only
Production inspection then found 174 migrations ending at that migration and
active `decision-v13` version 168. The shipped-source ledger was reconciled
from this evidence without editing Production migration history. The AI
feature remained OFF.

Before activation, verify the exact model named in
`BACKYRD_DECISION_AI_INTENT_MODEL` is available to the Production project and
supports strict Structured Outputs on Responses with `store: false`; confirm
latency within `BACKYRD_DECISION_VNEXT_TIMEOUT_MS`, rate/cost limits, privacy
notice, and a safe failure response. Run a controlled one-account pilot with
ordinary requests including "Familienausflug in Basel", "Regentag mit meiner
4-jährigen Tochter", plain food/coffee, and mixed/ambiguous wishes. Check the
sealed interpretation and whether any shown spot has verified core intent and
hard-constraint evidence. Do not equate an AI label with age suitability.
For the first pilot, `gpt-6-luna` is the intended low-cost classification
candidate; its request explicitly uses no reasoning effort to keep the 120-token
output bound suitable for a one-field result. Verify actual account access and
response timing before enabling even the pilot.

For the controlled pilot, set `BACKYRD_DECISION_AI_INTENT_ENABLED=true` only
alongside `BACKYRD_DECISION_AI_INTENT_USER_ALLOWLIST` containing the exact test
account UUID. An absent or empty list permits no AI calls. The explicit value
`*` permits all authenticated accounts and requires a separate
general-availability approval after the privacy notice is published. Malformed
lists fail closed. If a provider or quality failure occurs,
set it back to `false`; the deterministic Product path remains, with unknown
intents showing no unrelated ranked list. No model key or raw user wish should
appear in logs or release evidence.

The first Production pilot is controlled by the manual
`decision-ai-pilot-production.yml` workflow. It requires the exact current Main
SHA, the successful audited `decision-v13` deployment run, and literal mode
confirmation. The workflow verifies the deployed bundle and existing server-side
OpenAI key before setting `gpt-6-luna`, the one approved user UUID, and only
then the enable flag. `EMERGENCY_OFF` is a separate manual mode that sets the
flag false without waiting for model checks. The workflow reports
`PILOT_CONFIGURED_ONE_ACCOUNT_PROVIDER_NOT_YET_VERIFIED`, not pilot success;
the authenticated one-account request, provider result, costs, and ranking
evidence must still be checked before any broader activation.
After the taxonomy correction, the pilot workflow binds the requested
deployment run to the shipped Production ledger, downloads that exact audit,
and verifies the live `decision-v13` bundle digest before it can re-enable
only the previously approved account. The current Main may contain later
non-deployment ledger or workflow changes; its shipped source must remain an
ancestor and the exact audited Function must still be live.

For the 20-query natural-language evaluation, the same manual, source-bound
workflow also supports `ENABLE_EVAL_COHORT`. It adds only the previously
approved test account `6b31c2d2-6b2b-45bb-a7e0-ffbd0cdbea6f` to the original
pilot account. It does not open the feature to other accounts. The evaluation
must inspect the actual model-backed interpretation, ranked results, reasons,
rate/cost behavior and fail-closed paths. General availability is a separate
decision after this evidence and a published privacy notice; the eight current
`de-CH` legal documents remain drafts and do not satisfy that prerequisite.

## 2026-10-03 pilot finding

The account-only request "Familienausflug in Basel" proved that the provider
returned the bounded `ACTIVITY_EXPERIENCE` intent. The resulting Product
Decision nevertheless ranked two canonical `STAY` / `OVERNIGHT_STAY` hotels
among eight unconfirmed candidates, while `ACTIVITIES_PLAY` / `ACTIVITY_PLAY`
for Robi Bachgraben was not recognized as confirmed. This is a Decision-to-World
taxonomy mismatch, not missing researched facts or a model interpretation
error. In accordance with the pilot quality rollback rule, the manual
`EMERGENCY_OFF` run `37125040938` succeeded. The AI pilot remains OFF until a
new exact Product/Database release has passed canonical-value and live-account
verification. No all-account activation is authorized.
