-- Review Capture Trust Closure V2.
--
-- Storage runs an INSERT permission preflight before the object exists. At
-- that point `storage.objects.metadata.size` is not the final object size
-- (`contentLength` may be present instead). V1 required `metadata.size`, so
-- every legitimate reserved upload was rejected with Storage HTTP 403 before
-- a byte reached the bucket. V2 keeps upload authority fail-closed around the
-- authenticated owner, exact reservation, bucket, path, MIME and a client
-- content fingerprint. The final, Storage-computed byte size is checked only
-- during atomic finalization, after the object exists.

drop policy if exists "review_photos_upload_own_review" on storage.objects;

alter table public.review_media_upload_reservations_v1
  add column if not exists content_sha256 text[];

alter table public.review_media_upload_reservations_v1
  add constraint review_media_upload_reservations_v1_content_sha256_check
  check (
    content_sha256 is null
    or (
      cardinality(content_sha256) = media_count
      and array_position(content_sha256, null) is null
      and array_to_string(content_sha256, ',') ~
        '^([0-9a-f]{64})(,[0-9a-f]{64}){0,2}$'
    )
  );

create or replace function public.reserve_review_media_upload_v2(
  p_review_id uuid,
  p_spot_id uuid,
  p_storage_paths text[],
  p_content_types text[],
  p_max_sizes_bytes bigint[],
  p_content_sha256 text[],
  p_smart_review boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_state jsonb;
  v_reservation public.review_media_upload_reservations_v1%rowtype;
begin
  if coalesce(cardinality(p_content_sha256), 0) not between 1 and 3
     or cardinality(p_content_sha256) <> cardinality(p_storage_paths)
     or exists (
       select 1 from unnest(p_content_sha256) value
       where value !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'REVIEW_MEDIA_FINGERPRINT_INVALID' using errcode = '22023';
  end if;

  v_state := public.reserve_review_media_upload_v1(
    p_review_id, p_spot_id, p_storage_paths, p_content_types,
    p_max_sizes_bytes, p_smart_review
  );

  select * into v_reservation
  from public.review_media_upload_reservations_v1
  where review_id = p_review_id
  for update;

  if v_reservation.content_sha256 is null then
    update public.review_media_upload_reservations_v1
    set content_sha256 = p_content_sha256
    where review_id = p_review_id;
  elsif v_reservation.content_sha256 <> p_content_sha256 then
    raise exception 'REVIEW_MEDIA_RESERVATION_CONFLICT' using errcode = '42501';
  end if;

  return v_state;
end
$$;

create or replace function public.review_media_upload_is_reserved_v2(
  p_bucket_id text,
  p_storage_path text,
  p_owner uuid,
  p_metadata jsonb,
  p_user_metadata jsonb
) returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null
    and p_owner = auth.uid()
    and p_bucket_id = 'review-photos'
    and exists (
      select 1
      from public.review_media_upload_reservations_v1 rr
      where rr.user_id = auth.uid()
        and rr.bucket_id = p_bucket_id
        and p_storage_path like rr.review_id::text || '/%'
        and p_storage_path = any(rr.storage_paths)
        and (
          not coalesce(p_metadata, '{}'::jsonb) ? 'mimetype'
          or lower(p_metadata ->> 'mimetype') =
            lower(rr.content_types[array_position(rr.storage_paths, p_storage_path)])
        )
        and (
          rr.content_sha256 is null
          or lower(coalesce(p_user_metadata ->> 'review_content_sha256', '')) =
            rr.content_sha256[array_position(rr.storage_paths, p_storage_path)]
        )
        and rr.finalized_at is null
        and rr.expires_at > now()
    )
$$;

create policy "review_photos_upload_own_review"
on storage.objects
as permissive
for insert
to authenticated
with check (
  public.review_media_upload_is_reserved_v2(
    bucket_id, name, owner, metadata, user_metadata
  )
);

create or replace function public.finalize_review_with_media_v2(
  p_review_id uuid,
  p_spot_id uuid,
  p_text text,
  p_mood_a text,
  p_mood_b text,
  p_storage_paths text[],
  p_public_urls text[],
  p_smart_review boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_reservation public.review_media_upload_reservations_v1%rowtype;
  v_index integer;
begin
  if v_uid is null then
    raise exception 'REVIEW_MEDIA_AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- Let the V1 finalizer return an already committed exact Product identity.
  -- It cannot create duplicate Review, media or evidence rows.
  if exists (
    select 1 from public.reviews r
    where r.id = p_review_id and r.user_id = v_uid and r.spot_id = p_spot_id
  ) then
    return public.finalize_review_with_media_v1(
      p_review_id, p_spot_id, p_text, p_mood_a, p_mood_b,
      p_storage_paths, p_public_urls, p_smart_review
    );
  end if;

  select * into v_reservation
  from public.review_media_upload_reservations_v1 rr
  where rr.review_id = p_review_id
  for update;

  if not found
     or v_reservation.user_id <> v_uid
     or v_reservation.spot_id <> p_spot_id
     or v_reservation.smart_review <> p_smart_review
     or v_reservation.storage_paths <> p_storage_paths
     or v_reservation.content_sha256 is null
     or cardinality(v_reservation.content_sha256) <> cardinality(p_storage_paths)
     or v_reservation.finalized_at is not null
     or v_reservation.expires_at <= now() then
    raise exception 'REVIEW_MEDIA_RESERVATION_INVALID' using errcode = '42501';
  end if;

  for v_index in 1..cardinality(p_storage_paths) loop
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = v_reservation.bucket_id
        and o.name = p_storage_paths[v_index]
        and o.owner = v_uid
        and lower(coalesce(o.metadata ->> 'mimetype', '')) =
          lower(v_reservation.content_types[v_index])
        and coalesce((o.metadata ->> 'size')::bigint, 0) =
          v_reservation.max_sizes_bytes[v_index]
        and lower(coalesce(o.user_metadata ->> 'review_content_sha256', '')) =
          v_reservation.content_sha256[v_index]
    ) then
      raise exception 'REVIEW_MEDIA_OBJECT_INVALID' using errcode = '42501';
    end if;
  end loop;

  return public.finalize_review_with_media_v1(
    p_review_id, p_spot_id, p_text, p_mood_a, p_mood_b,
    p_storage_paths, p_public_urls, p_smart_review
  );
end
$$;

create or replace function public.finalize_review_without_media_v1(
  p_review_id uuid,
  p_spot_id uuid,
  p_text text,
  p_mood_a text,
  p_mood_b text,
  p_smart_review boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'REVIEW_MEDIA_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_review_id is null or p_spot_id is null
     or not exists (select 1 from public.spots where id = p_spot_id) then
    raise exception 'REVIEW_CAPTURE_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.reviews r
    where r.id = p_review_id and r.user_id = v_uid and r.spot_id = p_spot_id
      and r.review_origin = case when p_smart_review then 'SMART_REVIEW' else 'STANDARD_REVIEW' end
      and r.text is not distinct from nullif(trim(p_text), '')
      and r.mood_a is not distinct from nullif(trim(p_mood_a), '')
      and r.mood_b is not distinct from nullif(trim(p_mood_b), '')
      and not exists (select 1 from public.review_photos rp where rp.review_id = r.id)
  ) then
    return p_review_id;
  end if;
  if exists (select 1 from public.reviews where id = p_review_id) then
    raise exception 'REVIEW_CAPTURE_CONFLICT' using errcode = '42501';
  end if;

  insert into public.reviews(
    id, spot_id, user_id, data_origin, review_origin,
    product_evidence_origin, text, mood_a, mood_b, mood_a_id, mood_b_id
  ) values (
    p_review_id, p_spot_id, v_uid, 'REAL',
    case when p_smart_review then 'SMART_REVIEW' else 'STANDARD_REVIEW' end,
    case when p_smart_review then 'smart_review_v1' else null end,
    nullif(trim(p_text), ''), nullif(trim(p_mood_a), ''),
    nullif(trim(p_mood_b), ''), null, null
  );

  return p_review_id;
end
$$;

create or replace function public.cancel_review_media_upload_v2(
  p_review_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_reservation public.review_media_upload_reservations_v1%rowtype;
begin
  if v_uid is null then
    raise exception 'REVIEW_MEDIA_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_reservation
  from public.review_media_upload_reservations_v1
  where review_id = p_review_id
  for update;

  if not found then return true; end if;
  if v_reservation.user_id <> v_uid or v_reservation.finalized_at is not null then
    raise exception 'REVIEW_MEDIA_RESERVATION_INVALID' using errcode = '42501';
  end if;
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = v_reservation.bucket_id
      and o.name = any(v_reservation.storage_paths)
  ) then
    raise exception 'REVIEW_MEDIA_OBJECT_STILL_PRESENT' using errcode = '55000';
  end if;

  update public.review_media_upload_reservations_v1
  set expires_at = least(expires_at, now())
  where review_id = p_review_id;
  return true;
end
$$;

revoke all on function public.reserve_review_media_upload_v2(uuid,uuid,text[],text[],bigint[],text[],boolean) from public, anon;
revoke all on function public.review_media_upload_is_reserved_v2(text,text,uuid,jsonb,jsonb) from public, anon;
revoke all on function public.finalize_review_with_media_v2(uuid,uuid,text,text,text,text[],text[],boolean) from public, anon;
revoke all on function public.finalize_review_without_media_v1(uuid,uuid,text,text,text,boolean) from public, anon;
revoke all on function public.cancel_review_media_upload_v2(uuid) from public, anon;

grant execute on function public.reserve_review_media_upload_v2(uuid,uuid,text[],text[],bigint[],text[],boolean) to authenticated, service_role;
grant execute on function public.review_media_upload_is_reserved_v2(text,text,uuid,jsonb,jsonb) to authenticated, service_role;
grant execute on function public.finalize_review_with_media_v2(uuid,uuid,text,text,text,text[],text[],boolean) to authenticated, service_role;
grant execute on function public.finalize_review_without_media_v1(uuid,uuid,text,text,text,boolean) to authenticated, service_role;
grant execute on function public.cancel_review_media_upload_v2(uuid) to authenticated, service_role;

comment on function public.review_media_upload_is_reserved_v2(text,text,uuid,jsonb,jsonb) is
  'Storage INSERT preflight authority. Final object size is intentionally verified during atomic V2 finalization, not before upload.';
