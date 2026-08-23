# Human Spot Editor V1.1 — Validation

## Automated proof

- Full local Supabase rebuild through `20260823150000_human_spot_editor_v1_1.sql`.
- Existing Gold Authoring DB regression passes.
- V1.1 DB contract verifies Founder one-click acceptance, immediate readiness, Owner denial, event review-only behavior, duplicate-audience removal, manual-vs-schedule dayparts, typed values, atmosphere qualification, planning/duration preservation, Decision serialization, commercial isolation and unchanged 45/60 registries.
- Canonical semantics and Decision Input tests verify the shared audience target and bounded noise/planning/duration serialization.
- Changed Admin and Owner components pass targeted lint and production builds.

Repository-wide lint retains unrelated pre-existing failures outside the changed files; changed-file lint is clean.

## Museum acceptance contract

For `ab4da026-0d47-4ea1-b626-5293106b4fc2`, Production validation is read-only unless a Founder deliberately saves a genuine correction:

- one social-suitability question;
- current accepted social values remain visible;
- Admin/Founder safe general facts use one-click save;
- accepted direct saves do not reappear as pending self-review;
- manual dayparts do not receive the schedule-derived warning;
- historical noncanonical place type, opening status and unscoped Research facts remain explicit human review issues;
- current family, age-4, rain and indoor benchmark evidence remains unchanged.

No Production data correction is bundled into the migration. No public Owner rollout is enabled.
