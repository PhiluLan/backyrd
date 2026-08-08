-- 20260411100114_review_aggregate_and_spot_mood_sync.sql
-- Review -> Mood Aggregate Sync für Backyrd
--
-- Ziel:
-- - spot_moods als echte Aggregation aus reviews betreiben
-- - mood_a_id / mood_b_id serverseitig absichern
-- - zentrale Rebuild-/Refresh-Funktionen bereitstellen
-- - Trigger auf reviews, damit Discovery-Daten konsistent bleiben

-- ----------------------------------------
-- 1) Zusätzliche Foreign Keys für review mood ids
-- ----------------------------------------

alter table public.reviews
  drop constraint if exists reviews_mood_a_id_fkey;

alter table public.reviews
  add constraint reviews_mood_a_id_fkey
  foreign key (mood_a_id)
  references public.mood_tokens(id)
  on delete set null;

alter table public.reviews
  drop constraint if exists reviews_mood_b_id_fkey;

alter table public.reviews
  add constraint reviews_mood_b_id_fkey
  foreign key (mood_b_id)
  references public.mood_tokens(id)
  on delete set null;

create index if not exists idx_reviews_mood_a_id_not_null
  on public.reviews(mood_a_id)
  where mood_a_id is not null;

create index if not exists idx_reviews_mood_b_id_not_null
  on public.reviews(mood_b_id)
  where mood_b_id is not null;

-- ----------------------------------------
-- 2) Hilfsfunktion:
-- review mood ids aus mood_a / mood_b text auffüllen
-- ----------------------------------------

create or replace function public.ensure_review_mood_ids_v1(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.reviews%rowtype;
  v_mood_a_id bigint;
  v_mood_b_id bigint;
begin
  select *
  into v_review
  from public.reviews r
  where r.id = p_review_id
  limit 1;

  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  v_mood_a_id := v_review.mood_a_id;
  v_mood_b_id := v_review.mood_b_id;

  if v_mood_a_id is null and nullif(trim(v_review.mood_a), '') is not null then
    v_mood_a_id := public.match_mood_v1(v_review.mood_a);
  end if;

  if v_mood_b_id is null and nullif(trim(v_review.mood_b), '') is not null then
    v_mood_b_id := public.match_mood_v1(v_review.mood_b);
  end if;

  update public.reviews
  set
    mood_a_id = v_mood_a_id,
    mood_b_id = v_mood_b_id,
    updated_at = now()
  where id = p_review_id;

  return jsonb_build_object(
    'review_id', p_review_id,
    'mood_a_id', v_mood_a_id,
    'mood_b_id', v_mood_b_id
  );
end;
$$;

-- ----------------------------------------
-- 3) Zentrale Refresh-Funktion für einen Spot
-- ----------------------------------------
-- Rechnet spot_moods vollständig aus reviews neu.
-- Das ist absichtlich ein "full refresh for one spot",
-- damit die Logik robust und deterministisch bleibt.

create or replace function public.refresh_spot_moods_v1(p_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_rows_upserted integer := 0;
  v_rows_deleted integer := 0;
begin
  select exists(
    select 1
    from public.spots s
    where s.id = p_spot_id
  )
  into v_exists;

  if v_exists is not true then
    raise exception 'Spot not found';
  end if;

  -- Vorher alle mood ids für Reviews dieses Spots auffüllen
  update public.reviews r
  set
    mood_a_id = case
      when r.mood_a_id is null and nullif(trim(r.mood_a), '') is not null
        then public.match_mood_v1(r.mood_a)
      else r.mood_a_id
    end,
    mood_b_id = case
      when r.mood_b_id is null and nullif(trim(r.mood_b), '') is not null
        then public.match_mood_v1(r.mood_b)
      else r.mood_b_id
    end,
    updated_at = now()
  where r.spot_id = p_spot_id
    and (
      (r.mood_a_id is null and nullif(trim(r.mood_a), '') is not null)
      or
      (r.mood_b_id is null and nullif(trim(r.mood_b), '') is not null)
    );

  -- Bestehende Aggregation für Spot löschen
  delete from public.spot_moods sm
  where sm.spot_id = p_spot_id;

  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

  -- Neu aggregieren
  with mood_events as (
    select
      r.spot_id,
      r.mood_a_id as mood_id
    from public.reviews r
    where r.spot_id = p_spot_id
      and r.mood_a_id is not null

    union all

    select
      r.spot_id,
      r.mood_b_id as mood_id
    from public.reviews r
    where r.spot_id = p_spot_id
      and r.mood_b_id is not null
  ),
  aggregated as (
    select
      me.spot_id,
      me.mood_id,
      count(*)::integer as mood_count
    from mood_events me
    group by me.spot_id, me.mood_id
  ),
  ranked as (
    select
      a.spot_id,
      a.mood_id,
      a.mood_count,
      row_number() over (
        partition by a.spot_id
        order by a.mood_count desc, a.mood_id asc
      )::integer as rank
    from aggregated a
  )
  insert into public.spot_moods (
    spot_id,
    mood_id,
    mood_count,
    rank,
    source,
    created_at,
    updated_at
  )
  select
    r.spot_id,
    r.mood_id,
    r.mood_count,
    r.rank,
    'review_aggregate',
    now(),
    now()
  from ranked r;

  GET DIAGNOSTICS v_rows_upserted = ROW_COUNT;

  return jsonb_build_object(
    'spot_id', p_spot_id,
    'deleted_previous_rows', v_rows_deleted,
    'inserted_rows', v_rows_upserted
  );
end;
$$;

-- ----------------------------------------
-- 4) Full rebuild für alle Spots
-- ----------------------------------------

create or replace function public.refresh_all_spot_moods_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot record;
  v_spots_processed integer := 0;
begin
  for v_spot in
    select s.id
    from public.spots s
  loop
    perform public.refresh_spot_moods_v1(v_spot.id);
    v_spots_processed := v_spots_processed + 1;
  end loop;

  return jsonb_build_object(
    'spots_processed', v_spots_processed
  );
end;
$$;

-- ----------------------------------------
-- 5) Trigger-Funktion auf reviews
-- ----------------------------------------
-- Nach insert/update/delete:
-- betroffenen Spot neu aggregieren

create or replace function public.trg_refresh_spot_moods_from_reviews_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.refresh_spot_moods_v1(NEW.spot_id);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if OLD.spot_id is distinct from NEW.spot_id then
      perform public.refresh_spot_moods_v1(OLD.spot_id);
      perform public.refresh_spot_moods_v1(NEW.spot_id);
    else
      perform public.refresh_spot_moods_v1(NEW.spot_id);
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    perform public.refresh_spot_moods_v1(OLD.spot_id);
    return OLD;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_reviews_refresh_spot_moods on public.reviews;
create trigger trg_reviews_refresh_spot_moods
after insert or update or delete on public.reviews
for each row
execute function public.trg_refresh_spot_moods_from_reviews_v1();

-- ----------------------------------------
-- 6) Optionaler Helper-RPC:
-- Spot Detail refresh + read
-- ----------------------------------------
-- Praktisch für Debugging / Admin / spätere Rebuild-Flows

create or replace function public.refresh_and_get_spot_detail_v1(p_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_spot_moods_v1(p_spot_id);
  return public.get_spot_detail_v1(p_spot_id);
end;
$$;

-- ----------------------------------------
-- 7) Bestehende Reviews einmal sauber nachziehen
-- ----------------------------------------
-- Erst mood ids sichern, dann spot_moods global aufbauen

update public.reviews r
set
  mood_a_id = case
    when r.mood_a_id is null and nullif(trim(r.mood_a), '') is not null
      then public.match_mood_v1(r.mood_a)
    else r.mood_a_id
  end,
  mood_b_id = case
    when r.mood_b_id is null and nullif(trim(r.mood_b), '') is not null
      then public.match_mood_v1(r.mood_b)
    else r.mood_b_id
  end,
  updated_at = now()
where
  (r.mood_a_id is null and nullif(trim(r.mood_a), '') is not null)
  or
  (r.mood_b_id is null and nullif(trim(r.mood_b), '') is not null);

select public.refresh_all_spot_moods_v1();