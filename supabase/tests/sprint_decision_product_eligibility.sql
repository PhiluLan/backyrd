\set ON_ERROR_STOP on

begin;

create function pg_temp.dpe_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.dpe_assert(p_ok boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Decision product eligibility acceptance failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.dpe_actor(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create function pg_temp.dpe_spot(
  p_label text,
  p_status public.spot_status,
  p_owner uuid,
  p_category uuid
) returns uuid
language plpgsql as $$
declare v_id uuid := pg_temp.dpe_uuid('spot:' || p_label);
begin
  insert into public.spots(
    id, name, address, lat, lng, created_by, owner_id, status, category_id, city
  ) values (
    v_id,
    'Eligibility ' || p_label,
    'Fixture 1',
    47.55,
    7.59,
    p_owner,
    p_owner,
    p_status,
    p_category,
    'Decision Eligibility City'
  );
  return v_id;
end;
$$;

create function pg_temp.dpe_set_distribution(p_spot uuid, p_state text) returns void
language plpgsql as $$
begin
  update public.distribution_trust_states s
  set automatic_state = p_state,
      effective_state = p_state,
      reason_codes = array[]::text[],
      automatic_reason_codes = array[]::text[],
      active_override_id = null,
      updated_at = now()
  from public.safety_content_items i
  where s.content_item_id = i.id
    and i.entity_type = 'spot'
    and i.entity_id = p_spot;

  if not found then
    raise exception 'No Distribution state exists for fixture Spot %', p_spot;
  end if;
end;
$$;

do $$
declare
  v_user uuid := pg_temp.dpe_uuid('user');
  v_owner uuid := pg_temp.dpe_uuid('owner');
  v_category uuid := pg_temp.dpe_uuid('category');
  v_approved_normal uuid;
  v_approved_second uuid;
  v_approved_reduced uuid;
  v_approved_quarantined uuid;
  v_approved_excluded uuid;
  v_pending_normal uuid;
  v_rejected_normal uuid;
  v_cluster bigint := 910001;
  v_token integer := 910001;
  v_query_vector public.vector(1536) := array_fill(1::real, array[1536])::public.vector;
  v_index integer;
begin
  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values
    (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated',
      'authenticated', 'decision-eligibility@fixture.invalid', '', '{}', '{}',
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated',
      'authenticated', 'decision-eligibility-owner@fixture.invalid', '', '{}', '{}',
      now(), now(), '', '', '', ''
    );

  insert into public.categories(id, name)
  values (v_category, 'Eligibility Tests');

  insert into public.mood_clusters(id, name, name_norm)
  values (v_cluster, 'Eligibility Signal', 'eligibility_signal');
  insert into public.mood_tokens(id, token, locale, valid, token_norm)
  values (v_token, 'EligibilitySignal', 'de', true, 'eligibility_signal');
  insert into public.mood_token_clusters(token_id, cluster_id, weight, confidence, source)
  values (v_token, v_cluster, 1, 1, 'acceptance');

  -- Approved-only control population. These rows establish that the eligibility
  -- repair does not change scores or ordering among valid candidates.
  v_approved_normal := pg_temp.dpe_spot('Approved Normal', 'approved', v_owner, v_category);
  v_approved_second := pg_temp.dpe_spot('Approved Second', 'approved', v_owner, v_category);
  v_approved_reduced := pg_temp.dpe_spot('Approved Reduced', 'approved', v_owner, v_category);
  v_approved_quarantined := pg_temp.dpe_spot('Approved Quarantined', 'approved', v_owner, v_category);
  v_approved_excluded := pg_temp.dpe_spot('Approved Excluded', 'approved', v_owner, v_category);

  perform pg_temp.dpe_set_distribution(v_approved_normal, 'normal');
  perform pg_temp.dpe_set_distribution(v_approved_second, 'normal');
  perform pg_temp.dpe_set_distribution(v_approved_reduced, 'reduced');
  perform pg_temp.dpe_set_distribution(v_approved_quarantined, 'quarantined');
  perform pg_temp.dpe_set_distribution(v_approved_excluded, 'excluded');

  insert into public.reviews(spot_id, user_id, mood_a, mood_a_id, city)
  values
    (v_approved_normal, v_user, 'EligibilitySignal', v_token, 'Decision Eligibility City'),
    (v_approved_normal, v_user, 'EligibilitySignal', v_token, 'Decision Eligibility City'),
    (v_approved_second, v_user, 'EligibilitySignal', v_token, 'Decision Eligibility City'),
    (v_approved_reduced, v_user, 'EligibilitySignal', v_token, 'Decision Eligibility City');

  create temporary table dpe_approved_control_before on commit drop as
  select row_number() over ()::integer as result_position, r.*
  from public.backyrd_get_decision_spots_v11(
    'Decision Eligibility City', array[v_cluster::integer], 'broad intent',
    20, 1, 0, 0, 0.05
  ) r;

  perform pg_temp.dpe_assert(
    (select array_agg(spot_id order by result_position) =
      array[v_approved_normal, v_approved_second, v_approved_reduced]
     from dpe_approved_control_before),
    'approved NORMAL candidates keep score ordering, REDUCED follows, and restrictive Distribution states are excluded'
  );

  -- Invalid fixtures are deliberately stronger than the approved controls:
  -- exact names, twenty Mood observations, maximum category Taste affinity,
  -- identical semantic vectors and NORMAL Distribution.
  v_pending_normal := pg_temp.dpe_spot('Pending Exact Target', 'pending', v_owner, v_category);
  v_rejected_normal := pg_temp.dpe_spot('Rejected Exact Target', 'rejected', v_owner, v_category);
  perform pg_temp.dpe_set_distribution(v_pending_normal, 'normal');
  perform pg_temp.dpe_set_distribution(v_rejected_normal, 'normal');

  for v_index in 1..20 loop
    insert into public.reviews(spot_id, user_id, mood_a, mood_a_id, city)
    values
      (v_pending_normal, v_user, 'EligibilitySignal', v_token, 'Decision Eligibility City'),
      (v_rejected_normal, v_user, 'EligibilitySignal', v_token, 'Decision Eligibility City');
  end loop;

  insert into public.backyrd_user_feature_weights_v1(
    user_id, feature_type, feature_key, weight, confidence, positive_count
  ) values (
    v_user, 'category', 'eligibility tests', 1.6, 1, 100
  );

  insert into public.backyrd_spot_ml_documents_v1(
    spot_id, document_text, document_json, source_hash, document_version
  ) values
    (v_approved_normal, 'exact semantic eligibility signal',
      '{"city":"Decision Eligibility City"}', 'approved-normal', 'acceptance'),
    (v_pending_normal, 'exact semantic eligibility signal',
      '{"city":"Decision Eligibility City"}', 'pending-normal', 'acceptance'),
    (v_rejected_normal, 'exact semantic eligibility signal',
      '{"city":"Decision Eligibility City"}', 'rejected-normal', 'acceptance')
  on conflict (spot_id) do update set
    document_text = excluded.document_text,
    document_json = excluded.document_json,
    source_hash = excluded.source_hash,
    document_version = excluded.document_version;

  insert into public.backyrd_spot_embeddings_v1(
    spot_id, embedding, model_name, model_dimensions, document_version, source_hash
  ) values
    (v_approved_normal, v_query_vector, 'acceptance', 1536, 'acceptance', 'approved-normal'),
    (v_pending_normal, v_query_vector, 'acceptance', 1536, 'acceptance', 'pending-normal'),
    (v_rejected_normal, v_query_vector, 'acceptance', 1536, 'acceptance', 'rejected-normal')
  on conflict (spot_id) do update set
    embedding = excluded.embedding,
    model_name = excluded.model_name,
    model_dimensions = excluded.model_dimensions,
    document_version = excluded.document_version,
    source_hash = excluded.source_hash;

  create temporary table dpe_approved_control_after on commit drop as
  select row_number() over ()::integer as result_position, r.*
  from public.backyrd_get_decision_spots_v11(
    'Decision Eligibility City', array[v_cluster::integer], 'broad intent',
    20, 1, 0, 0, 0.05
  ) r;

  perform pg_temp.dpe_assert(
    not exists(
      (select * from dpe_approved_control_before except select * from dpe_approved_control_after)
      union all
      (select * from dpe_approved_control_after except select * from dpe_approved_control_before)
    ),
    'adding stronger non-approved fixtures leaves approved-only V11 ordering and scores byte-for-byte unchanged'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1
      from public.backyrd_get_decision_debug_v3(
        'Decision Eligibility City', array[v_cluster::integer],
        'Eligibility Pending Exact Target', 100, 1, 0
      ) r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ),
    'the shared V3 candidate boundary excludes exact-name non-approved Spots before scoring'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1
      from public.backyrd_get_decision_spots_v11(
        'Decision Eligibility City', array[v_cluster::integer],
        'Eligibility Pending Exact Target', 20, 1, 0, 0.35, 0.2
      ) r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ) and not exists(
      select 1
      from public.backyrd_get_decision_spots_v11(
        'Decision Eligibility City', array[v_cluster::integer],
        'Eligibility Rejected Exact Target', 20, 1, 0, 0.35, 0.2
      ) r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ),
    'V11 pending and rejected exact-name results contain only approved Spots despite stronger invalid Mood and Taste conditions'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1
      from public.backyrd_get_decision_spots_v11(
        'Decision Eligibility City', array[v_cluster::integer],
        'broad intent', 20, 1, 0, 0.35, 0.2
      ) r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ),
    'V11 broad-query results contain only approved Spots'
  );

  perform pg_temp.dpe_actor(v_user);

  create temporary table dpe_v12_first on commit drop as
  select *
  from public.backyrd_get_decision_spots_v12(
    'Decision Eligibility City', array[v_cluster::integer],
    'Eligibility Pending Exact Target', 20, 1, 0, 0.52, 0.055,
    'EligibilitySignal', 'Eligibility Pending Exact Target'
  );

  create temporary table dpe_v12_rejected on commit drop as
  select *
  from public.backyrd_get_decision_spots_v12(
    'Decision Eligibility City', array[v_cluster::integer],
    'Eligibility Rejected Exact Target', 20, 1, 0, 0.52, 0.055,
    'EligibilitySignal', 'Eligibility Rejected Exact Target'
  );

  create temporary table dpe_v12_broad on commit drop as
  select *
  from public.backyrd_get_decision_spots_v12(
    'Decision Eligibility City', array[v_cluster::integer],
    'broad intent', 20, 1, 0, 0.52, 0.055,
    'EligibilitySignal', 'broad intent'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1 from dpe_v12_first r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ) and not exists(
      select 1 from dpe_v12_rejected r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ) and not exists(
      select 1 from dpe_v12_broad r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ),
    'V12 repeated pending exact-name, rejected exact-name and broad executions return only approved Spots'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1
      from public.backyrd_recommendation_run_items_v1 i
      join public.backyrd_recommendation_runs_v1 r on r.id = i.run_id
      join public.spots s on s.id = i.spot_id
      where r.user_id = v_user
        and r.city = 'Decision Eligibility City'
        and s.status <> 'approved'
    ),
    'V12 never persists a non-approved recommendation-run item'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1
      from public.backyrd_match_spot_embeddings_v13(
        v_query_vector, 'Decision Eligibility City', 100, array[]::uuid[]
      ) r
      join public.spots s on s.id = r.spot_id
      where s.status <> 'approved'
    ),
    'semantic V13 matching retains its approved-only product boundary'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1
      from public.distribution_trust_spot_catalog_v1(
        null, 'Decision Eligibility City', 100, 'decision'
      ) r
      join public.spots s on s.id = r.id
      where s.status <> 'approved'
    ),
    'the V13 fallback catalog retains its approved-only product boundary'
  );

  create temporary table dpe_v13_union(spot_id uuid, source text) on commit drop;
  insert into dpe_v13_union select spot_id, 'personalized_v12' from dpe_v12_first;
  insert into dpe_v13_union
  select semantic.spot_id, 'semantic_v13'
  from public.backyrd_match_spot_embeddings_v13(
    v_query_vector, 'Decision Eligibility City', 100, array[]::uuid[]
  ) semantic
  join public.distribution_trust_filter_entities_v1(
    'spot',
    array(
      select spot_id
      from public.backyrd_match_spot_embeddings_v13(
        v_query_vector, 'Decision Eligibility City', 100, array[]::uuid[]
      )
    ),
    'decision'
  ) eligibility on eligibility.entity_id = semantic.spot_id
  where eligibility.eligible;
  insert into dpe_v13_union
  select id, 'fallback'
  from public.distribution_trust_spot_catalog_v1(
    null, 'Decision Eligibility City', 100, 'decision'
  );

  perform pg_temp.dpe_assert(
    not exists(
      select 1 from dpe_v13_union u
      join public.spots s on s.id = u.spot_id
      where s.status <> 'approved'
    ),
    'the complete V13 personalized + semantic + fallback candidate union is approved-only'
  );

  -- Distribution remains independent: NORMAL alone considers the pending Spot
  -- distributable, while every public Decision source still excludes it due to
  -- product status. Approved state behavior remains unchanged.
  perform pg_temp.dpe_assert(
    (select eligible and distribution_priority = 100
     from public.distribution_trust_filter_entities_v1(
       'spot', array[v_approved_normal], 'decision'
     )),
    'approved + NORMAL is eligible at priority 100'
  );
  perform pg_temp.dpe_assert(
    (select eligible and distribution_priority = 50
     from public.distribution_trust_filter_entities_v1(
       'spot', array[v_approved_reduced], 'decision'
     )),
    'approved + REDUCED keeps canonical eligibility at priority 50'
  );
  perform pg_temp.dpe_assert(
    (select not eligible
     from public.distribution_trust_filter_entities_v1(
       'spot', array[v_approved_quarantined], 'decision'
     )),
    'approved + QUARANTINED remains excluded'
  );
  perform pg_temp.dpe_assert(
    (select not eligible
     from public.distribution_trust_filter_entities_v1(
       'spot', array[v_approved_excluded], 'decision'
     )),
    'approved + EXCLUDED remains excluded'
  );
  perform pg_temp.dpe_assert(
    (select eligible
     from public.distribution_trust_filter_entities_v1(
       'spot', array[v_pending_normal], 'decision'
     )) and not exists(
       select 1 from dpe_v13_union where spot_id = v_pending_normal
     ),
    'pending + NORMAL is excluded by Product Eligibility, not by Distribution'
  );

  perform pg_temp.dpe_assert(
    (select count(*) = 3
     from public.backyrd_recommendation_runs_v1
     where user_id = v_user and city = 'Decision Eligibility City'),
    'repeated V12 execution creates exactly the three isolated synthetic runs'
  );
end;
$$;

rollback;

\echo 'Decision Product Eligibility acceptance passed.'
