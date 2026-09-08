-- Reconstruct the exact pre-candidate application schema inside the V1.5
-- validator's rollback-only transaction.
drop policy review_photos_upload_own_review on storage.objects;
drop function public.finalize_review_with_media_v1(uuid,uuid,text,text,text,text[],text[],boolean);
drop function public.review_media_upload_is_reserved_v1(text,text,uuid,jsonb);
drop function public.reserve_review_media_upload_v1(uuid,uuid,text[],text[],bigint[],boolean);
drop table public.review_media_upload_reservations_v1;
