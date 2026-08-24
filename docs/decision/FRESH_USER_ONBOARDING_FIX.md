# Fresh User Onboarding Fix

## Production failure

The Profile Basics screen used a direct PostgREST `profiles` upsert. Because the
row already exists from the `auth.users` trigger, `ON CONFLICT DO UPDATE`
included `profiles.id` in the update set. Authenticated users intentionally have
`INSERT(id)` but not `UPDATE(id)`, so PostgreSQL correctly returned `42501:
permission denied for table profiles`.

## Canonical path

`complete_profile_onboarding_v2` is the only Profile Basics completion write.
It derives the target user from `auth.uid()` and accepts only display name,
username, age, city, and country. Contact email is read from `auth.users`.
Username values are normalized to lowercase and validated against the existing
3–24 character `[a-z0-9_.]` contract and case-insensitive uniqueness index.

The RPC creates or updates the trigger-owned profile row, persists the four
visible basics plus the existing age/birthdate contract, and marks only Profile
Basics complete. It cannot write roles, admin state, subscription, trust,
moderation, consent, Taste, N2, or User Card state.

Taste onboarding now requires explicit personalization consent before its
first mutation. The Mobile surface captures that consent through the existing
consent RPC. `complete_decision_onboarding_v2` independently verifies active
consent and completed Profile Basics before creating SELF_DECLARED evidence.

## Validation

- Isolated PostgreSQL persistence/security harness: pass.
- Direct old upsert reproduces the permission denial: pass.
- Own save, missing-row creation, hard-read persistence, and retry: pass.
- Case-insensitive username collision: denied without overwrite.
- Cross-user, anonymous, and privileged-field writes: denied.
- Profile Basics creates no consent, Taste, N2, or User Card state.
- Taste onboarding without consent fails before partial state.
- Mobile lint: 0 errors (pre-existing warnings remain).
- iOS production bundle export: pass.
- Production migration: `20260824183000_fix_fresh_user_profile_onboarding_v1.sql`.

## backyrdBuddy checkpoint 0

Production UID `4f5f263e-7677-4231-9d36-275108aed3a6` remains at the failed
Profile Basics checkpoint. Username, city, country, birthdate, Profile Basics
completion, Taste onboarding completion, consent, SELF_DECLARED evidence, N2,
and User Card are still unset. The account was not advanced by this deployment.
