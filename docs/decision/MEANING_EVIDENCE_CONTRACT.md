# Meaning and evidence contract

Backyrd must recognise a supported experience without inventing a missing one.
This contract governs the handover from request understanding to stored World
facts, candidate admission and ranking. It does not declare perfect accuracy.

## Rules

| Stage | Required behaviour | Forbidden shortcut |
| --- | --- | --- |
| Understand | Preserve the requested experience, qualifiers, alternatives, negation and participant scope. Keep a trace to the original meaning. | Replace a specific duty with a broader activity, or invent an extra service from a date/occasion. |
| Classify | Explicit requirements remain duties; explicit preferences affect ranking; occasions and source quotations remain context. Necessary access derived from personal context is a separate, traceable requirement. | Demote a duty downstream because a field is unsupported, or treat every contextual word as a requirement. |
| Read | Always include the requested native property field. Additional accepted field aliases supplement it. | An alias list that hides or replaces the original field. |
| Compare | Shared canonical terms recognise equivalent wording on both request and stored-data sides. Exact unknown labels can agree only in compatible typed fields. | Substring matching, model confidence as proof, or general quietness as proof of a documented conversation condition. |
| Join | Evidence must belong to the requested offer/area/person and satisfy its recorded visit conditions. | Borrow vegan lunch for vegan dinner, a quiet unrelated room, or a different event date. |
| Decide | MET requires compatible evidence; FAILED requires a demonstrated contradiction; UNKNOWN means insufficient proof. | Treat unknown as false, unknown as true, or a partial match as a confirmed recommendation. |
| Rank | Rank only candidates that meet all active duties; use preferences and consent-bound personalization afterwards. | Personal affinity, popularity or an attractive explanation overcoming a failed or unknown duty. |

An event programme is not proof that it runs on every requested date. Capacity
is not a bookable slot. Hotel facilities are not automatically available to
day guests. The absence of a positive tag does not prove an excluded feature
is absent. These are separate evidence obligations, not synonym questions.

## Canonical implementation

- The existing World `experience-language.ts` is the shared finite vocabulary
  for authoring/research values and Decision comparisons. Equivalent wording
  is a shared concept, not a second implementation in an individual client.
- The existing Decision `product-librarian-language.ts` owns additive field
  aliases and source-key resolution. Every request family retains its own key,
  including when accepted semantic links add more keys. Source aliases and
  shared World language are included in the matching language hash.
- `product-librarian-matching.ts` continues to enforce evidence authority,
  conditions and joint offer/area compatibility. The final evaluator/ranker
  independently enforces mandatory admission. No database or UI contract is
  changed by this repair; the ordinary consumer Function is not deployed here.
- Scoped fact assessments now carry an additive `propertyRead` trace: searched
  and observed keys plus known/unknown/out-of-condition check counts. Counts
  are witness checks (one area may be checked for several linked offers), not
  distinct database rows. No private user nodes or credentials are added.
- Missing property family, unknown value, unmatched meaning, wrong visit
  condition and contradictory scoped evidence have separate reasons. A
  missing result cannot be explained as a data gap without inspecting these
  reasons and the actual stored values.

## Volta Bräu regression, 30 October

The captured approved profile already contains `atmosphere.conversation` =
`Unterhaltung gut möglich` in the indoor area and terrace, alongside cozy
atmosphere. The model emits the conversation duty correctly. The old alias map
looked only in `atmosphere.character`, replacing the native conversation field.
This produced a false UNKNOWN. Strict admission then correctly refused that
incorrect assessment. The earlier explanation of missing profile data was
wrong and is superseded by this trace.

Source-key resolution now always reads the native field as well as accepted
aliases. `conversation`, `Unterhaltung gut möglich`, `sich gut unterhalten
können` and `gut unterhalten können` share one canonical meaning. This is not
permission to infer conversation suitability from cozy, quiet or sociable.

## Acceptance and limits

Tests cover actual authoring-field roundtrips, every request family's native
key, the full synthetic HTTP chain for the conversation case, aliases, missing
and unknown data, qualifiers, negation, scope separation and visit conditions.
Existing price, access, capacity, activity, time and ranking regressions remain
required. No test may replace `atmosphere.conversation` with an artificial
general-atmosphere property and call that native-field coverage.

Recorded real model outputs and the captured catalog/event set are replayed
unchanged through the repaired canonical evaluator and presentation path.
Replays use neutral personalization and explicitly report zero new model calls
and zero production writes. Their ranking is not represented as the original
account's live personalized ranking. Live tests require their normal Admin
authorization and cost allowance; counters must never be reset to obtain them.

Validation on 30 October: 536 Decision and 376 World tests pass, as does the
complete Product CI (strict TypeScript, route invariant, Mobile/Web contracts
and isolated app E2E, zero production actions). Roundtrips cover all 31 actual
TEXT authoring fields shared with request families, including differing known
values, UNKNOWN and NOT_APPLICABLE. Native-field preservation covers all 126
request keys, including additional accepted semantic sources.

Replaying the ten recorded controls (with the two approved final time-schema
outputs) produces Volta Bräu and Alchemist for the bar request, with Volta first
under neutral tie-breaking. Both have compatible cozy/conversation evidence.
The other nine result lists are unchanged. All 16 displayed candidates have no
unresolved or failed mandatory conditions. No new model call was made. The
prior report's explanation of a missing conversation record is corrected;
the historical real-call exports are preserved as evidence of the fault.

Matching is version 18 and World experience language version 9. Consumer
decision-v13 remains v217 pending publication. The Founder subsequently asked
to remove obsolete release/diagnostic obstacles. `codeOnlyDeliveryScope` now
allows tested Function changes independently of the historical isolated SQL
release. It applies no migrations or Auth changes, retains the four exact
deferred Booking migrations, and does not need a new backup confirmation or an
unrelated historical deep-recertification run. Exact current-artifact tests,
identity checks, JWT verification and source-aware deployment remain binding.
Regular backups continue; this code delivery does not perform a database write.
