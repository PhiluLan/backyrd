-- Reconstruct the exact pre-candidate Public ACL inside the V1.5 validator's
-- rollback-only transaction.
revoke all privileges on table public.review_media_upload_reservations_v1
  from anon, authenticated, service_role;
revoke execute on function public.reserve_review_media_upload_v1(uuid,uuid,text[],text[],bigint[],boolean)
  from anon, authenticated, service_role;
revoke execute on function public.review_media_upload_is_reserved_v1(text,text,uuid,jsonb)
  from anon, authenticated, service_role;
revoke execute on function public.finalize_review_with_media_v1(uuid,uuid,text,text,text,text[],text[],boolean)
  from anon, authenticated, service_role;
