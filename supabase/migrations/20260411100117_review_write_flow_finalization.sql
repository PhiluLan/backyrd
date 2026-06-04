-- 20260411100117_review_write_flow_finalization.sql
-- Review Write Flow Finalisierung für Backyrd
--
-- Ziel:
-- - Review-Erstellung zentral serverseitig abbilden
-- - mood_a_id / mood_b_id immer korrekt setzen
-- - review_photos konsistent mitschreiben
-- - spot_moods nach Writes sofort refreshen
-- - direkte Client-Inserts in reviews/review_photos einschränken

-- ----------------------------------------
-- 1) Review-Schutzindex:
-- ein User darf pro Spot genau ein Review haben
-- ----------------------------------------
-- Das ist für Discovery-Produkte in dieser Phase sinnvoll:
-- ein Spot = eine Meinung pro User
-- spätere Mehrfach-Reviews kann man immer noch bewusst modellieren

create unique index if not exists uq_reviews_one_review_per_user_per_spot
  on public.reviews(spot_id, user_id)
  where user_id is not null;

-- ----------------------------------------
-- 2) Helper: Spot reviewable?
-- ----------------------------------------
-- Regeln:
-- - approved spots sind reviewbar
-- - owner darf eigenen Spot nicht reviewen
-- - optional: admin kann alles sehen, aber nicht automatisch reviewen

create or replace function public.assert_spot_reviewable_v1(
  p_spot_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot public.spots%rowtype;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_spot
  from public.spots s
  where s.id = p_spot_id
  limit 1;

  if v_spot.id is null then
    raise exception 'Spot not found';
  end if;

  if v_spot.status <> 'approved' then
    raise exception 'Spot is not reviewable';
  end if;

  if v_spot.owner_id = p_user_id then
    raise exception 'Owners cannot review their own spot';
  end if;

  return jsonb_build_object(
    'spot_id', v_spot.id,
    'status', v_spot.status,
    'owner_id', v_spot.owner_id
  );
end;
$$;

-- ----------------------------------------
-- 3) Helper: eigenes Review für Spot?
-- ----------------------------------------

create or replace function public.get_my_review_for_spot_v1(
  p_spot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'id', r.id,
    'spot_id', r.spot_id,
    'user_id', r.user_id,
    'text', r.text,
    'mood_a', r.mood_a,
    'mood_b', r.mood_b,
    'mood_a_id', r.mood_a_id,
    'mood_b_id', r.mood_b_id,
    'city', r.city,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'photos', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rp.id,
            'url', rp.url,
            'created_at', rp.created_at
          )
          order by rp.created_at asc
        ),
        '[]'::jsonb
      )
      from public.review_photos rp
      where rp.review_id = r.id
    )
  )
  into result_json
  from public.reviews r
  where r.spot_id = p_spot_id
    and r.user_id = v_user_id
  limit 1;

  return coalesce(result_json, '{}'::jsonb);
end;
$$;

-- ----------------------------------------
-- 4) Review erstellen
-- ----------------------------------------
-- Regeln:
-- - auth required
-- - Spot muss reviewbar sein
-- - genau ein Review pro User/Spot
-- - mood ids werden zentral gesetzt
-- - Fotos werden direkt angelegt
-- - spot_moods werden sofort refreshed

create or replace function public.create_review_with_photos_v1(
  p_spot_id uuid,
  p_text text default null,
  p_mood_a text default null,
  p_mood_b text default null,
  p_city text default null,
  p_photo_urls text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_spot public.spots%rowtype;
  v_existing_review_id uuid;
  v_mood_a text;
  v_mood_b text;
  v_mood_a_id bigint;
  v_mood_b_id bigint;
  v_city text;
  v_review public.reviews%rowtype;
  v_photo_url text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_spot_reviewable_v1(p_spot_id, v_user_id);

  select s.*
  into v_spot
  from public.spots s
  where s.id = p_spot_id
  limit 1;

  select r.id
  into v_existing_review_id
  from public.reviews r
  where r.spot_id = p_spot_id
    and r.user_id = v_user_id
  limit 1;

  if v_existing_review_id is not null then
    raise exception 'You already reviewed this spot';
  end if;

  v_mood_a := nullif(trim(p_mood_a), '');
  v_mood_b := nullif(trim(p_mood_b), '');
  v_city := coalesce(nullif(trim(p_city), ''), v_spot.city);

  if v_mood_a is null and v_mood_b is null then
    raise exception 'At least one mood is required';
  end if;

  if v_mood_a is not null then
    v_mood_a_id := public.match_mood_v1(v_mood_a);
  else
    v_mood_a_id := null;
  end if;

  if v_mood_b is not null then
    v_mood_b_id := public.match_mood_v1(v_mood_b);
  else
    v_mood_b_id := null;
  end if;

  insert into public.reviews (
    spot_id,
    user_id,
    text,
    mood_a,
    mood_b,
    mood_a_id,
    mood_b_id,
    city,
    photo_path
  )
  values (
    p_spot_id,
    v_user_id,
    nullif(trim(p_text), ''),
    v_mood_a,
    v_mood_b,
    v_mood_a_id,
    v_mood_b_id,
    v_city,
    null
  )
  returning *
  into v_review;

  if p_photo_urls is not null and cardinality(p_photo_urls) > 0 then
    foreach v_photo_url in array p_photo_urls loop
      if nullif(trim(v_photo_url), '') is not null then
        insert into public.review_photos (
          review_id,
          url,
          uploaded_by
        )
        values (
          v_review.id,
          trim(v_photo_url),
          v_user_id
        );
      end if;
    end loop;
  end if;

  perform public.refresh_spot_moods_v1(p_spot_id);

  return jsonb_build_object(
    'review', jsonb_build_object(
      'id', v_review.id,
      'spot_id', v_review.spot_id,
      'user_id', v_review.user_id,
      'text', v_review.text,
      'mood_a', v_review.mood_a,
      'mood_b', v_review.mood_b,
      'mood_a_id', v_review.mood_a_id,
      'mood_b_id', v_review.mood_b_id,
      'city', v_review.city,
      'created_at', v_review.created_at,
      'updated_at', v_review.updated_at
    ),
    'photos', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rp.id,
            'url', rp.url,
            'created_at', rp.created_at
          )
          order by rp.created_at asc
        ),
        '[]'::jsonb
      )
      from public.review_photos rp
      where rp.review_id = v_review.id
    )
  );
end;
$$;

-- ----------------------------------------
-- 5) Eigenes Review updaten
-- ----------------------------------------
-- Verhalten:
-- - User darf nur eigenes Review updaten
-- - moods werden neu gematcht
-- - vorhandene Fotos werden ersetzt, wenn p_photo_urls übergeben wird
-- - wenn p_photo_urls null ist, bleiben Fotos unverändert
-- - wenn p_photo_urls = '{}' ist, werden Fotos gelöscht

create or replace function public.update_my_review_v1(
  p_review_id uuid,
  p_text text default null,
  p_mood_a text default null,
  p_mood_b text default null,
  p_city text default null,
  p_photo_urls text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_review public.reviews%rowtype;
  v_mood_a text;
  v_mood_b text;
  v_mood_a_id bigint;
  v_mood_b_id bigint;
  v_city text;
  v_photo_url text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_review
  from public.reviews r
  where r.id = p_review_id
    and r.user_id = v_user_id
  limit 1;

  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  v_mood_a := nullif(trim(p_mood_a), '');
  v_mood_b := nullif(trim(p_mood_b), '');

  if v_mood_a is null and v_mood_b is null then
    raise exception 'At least one mood is required';
  end if;

  if v_mood_a is not null then
    v_mood_a_id := public.match_mood_v1(v_mood_a);
  else
    v_mood_a_id := null;
  end if;

  if v_mood_b is not null then
    v_mood_b_id := public.match_mood_v1(v_mood_b);
  else
    v_mood_b_id := null;
  end if;

  v_city := nullif(trim(p_city), '');

  update public.reviews
  set
    text = nullif(trim(p_text), ''),
    mood_a = v_mood_a,
    mood_b = v_mood_b,
    mood_a_id = v_mood_a_id,
    mood_b_id = v_mood_b_id,
    city = coalesce(v_city, city),
    updated_at = now()
  where id = p_review_id
  returning *
  into v_review;

  if p_photo_urls is not null then
    delete from public.review_photos
    where review_id = p_review_id;

    if cardinality(p_photo_urls) > 0 then
      foreach v_photo_url in array p_photo_urls loop
        if nullif(trim(v_photo_url), '') is not null then
          insert into public.review_photos (
            review_id,
            url,
            uploaded_by
          )
          values (
            p_review_id,
            trim(v_photo_url),
            v_user_id
          );
        end if;
      end loop;
    end if;
  end if;

  perform public.refresh_spot_moods_v1(v_review.spot_id);

  return jsonb_build_object(
    'review', jsonb_build_object(
      'id', v_review.id,
      'spot_id', v_review.spot_id,
      'user_id', v_review.user_id,
      'text', v_review.text,
      'mood_a', v_review.mood_a,
      'mood_b', v_review.mood_b,
      'mood_a_id', v_review.mood_a_id,
      'mood_b_id', v_review.mood_b_id,
      'city', v_review.city,
      'created_at', v_review.created_at,
      'updated_at', v_review.updated_at
    ),
    'photos', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rp.id,
            'url', rp.url,
            'created_at', rp.created_at
          )
          order by rp.created_at asc
        ),
        '[]'::jsonb
      )
      from public.review_photos rp
      where rp.review_id = v_review.id
    )
  );
end;
$$;

-- ----------------------------------------
-- 6) Eigenes Review löschen
-- ----------------------------------------
-- review_photos werden durch FK cascade mitgelöscht
-- spot_moods werden danach refreshed

create or replace function public.delete_my_review_v1(
  p_review_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_review public.reviews%rowtype;
  v_spot_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_review
  from public.reviews r
  where r.id = p_review_id
    and r.user_id = v_user_id
  limit 1;

  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  v_spot_id := v_review.spot_id;

  delete from public.reviews
  where id = p_review_id;

  perform public.refresh_spot_moods_v1(v_spot_id);

  return jsonb_build_object(
    'deleted', true,
    'review_id', p_review_id,
    'spot_id', v_spot_id
  );
end;
$$;

-- ----------------------------------------
-- 7) Direct inserts/updates auf reviews härter einschränken
-- ----------------------------------------
-- Ziel:
-- Clients sollen Reviews primär über die RPCs schreiben.
-- Admin behält direkten Zugriff für Backoffice/Fixes.

drop policy if exists "reviews_insert_authenticated" on public.reviews;
drop policy if exists "reviews_update_own" on public.reviews;
drop policy if exists "reviews_delete_own" on public.reviews;

create policy "reviews_insert_admin_only"
on public.reviews
for insert
to authenticated
with check (
  public.is_admin_v1(auth.uid())
);

create policy "reviews_update_admin_only"
on public.reviews
for update
to authenticated
using (
  public.is_admin_v1(auth.uid())
)
with check (
  public.is_admin_v1(auth.uid())
);

create policy "reviews_delete_admin_only"
on public.reviews
for delete
to authenticated
using (
  public.is_admin_v1(auth.uid())
);

drop policy if exists "review_photos_insert_authenticated" on public.review_photos;

create policy "review_photos_insert_admin_only"
on public.review_photos
for insert
to authenticated
with check (
  public.is_admin_v1(auth.uid())
);

-- ----------------------------------------
-- 8) Read helper: mein Review für Spot inklusive Spot-Refresh
-- ----------------------------------------

create or replace function public.refresh_and_get_my_review_for_spot_v1(
  p_spot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_spot_moods_v1(p_spot_id);
  return public.get_my_review_for_spot_v1(p_spot_id);
end;
$$;