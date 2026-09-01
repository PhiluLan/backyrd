-- Backyrd canonical Product Mood V1.
-- Truth domain: COMMUNITY_PERCEPTION — "How does this place feel?"
-- This migration intentionally does not write N4, Gold, Offering/Purpose or User Taste.

create table public.backyrd_mood_clusters_v1 (
  cluster_key text primary key check (cluster_key ~ '^mood_cluster\.[a-z0-9_]+$'),
  canonical_label text not null check (char_length(btrim(canonical_label)) between 2 and 40),
  display_labels jsonb not null default '{}'::jsonb check (jsonb_typeof(display_labels) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.backyrd_mood_concepts_v1 (
  concept_key text primary key check (concept_key ~ '^mood\.[a-z0-9_]+$'),
  canonical_label text not null check (char_length(btrim(canonical_label)) between 2 and 40),
  display_labels jsonb not null default '{}'::jsonb check (jsonb_typeof(display_labels) = 'object'),
  cluster_key text references public.backyrd_mood_clusters_v1(cluster_key) on update cascade on delete set null,
  active boolean not null default true,
  merged_into_concept_key text references public.backyrd_mood_concepts_v1(concept_key) on update cascade on delete restrict,
  creation_origin text not null default 'INITIAL_PRODUCT_SET'
    check (creation_origin in ('INITIAL_PRODUCT_SET','LEGACY_RECONCILIATION','ADMIN_APPROVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((active and merged_into_concept_key is null) or (not active)),
  check (merged_into_concept_key is null or merged_into_concept_key <> concept_key)
);

create unique index backyrd_mood_concepts_v1_active_label_idx
  on public.backyrd_mood_concepts_v1 (lower(canonical_label)) where active;

create table public.backyrd_mood_aliases_v1 (
  normalized_expression text primary key,
  expression text not null check (char_length(btrim(expression)) between 2 and 40),
  concept_key text not null references public.backyrd_mood_concepts_v1(concept_key) on update cascade on delete restrict,
  locale text not null default 'und' check (char_length(locale) between 2 and 12),
  active boolean not null default true,
  origin text not null default 'INITIAL_PRODUCT_SET'
    check (origin in ('CANONICAL_LABEL','INITIAL_PRODUCT_SET','LEGACY_RECONCILIATION','ADMIN_APPROVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalized_expression = lower(btrim(normalized_expression)))
);

create index backyrd_mood_aliases_v1_concept_idx
  on public.backyrd_mood_aliases_v1(concept_key) where active;

create table public.backyrd_mood_blocked_expressions_v1 (
  normalized_expression text primary key,
  reason text not null check (reason in ('TEST_PLACEHOLDER','NOT_A_MOOD','ABUSE','GARBAGE')),
  source text not null default 'LEGACY_RECONCILIATION',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (normalized_expression = lower(btrim(normalized_expression)))
);

create table public.backyrd_review_mood_expressions_v1 (
  review_id uuid not null references public.reviews(id) on delete cascade,
  slot smallint not null check (slot in (1,2)),
  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  raw_expression text not null check (char_length(raw_expression) >= 1),
  normalized_expression text not null,
  resolution_status text not null check (resolution_status in ('RESOLVED','UNRESOLVED','INVALID')),
  concept_key text references public.backyrd_mood_concepts_v1(concept_key) on update cascade on delete restrict,
  resolution_kind text not null check (resolution_kind in ('EXACT','ALIAS','ADMIN','UNRESOLVED','INVALID','DUPLICATE_CONCEPT')),
  invalid_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (review_id,slot),
  check ((resolution_status = 'RESOLVED' and concept_key is not null and resolved_at is not null)
    or (resolution_status <> 'RESOLVED' and concept_key is null)),
  check ((resolution_status = 'INVALID' and invalid_reason is not null) or resolution_status <> 'INVALID')
);

create index backyrd_review_mood_expressions_spot_user_idx
  on public.backyrd_review_mood_expressions_v1(spot_id,user_id,created_at desc);
create index backyrd_review_mood_expressions_unresolved_idx
  on public.backyrd_review_mood_expressions_v1(normalized_expression,created_at desc)
  where resolution_status = 'UNRESOLVED';

create table public.backyrd_spot_mood_contributions_v1 (
  id uuid primary key default gen_random_uuid(),
  contributor_key uuid not null default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source_review_id uuid not null unique references public.reviews(id) on delete cascade,
  contributed_at timestamptz not null,
  eligible boolean not null default true,
  ineligibility_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((eligible and ineligibility_reason is null) or (not eligible and ineligibility_reason is not null))
);

create unique index backyrd_spot_mood_contributions_current_user_idx
  on public.backyrd_spot_mood_contributions_v1(spot_id,user_id) where user_id is not null;
create unique index backyrd_spot_mood_contributions_contributor_idx
  on public.backyrd_spot_mood_contributions_v1(spot_id,contributor_key);

create table public.backyrd_spot_mood_contribution_concepts_v1 (
  contribution_id uuid not null references public.backyrd_spot_mood_contributions_v1(id) on delete cascade,
  concept_key text not null references public.backyrd_mood_concepts_v1(concept_key) on update cascade on delete restrict,
  source_slot smallint not null check (source_slot in (1,2)),
  created_at timestamptz not null default now(),
  primary key (contribution_id,concept_key),
  unique (contribution_id,source_slot)
);

create index backyrd_spot_mood_contribution_concepts_concept_idx
  on public.backyrd_spot_mood_contribution_concepts_v1(concept_key,contribution_id);

create table public.backyrd_spot_mood_profile_v1 (
  spot_id uuid not null references public.spots(id) on delete cascade,
  concept_key text not null references public.backyrd_mood_concepts_v1(concept_key) on update cascade on delete restrict,
  concept_contributors integer not null check (concept_contributors > 0),
  eligible_contributors integer not null check (eligible_contributors > 0),
  percentage numeric(5,2) not null check (percentage > 0 and percentage <= 100),
  evidence_state text not null check (evidence_state in ('EARLY','ESTABLISHED')),
  rank integer not null check (rank > 0),
  rebuilt_at timestamptz not null default now(),
  primary key (spot_id,concept_key),
  unique (spot_id,rank),
  check (concept_contributors <= eligible_contributors)
);

create index backyrd_spot_mood_profile_v1_spot_rank_idx
  on public.backyrd_spot_mood_profile_v1(spot_id,rank);

create table public.backyrd_mood_governance_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('MAP_ALIAS','CREATE_CONCEPT','MARK_INVALID','MERGE_CONCEPT')),
  normalized_expression text,
  source_concept_key text,
  target_concept_key text,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

insert into public.backyrd_mood_clusters_v1(cluster_key,canonical_label,display_labels) values
 ('mood_cluster.comfort','Comfort',jsonb_build_object('de','Wohlgefühl','en','Comfort')),
 ('mood_cluster.energy','Energy',jsonb_build_object('de','Energie','en','Energy')),
 ('mood_cluster.style','Style',jsonb_build_object('de','Stil','en','Style')),
 ('mood_cluster.character','Character',jsonb_build_object('de','Charakter','en','Character')),
 ('mood_cluster.discovery','Discovery',jsonb_build_object('de','Entdeckung','en','Discovery')),
 ('mood_cluster.atmosphere','Atmosphere',jsonb_build_object('de','Atmosphäre','en','Atmosphere'));

insert into public.backyrd_mood_concepts_v1(concept_key,canonical_label,display_labels,cluster_key,creation_origin) values
 ('mood.cozy','Gemütlich',jsonb_build_object('de','Gemütlich','en','Cozy'),'mood_cluster.comfort','INITIAL_PRODUCT_SET'),
 ('mood.relaxed','Entspannt',jsonb_build_object('de','Entspannt','en','Relaxed'),'mood_cluster.comfort','LEGACY_RECONCILIATION'),
 ('mood.intimate','Intim',jsonb_build_object('de','Intim','en','Intimate'),'mood_cluster.comfort','LEGACY_RECONCILIATION'),
 ('mood.lively','Lebendig',jsonb_build_object('de','Lebendig','en','Lively'),'mood_cluster.energy','INITIAL_PRODUCT_SET'),
 ('mood.loud','Laut',jsonb_build_object('de','Laut','en','Loud'),'mood_cluster.energy','INITIAL_PRODUCT_SET'),
 ('mood.quiet','Ruhig',jsonb_build_object('de','Ruhig','en','Quiet'),'mood_cluster.energy','INITIAL_PRODUCT_SET'),
 ('mood.romantic','Romantisch',jsonb_build_object('de','Romantisch','en','Romantic'),'mood_cluster.atmosphere','INITIAL_PRODUCT_SET'),
 ('mood.warm','Warm',jsonb_build_object('de','Warm','en','Warm'),'mood_cluster.atmosphere','LEGACY_RECONCILIATION'),
 ('mood.urban','Urban',jsonb_build_object('de','Urban','en','Urban'),'mood_cluster.style','INITIAL_PRODUCT_SET'),
 ('mood.modern','Modern',jsonb_build_object('de','Modern','en','Modern'),'mood_cluster.style','INITIAL_PRODUCT_SET'),
 ('mood.elegant','Elegant',jsonb_build_object('de','Elegant','en','Elegant'),'mood_cluster.style','LEGACY_RECONCILIATION'),
 ('mood.stylish','Stylish',jsonb_build_object('de','Stylish','en','Stylish'),'mood_cluster.style','LEGACY_RECONCILIATION'),
 ('mood.trendy','Trendy',jsonb_build_object('de','Trendy','en','Trendy'),'mood_cluster.style','LEGACY_RECONCILIATION'),
 ('mood.industrial','Industriell',jsonb_build_object('de','Industriell','en','Industrial'),'mood_cluster.style','LEGACY_RECONCILIATION'),
 ('mood.rustic','Rustikal',jsonb_build_object('de','Rustikal','en','Rustic'),'mood_cluster.character','INITIAL_PRODUCT_SET'),
 ('mood.classic','Klassisch',jsonb_build_object('de','Klassisch','en','Classic'),'mood_cluster.character','LEGACY_RECONCILIATION'),
 ('mood.authentic','Authentisch',jsonb_build_object('de','Authentisch','en','Authentic'),'mood_cluster.character','INITIAL_PRODUCT_SET'),
 ('mood.alternative','Alternativ',jsonb_build_object('de','Alternativ','en','Alternative'),'mood_cluster.character','LEGACY_RECONCILIATION'),
 ('mood.creative','Kreativ',jsonb_build_object('de','Kreativ','en','Creative'),'mood_cluster.character','LEGACY_RECONCILIATION'),
 ('mood.hidden','Versteckt',jsonb_build_object('de','Versteckt','en','Hidden'),'mood_cluster.discovery','INITIAL_PRODUCT_SET'),
 ('mood.instagrammable','Instagrammable',jsonb_build_object('de','Instagrammable','en','Instagrammable'),'mood_cluster.discovery','INITIAL_PRODUCT_SET'),
 ('mood.chill','Chillig',jsonb_build_object('de','Chillig','en','Chill'),'mood_cluster.comfort','INITIAL_PRODUCT_SET');

insert into public.backyrd_mood_aliases_v1(normalized_expression,expression,concept_key,locale,origin) values
 ('gemütlich','gemütlich','mood.cozy','de','CANONICAL_LABEL'),('gemuetlich','gemuetlich','mood.cozy','de','INITIAL_PRODUCT_SET'),
 ('cozy','cozy','mood.cozy','en','INITIAL_PRODUCT_SET'),('cosy','cosy','mood.cozy','en','INITIAL_PRODUCT_SET'),
 ('heimelig','heimelig','mood.cozy','de-CH','INITIAL_PRODUCT_SET'),
 ('entspannt','entspannt','mood.relaxed','de','CANONICAL_LABEL'),('relaxed','relaxed','mood.relaxed','en','INITIAL_PRODUCT_SET'),
 ('locker','locker','mood.relaxed','de','LEGACY_RECONCILIATION'),('lässig','lässig','mood.relaxed','de','LEGACY_RECONCILIATION'),
 ('intim','intim','mood.intimate','de','CANONICAL_LABEL'),('intimate','intimate','mood.intimate','en','INITIAL_PRODUCT_SET'),
 ('lebendig','lebendig','mood.lively','de','CANONICAL_LABEL'),('lebhaft','lebhaft','mood.lively','de','INITIAL_PRODUCT_SET'),
 ('belebt','belebt','mood.lively','de','INITIAL_PRODUCT_SET'),('lively','lively','mood.lively','en','INITIAL_PRODUCT_SET'),
 ('laut','laut','mood.loud','de','CANONICAL_LABEL'),('loud','loud','mood.loud','en','INITIAL_PRODUCT_SET'),
 ('ruhig','ruhig','mood.quiet','de','CANONICAL_LABEL'),('leise','leise','mood.quiet','de','INITIAL_PRODUCT_SET'),
 ('quiet','quiet','mood.quiet','en','INITIAL_PRODUCT_SET'),('romantisch','romantisch','mood.romantic','de','CANONICAL_LABEL'),
 ('romantic','romantic','mood.romantic','en','INITIAL_PRODUCT_SET'),('warm','warm','mood.warm','de','CANONICAL_LABEL'),
 ('urban','urban','mood.urban','und','CANONICAL_LABEL'),('modern','modern','mood.modern','und','CANONICAL_LABEL'),
 ('elegant','elegant','mood.elegant','und','CANONICAL_LABEL'),('chic','chic','mood.elegant','und','LEGACY_RECONCILIATION'),
 ('fancy','fancy','mood.elegant','en','LEGACY_RECONCILIATION'),('schick','schick','mood.elegant','de','LEGACY_RECONCILIATION'),
 ('stylish','stylish','mood.stylish','en','CANONICAL_LABEL'),('trendy','trendy','mood.trendy','und','CANONICAL_LABEL'),
 ('hipp','hipp','mood.trendy','de','LEGACY_RECONCILIATION'),('industrial','industrial','mood.industrial','en','CANONICAL_LABEL'),
 ('industriell','industriell','mood.industrial','de','INITIAL_PRODUCT_SET'),('rustikal','rustikal','mood.rustic','de','CANONICAL_LABEL'),
 ('urig','urig','mood.rustic','de-CH','LEGACY_RECONCILIATION'),('klassisch','klassisch','mood.classic','de','CANONICAL_LABEL'),
 ('classic','classic','mood.classic','en','INITIAL_PRODUCT_SET'),('authentisch','authentisch','mood.authentic','de','CANONICAL_LABEL'),
 ('authentic','authentic','mood.authentic','en','INITIAL_PRODUCT_SET'),('alternativ','alternativ','mood.alternative','de','CANONICAL_LABEL'),
 ('alternative','alternative','mood.alternative','en','INITIAL_PRODUCT_SET'),('kreativ','kreativ','mood.creative','de','CANONICAL_LABEL'),
 ('creative','creative','mood.creative','en','INITIAL_PRODUCT_SET'),('versteckt','versteckt','mood.hidden','de','CANONICAL_LABEL'),
 ('hidden','hidden','mood.hidden','en','INITIAL_PRODUCT_SET'),('hidden gem','hidden gem','mood.hidden','en','LEGACY_RECONCILIATION'),
 ('hidden gems','hidden gems','mood.hidden','en','LEGACY_RECONCILIATION'),('geheimtipp','geheimtipp','mood.hidden','de','LEGACY_RECONCILIATION'),
 ('instagrammable','instagrammable','mood.instagrammable','und','CANONICAL_LABEL'),('chillig','chillig','mood.chill','de','CANONICAL_LABEL'),
 ('chill','chill','mood.chill','en','INITIAL_PRODUCT_SET');

-- Approved grammatical forms used for free-text Decision query interpretation.
-- They remain deterministic aliases; they do not create a second Decision-only
-- synonym universe or imply that related-but-distinct concepts are identical.
insert into public.backyrd_mood_aliases_v1(normalized_expression,expression,concept_key,locale,origin) values
 ('gemütliche','gemütliche','mood.cozy','de','INITIAL_PRODUCT_SET'),
 ('gemütlicher','gemütlicher','mood.cozy','de','INITIAL_PRODUCT_SET'),
 ('gemütliches','gemütliches','mood.cozy','de','INITIAL_PRODUCT_SET'),
 ('gemütlichen','gemütlichen','mood.cozy','de','INITIAL_PRODUCT_SET'),
 ('heimelige','heimelige','mood.cozy','de-CH','INITIAL_PRODUCT_SET'),
 ('heimeliger','heimeliger','mood.cozy','de-CH','INITIAL_PRODUCT_SET'),
 ('heimeliges','heimeliges','mood.cozy','de-CH','INITIAL_PRODUCT_SET'),
 ('heimeligen','heimeligen','mood.cozy','de-CH','INITIAL_PRODUCT_SET'),
 ('urbaner','urbaner','mood.urban','de','INITIAL_PRODUCT_SET'),
 ('urbanes','urbanes','mood.urban','de','INITIAL_PRODUCT_SET'),
 ('urbanen','urbanen','mood.urban','de','INITIAL_PRODUCT_SET');

insert into public.backyrd_mood_blocked_expressions_v1(normalized_expression,reason) values
 ('a','TEST_PLACEHOLDER'),('b','TEST_PLACEHOLDER'),('i','TEST_PLACEHOLDER'),('l','TEST_PLACEHOLDER'),
 ('s','TEST_PLACEHOLDER'),('v','TEST_PLACEHOLDER'),('test','TEST_PLACEHOLDER'),('test a','TEST_PLACEHOLDER'),
 ('test b','TEST_PLACEHOLDER'),('test1','TEST_PLACEHOLDER'),('test2','TEST_PLACEHOLDER'),
 ('coffee','NOT_A_MOOD'),('kaffee','NOT_A_MOOD'),('breakfast','NOT_A_MOOD'),('cocktails','NOT_A_MOOD'),
 ('gute cocktails','NOT_A_MOOD'),('bier','NOT_A_MOOD'),('bierhalle','NOT_A_MOOD'),('brewery','NOT_A_MOOD'),
 ('brewpub','NOT_A_MOOD'),('burger','NOT_A_MOOD'),('craft beer','NOT_A_MOOD'),('pizza','NOT_A_MOOD'),
 ('pubfood','NOT_A_MOOD'),('weinbar','NOT_A_MOOD'),('italienisch','NOT_A_MOOD'),('fine dining','NOT_A_MOOD'),
 ('gault millau','NOT_A_MOOD'),('gourmet','NOT_A_MOOD'),('afterwork','NOT_A_MOOD'),('apero','NOT_A_MOOD'),
 ('date','NOT_A_MOOD'),('date night','NOT_A_MOOD'),('datenight','NOT_A_MOOD'),('homeoffice','NOT_A_MOOD'),
 ('klettern','NOT_A_MOOD'),('tanzen','NOT_A_MOOD'),('rugby','NOT_A_MOOD'),('kultur','NOT_A_MOOD'),
 ('kids','NOT_A_MOOD'),('für kinder','NOT_A_MOOD'),('mit kindern','NOT_A_MOOD'),('für familien','NOT_A_MOOD'),
 ('grosse gruppen','NOT_A_MOOD'),('günstig','NOT_A_MOOD'),('preiswert','NOT_A_MOOD'),('aussicht','NOT_A_MOOD'),
 ('rooftop','NOT_A_MOOD'),('basel','NOT_A_MOOD'),('chf 20','NOT_A_MOOD'),('open late','NOT_A_MOOD');

create or replace function public.backyrd_normalize_mood_expression_v1(p_input text)
returns text language sql immutable parallel safe set search_path = pg_catalog as $$
  select lower(regexp_replace(btrim(normalize(coalesce(p_input,''), NFC)), '\s+', ' ', 'g'))
$$;

create or replace function public.backyrd_resolve_mood_input_v2(p_input text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_raw text := btrim(normalize(coalesce(p_input,''), NFC));
  v_norm text := public.backyrd_normalize_mood_expression_v1(p_input);
  v_alias public.backyrd_mood_aliases_v1%rowtype;
  v_concept public.backyrd_mood_concepts_v1%rowtype;
  v_reason text;
begin
  if v_raw = '' then
    return jsonb_build_object('status','INVALID','normalizedExpression',v_norm,'reason','EMPTY','contractVersion','backyrd-product-mood-v2');
  end if;
  if char_length(v_raw) > 40 then
    return jsonb_build_object('status','INVALID','normalizedExpression',v_norm,'reason','TOO_LONG','contractVersion','backyrd-product-mood-v2');
  end if;
  if v_raw ~ '[[:cntrl:]]' or v_norm ~ '(https?://|www\.|[[:alnum:]_.-]+@[[:alnum:]_.-]+\.[a-z]{2,})' then
    return jsonb_build_object('status','INVALID','normalizedExpression',v_norm,'reason','UNSAFE_FORMAT','contractVersion','backyrd-product-mood-v2');
  end if;
  select reason into v_reason from public.backyrd_mood_blocked_expressions_v1 where normalized_expression = v_norm;
  if found then
    return jsonb_build_object('status','INVALID','normalizedExpression',v_norm,'reason',v_reason,'contractVersion','backyrd-product-mood-v2');
  end if;
  select * into v_alias from public.backyrd_mood_aliases_v1 where normalized_expression = v_norm and active;
  if found then
    select * into v_concept from public.backyrd_mood_concepts_v1 where concept_key = v_alias.concept_key and active;
    if found then
      return jsonb_build_object(
        'status','RESOLVED','rawExpression',v_raw,'normalizedExpression',v_norm,
        'conceptKey',v_concept.concept_key,'label',v_concept.canonical_label,
        'displayLabels',v_concept.display_labels,'clusterKey',v_concept.cluster_key,
        'resolutionKind',case when v_alias.origin='CANONICAL_LABEL' then 'EXACT' else 'ALIAS' end,
        'contractVersion','backyrd-product-mood-v2'
      );
    end if;
  end if;
  return jsonb_build_object(
    'status','UNRESOLVED','rawExpression',v_raw,'normalizedExpression',v_norm,
    'resolutionKind','UNRESOLVED','contractVersion','backyrd-product-mood-v2'
  );
end $$;

-- Decision consumes the same governed aliases as Review Mood. Explicit Mood
-- fields are resolved first; free text then contributes at most two distinct
-- concepts. Non-Mood and unresolved language never becomes ranking authority.
create or replace function public.backyrd_resolve_decision_mood_query_v1(
  p_query text default null,
  p_mood_a text default null,
  p_mood_b text default null
)
returns table(concept_key text,label text,matched_expression text,match_source text)
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_input text;
  v_result jsonb;
  v_query text;
  v_alias record;
  v_seen text[] := '{}'::text[];
begin
  foreach v_input in array array[p_mood_a,p_mood_b] loop
    if nullif(btrim(coalesce(v_input,'')),'') is null then continue; end if;
    v_result := public.backyrd_resolve_mood_input_v2(v_input);
    if v_result->>'status' = 'RESOLVED' and not ((v_result->>'conceptKey') = any(v_seen)) then
      v_seen := array_append(v_seen,v_result->>'conceptKey');
      concept_key := v_result->>'conceptKey'; label := v_result->>'label';
      matched_expression := v_result->>'normalizedExpression'; match_source := 'EXPLICIT';
      return next;
    end if;
  end loop;

  if cardinality(v_seen) >= 2 or nullif(btrim(coalesce(p_query,'')),'') is null then return; end if;
  v_query := ' ' || regexp_replace(public.backyrd_normalize_mood_expression_v1(p_query),'[^[:alnum:]äöüß]+',' ','g') || ' ';
  v_query := regexp_replace(v_query,'\s+',' ','g');

  for v_alias in
    select a.normalized_expression,a.concept_key,c.canonical_label
    from public.backyrd_mood_aliases_v1 a
    join public.backyrd_mood_concepts_v1 c on c.concept_key=a.concept_key and c.active
    where a.active and position(' ' || a.normalized_expression || ' ' in v_query) > 0
      and position(' nicht ' || a.normalized_expression || ' ' in v_query) = 0
      and position(' nicht zu ' || a.normalized_expression || ' ' in v_query) = 0
      and position(' not ' || a.normalized_expression || ' ' in v_query) = 0
      and position(' no ' || a.normalized_expression || ' ' in v_query) = 0
      and position(' kein ' || a.normalized_expression || ' ' in v_query) = 0
      and position(' keine ' || a.normalized_expression || ' ' in v_query) = 0
      and position(' keinen ' || a.normalized_expression || ' ' in v_query) = 0
    order by char_length(a.normalized_expression) desc,a.normalized_expression,a.concept_key
  loop
    if not (v_alias.concept_key = any(v_seen)) then
      v_seen := array_append(v_seen,v_alias.concept_key);
      concept_key := v_alias.concept_key; label := v_alias.canonical_label;
      matched_expression := v_alias.normalized_expression; match_source := 'QUERY_ALIAS';
      return next;
      if cardinality(v_seen) >= 2 then return; end if;
    end if;
  end loop;
end $$;

-- Community Mood is a non-negative, evidence-gated feature. A requested Mood
-- absent from an ESTABLISHED profile contributes zero; no row means neutral.
create or replace function public.backyrd_decision_community_mood_signal_v1(
  p_spot_ids uuid[],
  p_query text default null,
  p_mood_a text default null,
  p_mood_b text default null
)
returns table(
  spot_id uuid,
  signal_strength numeric,
  matched_concepts jsonb,
  eligible_contributors integer
)
language sql stable security definer set search_path = public, pg_catalog as $$
  with requested as materialized (
    select * from public.backyrd_resolve_decision_mood_query_v1(p_query,p_mood_a,p_mood_b)
  ), requested_count as (
    select count(*)::numeric n from requested
  ), supported as (
    select p.spot_id,p.concept_key,p.percentage,p.eligible_contributors,r.label
    from public.backyrd_spot_mood_profile_v1 p
    join requested r using(concept_key)
    where p.spot_id = any(coalesce(p_spot_ids,'{}'::uuid[])) and p.evidence_state='ESTABLISHED'
  )
  select s.spot_id,
    least(1::numeric,sum(s.percentage) / (100 * rc.n))::numeric(7,6) signal_strength,
    jsonb_agg(jsonb_build_object('conceptKey',s.concept_key,'label',s.label,'percentage',s.percentage)
      order by s.percentage desc,s.concept_key) matched_concepts,
    min(s.eligible_contributors)::integer eligible_contributors
  from supported s cross join requested_count rc
  where rc.n > 0
  group by s.spot_id,rc.n
$$;

create or replace function public.backyrd_validate_review_mood_input_v2()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_result jsonb;
begin
  if new.data_origin in ('REAL','IMPORT') and new.review_origin in ('SMART_REVIEW','STANDARD_REVIEW','IMPORT') then
    new.mood_a := nullif(btrim(normalize(coalesce(new.mood_a,''), NFC)),'');
    new.mood_b := nullif(btrim(normalize(coalesce(new.mood_b,''), NFC)),'');
    if new.mood_a is not null then
      v_result := public.backyrd_resolve_mood_input_v2(new.mood_a);
      if v_result->>'reason' in ('TOO_LONG','UNSAFE_FORMAT') then raise exception 'invalid_mood_a_%',lower(v_result->>'reason') using errcode='22023'; end if;
    end if;
    if new.mood_b is not null then
      v_result := public.backyrd_resolve_mood_input_v2(new.mood_b);
      if v_result->>'reason' in ('TOO_LONG','UNSAFE_FORMAT') then raise exception 'invalid_mood_b_%',lower(v_result->>'reason') using errcode='22023'; end if;
    end if;
    new.mood_a_id := null;
    new.mood_b_id := null;
  end if;
  return new;
end $$;

create or replace function public.backyrd_rebuild_spot_mood_profile_v1(p_spot_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if p_spot_id is null then return; end if;
  delete from public.backyrd_spot_mood_profile_v1 where spot_id = p_spot_id;
  insert into public.backyrd_spot_mood_profile_v1(
    spot_id,concept_key,concept_contributors,eligible_contributors,percentage,evidence_state,rank,rebuilt_at
  )
  with eligible as (
    select c.id from public.backyrd_spot_mood_contributions_v1 c
    where c.spot_id = p_spot_id and c.eligible
      and exists (select 1 from public.backyrd_spot_mood_contribution_concepts_v1 cc where cc.contribution_id = c.id)
  ), denominator as (
    select count(*)::integer value from eligible
  ), counts as (
    select cc.concept_key,count(*)::integer concept_contributors
    from eligible e join public.backyrd_spot_mood_contribution_concepts_v1 cc on cc.contribution_id=e.id
    group by cc.concept_key
  ), ranked as (
    select counts.*,denominator.value eligible_contributors,
      round(100.0 * counts.concept_contributors / denominator.value,2) percentage,
      row_number() over(order by counts.concept_contributors desc,counts.concept_key asc)::integer rank
    from counts cross join denominator where denominator.value > 0
  )
  select p_spot_id,concept_key,concept_contributors,eligible_contributors,percentage,
    case when eligible_contributors >= 3 then 'ESTABLISHED' else 'EARLY' end,rank,now()
  from ranked;
end $$;

create or replace function public.backyrd_refresh_current_mood_contribution_v1(p_user_id uuid,p_spot_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_review record; v_contribution_id uuid; v_existing_key uuid;
begin
  if p_user_id is null or p_spot_id is null then return; end if;
  select r.id,r.created_at into v_review
  from public.reviews r
  where r.user_id=p_user_id and r.spot_id=p_spot_id and r.data_origin not in ('TEST','FIXTURE')
    and exists (
      select 1 from public.backyrd_review_mood_expressions_v1 e
      join public.backyrd_mood_concepts_v1 c on c.concept_key=e.concept_key and c.active
      where e.review_id=r.id and e.resolution_status='RESOLVED'
    )
    and not exists (
      select 1 from public.safety_content_items sci
      where sci.entity_type='review' and sci.entity_id=r.id
        and sci.lifecycle_status in ('hidden','removed','deleted')
    )
    and public.distribution_trust_entity_is_eligible_v1('review',r.id,'feed')
  order by r.created_at desc,r.id desc limit 1;

  select contributor_key into v_existing_key from public.backyrd_spot_mood_contributions_v1
    where spot_id=p_spot_id and user_id=p_user_id for update;

  if v_review.id is null then
    delete from public.backyrd_spot_mood_contributions_v1 where spot_id=p_spot_id and user_id=p_user_id;
    perform public.backyrd_rebuild_spot_mood_profile_v1(p_spot_id);
    return;
  end if;

  insert into public.backyrd_spot_mood_contributions_v1(
    contributor_key,spot_id,user_id,source_review_id,contributed_at,eligible,ineligibility_reason,updated_at
  ) values (coalesce(v_existing_key,gen_random_uuid()),p_spot_id,p_user_id,v_review.id,v_review.created_at,true,null,now())
  on conflict (spot_id,user_id) where user_id is not null do update set
    source_review_id=excluded.source_review_id,contributed_at=excluded.contributed_at,
    eligible=true,ineligibility_reason=null,updated_at=now()
  returning id into v_contribution_id;

  delete from public.backyrd_spot_mood_contribution_concepts_v1 where contribution_id=v_contribution_id;
  insert into public.backyrd_spot_mood_contribution_concepts_v1(contribution_id,concept_key,source_slot)
  select v_contribution_id,e.concept_key,min(e.slot)
  from public.backyrd_review_mood_expressions_v1 e
  join public.backyrd_mood_concepts_v1 c on c.concept_key=e.concept_key and c.active
  where e.review_id=v_review.id and e.resolution_status='RESOLVED'
  group by e.concept_key order by min(e.slot) limit 2;

  perform public.backyrd_rebuild_spot_mood_profile_v1(p_spot_id);
end $$;

create or replace function public.backyrd_sync_review_mood_expressions_v1()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_review public.reviews%rowtype; v_slot smallint; v_raw text; v_result jsonb; v_first_concept text;
begin
  if tg_op='DELETE' then
    perform public.backyrd_refresh_current_mood_contribution_v1(old.user_id,old.spot_id);
    perform public.backyrd_rebuild_spot_mood_profile_v1(old.spot_id);
    return old;
  end if;
  v_review := new;
  delete from public.backyrd_review_mood_expressions_v1 where review_id=new.id;
  for v_slot in 1..2 loop
    v_raw := case when v_slot=1 then new.mood_a else new.mood_b end;
    if nullif(btrim(coalesce(v_raw,'')),'') is null then continue; end if;
    v_result := public.backyrd_resolve_mood_input_v2(v_raw);
    insert into public.backyrd_review_mood_expressions_v1(
      review_id,slot,spot_id,user_id,raw_expression,normalized_expression,resolution_status,
      concept_key,resolution_kind,invalid_reason,resolved_at,updated_at
    ) values (
      new.id,v_slot,new.spot_id,new.user_id,v_raw,v_result->>'normalizedExpression',v_result->>'status',
      nullif(v_result->>'conceptKey',''),coalesce(v_result->>'resolutionKind',case when v_result->>'status'='INVALID' then 'INVALID' else 'UNRESOLVED' end),
      case when v_result->>'status'='INVALID' then coalesce(v_result->>'reason','INVALID') else null end,
      case when v_result->>'status'='RESOLVED' then now() else null end,now()
    );
  end loop;
  select concept_key into v_first_concept from public.backyrd_review_mood_expressions_v1
    where review_id=new.id and slot=1 and resolution_status='RESOLVED';
  if v_first_concept is not null then
    update public.backyrd_review_mood_expressions_v1 set
      resolution_status='INVALID',concept_key=null,resolution_kind='DUPLICATE_CONCEPT',
      invalid_reason='DUPLICATE_CONCEPT',resolved_at=null,updated_at=now()
    where review_id=new.id and slot=2 and resolution_status='RESOLVED' and concept_key=v_first_concept;
  end if;
  if tg_op='UPDATE' and (old.user_id is distinct from new.user_id or old.spot_id is distinct from new.spot_id) then
    perform public.backyrd_refresh_current_mood_contribution_v1(old.user_id,old.spot_id);
  end if;
  perform public.backyrd_refresh_current_mood_contribution_v1(new.user_id,new.spot_id);
  return new;
end $$;

create or replace function public.backyrd_refresh_mood_for_safety_item_v1()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_review public.reviews%rowtype;
begin
  if new.entity_type='review' and new.entity_id is not null
     and (tg_op='INSERT' or old.lifecycle_status is distinct from new.lifecycle_status) then
    select * into v_review from public.reviews where id=new.entity_id;
    if found then perform public.backyrd_refresh_current_mood_contribution_v1(v_review.user_id,v_review.spot_id); end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_backyrd_validate_review_moods_v1 on public.reviews;
drop trigger if exists trg_reviews_agg_after_insert on public.reviews;
drop trigger if exists trg_reviews_agg_after_update on public.reviews;
drop trigger if exists trg_reviews_agg_after_delete on public.reviews;
drop trigger if exists trg_backyrd_validate_review_mood_input_v2 on public.reviews;
create trigger trg_backyrd_validate_review_mood_input_v2
before insert or update of mood_a,mood_b,mood_a_id,mood_b_id,data_origin,review_origin on public.reviews
for each row execute function public.backyrd_validate_review_mood_input_v2();
drop trigger if exists trg_backyrd_sync_review_mood_expressions_v1 on public.reviews;
create trigger trg_backyrd_sync_review_mood_expressions_v1
after insert or update of mood_a,mood_b,user_id,spot_id or delete on public.reviews
for each row execute function public.backyrd_sync_review_mood_expressions_v1();
drop trigger if exists trg_backyrd_refresh_mood_for_safety_item_v1 on public.safety_content_items;
drop trigger if exists trg_zz_backyrd_refresh_mood_for_safety_item_v1 on public.safety_content_items;
-- PostgreSQL fires same-event triggers alphabetically. Run after the existing
-- Safety/Distribution lifecycle triggers so eligibility observes their result.
create trigger trg_zz_backyrd_refresh_mood_for_safety_item_v1
after insert or update of lifecycle_status on public.safety_content_items
for each row execute function public.backyrd_refresh_mood_for_safety_item_v1();

-- Reconcile historical expressions without rewriting reviews.
insert into public.backyrd_review_mood_expressions_v1(
  review_id,slot,spot_id,user_id,raw_expression,normalized_expression,resolution_status,
  concept_key,resolution_kind,invalid_reason,resolved_at
)
select r.id,s.slot,r.spot_id,r.user_id,s.raw_expression,x.result->>'normalizedExpression',x.result->>'status',
  nullif(x.result->>'conceptKey',''),coalesce(x.result->>'resolutionKind',case when x.result->>'status'='INVALID' then 'INVALID' else 'UNRESOLVED' end),
  case when x.result->>'status'='INVALID' then coalesce(x.result->>'reason','INVALID') else null end,
  case when x.result->>'status'='RESOLVED' then now() else null end
from public.reviews r
cross join lateral (values (1::smallint,nullif(btrim(r.mood_a),'')),(2::smallint,nullif(btrim(r.mood_b),''))) s(slot,raw_expression)
cross join lateral (select public.backyrd_resolve_mood_input_v2(s.raw_expression) result) x
where s.raw_expression is not null
on conflict (review_id,slot) do nothing;

update public.backyrd_review_mood_expressions_v1 second set
  resolution_status='INVALID',concept_key=null,resolution_kind='DUPLICATE_CONCEPT',invalid_reason='DUPLICATE_CONCEPT',resolved_at=null
from public.backyrd_review_mood_expressions_v1 first
where first.review_id=second.review_id and first.slot=1 and second.slot=2
  and first.resolution_status='RESOLVED' and second.resolution_status='RESOLVED'
  and first.concept_key=second.concept_key;

do $$ declare r record; begin
  for r in select distinct user_id,spot_id from public.reviews where user_id is not null loop
    perform public.backyrd_refresh_current_mood_contribution_v1(r.user_id,r.spot_id);
  end loop;
end $$;

-- Deliberate least-privilege projection: callers receive only the masked view
-- and have no direct base-table access. The view owner can read the derived
-- table; its fixed projection never exposes contributor identity or EARLY
-- counts. Admin/service operations retain explicit base-table access.
create or replace view public.backyrd_spot_mood_profile_public_v1
with (security_barrier=true) as
select p.spot_id,p.concept_key,
  coalesce(c.display_labels->>'de',c.canonical_label) label,
  c.canonical_label,
  case when p.evidence_state='ESTABLISHED' then p.concept_contributors else null end concept_contributors,
  case when p.evidence_state='ESTABLISHED' then p.eligible_contributors else null end eligible_contributors,
  case when p.evidence_state='ESTABLISHED' then p.percentage else null end percentage,
  p.evidence_state,p.rank,p.rebuilt_at
from public.backyrd_spot_mood_profile_v1 p
join public.backyrd_mood_concepts_v1 c on c.concept_key=p.concept_key and c.active;

create or replace view public.backyrd_mood_unresolved_candidates_v1
with (security_invoker=true) as
select e.normalized_expression,min(e.raw_expression) sample_expression,count(*)::integer usage_count,
  count(distinct e.spot_id)::integer affected_spots,min(e.created_at) first_seen_at,max(e.created_at) last_seen_at
from public.backyrd_review_mood_expressions_v1 e
where e.resolution_status='UNRESOLVED'
group by e.normalized_expression
having count(*) >= 2;

create or replace function public.backyrd_search_mood_concepts_v1(
  p_query text default null,p_locale text default 'de',p_limit integer default 12
) returns table(concept_key text,label text,matched_expression text,match_type text,usage_count bigint)
language sql stable security invoker set search_path = public, pg_catalog as $$
  with input as (select public.backyrd_normalize_mood_expression_v1(p_query) q), usage as (
    select p.concept_key,sum(p.concept_contributors)::bigint count from public.backyrd_spot_mood_profile_v1 p group by p.concept_key
  ), matches as (
    select c.concept_key,coalesce(c.display_labels->>coalesce(nullif(p_locale,''),'de'),c.canonical_label) label,
      a.expression matched_expression,case when a.origin='CANONICAL_LABEL' then 'CANONICAL' else 'ALIAS' end match_type,
      coalesce(u.count,0) usage_count,
      case when i.q='' then 2 when a.normalized_expression=i.q then 0 when a.normalized_expression like i.q||'%' then 1 else 2 end match_rank
    from public.backyrd_mood_concepts_v1 c
    join public.backyrd_mood_aliases_v1 a on a.concept_key=c.concept_key and a.active
    cross join input i left join usage u on u.concept_key=c.concept_key
    where c.active and (i.q='' or a.normalized_expression like '%'||i.q||'%')
  )
  select distinct on (m.concept_key) m.concept_key,m.label,m.matched_expression,m.match_type,m.usage_count
  from matches m order by m.concept_key,m.match_rank,m.usage_count desc,m.matched_expression
  limit greatest(1,least(coalesce(p_limit,12),30))
$$;

create or replace function public.backyrd_rebuild_all_spot_mood_profiles_v1()
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare r record; v_count integer:=0;
begin
  if not public.is_admin_v1(auth.uid()) and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'admin_required' using errcode='42501';
  end if;
  delete from public.backyrd_spot_mood_profile_v1;
  for r in select distinct spot_id from public.backyrd_spot_mood_contributions_v1 loop
    perform public.backyrd_rebuild_spot_mood_profile_v1(r.spot_id); v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create or replace function public.backyrd_admin_merge_mood_concepts_v1(
  p_source_concept_key text,p_target_concept_key text,p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid:=auth.uid();v_affected_spots uuid[];v_spot uuid;
begin
  if v_uid is null or not public.is_admin_v1(v_uid) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_source_concept_key is null or p_target_concept_key is null or p_source_concept_key=p_target_concept_key then
    raise exception 'distinct_concepts_required' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'reason_required' using errcode='22023'; end if;
  if not exists(select 1 from public.backyrd_mood_concepts_v1 where concept_key=p_source_concept_key and active) or
     not exists(select 1 from public.backyrd_mood_concepts_v1 where concept_key=p_target_concept_key and active) then
    raise exception 'active_concepts_required' using errcode='22023';
  end if;
  select array_agg(distinct spot_id) into v_affected_spots
  from public.backyrd_review_mood_expressions_v1 where concept_key=p_source_concept_key;
  update public.backyrd_mood_aliases_v1 set concept_key=p_target_concept_key,updated_at=now()
    where concept_key=p_source_concept_key;
  update public.backyrd_review_mood_expressions_v1 set concept_key=p_target_concept_key,
    resolution_kind='ADMIN',resolved_at=now(),updated_at=now() where concept_key=p_source_concept_key;
  delete from public.backyrd_spot_mood_contribution_concepts_v1 source
    using public.backyrd_spot_mood_contribution_concepts_v1 target
    where source.contribution_id=target.contribution_id and source.concept_key=p_source_concept_key
      and target.concept_key=p_target_concept_key;
  update public.backyrd_spot_mood_contribution_concepts_v1 set concept_key=p_target_concept_key
    where concept_key=p_source_concept_key;
  update public.backyrd_mood_concepts_v1 set active=false,merged_into_concept_key=p_target_concept_key,updated_at=now()
    where concept_key=p_source_concept_key;
  foreach v_spot in array coalesce(v_affected_spots,'{}'::uuid[]) loop
    perform public.backyrd_rebuild_spot_mood_profile_v1(v_spot);
  end loop;
  insert into public.backyrd_mood_governance_audit_v1(actor_user_id,action,source_concept_key,target_concept_key,reason,metadata)
  values(v_uid,'MERGE_CONCEPT',p_source_concept_key,p_target_concept_key,btrim(p_reason),
    jsonb_build_object('sourceConceptKey',p_source_concept_key,'targetConceptKey',p_target_concept_key));
  return jsonb_build_object('ok',true,'sourceConceptKey',p_source_concept_key,'targetConceptKey',p_target_concept_key);
end $$;

create or replace function public.backyrd_admin_resolve_mood_candidate_v1(
  p_expression text,p_action text,p_concept_key text default null,
  p_new_concept_key text default null,p_new_label text default null,p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid:=auth.uid();v_norm text:=public.backyrd_normalize_mood_expression_v1(p_expression);r record;v_target text;
begin
  if v_uid is null or not public.is_admin_v1(v_uid) then raise exception 'admin_required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'reason_required' using errcode='22023'; end if;
  if upper(p_action)='CREATE_CONCEPT' then
    v_target:=p_new_concept_key;
    insert into public.backyrd_mood_concepts_v1(concept_key,canonical_label,display_labels,creation_origin,created_by)
    values(v_target,btrim(p_new_label),jsonb_build_object('de',btrim(p_new_label)),'ADMIN_APPROVED',v_uid);
  elsif upper(p_action)='MAP_ALIAS' then v_target:=p_concept_key;
  elsif upper(p_action)='MARK_INVALID' then v_target:=null;
  else raise exception 'unsupported_action' using errcode='22023'; end if;
  if v_target is not null then
    if not exists(select 1 from public.backyrd_mood_concepts_v1 where concept_key=v_target and active) then raise exception 'active_concept_required' using errcode='22023'; end if;
    if exists(select 1 from public.backyrd_mood_aliases_v1 where normalized_expression=v_norm and active and concept_key<>v_target) then
      raise exception 'alias_collision' using errcode='23505';
    end if;
    insert into public.backyrd_mood_aliases_v1(normalized_expression,expression,concept_key,locale,origin,created_by)
    values(v_norm,btrim(p_expression),v_target,'und','ADMIN_APPROVED',v_uid)
    on conflict(normalized_expression) do update set concept_key=excluded.concept_key,active=true,origin='ADMIN_APPROVED',created_by=v_uid,updated_at=now();
    delete from public.backyrd_mood_blocked_expressions_v1 where normalized_expression=v_norm;
    update public.backyrd_review_mood_expressions_v1 set resolution_status='RESOLVED',concept_key=v_target,
      resolution_kind='ADMIN',invalid_reason=null,resolved_at=now(),updated_at=now() where normalized_expression=v_norm;
  else
    insert into public.backyrd_mood_blocked_expressions_v1(normalized_expression,reason,source,created_by)
    values(v_norm,'NOT_A_MOOD','ADMIN',v_uid) on conflict(normalized_expression) do update set reason='NOT_A_MOOD',source='ADMIN',created_by=v_uid;
    update public.backyrd_review_mood_expressions_v1 set resolution_status='INVALID',concept_key=null,
      resolution_kind='INVALID',invalid_reason='ADMIN_INVALID',resolved_at=null,updated_at=now() where normalized_expression=v_norm;
  end if;
  for r in select distinct user_id,spot_id from public.backyrd_review_mood_expressions_v1 where normalized_expression=v_norm and user_id is not null loop
    perform public.backyrd_refresh_current_mood_contribution_v1(r.user_id,r.spot_id);
  end loop;
  insert into public.backyrd_mood_governance_audit_v1(actor_user_id,action,normalized_expression,target_concept_key,reason)
  values(v_uid,upper(p_action),v_norm,v_target,btrim(p_reason));
  return jsonb_build_object('ok',true,'normalizedExpression',v_norm,'status',case when v_target is null then 'INVALID' else 'RESOLVED' end,'conceptKey',v_target);
end $$;

alter table public.backyrd_mood_clusters_v1 enable row level security;
alter table public.backyrd_mood_concepts_v1 enable row level security;
alter table public.backyrd_mood_aliases_v1 enable row level security;
alter table public.backyrd_mood_blocked_expressions_v1 enable row level security;
alter table public.backyrd_review_mood_expressions_v1 enable row level security;
alter table public.backyrd_spot_mood_contributions_v1 enable row level security;
alter table public.backyrd_spot_mood_contribution_concepts_v1 enable row level security;
alter table public.backyrd_spot_mood_profile_v1 enable row level security;
alter table public.backyrd_mood_governance_audit_v1 enable row level security;

create policy backyrd_mood_clusters_public_read_v1 on public.backyrd_mood_clusters_v1 for select to anon,authenticated using(active);
create policy backyrd_mood_concepts_public_read_v1 on public.backyrd_mood_concepts_v1 for select to anon,authenticated using(active);
create policy backyrd_mood_aliases_public_read_v1 on public.backyrd_mood_aliases_v1 for select to anon,authenticated using(active);
create policy backyrd_spot_mood_profile_admin_read_v1 on public.backyrd_spot_mood_profile_v1 for select to authenticated using(public.is_admin_v1(auth.uid()));
create policy backyrd_review_mood_expressions_admin_read_v1 on public.backyrd_review_mood_expressions_v1 for select to authenticated using(public.is_admin_v1(auth.uid()));
create policy backyrd_mood_contributions_admin_read_v1 on public.backyrd_spot_mood_contributions_v1 for select to authenticated using(public.is_admin_v1(auth.uid()));
create policy backyrd_mood_contribution_concepts_admin_read_v1 on public.backyrd_spot_mood_contribution_concepts_v1 for select to authenticated using(public.is_admin_v1(auth.uid()));
create policy backyrd_mood_governance_audit_admin_read_v1 on public.backyrd_mood_governance_audit_v1 for select to authenticated using(public.is_admin_v1(auth.uid()));

revoke all on table public.backyrd_mood_clusters_v1,public.backyrd_mood_concepts_v1,public.backyrd_mood_aliases_v1,
  public.backyrd_mood_blocked_expressions_v1,public.backyrd_review_mood_expressions_v1,
  public.backyrd_spot_mood_contributions_v1,public.backyrd_spot_mood_contribution_concepts_v1,
  public.backyrd_spot_mood_profile_v1,public.backyrd_mood_governance_audit_v1 from public,anon,authenticated;
grant select on public.backyrd_mood_clusters_v1,public.backyrd_mood_concepts_v1,public.backyrd_mood_aliases_v1 to anon,authenticated;
grant select on public.backyrd_spot_mood_profile_v1 to authenticated;
grant select on public.backyrd_review_mood_expressions_v1,public.backyrd_spot_mood_contributions_v1,
  public.backyrd_spot_mood_contribution_concepts_v1,public.backyrd_mood_governance_audit_v1 to authenticated;
grant all on table public.backyrd_mood_clusters_v1,public.backyrd_mood_concepts_v1,public.backyrd_mood_aliases_v1,
  public.backyrd_mood_blocked_expressions_v1,public.backyrd_review_mood_expressions_v1,
  public.backyrd_spot_mood_contributions_v1,public.backyrd_spot_mood_contribution_concepts_v1,
  public.backyrd_spot_mood_profile_v1,public.backyrd_mood_governance_audit_v1 to service_role;

revoke all on public.backyrd_spot_mood_profile_public_v1,public.backyrd_mood_unresolved_candidates_v1 from public,anon,authenticated;
grant select on public.backyrd_spot_mood_profile_public_v1 to anon,authenticated,service_role;
grant select on public.backyrd_mood_unresolved_candidates_v1 to authenticated,service_role;

revoke execute on function public.backyrd_normalize_mood_expression_v1(text),public.backyrd_resolve_mood_input_v2(text),
  public.backyrd_resolve_decision_mood_query_v1(text,text,text),
  public.backyrd_decision_community_mood_signal_v1(uuid[],text,text,text),
  public.backyrd_validate_review_mood_input_v2(),public.backyrd_rebuild_spot_mood_profile_v1(uuid),
  public.backyrd_refresh_current_mood_contribution_v1(uuid,uuid),public.backyrd_sync_review_mood_expressions_v1(),
  public.backyrd_refresh_mood_for_safety_item_v1(),public.backyrd_search_mood_concepts_v1(text,text,integer),
  public.backyrd_rebuild_all_spot_mood_profiles_v1(),
  public.backyrd_admin_resolve_mood_candidate_v1(text,text,text,text,text,text),
  public.backyrd_admin_merge_mood_concepts_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.backyrd_resolve_mood_input_v2(text),public.backyrd_search_mood_concepts_v1(text,text,integer) to anon,authenticated,service_role;
grant execute on function public.backyrd_resolve_decision_mood_query_v1(text,text,text),
  public.backyrd_decision_community_mood_signal_v1(uuid[],text,text,text) to service_role;
grant execute on function public.backyrd_rebuild_all_spot_mood_profiles_v1(),
  public.backyrd_admin_resolve_mood_candidate_v1(text,text,text,text,text,text),
  public.backyrd_admin_merge_mood_concepts_v1(text,text,text) to authenticated,service_role;
grant execute on function public.backyrd_validate_review_mood_input_v2(),public.backyrd_rebuild_spot_mood_profile_v1(uuid),
  public.backyrd_refresh_current_mood_contribution_v1(uuid,uuid),public.backyrd_sync_review_mood_expressions_v1(),
  public.backyrd_refresh_mood_for_safety_item_v1() to service_role;

comment on table public.backyrd_review_mood_expressions_v1 is 'Preserved user Mood expressions with governed canonical resolution; never User Taste or objective Spot truth.';
comment on table public.backyrd_spot_mood_contributions_v1 is 'One current Community Mood perception per user and Spot. Historical reviews remain separate.';
comment on table public.backyrd_spot_mood_profile_v1 is 'Single canonical derived Product read model for current Community Spot Mood perception.';
