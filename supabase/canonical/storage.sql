-- Backyrd canonical Storage metadata.
-- Apply only after the canonical database migration and Supabase Storage bootstrap.
-- Contains bucket metadata and policies only; never object rows or secret values.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('badges', 'badges', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']::text[]),
  ('chat-uploads', 'chat-uploads', false, 12582912, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]),
  ('data-rights-exports', 'data-rights-exports', false, 20971520, array['application/json']::text[]),
  ('profile-photos', 'profile-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']::text[]),
  ('review-photos', 'review-photos', true, 12582912, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']::text[]),
  ('social-post-media', 'social-post-media', false, 12582912, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']::text[]),
  ('spot-photos', 'spot-photos', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

-- BASELINE_REVIEW_REQUIRED: badges and data-rights-exports intentionally have no
-- direct storage.objects policy in production; confirm their service-role-only write paths.

drop policy if exists "chat_uploads_delete_own_v1" on storage."objects";
create policy "chat_uploads_delete_own_v1"
on storage."objects"
as permissive
for delete
to "authenticated"
using ((bucket_id = 'chat-uploads'::text) AND (owner_id = (auth.uid())::text));

drop policy if exists "chat_uploads_insert_participant_v1" on storage."objects";
create policy "chat_uploads_insert_participant_v1"
on storage."objects"
as permissive
for insert
to "authenticated"
with check ((bucket_id = 'chat-uploads'::text) AND (split_part(name, '/'::text, 1) = 'chat'::text) AND (owner_id = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM chats c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 2)) AND ((c.user_a = auth.uid()) OR (c.user_b = auth.uid())) AND (NOT users_are_blocked_v1(c.user_a, c.user_b))))));

drop policy if exists "chat_uploads_select_participant_v1" on storage."objects";
create policy "chat_uploads_select_participant_v1"
on storage."objects"
as permissive
for select
to "authenticated"
using ((bucket_id = 'chat-uploads'::text) AND (split_part(name, '/'::text, 1) = 'chat'::text) AND (EXISTS ( SELECT 1
   FROM chats c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 2)) AND ((c.user_a = auth.uid()) OR (c.user_b = auth.uid()))))));

drop policy if exists "profile_photos_delete_own" on storage."objects";
create policy "profile_photos_delete_own"
on storage."objects"
as permissive
for delete
to "authenticated"
using ((bucket_id = 'profile-photos'::text) AND (owner = auth.uid()));

drop policy if exists "profile_photos_public_read" on storage."objects";
create policy "profile_photos_public_read"
on storage."objects"
as permissive
for select
to public
using (bucket_id = 'profile-photos'::text);

drop policy if exists "profile_photos_update_own" on storage."objects";
create policy "profile_photos_update_own"
on storage."objects"
as permissive
for update
to "authenticated"
using ((bucket_id = 'profile-photos'::text) AND (owner = auth.uid()))
with check ((bucket_id = 'profile-photos'::text) AND (owner = auth.uid()) AND (name ~~ (('avatar_'::text || (auth.uid())::text) || '_%'::text)));

drop policy if exists "profile_photos_upload_own" on storage."objects";
create policy "profile_photos_upload_own"
on storage."objects"
as permissive
for insert
to "authenticated"
with check ((bucket_id = 'profile-photos'::text) AND (owner = auth.uid()) AND (name ~~ (('avatar_'::text || (auth.uid())::text) || '_%'::text)));

drop policy if exists "review_photos_delete_own" on storage."objects";
create policy "review_photos_delete_own"
on storage."objects"
as permissive
for delete
to "authenticated"
using ((bucket_id = 'review-photos'::text) AND ((owner = auth.uid()) OR privacy_is_admin_v1()));

drop policy if exists "review_photos_public_read" on storage."objects";
create policy "review_photos_public_read"
on storage."objects"
as permissive
for select
to public
using (bucket_id = 'review-photos'::text);

drop policy if exists "review_photos_update_own" on storage."objects";
create policy "review_photos_update_own"
on storage."objects"
as permissive
for update
to "authenticated"
using ((bucket_id = 'review-photos'::text) AND ((owner = auth.uid()) OR privacy_is_admin_v1()))
with check ((bucket_id = 'review-photos'::text) AND ((owner = auth.uid()) OR privacy_is_admin_v1()));

drop policy if exists "review_photos_upload_own_review" on storage."objects";
create policy "review_photos_upload_own_review"
on storage."objects"
as permissive
for insert
to "authenticated"
with check ((bucket_id = 'review-photos'::text) AND (owner = auth.uid()) AND (privacy_is_admin_v1() OR (((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) AND (EXISTS ( SELECT 1
   FROM reviews r
  WHERE ((r.id = ((storage.foldername(objects.name))[1])::uuid) AND (r.user_id = auth.uid())))))));

drop policy if exists "social_post_media_authenticated_visible_read_v1" on storage."objects";
create policy "social_post_media_authenticated_visible_read_v1"
on storage."objects"
as permissive
for select
to "authenticated"
using ((bucket_id = 'social-post-media'::text) AND (EXISTS ( SELECT 1
   FROM ((social_post_media sm
     JOIN social_posts sp ON ((sp.id = sm.post_id)))
     JOIN profiles author_profile ON ((author_profile.id = sp.user_id)))
  WHERE ((sm.storage_path = objects.name) AND (sp.status = 'published'::text) AND ((sp.user_id = auth.uid()) OR ((author_profile.is_private = false) AND (NOT users_are_blocked_v1(auth.uid(), sp.user_id)) AND ((sp.visibility = 'public'::text) OR ((sp.visibility = 'followers'::text) AND (EXISTS ( SELECT 1
           FROM follows f
          WHERE ((f.follower = auth.uid()) AND (f.following = sp.user_id))))))))))));

drop policy if exists "social_post_media_user_delete" on storage."objects";
create policy "social_post_media_user_delete"
on storage."objects"
as permissive
for delete
to "authenticated"
using ((bucket_id = 'social-post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

drop policy if exists "social_post_media_user_update" on storage."objects";
create policy "social_post_media_user_update"
on storage."objects"
as permissive
for update
to "authenticated"
using ((bucket_id = 'social-post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))
with check ((bucket_id = 'social-post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

drop policy if exists "social_post_media_user_upload" on storage."objects";
create policy "social_post_media_user_upload"
on storage."objects"
as permissive
for insert
to "authenticated"
with check ((bucket_id = 'social-post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));

drop policy if exists "spot_photos_delete_owner_or_admin" on storage."objects";
create policy "spot_photos_delete_owner_or_admin"
on storage."objects"
as permissive
for delete
to "authenticated"
using ((bucket_id = 'spot-photos'::text) AND ((owner = auth.uid()) OR privacy_is_admin_v1()));

drop policy if exists "spot_photos_public_read" on storage."objects";
create policy "spot_photos_public_read"
on storage."objects"
as permissive
for select
to public
using (bucket_id = 'spot-photos'::text);

drop policy if exists "spot_photos_update_owner_or_admin" on storage."objects";
create policy "spot_photos_update_owner_or_admin"
on storage."objects"
as permissive
for update
to "authenticated"
using ((bucket_id = 'spot-photos'::text) AND ((owner = auth.uid()) OR privacy_is_admin_v1()))
with check ((bucket_id = 'spot-photos'::text) AND ((owner = auth.uid()) OR privacy_is_admin_v1()));

drop policy if exists "spot_photos_upload_authenticated_owner" on storage."objects";
create policy "spot_photos_upload_authenticated_owner"
on storage."objects"
as permissive
for insert
to "authenticated"
with check ((bucket_id = 'spot-photos'::text) AND (owner = auth.uid()) AND ((name ~~ 'header-%'::text) OR (name ~~ 'gallery-%'::text) OR (name ~~ 'spot_%'::text) OR (name ~~ 'review_%'::text)));
