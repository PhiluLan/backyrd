# Admin spot profile coverage (profile-coverage-v1)

The percentage in `/spots` measures saved factual profile coverage. It is not a correctness, confidence, recommendation, publication or popularity score. Nothing is written by this indicator, and Decision, public surfaces and permissions are unchanged.

Source: the existing authenticated `world_product_authoring_detail_v1` response used by the profile editor. Only the current list page (25 spots) is requested, with at most four concurrent requests. Refresh on focus, visibility, profile-save event and manual refresh remains intact. Load failures have no numeric score.

The denominator is the editor's category/type-relevant catalogue filtered to actor-authorized factual attributes, plus the applicable catalogue questions for each saved offer and area and shared spot properties. Each question counts once in that scope, with equal weight. Percentage is floor(answered / applicable × 100); only fully answered coverage reaches 100. Offers can introduce additional relevant questions, so adding an offer can reduce the percentage. The expanded checklist shows the exact numerator, denominator and every missing question.

Excluded: discovery preparation, additional social channels (Instagram, Facebook, LinkedIn, TikTok), neighborhood, volatile current state and special hours, subjective atmosphere/context/daypart summaries. Photos, Moods, reviews and engagement metrics are outside this factual-profile score. An experience profile replaces the older flat cuisine, specialty, offering-group, onsite-offering and service summaries instead of requiring duplicate entry. The experience profile itself requires at least one offer; offers and areas are not invented from category templates.

A counted answer must have a recognized known state, a non-empty meaningful value, pass the existing authoring validator, not be held/internal/expired, and not be disputed by a current snapshot conflict. A false boolean and a numeric zero are valid answers. Unknown is not complete. For scoped properties, explicit `NOT_APPLICABLE` counts as answered and `UNKNOWN` stays open; coverage never creates these states. Weekly hours need seven explicitly recorded weekdays, including closed days; a missing day is not inferred closed. Unreviewed/malformed scoped profiles stay incomplete.

Use “Was fehlt noch?” to see category sections, their counts and missing labels; “Profil ergänzen” opens the existing editor. Approval and conflict warnings remain separate from coverage. No new migration or production-data update is required.

Validation: `npm run typecheck --prefix admin-dashboard`, targeted ESLint, `npm run test:contracts --prefix admin-dashboard`, production build, and mobile/desktop presentation checks using synthetic fixtures.
