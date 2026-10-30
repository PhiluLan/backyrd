# Mandatory evidence before recommendation

The meaning plan's modality is binding across matching, Product assessment and final ranking. A required programme, atmosphere, accessibility feature, date or exclusion cannot become optional because of its field family. Personalization only orders already eligible candidates.

## Admission

- REQUIRED and EXCLUDED facts in the chosen logical branch must be MET together, using compatible offer/area witnesses. A missing or contradictory mandatory fact prevents admission.
- Unknown duties remain in the librarian's `unresolved` collection with their individual reasons; proven contradictions stay `excluded`. Neither receives a Product recommendation rank.
- Only explicit PREFERRED facts (including preferred logic branches) may influence ranking without blocking admission. CONTEXT and NOT_REQUIRED remain non-duties; this change does not reinterpret the user's original words or repair a model that assigns the wrong modality.
- A required fact in an input-only/context family is UNKNOWN with `REQUEST_PARAMETER_NOT_VERIFIABLE_AS_REQUIREMENT`. It is never silently relabelled CONTEXT. Existing context parameters still participate in budget and eligibility checks.
- Unknown requested visit times remain UNKNOWN, including an undated day phase; they are not turned into harmless context. With no time duty, the engine does not invent a visit now.
- ALL requires the full combination; required ANY accepts one fully proven branch. Shared duties remain binding outside ANY. Unknown conditional truth requires every possible selected conditional plan to be fully supported; one favourable branch cannot conceal the other.
- A positive accessibility or atmosphere fact cannot substitute for an unknown programme. Core confirmation is issued only for a fully supported admissible visit.

The final Product gate independently requires ELIGIBLE_CONFIRMED, hardConstraintState PASS, no unknown or failed hard constraints, confirmed core coverage, and no contextual rejection. Thus a falsely confident upstream core or tier alone cannot manufacture a rank. The existing null-rank response rows remain diagnosis data; both Mobile `wohinModel` and Web transport exclude them from displayed results.

Explicit legacy UI hard controls are binding too. The adapter no longer discards indoor, atmosphere, equipment or non-category exclusion controls by family. Existing scope-aware budget and time compatibility guards remain; source-use authorizations are not broadened.

## Versions and rollout

Matching is `backyrd.decision-vnext.librarian-matching@15`. Spot and event evaluation are `decision-vnext-librarian-evaluator@4` and `@5`. Ranking policy is v7 and evaluation release v14. Request/response schema shapes are unchanged. No database, auth or provider changes are needed.

This implementation does not deploy or activate a new production artifact. Release certification and normal product authority controls still apply. The diagnostic function and deployed consumer are not changed by the local replay.

## Validation

`npm test --workspace @backyrd/decision-vnext-core`: 469 passing tests. These include a modality/state matrix across field families, the 27 combinations of three mandatory facts, unknown and proven Jazz/access fixtures, mandatory vs preferred atmosphere, exact-date unknown availability, group-count uncertainty, exclusions, actual ANY branches and a rehashed inconsistent-assessment test against the final gate. Existing tests that previously required unsafe fallback ranking now inspect unresolved data or assert exclusion instead. Source-use, authentication, age restrictions and client-contract checks continue to run.

The recorded ten real model outputs from 30 October were replayed locally, without new model calls or production writes, against the saved 419-profile/25-event snapshot with neutral personalization and frozen authority time. This is not a new live model test or an identical database rerun. Admitted counts before/after: cafe 91/0; free table tennis 0/0; swimming 3/0; vegan lunch 173/15; date bar 50/0; children outdoors 121/0; escape room 1/0; sauna 8/0; flea market 0/0; Jazz/access 11/0. The eight displayed vegan-lunch results remain. All other unresolved requirements remain visible in the evaluation, without recommendation ranks.

The reduced coverage is intentional under the mandatory-evidence rule, not a claim that the outstanding search problems are solved. Vocabulary alignment, the model's treatment of children and prerequisites, programme evidence, capacity verification and incomplete schedules still require separate work. Never restore silent fallback admission to hide those gaps.

## Semantic alignment and ranking follow-up (matching 16, prompt 6)

The follow-up keeps the admission invariant above. It changes these four parts:

1. **Shared meaning and scope.** The finite language adds explicit live jazz,
   conversation, child activity and public day access concepts. A declared offer
   caption can establish the named activity; only known captions and a small set
   of booking/team suffixes are accepted. Negated or conditional prose remains
   unproven. Typed drink/item lists support exact catalog terms and origin
   qualifiers. Coffee recorded as an activity can prove the requested drink in
   that same offer. Offer/area joins still prevent borrowing a quiet room from
   an unrelated offer. `table_tennis` already existed; this change does not claim
   to introduce its canonical ID.
2. **Model handover.** Prompt revision 6 explicitly distinguishes child activities
   from family-friendly dining, a child subgroup from the complete party, live
   jazz from generic music, and public/spontaneous access from an optional hotel
   stay. Complete explicit party size is a capacity requirement; partial party
   counts remain context. Numeric zero prices express free access without
   inventing a currency or group size. Prompt compliance must also be evaluated
   with real model responses; fixtures alone do not prove it.
3. **Time and capacity.** An activity can be documented while its requested date
   fails. These are now separate fact and eligibility assessments. Offer validity
   bounds supply an explicit out-of-season rejection independently of missing
   venue hours. Existing typed offer schedules remain authoritative: an empty
   schedule does not inherit venue hours. A required party size is compared with
   the selected offer's known numeric capacity (at least the requested number),
   respecting property conditions. Prices, another room and unrelated offers do
   not establish capacity. Static capacity is explicitly explained as distinct
   from available booking slots. A full zero tariff with included mandatory fees
   may prove free access; partial items and missing fees cannot.
4. **Ranking.** Only admitted candidates are ranked. Matched preferences and
   confirmed request evidence use semantic identities instead of raw fact IDs.
   Repeated meal/activity aliases do not create extra votes. Unrelated profile
   content and offer-count explanations do not improve evidence rank. Genuine
   ties use a stable spot identity independent of profile edits, catalog order,
   names, popularity and payments. Existing rank-vector JSON shape is retained
   for Mobile/Web compatibility. Ranking policy 8 and evaluation release 15 bind
   the change; evaluator versions 6/7 identify spot/event execution.

No profile data is backfilled and no opening schedule, child suitability, public
access or booking inventory is fabricated. A frozen replay tests the matcher
against recorded model answers; it does not test the new prompt. A separate
admin-only prompt trial must be labelled accordingly and must not be confused
with deployment of the consumer engine.

A real five-case prompt-5 trial found a missing inferred wheelchair-access duty.
Prompt 6 therefore explicitly keeps personal mobility aids as context and emits
the required access fact separately; zero-price requests retain unspecified
currency when the user has not named one. This is a prompt correction, never
a software demotion of a duty already emitted by the model.

### Follow-up validation

- 496 Decision core tests and 374 World tests pass, including 27 targeted
  semantic/capacity/time/ranking regressions. The full Product CI chain passes
  with strict TypeScript, Mobile/Web contracts, route invariants and the existing
  isolated app E2E (zero production actions).
- The recorded ten-case matcher replay now finds Kaphi and 18 proven vegan-lunch
  candidates. It still uses prompt-4 meanings, so it cannot establish the new
  interpretation quality.
- Five real prompt-5 calls tested children, sauna, live jazz, six-person escape
  room and free table tennis. Children became an explicit required activity,
  sauna retained required public/spontaneous access, and the complete group
  size remained required. Live-jazz lost its inferred wheelchair-access duty;
  that regression caused the prompt-6 correction above.
- A real prompt-6 retry preserves live jazz REQUIRED and wheelchair access
  REQUIRED/INFERRED, with the mobility aid CONTEXT. A second retry was blocked
  by the existing global daily quota (20 requests, one blocked attempt); the
  quota was neither reset nor widened. This is not repeated-run statistical
  certification of the model or a fresh ten-case trial of prompt 6.
- Replaying the five updated case meanings (four prompt-5, one prompt-6) against
  the frozen catalog yields five child/outdoor candidates: St. Johanns-Park,
  Kannenfeldpark, Schützenmattpark, Hoppolino and Robi Bachgraben. Date-specific
  pingpong, swimming, escape, sauna, flea market and jazz/access stay unresolved
  or excluded where the required evidence is absent or contradicts the visit.
- The temporary admin prompt trial was restored to its exact prior source hash
  `2f082693d82220fb10f7e1846760f5d5c69d76558b190faf36e48e37cdeb6c34`.
  Consumer `decision-v13` remains version 217. No spot data, consent/auth rules,
  learning data or normal consumer decisions were written by these trials.

## Fresh ten-case diagnostic, 30 October (matching 17, prompt 7)

Ten new authenticated model calls completed against diagnostic v7 and the
unchanged consumer-v217 program in 75.86 seconds of summed server runtime.
Each searched 419 current Spot profiles and 25 event occurrences. The daily
budget extension to 40 is separately Founder-approved for this UTC day only.
All ten transports completed; that is not a semantic pass. The recorded export
contains 53 displayed recommendations. Thirty-seven have an unresolved hard
constraint or unconfirmed requested availability. Child activity was omitted
from the mandatory meaning plan; a first date was emitted as a required service.
A seasonal market in Merian Gärten was incorrectly presented for a flea market.

The new recorded answers were replayed through this branch without new model
calls, with neutral replay personalization and each recorded evaluation time.
The recorded facts were unchanged; their envelope was rebound to the current
configuration hash. Strict admission removes unresolved duties, confirms Kaphi
for the cafe request and 18 vegan-lunch candidates. The old child meaning still
admits restaurants, demonstrating why matcher changes alone cannot repair an
omitted model duty. It must be fixed at interpretation, not invented downstream.

Prompt 7 distinguishes occasion context from an explicitly requested organised
service, and generic visit verbs from independently requested physical activity.
Concrete requested atmosphere, activity and service conditions remain duties.
The matcher bridges atmosphere.conversation to the same scoped, explicitly
recorded atmosphere concept, and participation.entry_mode to matching booking
meaning. Quiet alone does not establish conversation; a different room does not
supply its evidence. Three regression tests cover these boundaries. The optional
request-local search observer is retained from the diagnostic branch; its route
test proves it observes once without an additional model call/read or a changed
answer. Ordinary clients do not install an observer.

Ten genuine candidate control calls then completed in 85.54 seconds of summed
server runtime, explicitly labelled CANDIDATE_FIX_VALIDATION (diagnostic v8,
source b3271956, prompt 7, matching 17). They display 14 recommendations with
no unresolved hard conditions: Kaphi, eight vegan-lunch results, and five
child/outdoor results. The date is context, children are a required activity,
and wheelchair access remains required alongside live jazz. Empty results
are retained for absent dates, capacity or scoped evidence, not filled with
unproven substitutes. This is a bounded ten-case trial, not a general accuracy
claim or a consumer deployment.

Eight model plans are clean. Two still mark the original time quotation as a
second REQUIRED condition (table tennis and flea market), despite separately
preserving the actual date/day phase. Prompt/schema revision 8 constrains
time.original to CONTEXT in the active structured model contract and validates
it at the provider boundary. Nonconforming output fails before search; no
modality is silently demoted, no retry is added, and historical meaning plans
and the frozen base schema remain unchanged. Genuine revision-8 validation
needed two additional calls beyond the approved twenty. The Founder explicitly
approved exactly those two controls. Both real revision-8 calls completed:
table tennis preserves Basel, table_tennis, 30 October, EVENING and zero maximum
price as REQUIRED; flea market preserves Basel, Flohmarkt and 1 November as
REQUIRED. Both original time quotations are CONTEXT. Neither result invents a
matching date or admits an unresolved candidate. Server totals were 9.54 and
8.17 seconds. This validates those two cases, not a fresh ten-case revision-8
trial or repeated-run statistical reliability.

All 502 Decision tests pass, as do Product TypeScript, route invariants,
Mobile/Web contracts and isolated app E2E (zero production actions). The E2E
needed a permitted loopback server after the first sandbox bind was denied.
GitHub release certification remains blocked by the existing isolated research
authority's exact deferred Function binding; no release control was widened.
Consumer decision-v13 remains version 217.

The temporary candidate diagnostic v10 was restored to baseline v11 with only
the approved date-bound quota change. Bundle hash:
6bcb6b69d90d9b6feb6ab44dd497c543eec1785dac3dc43e275c1709deac2e60.
The 30 October global count is 42, with one earlier blocked attempt. Counters,
operation identity, minute caps, auth/admin checks and expiry remain unchanged;
the daily cap returns to 20 on 31 October UTC. No further model calls were made.

## Native field audit and correction

The conversation case exposed an error in the earlier explanation: Volta Bräu
already records `Unterhaltung gut möglich` in its actual conversation fields.
The additive-family map incorrectly replaced that native field, producing a
false UNKNOWN. Strict admission did not fix that upstream reading error.
`MEANING_EVIDENCE_CONTRACT.md` specifies the corrected general rules, the
source-field preservation invariant, all-field roundtrip tests and the exact
ten-case recorded-output replay. This supersedes the earlier missing-data
explanation for this case. Historical live exports remain unchanged.
