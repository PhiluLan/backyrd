# Unknown and Candidate Tiers

## Active Luna / librarian path (matching @11, ranking v5)

The active path preserves `MET`, `UNKNOWN` and `FAILED` separately. A candidate
with a proven requested venue type or activity can be recommended as
`UNCONFIRMED_FALLBACK` when other requested details are unconfirmed. The final
Product ranking must not silently suppress these admitted fallbacks.
Unproven venue identity or an entirely unproven core activity still cannot
produce a relevant recommendation merely because its city matches.

- Unknown admission, including undocumented child entry, does not exclude.
  A documented applicable minimum age or other access prohibition still does.
- Atmosphere and requested areas/settings affect ranking, never admission,
  including when older clients label indoor or atmosphere as a hard filter.
  A mismatch is disclosed. An indoor cafe never proves an indoor play area.
- Missing visit or offer times allow a suggestion with unknown availability.
  Without a requested time, current day and opening hours are irrelevant.
  Documented closure during the requested visit remains an exclusion.
- Price bounds wholly within the requested cap are confirmed. A range spanning
  the cap remains uncertain and recommendable with a clear price warning;
  a documented minimum above the cap remains an exclusion. No cheap drink can
  prove a dinner budget, and unknown fees or group scope remain unconfirmed.
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
keep their compatibility guards except for the explicitly softened indoor and
atmosphere dimensions.

The older Phase 3B draft is historical:
[PHASE3B_UNKNOWN_AND_CONSTRAINT_POLICY.md](./PHASE3B_UNKNOWN_AND_CONSTRAINT_POLICY.md).
Its `EXCLUDE_IF_UNKNOWN` time policy and proposed clarification dialogue do not
specify the current active Luna path.
