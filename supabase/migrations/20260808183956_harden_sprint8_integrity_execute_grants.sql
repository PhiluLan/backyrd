-- Sprint 8 acceptance: Integrity detectors are database-internal helpers.
-- Reviews invoke them through trusted triggers; clients must not fabricate or
-- replay signals by calling the underlying SECURITY DEFINER functions.

revoke all on function public.safety_raise_review_integrity_signal_v1(
  uuid, text, text, numeric, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.safety_raise_review_integrity_signal_v1(
  uuid, text, text, numeric, jsonb, jsonb
) to service_role;

revoke all on function public.safety_evaluate_review_integrity_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.safety_evaluate_review_integrity_v1(uuid)
  to service_role;

revoke all on function public.safety_evaluate_review_burst_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.safety_evaluate_review_burst_v1(uuid)
  to service_role;

revoke all on function public.safety_evaluate_review_new_account_brigade_v1(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.safety_evaluate_review_new_account_brigade_v1(
  uuid, integer, integer
) to service_role;

revoke all on function public.safety_evaluate_review_repeated_group_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.safety_evaluate_review_repeated_group_v1(uuid)
  to service_role;

-- Trigger functions do not require EXECUTE grants for the inserting client.
revoke all on function public.safety_review_integrity_after_insert_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.safety_review_burst_after_insert_v1()
  from public, anon, authenticated, service_role;

-- Admins may inspect signals through the existing admin-only RLS policy.
-- No client role may create, alter, delete, maintain or trigger signal rows.
revoke all on table public.safety_signals from public, anon, authenticated;
grant select on table public.safety_signals to authenticated;
