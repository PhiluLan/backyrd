# Direct Auth user deletion

The Supabase dashboard uses Auth's privileged deletion path. It does not run
Backyrd's controlled data-rights workflow or its storage cleanup. Accounts that
own Storage objects or have other protected references may still require that
workflow; do not disable constraints or moderation safeguards to force deletion.

The 2026-09-29 correction makes `safety_sync_content_actor_v2` respect a missing
profile when deriving the author. Previously the profile entity UUID was
reinserted into `actor_user_id` during `ON DELETE SET NULL`, aborting Auth
deletion with `safety_content_items_actor_user_id_fkey`. Safety rows are retained;
the correction neither deletes accounts nor grants clients new privileges.

Validation: `supabase/tests/safety_actor_profile_deletion.sql` exercises live
attribution, denial of ordinary-client Auth deletion, privileged Auth/profile
deletion, retained Safety evidence and subsequent updates. Run only against an
isolated database, never against production users. The same fixture was also
tested locally with deletion executed as `supabase_auth_admin`.

Founder explicitly approved the recovery-risk scope for this specific fix on
2026-09-29 in the task: “Ja, für diese konkrete Korrektur freigeben”. This is not
a general extension of risk acceptance. No restore drill or guaranteed database
rollback is claimed. Publish only the exact reviewed migration through the
SHA-bound production workflow. On failure, stop and use a reviewed forward fix.
