-- Fresh-user onboarding must write through a narrow self-service boundary.
-- Direct PostgREST upsert attempted to UPDATE profiles.id on conflict and was
-- correctly denied by the existing column privileges.

create or replace function public.complete_profile_onboarding_v2(
  p_display_name text,
  p_username text,
  p_age integer,
  p_city text,
  p_country text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), '');
  v_username text := lower(nullif(btrim(coalesce(p_username, '')), ''));
  v_city text := nullif(regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g'), '');
  v_country text := nullif(regexp_replace(btrim(coalesce(p_country, '')), '\s+', ' ', 'g'), '');
  v_birthdate date;
  v_email text;
  v_now timestamptz := now();
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_display_name is null or char_length(v_display_name) < 2 then
    raise exception 'display_name_required' using errcode = '22023';
  end if;
  if char_length(v_display_name) > 60 then
    raise exception 'display_name_too_long' using errcode = '22023';
  end if;
  if v_username is null then
    raise exception 'username_required' using errcode = '22023';
  end if;
  if v_username !~ '^[a-z0-9_.]{3,24}$' then
    raise exception 'username_invalid' using errcode = '22023';
  end if;
  if p_age is null or p_age < 13 or p_age > 120 then
    raise exception 'age_invalid' using errcode = '22023';
  end if;
  if v_city is null or char_length(v_city) > 80 then
    raise exception 'city_invalid' using errcode = '22023';
  end if;
  if v_country is null or char_length(v_country) > 80 then
    raise exception 'country_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.profiles p
    where lower(btrim(p.username)) = v_username
      and p.id <> v_user_id
  ) then
    raise exception 'username_taken' using errcode = '23505';
  end if;

  select lower(btrim(u.email))
  into v_email
  from auth.users u
  where u.id = v_user_id
    and u.deleted_at is null;

  if not found then
    raise exception 'auth_user_missing' using errcode = '23503';
  end if;

  v_birthdate := make_date(extract(year from current_date)::integer - p_age, 1, 1);

  insert into public.profiles (
    id,
    display_name,
    first_name,
    username,
    birthdate,
    city,
    home_city,
    country,
    contact_email,
    age_confirmed_at,
    profile_onboarding_completed_at,
    onboarding_version,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_display_name,
    v_display_name,
    v_username,
    v_birthdate,
    v_city,
    v_city,
    v_country,
    v_email,
    v_now,
    v_now,
    'profile-onboarding-v2',
    v_now,
    v_now
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    first_name = excluded.first_name,
    username = excluded.username,
    birthdate = excluded.birthdate,
    city = excluded.city,
    home_city = excluded.home_city,
    country = excluded.country,
    contact_email = coalesce(excluded.contact_email, public.profiles.contact_email),
    age_confirmed_at = excluded.age_confirmed_at,
    profile_onboarding_completed_at = coalesce(
      public.profiles.profile_onboarding_completed_at,
      excluded.profile_onboarding_completed_at
    ),
    onboarding_version = excluded.onboarding_version,
    updated_at = excluded.updated_at;

  select p.profile_onboarding_completed_at
  into v_completed_at
  from public.profiles p
  where p.id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'userId', v_user_id,
    'displayName', v_display_name,
    'username', v_username,
    'age', p_age,
    'city', v_city,
    'country', v_country,
    'profileOnboardingCompletedAt', v_completed_at,
    'nextRoute', '/onboarding/decision'
  );
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
end
$$;

revoke all on function public.complete_profile_onboarding_v2(text, text, integer, text, text)
  from public, anon;
grant execute on function public.complete_profile_onboarding_v2(text, text, integer, text, text)
  to authenticated, service_role;

comment on function public.complete_profile_onboarding_v2(text, text, integer, text, text) is
  'Authenticated self-only Profile Basics write. Whitelisted fields only; no Taste, consent, role, subscription, trust, or moderation mutation.';

-- Fail before any Taste/onboarding mutation when the user has not explicitly
-- granted optional personalization consent.
create or replace function public.complete_decision_onboarding_v2(p_city text, p_spot_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_count integer;
  v_spot uuid;
  v_snapshot text;
  v_inserted integer := 0;
  v_now timestamptz := now();
  r record;
  v_id uuid;
  v_revision integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.user_has_active_consent_v1(v_user, 'personalized_recommendations') then
    raise exception 'personalization_consent_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user and p.profile_onboarding_completed_at is not null
  ) then
    raise exception 'profile_onboarding_required' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_spot_ids, '{}'::uuid[])) id
  where id is not null;

  v_count := coalesce(cardinality(v_ids), 0);
  if v_count < 3 or v_count > 8 then raise exception 'onboarding_spot_count_invalid'; end if;
  if (
    select count(*) from public.spots
    where id = any(v_ids) and status = 'approved' and data_origin not in ('FIXTURE', 'TEST')
  ) <> v_count then raise exception 'onboarding_spot_invalid'; end if;

  update public.profiles
  set city = coalesce(city, p_city), home_city = coalesce(home_city, p_city), updated_at = now()
  where id = v_user;

  perform public.save_favorite_spot_seeds_v1(p_city := p_city, p_spot_ids := v_ids, p_raw_names := '{}'::text[]);

  foreach v_spot in array v_ids loop
    select snapshot_identity into v_snapshot
    from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot])
    where spot_id = v_spot and available;
    if v_snapshot is null then continue; end if;

    for r in
      select c->>'concept' concept
      from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot]) n
      cross join lateral jsonb_array_elements(n.concepts) c
      join public.backyrd_taste_concepts_v1 t on t.concept_key = c->>'concept'
      where n.spot_id = v_spot and (c->>'confidence')::numeric >= .35
    loop
      insert into public.backyrd_self_declared_taste_v1(
        user_id, concept_key, source_kind, spot_id, source_n4_snapshot_identity, state
      ) values (v_user, r.concept, 'DECISION_ONBOARDING', v_spot, v_snapshot, 'ACTIVE')
      on conflict(user_id, concept_key, source_kind, spot_id) do update set
        revision = case
          when backyrd_self_declared_taste_v1.state <> 'ACTIVE'
            or backyrd_self_declared_taste_v1.source_n4_snapshot_identity is distinct from excluded.source_n4_snapshot_identity
          then backyrd_self_declared_taste_v1.revision + 1
          else backyrd_self_declared_taste_v1.revision
        end,
        state = 'ACTIVE',
        source_n4_snapshot_identity = excluded.source_n4_snapshot_identity,
        corrected_at = null
      returning id, revision into v_id, v_revision;

      perform public.backyrd_ingest_memory_event_v1(jsonb_build_object(
        'userId', v_user,
        'idempotencyKey', 'self-declared:' || v_id || ':' || v_revision,
        'eventType', 'onboarding_preference',
        'occurredAt', v_now,
        'observedAt', v_now,
        'ingestedAt', v_now,
        'sessionId', 'decision-onboarding-v2',
        'spotId', v_spot,
        'momentSignature', '{}'::jsonb,
        'spotEvidence', jsonb_build_object('concepts', jsonb_build_array(r.concept)),
        'provenance', jsonb_build_object(
          'source', 'SELF_DECLARED',
          'sourceVersion', 'backyrd-canonical-semantics-v1',
          'sourceEventId', v_id || ':' || v_revision
        ),
        'consentPurpose', 'personalized_recommendations',
        'consentState', 'granted',
        'contractVersion', 'backyrd-memory-event-contract-v1'
      ));
      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  update public.profiles
  set decision_onboarding_completed_at = now(), onboarding_version = 'canonical-semantics-v1', updated_at = now()
  where id = v_user;

  return jsonb_build_object(
    'ok', true,
    'selectedCount', v_count,
    'declaredEvidenceCount', v_inserted,
    'semanticContractVersion', 'backyrd-canonical-semantics-v1'
  );
end
$$;

revoke all on function public.complete_decision_onboarding_v2(text, uuid[])
  from public, anon;
grant execute on function public.complete_decision_onboarding_v2(text, uuid[])
  to authenticated, service_role;
