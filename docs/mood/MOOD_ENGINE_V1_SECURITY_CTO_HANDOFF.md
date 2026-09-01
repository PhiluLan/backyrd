# Canonical Mood V1 — Security CTO Handoff

## Release status

Implementation and local security regressions are ready for independent Security CTO review. Production release and final Product PASS remain blocked until Security acceptance and physical Founder acceptance. No Production mutation or canary was performed by this worktree.

## New or changed privileged boundaries

All functions below are in `20260831220000_create_canonical_product_mood_v1.sql`, use a fixed `search_path`, revoke implicit/Public execution, and have explicit grants.

| Function | Security | Intended caller |
|---|---|---|
| `backyrd_resolve_mood_input_v2(text)` | `SECURITY DEFINER`, deterministic validation/alias read | anon, authenticated, service role |
| `backyrd_resolve_decision_mood_query_v1(text,text,text)` | `SECURITY DEFINER`, read-only canonical query resolver | service role only |
| `backyrd_decision_community_mood_signal_v1(uuid[],text,text,text)` | `SECURITY DEFINER`, read-only ESTABLISHED profile projection | service role only |
| `backyrd_rebuild_spot_mood_profile_v1(uuid)` | `SECURITY DEFINER`, derived aggregate rebuild | service role only |
| `backyrd_rebuild_all_spot_mood_profiles_v1()` | `SECURITY DEFINER`, global derived rebuild | authenticated Admin check + service role |
| `backyrd_admin_resolve_mood_candidate_v1(...)` | `SECURITY DEFINER`, audited semantic governance | authenticated Admin check + service role |
| `backyrd_admin_merge_mood_concepts_v1(...)` | `SECURITY DEFINER`, audited merge/rebuild | authenticated Admin check + service role |
| Mood review/safety trigger functions | `SECURITY DEFINER`, canonical source synchronization | trigger/service role only |

## Required adversarial acceptance

- Verify effective PostgreSQL ACLs after migration, not migration text only.
- anon/authenticated cannot call either Decision Mood RPC, write concepts/aliases/profiles/contributions, or invoke rebuild.
- authenticated non-Admin cannot resolve candidates or merge concepts.
- Review ownership/foreign `user_id`, `review_id`, contribution, and arbitrary aggregate writes fail.
- Normal clients cannot submit more than two Moods, duplicate a canonical concept through aliases, or create canonical concepts from novel strings.
- `SECURITY DEFINER` search paths and object qualification resist search-path/object-shadowing attacks.
- Edge service credentials remain server-only; public response exposes no contributor identity or low-sample counts.
- Resolver errors degrade to neutral Decision evidence and cannot bypass Product/Distribution eligibility.

## Regression evidence

- `supabase/tests/canonical_product_mood_v1.sql`: ACL/IDOR, resolution, low sample, moderation/restoration, deterministic rebuild, Taste/N4/Gold firewalls.
- `decision-lab/test/community-mood-decision.test.mjs`: bounded non-negative component and eligibility ordering.
- `decision-v13-production-recertification-v6.json`: byte-bound authorized semantic state.
- `canonical-mood-decision-canary.mjs`: explicit-ID, read-only Production canary; it emits aggregate evidence only.

Security CTO should return an independent PASS/FAIL plus any effective ACL fingerprint delta. Expected fingerprints must not be updated merely to make a changed catalog pass.
