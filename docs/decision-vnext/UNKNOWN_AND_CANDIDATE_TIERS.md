# Unknown and Candidate Tiers

## Active Luna / librarian path (matching @13, ranking v6)

The active path preserves `MET`, `UNKNOWN` and `FAILED` separately. A candidate
with a proven requested venue type or activity can be recommended as
`UNCONFIRMED_FALLBACK` when other requested details are unconfirmed. The final
Product ranking must not silently suppress these admitted fallbacks.
Unproven venue identity or an entirely unproven core activity still cannot
produce a relevant recommendation merely because its city matches.

- Unknown admission, including undocumented child entry, does not exclude.
  A documented applicable minimum age or other access prohibition still does.
- Equipment/facilities, activity duration, atmosphere and requested areas/settings affect ranking, never admission,
  including when older clients label indoor or atmosphere as a hard filter.
  A mismatch is disclosed. An indoor cafe never proves an indoor play area.
- Excluded foods, drinks, activities and other content affect ranking, never
  admission. A matching excluded item must be disclosed as a mismatch; another
  offer may still fit. An explicitly excluded venue type remains a hard
  exclusion when that type is documented. A missing type label does not prove
  absence, and an unknown excluded type does not suppress a proven activity.
- A documented route length outside an explicitly requested numeric limit
  remains a hard contradiction. The separate activity-duration measurement is
  a ranking detail; it does not exclude, including for a numeric mismatch.
- Missing visit or offer times allow a suggestion with unknown availability.
  Without a requested time, current day and opening hours are irrelevant.
  Documented closure during the requested visit remains an exclusion.
- A price wish within the stored range confirms budget, irrespective of whether
  that range describes selectable prices or an uncertain total, and irrespective
  of the fee-completeness flag. A maximum budget uses the stored minimum: a cap
  of CHF20 confirms CHF11–26 (and CHF11–19), without an overlap warning. A stored
  minimum above that cap excludes. Strict operators retain their boundaries;
  an exact amount inside a range also confirms. This is discovery budget fit,
  not a claim that every possible order or every final invoice meets the cap.
  Missing price bounds, currency, quantities and explicit coverage remain
  unconfirmed; a cheap drink cannot confirm the requested dinner budget.
- Accessibility is component-specific. A documented accessible terrace does
  not prove the interior, toilet or a step-free entrance. Mixed generic
  wheelchair evidence permits an explicitly qualified fallback. A specifically
  requested and disproven component (for example a step-free entrance) excludes.
  The deterministic public accessibility assessment uses existing ACCESSIBILITY
  and GENERAL_WORLD permissions; no source policy authorization is expanded.

Fully confirmed candidates precede fallbacks. Among otherwise equivalent
fallbacks, fewer unresolved requirements precede more unresolved requirements.
Each confirmed fact remains independently usable as a ranking reason even when
another fact is unknown. Unknowns are never rewritten as positive facts.
Applicable important contradictions (age, requested location, documented
closure, a proven budget excess or a specifically disproven access need), user
rejections and authorization/validation gates remain binding.

Luna's frozen contract, prompt and model are unchanged by this policy. There is
no extra model call and no user clarification dialogue. Existing typed controls
keep their compatibility guards except for the explicitly softened indoor, atmosphere, equipment and
non-category content-exclusion dimensions.

The older Phase 3B draft is historical:
[PHASE3B_UNKNOWN_AND_CONSTRAINT_POLICY.md](./PHASE3B_UNKNOWN_AND_CONSTRAINT_POLICY.md).
Its `EXCLUDE_IF_UNKNOWN` time policy and proposed clarification dialogue do not
specify the current active Luna path.

## Luna executable vocabulary and calendar (prompt @4)

The active prompt uses the existing shared concept, venue-type and food/drink
catalogues. It separates consumption (`drinks` plus `WINE`) from requested venue
identity (`WINE_BAR`); consumption alone must not invent a venue requirement.
Specific meals retain `lunch`, `dinner` or `breakfast`. Unknown concepts remain
free text; the catalogue does not constrain the range of wishes.

The server supplies a local calendar derived from the trusted reference instant
in Europe/Zurich, including today, tomorrow and fourteen dated weekdays. Date
advancement uses calendar dates, not elapsed 24-hour intervals across DST.
The provider and diagnostic request builder share this input construction;
explicit typed context must not replace or discard the calendar. Luna still
resolves the user's language. The librarian does not reparse or repair prose.
Participant ages retain PERSON scope and CONTEXT modality; negation of an offer
must never become exclusion of the accompanying child's age.

The base prompt/schema and 127-family contract remain frozen; the active prompt
revision and hash identify this reversible change. The model remains
`gpt-5.6-luna`, reasoning low, one bounded call, `store:false`. No fine-tuning,
extra model call, database migration or source-policy change is introduced.
