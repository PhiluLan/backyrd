# Decision requested-day and purpose release

Release class: **PRODUCTION_RELEASE**

This marker requests one fresh Product release certification on the current
canonical Main after the concurrent World Authoring merge. It introduces no
runtime, database, Auth, Product-semantic, Spot-fact, dependency, or mobile
source change.

The release scope is the already reviewed Decision change from PR #341:

- evaluate the requested weekday against verified canonical opening hours;
- fail closed when that weekday is closed or unknown;
- expose the verified weekday intervals in the Product explanation;
- use confirmed primary visit purpose as a weaker ranking signal after the
  core category; and
- keep purpose-only evidence insufficient for core eligibility.

Release inputs:

- PR #341 candidate: `0ef9807d47b8433878fbaa1d29b5158908dc5bbd`
- PR #341 merge: `5fd5d40eed200dcd038939e221e0cd79893bb9dc`
- shipped Supabase baseline recorded by PR #342:
  `0f58077027a2f7bba9ebcf663562201b5bfe1803`
- canonical Main immediately before this marker:
  `3fa8608289b818c637e534704dbef74dfe7d7740`

The resulting merge commit, not any earlier ancestor, must be the exact source
identity for the POST_MERGE_MAIN manifest, backend deployment plan, and Mobile
OTA artifact. The production plan must contain zero pending migrations and may
deploy only `decision-v13`. OTA publication must use the manifest-verified
`bundle/mobile-update` directory without rebuilding.
