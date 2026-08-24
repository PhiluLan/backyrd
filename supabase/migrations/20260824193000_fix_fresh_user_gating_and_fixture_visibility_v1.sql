-- Fresh-user lifecycle closure: one canonical Product-entry read and one
-- server-enforced Product visibility boundary for real Spots.

create or replace function public.get_my_product_entry_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_profile_complete boolean := false;
  v_taste_complete boolean := false;
  v_consent boolean := false;
begin
  if v_user is null then
    return jsonb_build_object(
      'loggedIn', false,
      'userId', null,
      'profileBasicsComplete', false,
      'tasteOnboardingComplete', false,
      'personalizationConsentValid', false,
      'canEnterDecision', false,
      'needsProfileOnboarding', false,
      'needsDecisionOnboarding', false,
      'semanticContractVersion', null,
      'nextRoute', '/auth/login'
    );
  end if;

  select * into v_profile from public.profiles where id = v_user;
  v_profile_complete := found and v_profile.profile_onboarding_completed_at is not null;
  v_taste_complete := v_profile_complete and v_profile.decision_onboarding_completed_at is not null;
  v_consent := public.user_has_active_consent_v1(v_user, 'personalized_recommendations');

  return jsonb_build_object(
    'loggedIn', true,
    'userId', v_user,
    'profileBasicsComplete', v_profile_complete,
    'tasteOnboardingComplete', v_taste_complete,
    'personalizationConsentValid', v_consent,
    'canEnterDecision', v_profile_complete and v_taste_complete,
    'needsProfileOnboarding', not v_profile_complete,
    'needsDecisionOnboarding', v_profile_complete and not v_taste_complete,
    'semanticContractVersion', case when v_taste_complete then v_profile.onboarding_version else null end,
    'nextRoute', case
      when not v_profile_complete then '/onboarding/profile'
      when not v_taste_complete then '/onboarding/decision'
      else '/(tabs)'
    end
  );
end
$$;

revoke all on function public.get_my_product_entry_status_v1() from public, anon;
grant execute on function public.get_my_product_entry_status_v1() to authenticated, service_role;

-- The old policy exposed every approved row, including explicit FIXTURE rows.
-- Real Product users now see only approved, non-fixture origins. Founder/Admin
-- access remains available for internal operations; service_role continues to
-- bypass RLS for CI/Lab runtimes.
drop policy if exists spots_select_approved on public.spots;
drop policy if exists spots_select_product_visible_v1 on public.spots;
drop policy if exists spots_select_internal_admin_v1 on public.spots;
create policy spots_select_product_visible_v1
on public.spots
for select
to anon, authenticated
using (
  status = 'approved'
  and data_origin not in ('FIXTURE', 'TEST')
);
create policy spots_select_internal_admin_v1
on public.spots
for select
to authenticated
using (
  status = 'approved'
  and data_origin in ('FIXTURE', 'TEST')
  and public.is_admin_v1(auth.uid())
);

-- Security-definer taxonomy reads bypass table RLS and therefore need the same
-- explicit Product boundary.
create or replace function public.get_mobile_spot_taxonomy_v1(p_spot_id uuid, p_locale text default 'de')
returns table(
  taxonomy_node_id uuid,
  slug text,
  node_type text,
  label text,
  icon text,
  color text,
  sort_order integer,
  source text,
  confidence numeric,
  is_verified boolean,
  ml_weight numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.slug,
    n.node_type,
    coalesce(tr.label, de.label, n.slug),
    n.icon,
    n.color,
    n.sort_order,
    st.source,
    st.confidence,
    st.is_verified,
    n.ml_weight
  from public.spot_taxonomies st
  join public.spots sp on sp.id = st.spot_id
  join public.taxonomy_nodes n on n.id = st.taxonomy_node_id
  left join public.taxonomy_node_translations tr
    on tr.taxonomy_node_id = n.id
   and tr.locale = coalesce(nullif(trim(p_locale), ''), 'de')
  left join public.taxonomy_node_translations de
    on de.taxonomy_node_id = n.id and de.locale = 'de'
  where st.spot_id = p_spot_id
    and sp.status = 'approved'
    and sp.data_origin not in ('FIXTURE', 'TEST')
    and n.is_active = true
  order by
    case n.node_type
      when 'subcategory' then 1
      when 'feature' then 2
      when 'offering' then 3
      when 'service' then 4
      else 5
    end,
    st.is_verified desc,
    n.ml_weight desc,
    n.sort_order,
    coalesce(tr.label, de.label, n.slug);
$$;

create or replace function public.search_mobile_taxonomy_spots_v1(p_query text, p_locale text default 'de', p_limit integer default 100)
returns table(spot_id uuid, matched_labels text[], match_score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select lower(trim(coalesce(p_query, ''))) as query
  ),
  matching_nodes as (
    select
      n.id as taxonomy_node_id,
      coalesce(tr.label, de.label, n.slug) as matched_label,
      greatest(
        case
          when lower(coalesce(tr.label, de.label, n.slug)) = i.query then 1.00
          when lower(coalesce(tr.label, de.label, n.slug)) like i.query || '%' then 0.92
          when lower(coalesce(tr.label, de.label, n.slug)) like '%' || i.query || '%' then 0.82
          else 0
        end,
        case
          when lower(n.slug) = i.query then 0.95
          when lower(n.slug) like '%' || i.query || '%' then 0.75
          else 0
        end,
        coalesce((
          select max(
            case
              when lower(s.synonym) = i.query then 0.96 * s.weight
              when lower(s.synonym) like i.query || '%' then 0.88 * s.weight
              when lower(s.synonym) like '%' || i.query || '%' then 0.78 * s.weight
              else 0
            end
          )
          from public.taxonomy_synonyms s
          where s.taxonomy_node_id = n.id
            and s.locale in (coalesce(nullif(trim(p_locale), ''), 'de'), 'de')
        ), 0)
      ) * n.ml_weight as node_score
    from public.taxonomy_nodes n
    cross join input i
    left join public.taxonomy_node_translations tr
      on tr.taxonomy_node_id = n.id
     and tr.locale = coalesce(nullif(trim(p_locale), ''), 'de')
    left join public.taxonomy_node_translations de
      on de.taxonomy_node_id = n.id
     and de.locale = 'de'
    where n.is_active = true
      and char_length(i.query) >= 4
      and (
        lower(coalesce(tr.label, de.label, n.slug)) like '%' || i.query || '%'
        or lower(n.slug) like '%' || i.query || '%'
        or exists (
          select 1
          from public.taxonomy_synonyms s
          where s.taxonomy_node_id = n.id
            and s.locale in (coalesce(nullif(trim(p_locale), ''), 'de'), 'de')
            and lower(s.synonym) like '%' || i.query || '%'
        )
      )
  )
  select
    st.spot_id,
    array_agg(distinct mn.matched_label order by mn.matched_label),
    max(mn.node_score * greatest(st.confidence, 0.25))::numeric
  from matching_nodes mn
  join public.spot_taxonomies st on st.taxonomy_node_id = mn.taxonomy_node_id
  join public.spots sp on sp.id = st.spot_id
  where sp.status = 'approved'
    and sp.data_origin not in ('FIXTURE', 'TEST')
  group by st.spot_id
  order by max(mn.node_score * greatest(st.confidence, 0.25)) desc, st.spot_id
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

-- Same-version retries and accidental navigation back to onboarding must be a
-- read-only success. A future declared-Taste editor requires a separate,
-- explicitly versioned correction contract.
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
  v_completed_at timestamptz;
  r record;
  v_id uuid;
  v_revision integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select decision_onboarding_completed_at
  into v_completed_at
  from public.profiles
  where id = v_user;

  if v_completed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'alreadyCompleted', true,
      'selectedCount', (select count(*) from public.user_favorite_spot_seeds where user_id = v_user and spot_id is not null),
      'declaredEvidenceCount', (select count(*) from public.backyrd_self_declared_taste_v1 where user_id = v_user and state = 'ACTIVE'),
      'semanticContractVersion', 'backyrd-canonical-semantics-v1'
    );
  end if;

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
    where id = any(v_ids)
      and status = 'approved'
      and data_origin not in ('FIXTURE', 'TEST')
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
    'alreadyCompleted', false,
    'selectedCount', v_count,
    'declaredEvidenceCount', v_inserted,
    'semanticContractVersion', 'backyrd-canonical-semantics-v1'
  );
end
$$;

revoke all on function public.complete_decision_onboarding_v2(text, uuid[]) from public, anon;
grant execute on function public.complete_decision_onboarding_v2(text, uuid[]) to authenticated, service_role;

comment on function public.get_my_product_entry_status_v1() is
  'Canonical server truth for Profile Basics, Taste onboarding, consent visibility, and Decision entry.';
comment on policy spots_select_product_visible_v1 on public.spots is
  'Normal Product reads exclude explicit FIXTURE/TEST Spots; Admin and service-only internal tooling remain available.';
