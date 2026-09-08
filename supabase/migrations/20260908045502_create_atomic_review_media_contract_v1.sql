-- Atomic, fail-closed Review media publication. A reservation is upload
-- authority only; it is not a Review and carries no Product/Evidence meaning.

create table public.review_media_upload_reservations_v1 (
  review_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  media_count integer not null check (media_count between 1 and 3),
  bucket_id text not null default 'review-photos' check (bucket_id = 'review-photos'),
  storage_paths text[] not null,
  content_types text[] not null,
  max_sizes_bytes bigint[] not null,
  smart_review boolean not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  finalized_at timestamptz,
  check (cardinality(storage_paths) = media_count),
  check (cardinality(content_types) = media_count),
  check (cardinality(max_sizes_bytes) = media_count)
);

create index review_media_upload_reservations_v1_open_user_idx
  on public.review_media_upload_reservations_v1(user_id, expires_at)
  where finalized_at is null;
create index review_media_upload_reservations_v1_open_spot_idx
  on public.review_media_upload_reservations_v1(user_id, spot_id, expires_at)
  where finalized_at is null;

alter table public.review_media_upload_reservations_v1 enable row level security;
revoke all on table public.review_media_upload_reservations_v1 from public, anon, authenticated;
grant all on table public.review_media_upload_reservations_v1 to service_role;

create or replace function public.reserve_review_media_upload_v1(
  p_review_id uuid,
  p_spot_id uuid,
  p_storage_paths text[],
  p_content_types text[],
  p_max_sizes_bytes bigint[],
  p_smart_review boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.review_media_upload_reservations_v1%rowtype;
begin
  if v_uid is null then
    raise exception 'REVIEW_MEDIA_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_review_id is null or p_spot_id is null
     or coalesce(cardinality(p_storage_paths), 0) not between 1 and 3
     or cardinality(p_storage_paths) <> cardinality(p_content_types)
     or cardinality(p_storage_paths) <> cardinality(p_max_sizes_bytes)
     or exists (
       select 1 from generate_subscripts(p_storage_paths, 1) i
       where p_storage_paths[i] !~ ('^' || p_review_id::text || '/[0-2]\.(jpg|jpeg|png|webp|heic|heif|avif)$')
          or lower(p_content_types[i]) not in ('image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif')
          or p_max_sizes_bytes[i] not between 1 and 12582912
     ) then
    raise exception 'REVIEW_MEDIA_RESERVATION_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from public.spots where id = p_spot_id) then
    raise exception 'REVIEW_MEDIA_SPOT_NOT_FOUND' using errcode = '22023';
  end if;

  -- Serialize each user's reservation budget so concurrent requests cannot
  -- exceed the exact open-reservation limits.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select * into v_existing
  from public.review_media_upload_reservations_v1
  where review_id = p_review_id;

  if found then
    if v_existing.user_id <> v_uid
       or v_existing.spot_id <> p_spot_id
       or v_existing.storage_paths <> p_storage_paths
       or v_existing.content_types <> p_content_types
       or v_existing.max_sizes_bytes <> p_max_sizes_bytes
       or v_existing.smart_review <> p_smart_review
       or (v_existing.finalized_at is null and v_existing.expires_at <= now()) then
      raise exception 'REVIEW_MEDIA_RESERVATION_CONFLICT' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'review_id', p_review_id,
      'state', case when v_existing.finalized_at is null then 'OPEN' else 'FINALIZED' end
    );
  end if;

  if (select count(*) from public.review_media_upload_reservations_v1
      where user_id = v_uid and finalized_at is null and expires_at > now()) >= 5
     or (select count(*) from public.review_media_upload_reservations_v1
      where user_id = v_uid and spot_id = p_spot_id
        and finalized_at is null and expires_at > now()) >= 2 then
    raise exception 'REVIEW_MEDIA_RESERVATION_LIMIT' using errcode = '54000';
  end if;

  insert into public.review_media_upload_reservations_v1(
    review_id, user_id, spot_id, media_count, storage_paths, content_types,
    max_sizes_bytes, smart_review
  ) values (
    p_review_id, v_uid, p_spot_id, cardinality(p_storage_paths),
    p_storage_paths, p_content_types, p_max_sizes_bytes, p_smart_review
  );
  return jsonb_build_object('review_id', p_review_id, 'state', 'OPEN');
end
$$;

-- Storage evaluates this narrow predicate without granting Product clients
-- access to reservation rows. The object owner, bucket, full path, MIME, size,
-- expiry and consumption state must all match one reservation exactly.
create or replace function public.review_media_upload_is_reserved_v1(
  p_bucket_id text,
  p_storage_path text,
  p_owner uuid,
  p_metadata jsonb
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
        and lower(coalesce(p_metadata ->> 'mimetype', '')) =
          lower(rr.content_types[array_position(rr.storage_paths, p_storage_path)])
        and coalesce((p_metadata ->> 'size')::bigint, 0) between 1 and
          rr.max_sizes_bytes[array_position(rr.storage_paths, p_storage_path)]
        and rr.finalized_at is null
        and rr.expires_at > now()
    )
$$;

drop policy if exists "review_photos_upload_own_review" on storage.objects;
create policy "review_photos_upload_own_review"
on storage.objects
as permissive
for insert
to authenticated
with check (
  public.review_media_upload_is_reserved_v1(bucket_id, name, owner, metadata)
);

create or replace function public.finalize_review_with_media_v1(
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
  v_path text;
  v_url text;
begin
  if v_uid is null then
    raise exception 'REVIEW_MEDIA_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_review_id is null or p_spot_id is null
     or coalesce(cardinality(p_storage_paths), 0) not between 1 and 3
     or cardinality(p_storage_paths) <> cardinality(p_public_urls) then
    raise exception 'REVIEW_MEDIA_SET_INVALID' using errcode = '22023';
  end if;

  -- An exact successful retry returns the original identity. It never creates
  -- another Review, media row, trigger event, or Smart Review evidence signal.
  if exists (
    select 1 from public.reviews r
    where r.id = p_review_id and r.user_id = v_uid and r.spot_id = p_spot_id
      and r.review_origin = case when p_smart_review then 'SMART_REVIEW' else 'STANDARD_REVIEW' end
      and r.text is not distinct from nullif(trim(p_text), '')
      and r.mood_a is not distinct from nullif(trim(p_mood_a), '')
      and r.mood_b is not distinct from nullif(trim(p_mood_b), '')
  ) then
    if (select count(*) from public.review_photos rp
        where rp.review_id = p_review_id and rp.uploaded_by = v_uid
          and rp.url = any(p_public_urls)) = cardinality(p_public_urls)
       and (select count(*) from public.review_photos rp where rp.review_id = p_review_id) = cardinality(p_public_urls) then
      return p_review_id;
    end if;
    raise exception 'REVIEW_MEDIA_FINALIZATION_CONFLICT' using errcode = '42501';
  end if;

  select * into v_reservation
  from public.review_media_upload_reservations_v1 rr
  where rr.review_id = p_review_id
  for update;

  if not found
     or v_reservation.user_id <> v_uid
     or v_reservation.spot_id <> p_spot_id
     or v_reservation.smart_review <> p_smart_review
     or v_reservation.media_count <> cardinality(p_storage_paths)
     or v_reservation.storage_paths <> p_storage_paths
     or v_reservation.finalized_at is not null
     or v_reservation.expires_at <= now() then
    raise exception 'REVIEW_MEDIA_RESERVATION_INVALID' using errcode = '42501';
  end if;

  for v_index in 1..cardinality(p_storage_paths) loop
    v_path := p_storage_paths[v_index];
    v_url := p_public_urls[v_index];
    if v_path !~ ('^' || p_review_id::text || '/[0-2]\.(jpg|jpeg|png|webp|heic|heif|avif)$')
       or v_url !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/review-photos/' ||
                    replace(v_path, '.', '\.') || '$')
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = v_reservation.bucket_id
           and o.name = v_path
           and o.owner = v_uid
           and lower(coalesce(o.metadata ->> 'mimetype', '')) = lower(v_reservation.content_types[v_index])
           and coalesce((o.metadata ->> 'size')::bigint, 0) between 1 and v_reservation.max_sizes_bytes[v_index]
       ) then
      raise exception 'REVIEW_MEDIA_OBJECT_INVALID' using errcode = '42501';
    end if;
  end loop;

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

  for v_index in 1..cardinality(p_storage_paths) loop
    insert into public.review_photos(review_id, url, uploaded_by)
    values (p_review_id, p_public_urls[v_index], v_uid);
  end loop;

  update public.review_media_upload_reservations_v1
  set finalized_at = now()
  where review_id = p_review_id;

  return p_review_id;
end
$$;

revoke all on function public.reserve_review_media_upload_v1(uuid,uuid,text[],text[],bigint[],boolean) from public, anon;
revoke all on function public.review_media_upload_is_reserved_v1(text,text,uuid,jsonb) from public, anon;
revoke all on function public.finalize_review_with_media_v1(uuid,uuid,text,text,text,text[],text[],boolean) from public, anon;
grant execute on function public.reserve_review_media_upload_v1(uuid,uuid,text[],text[],bigint[],boolean) to authenticated;
grant execute on function public.review_media_upload_is_reserved_v1(text,text,uuid,jsonb) to authenticated;
grant execute on function public.finalize_review_with_media_v1(uuid,uuid,text,text,text,text[],text[],boolean) to authenticated;
grant execute on function public.reserve_review_media_upload_v1(uuid,uuid,text[],text[],bigint[],boolean) to service_role;
grant execute on function public.review_media_upload_is_reserved_v1(text,text,uuid,jsonb) to service_role;
grant execute on function public.finalize_review_with_media_v1(uuid,uuid,text,text,text,text[],text[],boolean) to service_role;

comment on table public.review_media_upload_reservations_v1 is
  'Private-by-grant, short-lived Review media upload authorities. Expired rows remain available for bounded orphan cleanup; remove matching objects through the Storage API before deleting reservation rows.';
