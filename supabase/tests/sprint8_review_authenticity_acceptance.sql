\set ON_ERROR_STOP on

begin;

create function pg_temp.test_uuid(p_label text) returns uuid
language sql immutable
as $$
  select (
    substr(md5(p_label), 1, 8) || '-' ||
    substr(md5(p_label), 9, 4) || '-4' ||
    substr(md5(p_label), 14, 3) || '-8' ||
    substr(md5(p_label), 18, 3) || '-' ||
    substr(md5(p_label), 21, 12)
  )::uuid;
$$;

create function pg_temp.assert_true(p_ok boolean, p_message text) returns void
language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'Sprint 8 acceptance failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.set_actor(p_user_id uuid, p_role text default 'authenticated')
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', p_role)::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', p_role, true);
end;
$$;

create function pg_temp.make_user(
  p_label text,
  p_created_at timestamptz default '2026-07-01 00:00:00+00'
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := pg_temp.test_uuid('user:' || p_label);
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id,
    'authenticated', 'authenticated', p_label || '@sprint8.invalid', '',
    p_created_at, '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, p_created_at, p_created_at, '', '', '', ''
  ) on conflict (id) do nothing;
  return v_id;
end;
$$;

create function pg_temp.make_spot(p_label text, p_owner_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := pg_temp.test_uuid('spot:' || p_label);
begin
  insert into public.spots (id, name, lat, lng, status, owner_id)
  values (v_id, 'Sprint 8 ' || p_label, 47.3769, 8.5417, 'approved', p_owner_id)
  on conflict (id) do update set owner_id = excluded.owner_id;
  return v_id;
end;
$$;

create function pg_temp.make_review(
  p_label text,
  p_spot_id uuid,
  p_user_id uuid,
  p_text text,
  p_created_at timestamptz
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := pg_temp.test_uuid('review:' || p_label);
begin
  perform pg_temp.set_actor(p_user_id);
  insert into public.reviews (id, spot_id, user_id, text, created_at, updated_at)
  values (v_id, p_spot_id, p_user_id, p_text, p_created_at, p_created_at);
  return v_id;
end;
$$;

create function pg_temp.signal_count(p_review_id uuid, p_signal_type text)
returns integer
language sql stable
as $$
  select count(*)::integer
  from public.safety_signals s
  join public.safety_cases c on c.id = s.case_id
  join public.safety_content_items i on i.id = c.content_item_id
  where i.entity_type = 'review'
    and i.entity_id = p_review_id
    and s.provider = 'backyrd_integrity'
    and s.signal_type = p_signal_type;
$$;

create function pg_temp.signal_risk(p_review_id uuid, p_signal_type text)
returns text
language sql stable
as $$
  select s.categories ->> 'risk_level'
  from public.safety_signals s
  join public.safety_cases c on c.id = s.case_id
  join public.safety_content_items i on i.id = c.content_item_id
  where i.entity_type = 'review'
    and i.entity_id = p_review_id
    and s.provider = 'backyrd_integrity'
    and s.signal_type = p_signal_type
  order by s.created_at desc
  limit 1;
$$;

-- Detector triggers are disabled only inside this disposable, rolled-back test
-- transaction. Each detector is invoked explicitly so fixtures cannot mask one
-- another. The Owner Self Review and Content Registry triggers stay active.
alter table public.reviews disable trigger trg_safety_review_integrity_v1;
alter table public.reviews disable trigger trg_safety_review_burst_v1;

do $$
declare
  t0 constant timestamptz := '2026-08-08 12:00:00+00';
  u uuid;
  s uuid;
  s2 uuid;
  r uuid;
  i integer;
  v_similarity numeric;
  v_before numeric := 0;
  v_at numeric := 2;
  v_above numeric := 0;
  v_base text;
  v_candidate text;
  v_before_base text;
  v_before_candidate text;
  v_at_base text;
  v_at_candidate text;
  v_above_base text;
  v_above_candidate text;
begin
  -- Normalization is deterministic for casing, punctuation and whitespace.
  perform pg_temp.assert_true(
    public.safety_normalize_review_text_v1('  Sehr,   GUT!!!  ') = 'sehr gut',
    'normalization must fold casing, punctuation and whitespace'
  );
  perform pg_temp.assert_true(
    public.safety_normalize_review_text_v1('ÜBERRASCHEND schön') = 'überraschend schön',
    'normalization must preserve Unicode while folding case'
  );

  -- Exact duplicate: 0 previous is below, 1 is the boundary, 2 is high risk.
  u := pg_temp.make_user('exact');
  s := pg_temp.make_spot('exact');
  r := pg_temp.make_review('exact-1', s, u, 'Ein wirklich ruhiger schöner Abend.', t0 - interval '2 minutes');
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_exact_duplicate') = 0, 'exact duplicate below threshold');
  r := pg_temp.make_review('exact-2', s, u, ' EIN wirklich ruhiger, schöner Abend! ', t0 - interval '1 minute');
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_exact_duplicate') = 'suspicious', 'exact duplicate boundary at one previous match');
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_exact_duplicate') = 1, 'exact duplicate repeated evaluation is idempotent');
  r := pg_temp.make_review('exact-3', s, u, 'ein wirklich ruhiger schöner abend', t0);
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_exact_duplicate') = 'high_risk', 'exact duplicate high boundary at two previous matches');

  -- Common short reviews are below the eight-character duplicate guard.
  foreach i in array array[1,2,3] loop
    u := pg_temp.make_user('short-' || i);
    s := pg_temp.make_spot('short-' || i);
    perform pg_temp.make_review('short-' || i || '-1', s, u, (array['Super!','Gut','Nice'])[i], t0 - interval '1 minute');
    r := pg_temp.make_review('short-' || i || '-2', s, u, lower((array['Super!','Gut','Nice'])[i]), t0);
    perform public.safety_evaluate_review_integrity_v1(r);
    perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_exact_duplicate') = 0, 'short generic duplicate guard ' || i);
  end loop;

  -- Copy/paste: one other Spot is suspicious; three other Spots is high risk.
  u := pg_temp.make_user('copy');
  for i in 1..4 loop
    s := pg_temp.make_spot('copy-' || i);
    r := pg_temp.make_review('copy-' || i, s, u, 'Identischer ausführlicher Erlebnistext', t0 - (5-i) * interval '1 minute');
    perform public.safety_evaluate_review_integrity_v1(r);
    if i = 1 then
      perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_copy_paste') = 0, 'copy/paste below threshold');
    elsif i = 2 then
      perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_copy_paste') = 'suspicious', 'copy/paste boundary at one other Spot');
    elsif i = 4 then
      perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_copy_paste') = 'high_risk', 'copy/paste high boundary at three other Spots');
      perform public.safety_evaluate_review_integrity_v1(r);
      perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_copy_paste') = 1, 'copy/paste repeated evaluation is idempotent');
    end if;
  end loop;

  -- Near duplicate uses pg_trgm >= 0.92, only for normalized length >= 20.
  -- pg_trgm similarities are discrete ratios. Select deterministic generated
  -- pairs immediately below, at/above, and above the configured 0.92 cutoff.
  for i in 3..100 loop
    select string_agg('token' || lpad(g::text, 3, '0'), ' ' order by g)
    into v_base
    from generate_series(1, i) g;
    v_candidate := left(v_base, length(v_base) - 1) || 'x';
    v_similarity := similarity(v_base, v_candidate);
    if v_similarity < 0.92 and v_similarity > v_before then
      v_before := v_similarity;
      v_before_base := v_base;
      v_before_candidate := v_candidate;
    end if;
    if v_similarity >= 0.92 and v_similarity < v_at then
      v_at := v_similarity;
      v_at_base := v_base;
      v_at_candidate := v_candidate;
    end if;
    if v_similarity > v_above and v_similarity < 1 then
      v_above := v_similarity;
      v_above_base := v_base;
      v_above_candidate := v_candidate;
    end if;
  end loop;
  raise notice 'near similarity fixtures: below=%, at=%, above=%', v_before, v_at, v_above;
  perform pg_temp.assert_true(v_before < 0.92, 'near-duplicate below fixture must remain below 0.92');
  perform pg_temp.assert_true(v_at >= 0.92 and v_at < 0.922, 'near-duplicate representable boundary fixture must enter at 0.92');
  perform pg_temp.assert_true(v_above > v_at and v_above < 1, 'near-duplicate above fixture must exceed the boundary and remain non-exact');

  u := pg_temp.make_user('near-below');
  s := pg_temp.make_spot('near-below-a'); s2 := pg_temp.make_spot('near-below-b');
  perform pg_temp.make_review('near-below-a', s, u, v_before_base, t0 - interval '1 minute');
  r := pg_temp.make_review('near-below-b', s2, u, v_before_candidate, t0);
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_near_duplicate') = 0, 'near duplicate below 0.92');

  u := pg_temp.make_user('near-at');
  s := pg_temp.make_spot('near-at-a'); s2 := pg_temp.make_spot('near-at-b');
  perform pg_temp.make_review('near-at-a', s, u, v_at_base, t0 - interval '1 minute');
  r := pg_temp.make_review('near-at-b', s2, u, v_at_candidate, t0);
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_near_duplicate') = 'suspicious', 'near duplicate exactly at 0.92');

  u := pg_temp.make_user('near-above');
  s := pg_temp.make_spot('near-above-a'); s2 := pg_temp.make_spot('near-above-b');
  perform pg_temp.make_review('near-above-a', s, u, v_above_base, t0 - interval '1 minute');
  r := pg_temp.make_review('near-above-b', s2, u, v_above_candidate, t0);
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_near_duplicate') = 'suspicious', 'near duplicate above 0.92');
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_near_duplicate') = 1, 'near duplicate repeated evaluation is idempotent');

  -- Same-Spot cadence: 2/24h below, 3 at threshold, 5 high; exact 24h is included.
  u := pg_temp.make_user('repeat'); s := pg_temp.make_spot('repeat');
  perform pg_temp.make_review('repeat-1', s, u, 'first visit', t0 - interval '24 hours');
  r := pg_temp.make_review('repeat-2', s, u, 'second visit', t0 - interval '1 hour');
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_repeat_same_spot') = 0, 'repeat same Spot below threshold');
  r := pg_temp.make_review('repeat-3', s, u, 'third visit', t0);
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_repeat_same_spot') = 'suspicious', 'repeat same Spot boundary at three');
  perform pg_temp.make_review('repeat-4', s, u, 'fourth visit', t0 + interval '1 minute');
  perform pg_temp.make_review('repeat-5', s, u, 'fifth visit', t0 + interval '2 minutes');
  r := pg_temp.make_review('repeat-6', s, u, 'sixth visit', t0 + interval '3 minutes');
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_repeat_same_spot') = 'high_risk', 'repeat same Spot high boundary at five');
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_repeat_same_spot') = 1, 'repeat same Spot repeated evaluation is idempotent');

  u := pg_temp.make_user('repeat-control'); s := pg_temp.make_spot('repeat-control');
  perform pg_temp.make_review('repeat-control-1', s, u, 'visit one', t0 - interval '48 hours');
  perform pg_temp.make_review('repeat-control-2', s, u, 'visit two', t0 - interval '24 hours 1 second');
  r := pg_temp.make_review('repeat-control-3', s, u, 'visit three', t0);
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_repeat_same_spot') = 0, 'legitimate repeat visits outside 24h');

  -- Velocity: 4/10m below, 5 at threshold, 10 high; exact boundary is included.
  u := pg_temp.make_user('velocity');
  for i in 1..10 loop
    s := pg_temp.make_spot('velocity-' || i);
    r := pg_temp.make_review('velocity-' || i, s, u, 'velocity text ' || i, t0 - (10-i) * interval '1 minute');
    if i in (4,5,10) then
      perform public.safety_evaluate_review_integrity_v1(r);
      if i = 4 then perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_high_velocity') = 0, 'velocity below threshold'); end if;
      if i = 5 then perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_high_velocity') = 'suspicious', 'velocity boundary at five'); end if;
      if i = 10 then
        perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_high_velocity') = 'high_risk', 'velocity high boundary at ten');
        perform public.safety_evaluate_review_integrity_v1(r);
        perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_high_velocity') = 1, 'velocity repeated evaluation is idempotent');
      end if;
    end if;
  end loop;
  u := pg_temp.make_user('velocity-control');
  for i in 1..5 loop
    s := pg_temp.make_spot('velocity-control-' || i);
    r := pg_temp.make_review('velocity-control-' || i, s, u, 'normal cadence ' || i, t0 - (6-i) * interval '10 minutes 1 second');
  end loop;
  perform public.safety_evaluate_review_integrity_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_high_velocity') = 0, 'normal cadence outside 10m');
end;
$$;

do $$
declare
  t0 constant timestamptz := '2026-08-08 15:00:00+00';
  current_users uuid[] := '{}';
  u uuid;
  s uuid;
  r uuid;
  i integer;
  j integer;
begin
  -- Spot burst 15m: 4 users below, 5 suspicious, 10 high; 15m is inclusive.
  s := pg_temp.make_spot('burst15');
  for i in 1..10 loop
    u := pg_temp.make_user('burst15-' || i);
    r := pg_temp.make_review('burst15-' || i, s, u, 'independent experience ' || i, t0 - (10-i) * interval '1 minute');
    if i in (4,5,10) then
      perform public.safety_evaluate_review_burst_v1(r);
      if i = 4 then perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_spot_burst_15m') = 0, '15m burst below threshold'); end if;
      if i = 5 then perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_spot_burst_15m') = 'suspicious', '15m burst boundary at five users'); end if;
      if i = 10 then
        perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_spot_burst_15m') = 'high_risk', '15m burst high boundary at ten users');
        perform public.safety_evaluate_review_burst_v1(r);
        perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_spot_burst_15m') = 1, '15m burst repeated evaluation is idempotent');
      end if;
    end if;
  end loop;

  s := pg_temp.make_spot('burst15-outside');
  for i in 1..5 loop
    u := pg_temp.make_user('burst15-outside-' || i);
    r := pg_temp.make_review('burst15-outside-' || i, s, u, 'outside window ' || i, case when i < 5 then t0 - interval '15 minutes 1 second' - i * interval '1 second' else t0 end);
  end loop;
  perform public.safety_evaluate_review_burst_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_spot_burst_15m') = 0, '15m burst excludes users just outside window');

  -- Spot burst 60m: 9 below, 10 suspicious, 20 high. Reviews are spread
  -- outside 15m so this fixture isolates the 60m rule.
  foreach j in array array[9,10,20] loop
    s := pg_temp.make_spot('burst60-' || j);
    for i in 1..j loop
      u := pg_temp.make_user('burst60-' || j || '-' || i);
      r := pg_temp.make_review('burst60-' || j || '-' || i, s, u, 'hourly crowd ' || i, case when i = j then t0 else t0 - interval '40 minutes' - i * interval '1 second' end);
    end loop;
    perform public.safety_evaluate_review_burst_v1(r);
    if j = 9 then perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_spot_burst_60m') = 0, '60m burst below threshold'); end if;
    if j = 10 then perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_spot_burst_60m') = 'suspicious', '60m burst boundary at ten users'); end if;
    if j = 20 then
      perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_spot_burst_60m') = 'high_risk', '60m burst high boundary at twenty users');
      perform public.safety_evaluate_review_burst_v1(r);
      perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_spot_burst_60m') = 1, '60m burst repeated evaluation is idempotent');
    end if;
  end loop;

  s := pg_temp.make_spot('burst60-outside');
  for i in 1..10 loop
    u := pg_temp.make_user('burst60-outside-' || i);
    r := pg_temp.make_review('burst60-outside-' || i, s, u, 'outside hour ' || i, case when i < 10 then t0 - interval '60 minutes 1 second' - i * interval '1 second' else t0 end);
  end loop;
  perform public.safety_evaluate_review_burst_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_spot_burst_60m') = 0, '60m burst excludes users just outside window');

  -- Coordinated exact copy: 2 below, 3 suspicious, 5 high; short generic
  -- texts are excluded by the 12-character guard.
  s := pg_temp.make_spot('coordinated-copy');
  for i in 1..5 loop
    u := pg_temp.make_user('coordinated-copy-' || i);
    r := pg_temp.make_review('coordinated-copy-' || i, s, u, 'wortgleich koordinierter text', t0 - (5-i) * interval '1 minute');
    if i in (2,3,5) then
      perform public.safety_evaluate_review_burst_v1(r);
      if i = 2 then perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_coordinated_copy') = 0, 'coordinated copy below threshold'); end if;
      if i = 3 then perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_coordinated_copy') = 'suspicious', 'coordinated copy boundary at three users'); end if;
      if i = 5 then
        perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_coordinated_copy') = 'high_risk', 'coordinated copy high boundary at five users');
        perform public.safety_evaluate_review_burst_v1(r);
        perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_coordinated_copy') = 1, 'coordinated copy repeated evaluation is idempotent');
      end if;
    end if;
  end loop;
  s := pg_temp.make_spot('coordinated-short');
  for i in 1..5 loop
    u := pg_temp.make_user('coordinated-short-' || i);
    r := pg_temp.make_review('coordinated-short-' || i, s, u, 'Super!', t0);
  end loop;
  perform public.safety_evaluate_review_burst_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_coordinated_copy') = 0, 'short generic coordinated-copy guard');

  -- New-account brigade: 2 new below, 3/5 (=60%) suspicious, 5 new high.
  s := pg_temp.make_spot('new-account-below');
  for i in 1..4 loop
    u := pg_temp.make_user('new-account-below-' || i, case when i <= 2 then t0 - interval '7 days' else t0 - interval '100 days' end);
    r := pg_temp.make_review('new-account-below-' || i, s, u, 'new account control ' || i, t0 - (4-i) * interval '1 minute');
  end loop;
  perform public.safety_evaluate_review_new_account_brigade_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_new_account_brigade') = 0, 'new-account brigade below threshold');

  s := pg_temp.make_spot('new-account-at');
  for i in 1..5 loop
    u := pg_temp.make_user('new-account-at-' || i, case when i <= 3 then t0 - interval '7 days' else t0 - interval '100 days' end);
    r := pg_temp.make_review('new-account-at-' || i, s, u, 'new account boundary ' || i, t0 - (5-i) * interval '1 minute');
  end loop;
  perform public.safety_evaluate_review_new_account_brigade_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_new_account_brigade') = 'suspicious', 'new-account brigade boundary at 3/5 and seven days');

  s := pg_temp.make_spot('new-account-high');
  for i in 1..5 loop
    u := pg_temp.make_user('new-account-high-' || i, t0 - interval '48 hours');
    r := pg_temp.make_review('new-account-high-' || i, s, u, 'new account high ' || i, t0 - (5-i) * interval '1 minute');
  end loop;
  perform public.safety_evaluate_review_new_account_brigade_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_new_account_brigade') = 'high_risk', 'new-account brigade high boundary');
  perform public.safety_evaluate_review_new_account_brigade_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_new_account_brigade') = 1, 'new-account brigade repeated evaluation is idempotent');

  s := pg_temp.make_spot('established-control');
  for i in 1..8 loop
    u := pg_temp.make_user('established-control-' || i, t0 - interval '365 days');
    r := pg_temp.make_review('established-control-' || i, s, u, 'established independent ' || i, t0 - (8-i) * interval '2 minutes');
  end loop;
  perform public.safety_evaluate_review_new_account_brigade_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_new_account_brigade') = 0, 'established accounts do not form new-account brigade');

  -- Repeated group: current group >=3 and the same three accounts at one prior
  -- Spot within seven days is suspicious; two prior Spots is high risk.
  for i in 1..3 loop
    current_users := array_append(current_users, pg_temp.make_user('group-' || i));
  end loop;
  for j in 1..2 loop
    s := pg_temp.make_spot('group-prior-' || j);
    for i in 1..3 loop
      perform pg_temp.make_review('group-prior-' || j || '-' || i, s, current_users[i], 'independent group history ' || j || '-' || i, t0 - j * interval '1 day' + i * interval '1 minute');
    end loop;
  end loop;
  s := pg_temp.make_spot('group-current');
  for i in 1..3 loop
    r := pg_temp.make_review('group-current-' || i, s, current_users[i], 'current group ' || i, t0 - (3-i) * interval '1 minute');
  end loop;
  perform public.safety_evaluate_review_repeated_group_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_repeated_group_pattern') = 'high_risk', 'repeated group high boundary at two prior Spots');
  perform public.safety_evaluate_review_repeated_group_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_repeated_group_pattern') = 1, 'repeated group repeated evaluation is idempotent');

  current_users := '{}';
  for i in 1..3 loop current_users := array_append(current_users, pg_temp.make_user('group-at-' || i)); end loop;
  s := pg_temp.make_spot('group-at-prior');
  for i in 1..3 loop perform pg_temp.make_review('group-at-prior-' || i, s, current_users[i], 'prior at ' || i, t0 - interval '7 days' + i * interval '1 minute'); end loop;
  s := pg_temp.make_spot('group-at-current');
  for i in 1..3 loop r := pg_temp.make_review('group-at-current-' || i, s, current_users[i], 'current at ' || i, t0 - (3-i) * interval '1 minute'); end loop;
  perform public.safety_evaluate_review_repeated_group_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_risk(r, 'review_integrity_repeated_group_pattern') = 'suspicious', 'repeated group boundary at one prior Spot and three users');

  current_users := '{}';
  for i in 1..3 loop current_users := array_append(current_users, pg_temp.make_user('group-control-' || i)); end loop;
  s := pg_temp.make_spot('group-control-prior');
  for i in 1..3 loop
    u := pg_temp.make_user('unrelated-prior-' || i);
    perform pg_temp.make_review('group-control-prior-' || i, s, u, 'unrelated prior ' || i, t0 - interval '1 day');
  end loop;
  s := pg_temp.make_spot('group-control-current');
  for i in 1..3 loop r := pg_temp.make_review('group-control-current-' || i, s, current_users[i], 'unrelated current ' || i, t0); end loop;
  perform public.safety_evaluate_review_repeated_group_v1(r);
  perform pg_temp.assert_true(pg_temp.signal_count(r, 'review_integrity_repeated_group_pattern') = 0, 'unrelated groups do not trigger repeated-group detection');

  -- Signals are review queues, never proof or automatic account punishment.
  perform pg_temp.assert_true((select count(*) from public.safety_account_enforcements) = 0, 'detectors must not create account enforcement');
  perform pg_temp.assert_true((select count(*) from public.safety_account_measures) = 0, 'detectors must not create account measures');
  perform pg_temp.assert_true((select count(*) from public.safety_user_enforcement_events) = 0, 'detectors must not create enforcement events');
end;
$$;

-- Owner Self Review acceptance uses the real BEFORE INSERT database trigger.
do $$
declare
  t0 constant timestamptz := '2026-08-08 18:00:00+00';
  ordinary uuid := pg_temp.make_user('owner-ordinary');
  v_owner_id uuid := pg_temp.make_user('verified-owner');
  pending_id uuid := pg_temp.make_user('pending-claimant');
  own_spot uuid := pg_temp.make_spot('verified-owned', v_owner_id);
  other_spot uuid := pg_temp.make_spot('owner-other');
  pending_spot uuid := pg_temp.make_spot('pending-claim');
  retrospective_spot uuid := pg_temp.make_spot('retrospective-owner');
  retrospective_review uuid;
  blocked boolean := false;
begin
  perform pg_temp.make_review('ordinary-allowed', own_spot, ordinary, 'Ordinary user experience', t0);

  begin
    perform pg_temp.make_review('owner-blocked', own_spot, v_owner_id, 'My own business review', t0);
  exception when sqlstate 'P0001' then
    blocked := sqlerrm = 'SAFETY_OWNER_SELF_REVIEW';
  end;
  perform pg_temp.assert_true(blocked, 'verified owner must be blocked from reviewing own Spot');

  perform pg_temp.make_review('owner-other-allowed', other_spot, v_owner_id, 'Another business experience', t0);

  insert into public.spot_claims (spot_id, user_id, status, proof)
  values (pending_spot, pending_id, 'pending', 'synthetic_pending_claim');
  perform pg_temp.assert_true((select owner_id is null from public.spots where id = pending_spot), 'pending claim must not establish ownership');
  perform pg_temp.make_review('pending-claim-allowed', pending_spot, pending_id, 'Pending claimant experience', t0);

  retrospective_review := pg_temp.make_review('retrospective-existing', retrospective_spot, v_owner_id, 'Review predating ownership', t0 - interval '1 day');
  update public.spots set owner_id = v_owner_id where id = retrospective_spot;
  perform pg_temp.assert_true(exists(select 1 from public.reviews where id = retrospective_review), 'ownership established later does not silently delete historical review');
end;
$$;

-- The ordinary-review case also traverses the actual authenticated RLS policy.
set local role authenticated;
select pg_temp.make_review(
  'ordinary-rls-allowed',
  pg_temp.test_uuid('spot:owner-other'),
  pg_temp.test_uuid('user:owner-ordinary'),
  'Ordinary authenticated review through RLS',
  '2026-08-08 18:05:00+00'
);
reset role;

-- Admin queue/detail and all four human decisions.
do $$
declare
  admin_id uuid := pg_temp.make_user('acceptance-admin');
  v_policy_id uuid;
  v_content_id uuid;
  v_case_id uuid;
  v_detail jsonb;
  v_action text;
  v_lifecycle text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update public.profiles set is_admin = true where id = admin_id;
  perform pg_temp.set_actor(admin_id);
  perform pg_temp.assert_true(auth.uid() = admin_id, 'synthetic Admin JWT identity');
  perform pg_temp.assert_true(exists(select 1 from public.profiles where id=admin_id and is_admin), 'synthetic Admin profile');
  perform pg_temp.assert_true(public.safety_is_admin_v1(admin_id), 'synthetic Admin authorization');
  select id into v_policy_id from public.safety_policy_versions
  where policy_key = 'backyrd-global' and status in ('shadow','active')
  order by activated_at desc nulls last, created_at desc limit 1;

  insert into public.safety_content_items(content_type, entity_type, entity_id, actor_user_id, text_content)
  values ('review','review',gen_random_uuid(),admin_id,'Admin contract synthetic review') returning id into v_content_id;
  insert into public.safety_cases(content_item_id,policy_version_id,case_status,priority,explanation_code)
  values(v_content_id,v_policy_id,'needs_review',80,'REVIEW_INTEGRITY_SIGNAL') returning id into v_case_id;
  insert into public.safety_signals(case_id,signal_type,provider,categories,scores,flagged)
  values
    (v_case_id,'review_integrity_coordinated_copy','backyrd_integrity','{"risk_level":"high_risk","distinct_users_30m":5}'::jsonb,'{"integrity_score":0.97}'::jsonb,true),
    (v_case_id,'specialized_moderation','openai','{}','{}',false);

  perform pg_temp.assert_true(exists(
    select 1 from public.safety_admin_queue_v3('needs_review',200) q
    where q.case_id=v_case_id and q.has_integrity_signal
      and q.integrity_signal_count=1
      and q.integrity_signal_types=array['review_integrity_coordinated_copy']::text[]
      and q.integrity_risk_level='high_risk' and q.integrity_score=0.97
      and q.priority=80 and q.case_status='needs_review'
  ), 'Admin Queue v3 Integrity contract');

  v_detail := public.safety_admin_case_detail_v1(v_case_id);
  perform pg_temp.assert_true(jsonb_array_length(v_detail->'signals')=2, 'Admin detail returns Integrity and Content Safety signals separately classifiable');

  foreach v_action in array array['allow','limit','temporary_hide','remove'] loop
    insert into public.safety_content_items(content_type,entity_type,entity_id,text_content)
    values('review','review',gen_random_uuid(),'Human decision '||v_action) returning id into v_content_id;
    insert into public.safety_cases(content_item_id,policy_version_id,case_status,priority,explanation_code)
    values(v_content_id,v_policy_id,'needs_review',60,'REVIEW_INTEGRITY_SIGNAL') returning id into v_case_id;
    insert into public.safety_signals(case_id,signal_type,provider,categories,scores,flagged)
    values(v_case_id,'review_integrity_exact_duplicate','backyrd_integrity','{"risk_level":"suspicious"}','{"integrity_score":0.78}',true);

    perform public.safety_admin_decide_user_content_v1(
      v_case_id,v_action,null,null,null,'Synthetic acceptance decision',
      'Sprint 8 human decision',array['HUMAN_REVIEW','REVIEW_INTEGRITY_HUMAN_REVIEW','HUMAN_ACTION_'||upper(v_action)]
    );
    v_lifecycle := case v_action when 'allow' then 'live' when 'limit' then 'limited' when 'temporary_hide' then 'hidden' else 'removed' end;
    perform pg_temp.assert_true(exists(
      select 1 from public.safety_cases c join public.safety_content_items i on i.id=c.content_item_id
      where c.id=v_case_id and c.case_status='decided' and c.final_action=v_action
        and c.decision_source='human' and c.decided_by=admin_id and i.lifecycle_status=v_lifecycle
    ), 'human decision state for '||v_action);
    perform pg_temp.assert_true(exists(
      select 1 from public.safety_decision_events d where d.case_id=v_case_id
        and d.action=v_action and d.source='human'
        and d.reason_codes @> array['HUMAN_REVIEW','REVIEW_INTEGRITY_HUMAN_REVIEW']::text[]
    ), 'human decision audit event for '||v_action);
  end loop;
end;
$$;

-- Authorization and SECURITY DEFINER metadata.
do $$
declare
  normal_id uuid := pg_temp.make_user('acceptance-normal');
  denied boolean;
  fn text;
begin
  foreach fn in array array[
    'public.safety_raise_review_integrity_signal_v1(uuid,text,text,numeric,jsonb,jsonb)',
    'public.safety_evaluate_review_integrity_v1(uuid)',
    'public.safety_evaluate_review_burst_v1(uuid)',
    'public.safety_evaluate_review_new_account_brigade_v1(uuid,integer,integer)',
    'public.safety_evaluate_review_repeated_group_v1(uuid)'
  ] loop
    perform pg_temp.assert_true(not has_function_privilege('anon',fn,'EXECUTE'), 'anon cannot execute '||fn);
    perform pg_temp.assert_true(not has_function_privilege('authenticated',fn,'EXECUTE'), 'authenticated cannot execute '||fn);
    perform pg_temp.assert_true(has_function_privilege('service_role',fn,'EXECUTE'), 'service role can execute '||fn);
  end loop;

  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.safety_signals','INSERT'), 'normal users cannot insert Integrity signals');
  perform pg_temp.assert_true((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='safety_signals'), 'safety_signals RLS remains enabled');

  perform pg_temp.set_actor(normal_id);
  denied := false;
  begin perform public.safety_admin_queue_v3('needs_review',1); exception when others then denied := true; end;
  perform pg_temp.assert_true(denied, 'normal user cannot call Integrity Admin Queue');
  denied := false;
  begin perform public.safety_admin_case_detail_v1(gen_random_uuid()); exception when sqlstate '42501' then denied := true; end;
  perform pg_temp.assert_true(denied, 'normal user cannot call Admin Case Detail');
  denied := false;
  begin perform public.safety_admin_decide_user_content_v1(gen_random_uuid(),'allow'); exception when others then denied := true; end;
  perform pg_temp.assert_true(denied, 'normal user cannot decide Safety cases');

  perform pg_temp.assert_true(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'safety_raise_review_integrity_signal_v1','safety_evaluate_review_integrity_v1',
        'safety_evaluate_review_burst_v1','safety_evaluate_review_new_account_brigade_v1',
        'safety_evaluate_review_repeated_group_v1','safety_block_owner_self_review_v1'
      ) and p.prosecdef
      and (p.proconfig is null or not exists(select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  ), 'all Sprint 8 SECURITY DEFINER functions have explicit search_path');
end;
$$;

alter table public.reviews enable trigger trg_safety_review_integrity_v1;
alter table public.reviews enable trigger trg_safety_review_burst_v1;

rollback;

\echo 'Sprint 8 Review Authenticity & Manipulation acceptance passed.'
