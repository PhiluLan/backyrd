\set ON_ERROR_STOP on

begin;
set local client_min_messages = error;

create function pg_temp.d02_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.d02_actor(p_user uuid) returns void
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

create function pg_temp.d02_vector(p_a real, p_b real, p_c real)
returns public.vector(1536)
language sql immutable as $$
  select (array[p_a, p_b, p_c]::real[] || array_fill(0::real, array[1533]))::public.vector;
$$;

create function pg_temp.d02_spot(
  p_key text,
  p_name text,
  p_city text,
  p_category uuid,
  p_owner uuid,
  p_price integer
) returns uuid
language plpgsql as $$
declare v_id uuid := pg_temp.d02_uuid('spot:' || p_key);
begin
  insert into public.spots(
    id, name, address, lat, lng, created_by, owner_id, status, category_id,
    city, country, price_level, created_at
  ) values (
    v_id, p_name, 'Synthetic ' || p_key || ' 1', 47.55, 7.59,
    p_owner, p_owner, 'approved', p_category, p_city, 'Switzerland', p_price,
    timestamptz '2026-08-01 12:00:00+00' + (length(p_key) || ' minutes')::interval
  );
  return v_id;
end;
$$;

create function pg_temp.d02_distribution(p_spot uuid, p_state text) returns void
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
  if not found then raise exception 'missing Distribution state for %', p_spot; end if;
end;
$$;

create temporary table d02_ids(key text primary key, id uuid not null) on commit drop;

do $$
declare
  v_owner uuid := pg_temp.d02_uuid('user:owner');
  v_cold uuid := pg_temp.d02_uuid('user:cold');
  v_strong uuid := pg_temp.d02_uuid('user:strong');
  v_sparse uuid := pg_temp.d02_uuid('user:sparse');
  v_cafe uuid := pg_temp.d02_uuid('category:cafe');
  v_bar uuid := pg_temp.d02_uuid('category:bar');
  v_restaurant uuid := pg_temp.d02_uuid('category:restaurant');
  v_nightlife uuid := pg_temp.d02_uuid('category:nightlife');
  v_culture uuid := pg_temp.d02_uuid('category:culture');
  v_activity uuid := pg_temp.d02_uuid('category:activity');
  v_outing uuid := pg_temp.d02_uuid('category:outing');
  v_spot uuid;
begin
  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated', 'd02-owner@fixture.invalid', '', '{}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_cold, 'authenticated', 'authenticated', 'd02-cold@fixture.invalid', '', '{}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_strong, 'authenticated', 'authenticated', 'd02-strong@fixture.invalid', '', '{}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_sparse, 'authenticated', 'authenticated', 'd02-sparse@fixture.invalid', '', '{}', '{}', now(), now(), '', '', '', '');

  insert into public.categories(id, name) values
    (v_cafe, 'Café'),
    (v_bar, 'Bar'),
    (v_restaurant, 'Restaurant'),
    (v_nightlife, 'Nachtleben'),
    (v_culture, 'Kultur'),
    (v_activity, 'Aktivität'),
    (v_outing, 'Ausflug');

  insert into d02_ids values
    ('user_cold', v_cold), ('user_strong', v_strong), ('user_sparse', v_sparse),
    ('owner', v_owner), ('category_cafe', v_cafe), ('category_bar', v_bar),
    ('category_restaurant', v_restaurant), ('category_nightlife', v_nightlife),
    ('category_culture', v_culture), ('category_activity', v_activity),
    ('category_outing', v_outing);

  v_spot := pg_temp.d02_spot('hearth-cafe', 'Hearth Café', 'Basel', v_cafe, v_owner, 1);
  insert into d02_ids values ('hearth_cafe', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('riverside-wine', 'Riverside Wine Bar', 'Basel', v_bar, v_owner, 2);
  insert into d02_ids values ('riverside_wine', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('pulse-bar', 'Pulse Cocktail Bar', 'Basel', v_bar, v_owner, 2);
  insert into d02_ids values ('pulse_bar', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('night-owl', 'Night Owl Club', 'Basel', v_nightlife, v_owner, 3);
  insert into d02_ids values ('night_owl', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('garden-bistro', 'Garden Bistro', 'Basel', v_restaurant, v_owner, 1);
  insert into d02_ids values ('garden_bistro', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('kunsthaus', 'Kunsthaus Basel', 'Basel', v_culture, v_owner, 2);
  insert into d02_ids values ('kunsthaus', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('kunsthaus-duplicate', 'Kunsthaus der Basel', 'Basel', v_culture, v_owner, 2);
  insert into d02_ids values ('kunsthaus_duplicate', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('maker-lab', 'Maker Lab', 'Basel', v_activity, v_owner, 2);
  insert into d02_ids values ('maker_lab', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('park-view', 'Park View Walk', 'Basel', v_outing, v_owner, 1);
  insert into d02_ids values ('park_view', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('cellar-bar', 'Cellar Bar', 'Basel', v_bar, v_owner, 1);
  insert into d02_ids values ('cellar_bar', v_spot); perform pg_temp.d02_distribution(v_spot, 'reduced');
  v_spot := pg_temp.d02_spot('quarantined-club', 'Quarantined Club', 'Basel', v_nightlife, v_owner, 1);
  insert into d02_ids values ('quarantined_club', v_spot); perform pg_temp.d02_distribution(v_spot, 'quarantined');
  v_spot := pg_temp.d02_spot('cabinet-curiosities', 'Cabinet of Curiosities', 'Sparseville', v_culture, v_owner, 2);
  insert into d02_ids values ('cabinet', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
  v_spot := pg_temp.d02_spot('silent-puzzle', 'Silent Puzzle Room', 'Sparseville', v_activity, v_owner, 2);
  insert into d02_ids values ('silent_puzzle', v_spot); perform pg_temp.d02_distribution(v_spot, 'normal');
end;
$$;

insert into public.consent_purposes(
  key,title_de,description_de,category,legal_basis,requires_consent,is_required,
  default_enabled,withdrawal_effect,sort_order,is_active
) values (
  'personalized_recommendations','Synthetic personalization','D0.2 isolated fixture',
  'personalization','consent',true,false,false,'Synthetic fixture rollback',10,true
)
on conflict (key) do nothing;

insert into public.user_consents(
  user_id,purpose_key,status,granted_at,source,locale,updated_at
)
select id,'personalized_recommendations','granted',now(),'system_migration','de',now()
from d02_ids
where key in ('user_cold','user_strong','user_sparse');

insert into public.mood_clusters(id, name, name_norm) values
  (920001, 'Cozy', 'cozy'), (920002, 'Romantic', 'romantic'),
  (920003, 'Lively', 'lively'), (920004, 'Quiet', 'quiet'),
  (920005, 'Unusual', 'unusual'), (920006, 'Indoor', 'indoor');
insert into public.mood_tokens(id, token, locale, valid, token_norm) values
  (920001, 'cozy', 'de', true, 'cozy'),
  (920002, 'romantic', 'de', true, 'romantic'),
  (920003, 'lively', 'de', true, 'lively'),
  (920004, 'quiet', 'de', true, 'quiet'),
  (920005, 'unusual', 'de', true, 'unusual'),
  (920006, 'indoor', 'de', true, 'indoor');
insert into public.mood_token_clusters(token_id, cluster_id, weight, confidence, source)
select id, id, 1, 1, 'd0.2' from public.mood_tokens where id between 920001 and 920006;

insert into public.mood_concepts(id, label, label_norm, primary_cluster_id) values
  (920001, 'Cozy', 'cozy', 920001),
  (920002, 'Romantic', 'romantic', 920002),
  (920003, 'Lively', 'lively', 920003),
  (920004, 'Quiet', 'quiet', 920004),
  (920005, 'Unusual', 'unusual', 920005),
  (920006, 'Indoor', 'indoor', 920006);
insert into public.mood_token_concepts(token_id, concept_id, confidence)
select id, id, 1 from public.mood_tokens where id between 920001 and 920006;

create temporary table d02_spot_signals(
  spot_key text, mood_id integer, mood_count integer, rank numeric, concept_strength numeric
) on commit drop;
insert into d02_spot_signals values
  ('hearth_cafe',920001,8,3,1.3), ('hearth_cafe',920004,6,3,1.2), ('hearth_cafe',920002,3,2,0.8),
  ('riverside_wine',920001,4,2,0.8), ('riverside_wine',920002,6,3,1.2), ('riverside_wine',920003,5,2,1.0),
  ('pulse_bar',920003,9,3,1.4),
  ('night_owl',920003,10,3,1.5),
  ('garden_bistro',920001,6,3,1.1), ('garden_bistro',920002,2,1,0.5),
  ('kunsthaus',920004,5,3,1.2), ('kunsthaus',920006,4,2,0.9), ('kunsthaus',920005,3,2,0.8),
  ('kunsthaus_duplicate',920004,3,2,0.8), ('kunsthaus_duplicate',920006,2,1,0.6),
  ('maker_lab',920005,7,3,1.3), ('maker_lab',920006,5,2,1.0),
  ('park_view',920004,2,1,0.5),
  ('cellar_bar',920003,12,3,1.5),
  ('quarantined_club',920003,20,3,1.5),
  ('cabinet',920005,8,3,1.4), ('cabinet',920006,6,3,1.2), ('cabinet',920004,4,2,0.9),
  ('silent_puzzle',920005,7,3,1.3), ('silent_puzzle',920006,7,3,1.3), ('silent_puzzle',920004,5,2,1.0);

insert into public.spot_moods(spot_id, mood_id, mood_count, rank)
select i.id, s.mood_id, s.mood_count, s.rank
from d02_spot_signals s join d02_ids i on i.key=s.spot_key;
insert into public.spot_mood_concepts(spot_id, concept_id, strength, source)
select i.id, s.mood_id, s.concept_strength, 'd0.2'
from d02_spot_signals s join d02_ids i on i.key=s.spot_key;

insert into public.reviews(spot_id, user_id, mood_a, mood_a_id, city, text, created_at)
select i.id, (select id from d02_ids where key='user_cold'), t.token, t.id,
       sp.city, 'Synthetic controlled review ' || g.n,
       timestamptz '2026-08-01 10:00:00+00' + (g.n || ' minutes')::interval
from d02_spot_signals s
join d02_ids i on i.key=s.spot_key
join public.spots sp on sp.id=i.id
join public.mood_tokens t on t.id=s.mood_id
cross join lateral generate_series(1, greatest(1, least(s.mood_count, 8))) g(n);

insert into public.spot_descriptions(
  spot_id, admin_description, admin_keywords, content_status, is_verified
) values
  ((select id from d02_ids where key='hearth_cafe'), 'Warm quiet affordable café for dates and long conversations.', array['cozy','quiet','affordable','date','coffee'], 'published', true),
  ((select id from d02_ids where key='riverside_wine'), 'Intimate wine bar for a date with relaxed drinks afterwards.', array['cozy','romantic','drinks','wine','friends'], 'published', true),
  ((select id from d02_ids where key='pulse_bar'), 'Lively cocktail bar for friends, music and energetic drinks.', array['lively','cocktails','friends','music'], 'published', true),
  ((select id from d02_ids where key='night_owl'), 'Loud late-night club with dancing and parties.', array['loud','club','party','dancing'], 'published', true),
  ((select id from d02_ids where key='garden_bistro'), 'Affordable cozy food and dinner in a calm garden room.', array['affordable','cozy','food','dinner'], 'published', true),
  ((select id from d02_ids where key='kunsthaus'), 'Quiet indoor art museum for solo reflection on Sunday.', array['art','museum','quiet','indoor','solo','sunday'], 'published', true),
  ((select id from d02_ids where key='kunsthaus_duplicate'), 'Small indoor gallery for art and quiet solo visits.', array['art','gallery','quiet','indoor','solo'], 'published', true),
  ((select id from d02_ids where key='maker_lab'), 'Unusual indoor hands-on creative workshop and activity.', array['unusual','indoor','hands-on','creative','solo'], 'published', true),
  ((select id from d02_ids where key='park_view'), 'Outdoor walk with a green view.', array['outdoor','walk','park'], 'published', true),
  ((select id from d02_ids where key='cellar_bar'), 'Lively affordable hidden cellar bar for cocktails.', array['lively','hidden','drinks','cocktail'], 'published', true),
  ((select id from d02_ids where key='quarantined_club'), 'Exact strongest lively party club.', array['lively','party','club'], 'published', true),
  ((select id from d02_ids where key='cabinet'), 'Unusual quiet indoor collection, ideal alone on Sunday and not about food.', array['unusual','quiet','indoor','solo','sunday','collection'], 'published', true),
  ((select id from d02_ids where key='silent_puzzle'), 'Unusual indoor puzzle activity for one person on Sunday afternoon.', array['unusual','quiet','indoor','solo','sunday','puzzle'], 'published', true);

insert into public.spot_intelligence_v1(
  spot_id, best_for, occasion_tags, atmosphere_tags, avoid_if_tags,
  good_for_time, noise_level, crowd_type, source, is_verified
)
select id,
  case key
    when 'hearth_cafe' then array['date','conversation']
    when 'riverside_wine' then array['date','drinks with friends']
    when 'pulse_bar' then array['friends','drinks']
    when 'kunsthaus' then array['solo','art']
    when 'maker_lab' then array['solo','creative activity']
    when 'cabinet' then array['solo','unusual discovery']
    when 'silent_puzzle' then array['solo','unusual activity']
    else array[]::text[] end,
  case when key in ('kunsthaus','cabinet','silent_puzzle') then array['sunday'] else array[]::text[] end,
  case when key in ('hearth_cafe','riverside_wine','garden_bistro') then array['cozy']
       when key in ('pulse_bar','night_owl','cellar_bar','quarantined_club') then array['lively']
       else array['quiet','unusual'] end,
  case when key in ('night_owl','quarantined_club') then array['quiet conversation'] else array[]::text[] end,
  case when key in ('kunsthaus','maker_lab','cabinet','silent_puzzle') then array['sunday afternoon','rainy day'] else array['evening'] end,
  case when key in ('pulse_bar','night_owl','cellar_bar','quarantined_club') then 'lively' else 'quiet' end,
  case when key in ('pulse_bar','night_owl','cellar_bar','quarantined_club') then array['friends'] else array['solo','couples'] end,
  'admin', true
from d02_ids
where key in ('hearth_cafe','riverside_wine','pulse_bar','night_owl','garden_bistro','kunsthaus','kunsthaus_duplicate','maker_lab','park_view','cellar_bar','quarantined_club','cabinet','silent_puzzle');

insert into public.backyrd_spot_ml_documents_v1(
  spot_id, document_text, document_json, source_hash, document_version, updated_at
)
select i.id,
  concat_ws(E'\n', 'Spot: ' || s.name, 'Kategorie: ' || c.name, 'Stadt: ' || s.city,
    'Preislevel: ' || s.price_level,
    'Beschreibung: ' || ec.effective_description,
    'Keywords: ' || array_to_string(ec.effective_keywords, ', ')),
  jsonb_build_object('name',s.name,'category',c.name,'city',s.city,'price_level',s.price_level,
    'description',ec.effective_description,'keywords',ec.effective_keywords),
  md5(i.key || ':v1'), 'd0.2', timestamptz '2026-08-10 12:00:00+00'
from d02_ids i
join public.spots s on s.id=i.id
join public.categories c on c.id=s.category_id
join public.spot_effective_content_v1 ec on ec.spot_id=s.id
where i.key in ('hearth_cafe','riverside_wine','pulse_bar','night_owl','garden_bistro','kunsthaus','kunsthaus_duplicate','maker_lab','park_view','cellar_bar','quarantined_club','cabinet','silent_puzzle')
on conflict (spot_id) do update set
  document_text=excluded.document_text,
  document_json=excluded.document_json,
  source_hash=excluded.source_hash,
  document_version=excluded.document_version,
  updated_at=excluded.updated_at;

insert into public.backyrd_spot_embeddings_v1(
  spot_id, embedding, model_name, model_dimensions, document_version, source_hash, updated_at
) values
  ((select id from d02_ids where key='hearth_cafe'), pg_temp.d02_vector(.95,.25,.35), 'text-embedding-3-small',1536,'d0.2',md5('hearth_cafe:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='riverside_wine'), pg_temp.d02_vector(.88,.80,.20), 'text-embedding-3-small',1536,'d0.2',md5('riverside_wine:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='pulse_bar'), pg_temp.d02_vector(.55,.99,.10), 'text-embedding-3-small',1536,'d0.2',md5('pulse_bar:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='night_owl'), pg_temp.d02_vector(.20,.95,.10), 'text-embedding-3-small',1536,'d0.2',md5('night_owl:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='garden_bistro'), pg_temp.d02_vector(.85,.35,.15), 'text-embedding-3-small',1536,'d0.2',md5('garden_bistro:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='kunsthaus'), pg_temp.d02_vector(.45,.20,.99), 'text-embedding-3-small',1536,'d0.2',md5('kunsthaus:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='kunsthaus_duplicate'), pg_temp.d02_vector(.40,.15,.92), 'text-embedding-3-small',1536,'d0.2',md5('kunsthaus_duplicate:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='maker_lab'), pg_temp.d02_vector(.35,.40,.95), 'text-embedding-3-small',1536,'d0.2',md5('maker_lab:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='park_view'), pg_temp.d02_vector(.50,.30,.20), 'text-embedding-3-small',1536,'d0.2',md5('park_view:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='cellar_bar'), pg_temp.d02_vector(.65,1.00,.10), 'text-embedding-3-small',1536,'d0.2',md5('cellar_bar:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='quarantined_club'), pg_temp.d02_vector(.10,1.00,.05), 'text-embedding-3-small',1536,'d0.2',md5('quarantined_club:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='cabinet'), pg_temp.d02_vector(.20,.10,1.00), 'text-embedding-3-small',1536,'d0.2',md5('cabinet:v1'),timestamptz '2026-08-10 12:05:00+00'),
  ((select id from d02_ids where key='silent_puzzle'), pg_temp.d02_vector(.10,.30,.98), 'text-embedding-3-small',1536,'d0.2',md5('silent_puzzle:v1'),timestamptz '2026-08-10 12:05:00+00');

-- Strong historical Taste intentionally conflicts with Trace 2's current Bar intent.
insert into public.user_taste_concepts_v2(user_id, concept_id, weight, confidence) values
  ((select id from d02_ids where key='user_strong'),920001,1.8,1),
  ((select id from d02_ids where key='user_strong'),920004,1.6,1),
  ((select id from d02_ids where key='user_strong'),920003,-0.8,1);
insert into public.backyrd_user_feature_weights_v1(
  user_id,feature_type,feature_key,weight,confidence,positive_count,negative_count,last_event_at
) values
  ((select id from d02_ids where key='user_strong'),'category','category:cafe',1.6,1,30,0,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'mood','mood:cozy',2.0,1,30,0,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'mood','mood:quiet',1.8,1,25,0,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'category','category:bar',-0.9,1,0,8,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'mood','mood:lively',-0.8,1,0,8,now()-interval '1 day');
insert into public.user_place_type_preferences_v1(
  user_id,context_key,place_type,weight,confidence,positive_count,negative_count,last_event_at
) values
  ((select id from d02_ids where key='user_strong'),'global','cafe',1.25,1,30,0,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'global','bar',-0.55,1,0,8,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'lively+friends','cafe',1.10,1,10,0,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'lively+friends','bar',-0.45,1,0,5,now()-interval '1 day');
insert into public.backyrd_user_context_feature_preferences_v1(
  user_id,context_scope,context_key,feature_type,feature_key,weight,confidence,
  positive_count,negative_count,last_event_at
) values
  ((select id from d02_ids where key='user_strong'),'global','global','category','category:cafe',0.50,1,30,0,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'global','global','mood','mood:quiet',0.50,1,25,0,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'category','category:bar','category','category:bar',-0.50,1,0,8,now()-interval '1 day'),
  ((select id from d02_ids where key='user_strong'),'situation','situation:friends','mood','mood:lively',-0.50,1,0,6,now()-interval '1 day');

insert into public.backyrd_ml_events_v1(
  user_id,event_type,spot_id,decision_id,rank,city,mood_a_text,mood_b_text,
  signal_strength,context,created_at
) values (
  (select id from d02_ids where key='user_strong'), 'decision_like',
  (select id from d02_ids where key='hearth_cafe'), null, 1, 'Basel', 'cozy', 'quiet',
  0.22, '{"source":"synthetic_history"}', now()-interval '2 hours'
);

-- TRACE 1: cold / low personalization.
select pg_temp.d02_actor((select id from d02_ids where key='user_cold'));
select setseed(0.101);
create temporary table t1_v12_raw on commit drop as
select row_number() over ()::integer v12_rank, r.*
from public.backyrd_get_decision_spots_v12(
  'Basel',null,'Date cozy nicht teuer Freitagabend Drinks danach',16,1,0,.52,.055,'cozy','romantic'
) r;
create temporary table t1_run on commit drop as
select * from public.backyrd_recommendation_runs_v1
where user_id=(select id from d02_ids where key='user_cold') order by created_at desc limit 1;
create temporary table t1_sem_raw on commit drop as
select row_number() over ()::integer semantic_rank, r.*
from public.backyrd_match_spot_embeddings_v13(pg_temp.d02_vector(1,.45,.15),'Basel',24,'{}') r;
create temporary table t1_dist on commit drop as
select * from public.distribution_trust_filter_entities_v1(
  'spot',array(select spot_id from t1_v12_raw union select spot_id from t1_sem_raw),'decision'
);
create temporary table t1_v12 on commit drop as
select r.* from t1_v12_raw r join t1_dist d on d.entity_id=r.spot_id where d.eligible order by r.v12_rank;
create temporary table t1_sem on commit drop as
select r.* from t1_sem_raw r join t1_dist d on d.entity_id=r.spot_id where d.eligible order by r.semantic_rank;
create temporary table t1_fallback(
  fallback_order integer generated always as identity, spot_id uuid, name text, city text,
  category_name text, similarity numeric, document_text text
) on commit drop;
insert into t1_fallback(spot_id,name,city,category_name,similarity,document_text)
select c.id,c.name,p.city,c.category_name,0,'Distribution-safe alternative candidate'
from public.distribution_trust_spot_catalog_v1(null,'Basel',48,'decision') c
join public.spots p on p.id=c.id
where not exists(select 1 from t1_v12 v where v.spot_id=c.id)
  and not exists(select 1 from t1_sem s where s.spot_id=c.id)
limit greatest(0,16-(select count(distinct spot_id) from (select spot_id from t1_v12 union select spot_id from t1_sem) u));
insert into t1_fallback(spot_id,name,city,category_name,similarity,document_text)
select c.id,c.name,p.city,c.category_name,0,'Distribution-safe alternative candidate'
from public.distribution_trust_spot_catalog_v1(null,null,48,'decision') c
join public.spots p on p.id=c.id
where not exists(select 1 from t1_v12 v where v.spot_id=c.id)
  and not exists(select 1 from t1_sem s where s.spot_id=c.id)
  and not exists(select 1 from t1_fallback f where f.spot_id=c.id)
limit greatest(0,16-(select count(distinct spot_id) from (select spot_id from t1_v12 union select spot_id from t1_sem) u)-(select count(*) from t1_fallback));
create temporary table t1_fallback_dist on commit drop as
select * from public.distribution_trust_filter_entities_v1(
  'spot',array(select spot_id from t1_fallback),'decision'
);

-- TRACE 2: strong long-term Café/quiet Taste versus explicit lively Bar intent.
select pg_temp.d02_actor((select id from d02_ids where key='user_strong'));
select setseed(0.202);
create temporary table t2_v12_raw on commit drop as
select row_number() over ()::integer v12_rank, r.*
from public.backyrd_get_decision_spots_v12(
  'Basel',null,'Bar Drinks Cocktails lebhaft mit Freunden',16,1,0,.52,.055,'lively','friends'
) r;
create temporary table t2_run on commit drop as
select * from public.backyrd_recommendation_runs_v1
where user_id=(select id from d02_ids where key='user_strong') order by created_at desc limit 1;
create temporary table t2_sem_raw on commit drop as
select row_number() over ()::integer semantic_rank, r.*
from public.backyrd_match_spot_embeddings_v13(pg_temp.d02_vector(.20,1,.05),'Basel',24,'{}') r;
create temporary table t2_dist on commit drop as
select * from public.distribution_trust_filter_entities_v1(
  'spot',array(select spot_id from t2_v12_raw union select spot_id from t2_sem_raw),'decision'
);
create temporary table t2_v12 on commit drop as
select r.* from t2_v12_raw r join t2_dist d on d.entity_id=r.spot_id where d.eligible order by r.v12_rank;
create temporary table t2_sem on commit drop as
select r.* from t2_sem_raw r join t2_dist d on d.entity_id=r.spot_id where d.eligible order by r.semantic_rank;
create temporary table t2_fallback(
  fallback_order integer generated always as identity, spot_id uuid, name text, city text,
  category_name text, similarity numeric, document_text text
) on commit drop;
insert into t2_fallback(spot_id,name,city,category_name,similarity,document_text)
select c.id,c.name,p.city,c.category_name,0,'Distribution-safe alternative candidate'
from public.distribution_trust_spot_catalog_v1(null,null,48,'decision') c
join public.spots p on p.id=c.id
where not exists(select 1 from t2_v12 v where v.spot_id=c.id)
  and not exists(select 1 from t2_sem s where s.spot_id=c.id)
limit greatest(0,16-(select count(distinct spot_id) from (select spot_id from t2_v12 union select spot_id from t2_sem) u));
create temporary table t2_fallback_dist on commit drop as
select * from public.distribution_trust_filter_entities_v1(
  'spot',array(select spot_id from t2_fallback),'decision'
);
create temporary table t2_profile_global on commit drop as
select * from public.backyrd_get_my_place_type_profile_v1(null,100) where context_key='global';
create temporary table t2_profile_context on commit drop as
select * from public.backyrd_get_my_place_type_profile_v1(null,100) where context_key='lively+friends';
create temporary table t2_contextual_taste on commit drop as
select * from public.backyrd_get_my_contextual_taste_v1(
  array['global','category:bar','situation:friends','category_situation:bar+friends'],160
);
create temporary table t2_recent_memory on commit drop as
select * from public.backyrd_get_recent_decision_memory_v1(48,220);
create temporary table t2_auth_probe on commit drop as
select auth.uid() as auth_uid,
  (select count(*) from public.user_place_type_preferences_v1 where user_id=(select id from d02_ids where key='user_strong')) profile_rows,
  (select count(*) from public.backyrd_user_context_feature_preferences_v1 where user_id=(select id from d02_ids where key='user_strong')) contextual_rows;

-- TRACE 3: sparse city, unusual indoor solo non-food Sunday request.
select pg_temp.d02_actor((select id from d02_ids where key='user_sparse'));
select setseed(0.303);
create temporary table t3_v12_raw on commit drop as
select row_number() over ()::integer v12_rank, r.*
from public.backyrd_get_decision_spots_v12(
  'Sparseville',null,'Etwas ungewöhnliches, drinnen, allein, kein Essen, Sonntag Nachmittag',16,1,0,.52,.055,'unusual','indoor'
) r;
create temporary table t3_run on commit drop as
select * from public.backyrd_recommendation_runs_v1
where user_id=(select id from d02_ids where key='user_sparse') order by created_at desc limit 1;
create temporary table t3_sem_raw on commit drop as
select row_number() over ()::integer semantic_rank, r.*
from public.backyrd_match_spot_embeddings_v13(pg_temp.d02_vector(.05,.10,1),'Sparseville',24,'{}') r;
create temporary table t3_dist on commit drop as
select * from public.distribution_trust_filter_entities_v1(
  'spot',array(select spot_id from t3_v12_raw union select spot_id from t3_sem_raw),'decision'
);
create temporary table t3_v12 on commit drop as
select r.* from t3_v12_raw r join t3_dist d on d.entity_id=r.spot_id where d.eligible order by r.v12_rank;
create temporary table t3_sem on commit drop as
select r.* from t3_sem_raw r join t3_dist d on d.entity_id=r.spot_id where d.eligible order by r.semantic_rank;
create temporary table t3_fallback(
  fallback_order integer generated always as identity, spot_id uuid, name text, city text,
  category_name text, similarity numeric, document_text text
) on commit drop;
insert into t3_fallback(spot_id,name,city,category_name,similarity,document_text)
select c.id,c.name,p.city,c.category_name,0,'Distribution-safe alternative candidate'
from public.distribution_trust_spot_catalog_v1(null,'Sparseville',48,'decision') c
join public.spots p on p.id=c.id
where not exists(select 1 from t3_v12 v where v.spot_id=c.id)
  and not exists(select 1 from t3_sem s where s.spot_id=c.id)
limit greatest(0,16-(select count(distinct spot_id) from (select spot_id from t3_v12 union select spot_id from t3_sem) u));
insert into t3_fallback(spot_id,name,city,category_name,similarity,document_text)
select c.id,c.name,p.city,c.category_name,0,'Distribution-safe alternative candidate'
from public.distribution_trust_spot_catalog_v1(null,null,48,'decision') c
join public.spots p on p.id=c.id
where not exists(select 1 from t3_v12 v where v.spot_id=c.id)
  and not exists(select 1 from t3_sem s where s.spot_id=c.id)
  and not exists(select 1 from t3_fallback f where f.spot_id=c.id)
limit greatest(0,16-(select count(distinct spot_id) from (select spot_id from t3_v12 union select spot_id from t3_sem) u)-(select count(*) from t3_fallback));
create temporary table t3_fallback_dist on commit drop as
select * from public.distribution_trust_filter_entities_v1(
  'spot',array(select spot_id from t3_fallback),'decision'
);

-- Controlled local SQL timing samples. These are mechanics baselines, not Production latency.
select pg_temp.d02_actor((select id from d02_ids where key='user_strong'));
create temporary table d02_perf(component text, milliseconds numeric) on commit drop;
do $$
declare
  i integer;
  started_at timestamptz;
  elapsed numeric;
begin
  for i in 1..20 loop
    started_at := clock_timestamp();
    perform * from public.backyrd_get_context_keys_for_decision_v1(
      'Basel','lively','friends','{"audience":["friends"],"place_types":["bar"]}'::jsonb
    );
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('context_rpc',elapsed);

    started_at := clock_timestamp();
    perform * from public.backyrd_get_my_place_type_profile_v1(null,100);
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('place_type_profile_rpc',elapsed);

    started_at := clock_timestamp();
    perform * from public.backyrd_get_my_contextual_taste_v1(
      array['global','category:bar','situation:friends','category_situation:bar+friends'],160
    );
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('contextual_taste_rpc',elapsed);

    started_at := clock_timestamp();
    perform * from public.backyrd_get_recent_decision_memory_v1(48,220);
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('recent_memory_rpc',elapsed);

    started_at := clock_timestamp();
    perform * from public.backyrd_get_decision_spots_v12(
      'Basel',null,'Bar Drinks Cocktails lebhaft mit Freunden',16,1,0,.52,.055,'lively','friends'
    );
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('v12_rpc_including_persistence',elapsed);

    started_at := clock_timestamp();
    perform * from public.backyrd_match_spot_embeddings_v13(pg_temp.d02_vector(.20,1,.05),'Basel',24,'{}');
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('semantic_rpc',elapsed);

    started_at := clock_timestamp();
    perform * from public.distribution_trust_filter_entities_v1(
      'spot',array(select id from d02_ids where key in ('hearth_cafe','riverside_wine','pulse_bar','night_owl','garden_bistro','kunsthaus','maker_lab','cellar_bar')),'decision'
    );
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('distribution_rpc',elapsed);

    started_at := clock_timestamp();
    perform s.id,s.name,s.city,c.name from public.spots s left join public.categories c on c.id=s.category_id
      where s.id=any(array(select id from d02_ids where key in ('hearth_cafe','riverside_wine','pulse_bar','night_owl','garden_bistro','kunsthaus','maker_lab','cellar_bar')));
    elapsed := extract(epoch from clock_timestamp()-started_at)*1000;
    insert into d02_perf values ('metadata_fetch_sql',elapsed);
  end loop;
end;
$$;

select jsonb_build_object(
  'environment',jsonb_build_object('kind','disposable local Supabase','data','synthetic','production_mutation',false),
  'performance',jsonb_build_object(
    'note','20-sample disposable-local SQL baseline; Fusion timing is added by the actual-code Node harness; no Production latency claim.',
    'sql',(select jsonb_object_agg(component,jsonb_build_object(
      'samples',samples,'median_ms',median_ms,'p95_ms',p95_ms,'max_ms',max_ms
    )) from (
      select component,count(*) samples,
        percentile_cont(.5) within group(order by milliseconds) median_ms,
        percentile_cont(.95) within group(order by milliseconds) p95_ms,
        max(milliseconds) max_ms
      from d02_perf group by component order by component
    ) p)
  ),
  'traces',jsonb_build_array(
    jsonb_build_object(
      'name','trace_1_cold',
      'request',jsonb_build_object(
        'city','Basel','moodA','cozy','moodB','romantic',
        'query','Date cozy nicht teuer Freitagabend Drinks danach',
        'preferredPlaceTypes',jsonb_build_array('bar','cafe'),
        'audience',jsonb_build_array('date'),'occasions',jsonb_build_array('friday_evening'),
        'strictCategoryIntent',true,'limit',16
      ),
      'v12',(select coalesce(jsonb_agg(to_jsonb(v)-'v12_rank' order by v12_rank),'[]') from t1_v12 v),
      'semantic',(
        select coalesce(jsonb_agg(x.payload order by x.ord),'[]') from (
          select semantic_rank::numeric ord,to_jsonb(s)-'semantic_rank' payload from t1_sem s
          union all select 1000+fallback_order,to_jsonb(f)-'fallback_order' from t1_fallback f
        ) x
      ),
      'placeTypeProfile',jsonb_build_object('global','[]'::jsonb,'context','[]'::jsonb),
      'contextualTaste','[]'::jsonb,'recentMemory','[]'::jsonb,
      'distributionPriority',(select coalesce(jsonb_object_agg(entity_id::text,distribution_priority),'{}') from (select * from t1_dist union all select * from t1_fallback_dist) d where eligible),
      'evidence',jsonb_build_object(
        'user_state',jsonb_build_object('feature_weights',0,'contextual_taste',0,'recent_memory',0),
        'v12_raw',(select coalesce(jsonb_agg(to_jsonb(v) order by v12_rank),'[]') from t1_v12_raw v),
        'semantic_raw',(select coalesce(jsonb_agg(to_jsonb(s) order by semantic_rank),'[]') from t1_sem_raw s),
        'distribution',(select coalesce(jsonb_agg(to_jsonb(d) order by distribution_priority desc,entity_id),'[]') from t1_dist d),
        'fallback',(select coalesce(jsonb_agg(to_jsonb(f) order by fallback_order),'[]') from t1_fallback f),
        'recommendation_run',(select to_jsonb(r) from t1_run r),
        'recommendation_items',(select coalesce(jsonb_agg(to_jsonb(i) order by rank),'[]') from public.backyrd_recommendation_run_items_v1 i where i.run_id=(select id from t1_run)),
        'spot_documents',(select jsonb_agg(to_jsonb(x)) from (select b.spot_id,b.document_text,b.document_json,b.source_hash from public.backyrd_build_spot_ml_document_v13((select id from d02_ids where key='hearth_cafe')) b union all select b.spot_id,b.document_text,b.document_json,b.source_hash from public.backyrd_build_spot_ml_document_v13((select id from d02_ids where key='garden_bistro')) b) x)
      )
    ),
    jsonb_build_object(
      'name','trace_2_personalization_conflict',
      'request',jsonb_build_object(
        'city','Basel','moodA','lively','moodB','friends',
        'query','Bar Drinks Cocktails lebhaft mit Freunden',
        'preferredPlaceTypes',jsonb_build_array('bar'),'audience',jsonb_build_array('friends'),
        'strictCategoryIntent',true,'limit',16
      ),
      'v12',(select coalesce(jsonb_agg(to_jsonb(v)-'v12_rank' order by v12_rank),'[]') from t2_v12 v),
      'semantic',(
        select coalesce(jsonb_agg(x.payload order by x.ord),'[]') from (
          select semantic_rank::numeric ord,to_jsonb(s)-'semantic_rank' payload from t2_sem s
          union all select 1000+fallback_order,to_jsonb(f)-'fallback_order' from t2_fallback f
        ) x
      ),
      'placeTypeProfile',jsonb_build_object(
        'global',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from t2_profile_global p),
        'context',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from t2_profile_context p)
      ),
      'contextualTaste',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from t2_contextual_taste t),
      'recentMemory',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from t2_recent_memory m),
      'distributionPriority',(select coalesce(jsonb_object_agg(entity_id::text,distribution_priority),'{}') from (select * from t2_dist union all select * from t2_fallback_dist) d where eligible),
      'evidence',jsonb_build_object(
        'taste_state',(select jsonb_agg(to_jsonb(w) order by abs(weight) desc) from public.backyrd_user_feature_weights_v1 w where user_id=(select id from d02_ids where key='user_strong')),
        'auth_probe',(select to_jsonb(a) from t2_auth_probe a),
        'v12_raw',(select coalesce(jsonb_agg(to_jsonb(v) order by v12_rank),'[]') from t2_v12_raw v),
        'semantic_raw',(select coalesce(jsonb_agg(to_jsonb(s) order by semantic_rank),'[]') from t2_sem_raw s),
        'distribution',(select coalesce(jsonb_agg(to_jsonb(d) order by distribution_priority desc,entity_id),'[]') from t2_dist d),
        'fallback',(select coalesce(jsonb_agg(to_jsonb(f) order by fallback_order),'[]') from t2_fallback f),
        'recommendation_run',(select to_jsonb(r) from t2_run r),
        'recommendation_items',(select coalesce(jsonb_agg(to_jsonb(i) order by rank),'[]') from public.backyrd_recommendation_run_items_v1 i where i.run_id=(select id from t2_run))
      )
    ),
    jsonb_build_object(
      'name','trace_3_sparse',
      'request',jsonb_build_object(
        'city','Sparseville','moodA','unusual','moodB','indoor',
        'query','Etwas ungewöhnliches, drinnen, allein, kein Essen, Sonntag Nachmittag',
        'preferredPlaceTypes',jsonb_build_array(),'audience',jsonb_build_array('solo'),
        'strictCategoryIntent',false,'limit',16
      ),
      'v12',(select coalesce(jsonb_agg(to_jsonb(v)-'v12_rank' order by v12_rank),'[]') from t3_v12 v),
      'semantic',(
        select coalesce(jsonb_agg(x.payload order by x.ord),'[]') from (
          select semantic_rank::numeric ord,to_jsonb(s)-'semantic_rank' payload from t3_sem s
          union all select 1000+fallback_order,to_jsonb(f)-'fallback_order' from t3_fallback f
        ) x
      ),
      'placeTypeProfile',jsonb_build_object('global','[]'::jsonb,'context','[]'::jsonb),
      'contextualTaste','[]'::jsonb,'recentMemory','[]'::jsonb,
      'distributionPriority',(select coalesce(jsonb_object_agg(entity_id::text,distribution_priority),'{}') from (select * from t3_dist union all select * from t3_fallback_dist) d where eligible),
      'evidence',jsonb_build_object(
        'v12_raw',(select coalesce(jsonb_agg(to_jsonb(v) order by v12_rank),'[]') from t3_v12_raw v),
        'semantic_raw',(select coalesce(jsonb_agg(to_jsonb(s) order by semantic_rank),'[]') from t3_sem_raw s),
        'distribution',(select coalesce(jsonb_agg(to_jsonb(d) order by distribution_priority desc,entity_id),'[]') from t3_dist d),
        'fallback',(select coalesce(jsonb_agg(to_jsonb(f) order by fallback_order),'[]') from t3_fallback f),
        'recommendation_run',(select to_jsonb(r) from t3_run r),
        'recommendation_items',(select coalesce(jsonb_agg(to_jsonb(i) order by rank),'[]') from public.backyrd_recommendation_run_items_v1 i where i.run_id=(select id from t3_run)),
        'spot_documents',(select jsonb_agg(to_jsonb(x)) from (select b.spot_id,b.document_text,b.document_json,b.source_hash from public.backyrd_build_spot_ml_document_v13((select id from d02_ids where key='cabinet')) b union all select b.spot_id,b.document_text,b.document_json,b.source_hash from public.backyrd_build_spot_ml_document_v13((select id from d02_ids where key='silent_puzzle')) b) x)
      )
    )
  )
)::text;

rollback;
