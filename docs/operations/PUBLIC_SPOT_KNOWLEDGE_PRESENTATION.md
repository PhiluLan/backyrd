# Public Spot knowledge presentation

Public Web and Mobile continue to use `spot_detail_product_profile_v1`. Registries 2.2–2.5 inherit existing public presentation choices from 2.1 for matching fields. Newly introduced fields default to hidden, except the reviewed discovery and experience profiles. Raw source drafts remain excluded.

The backward-compatible response adds `experienceProfile` and `publicDescription`. These require the current manifest, SPOT scope, a verified/current known value, explicit human review, and the public/surface presentation policy. Older clients continue to consume ordinary fields without receiving raw profiles in that field list.

Both clients use the pure shared presentation adapter. Prices, ages, schedules and conditions remain attached to their specific offer; area facts and shared amenities remain separate. Unknown values and unmapped internal keys are omitted. This adapter does not change eligibility or ranking.

The new Mobile cards require a compatible certified App/Expo update. Database deployment alone restores ordinary detail fields to existing installed clients. Do not report the new cards live on an installed device without validating its runtime and update.

Validation: isolated canonical database clean boot and legacy/new-registry public-reader regression; unauthenticated public access and private-policy denial; surface visibility; unreviewed, stale, unverified and unapproved negatives; shared adapter and actual Web rendering tests; both client type checks, Mobile contracts, Web production build. Fixtures are synthetic and transactionally rolled back.
