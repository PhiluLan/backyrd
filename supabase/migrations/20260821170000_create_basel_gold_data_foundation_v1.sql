-- Basel Gold Data Foundation v1
-- Data/provenance readiness only. No N3/N5/N6 or ranking semantics change.

-- ---------------------------------------------------------------------------
-- 1. Canonical data-origin boundary
-- ---------------------------------------------------------------------------

alter table public.spots add column if not exists data_origin text;
alter table public.reviews add column if not exists data_origin text;
alter table public.reviews add column if not exists review_origin text;
alter table public.backyrd_spot_intelligence_evidence_v1 add column if not exists data_origin text;

update public.spots set data_origin='LEGACY' where data_origin is null;
update public.spots set data_origin='FIXTURE' where id in (
  'c55972cf-9ca6-4133-8d9b-c6edc03b1e67','edb5435b-cbaf-40c2-850d-ba4dd3b4fc0c','d89765d4-75a9-4328-bea0-f71936380459','b6a7821d-39fb-44d1-a068-9afbe872057a',
  'cfa74c43-12d5-4895-b0b4-cc89ba3c1f6b','1466d63f-517c-46e3-b1a6-9e827ff95f4f','f11f1fd9-53f1-4724-a877-54aede23aafc','1af217f0-131e-408b-99e3-db333cc26e38',
  '9078e5ca-d3f4-49e9-93f0-1486b6bd8fc6','ef284062-52c4-413b-8c53-0c6c7f3b43d3','bd6c1f4c-b279-4863-a2d3-1d73e29bface','0d6e8e24-be6d-4fbd-a8af-3a093c3d7bfa',
  '6af880c0-215e-40b6-8a7e-8b7e68321afe','a6cd394c-1e8c-44ba-82de-0e48a36789fc','32384a20-3ab1-440d-9352-8e70b4f13796','e88e7ad6-276f-4bbc-a24f-bb648d162c87',
  'b8d65210-19b1-4dcd-9c37-32d72ad764df','98e25732-7723-40e9-ab92-2ebb18521b3b','adb07db7-8e83-484d-9f86-1080344f74d7','cafb40dc-3502-4ee9-9774-3dbfba1c454e',
  '347c6088-56f4-4001-b960-10ef0b20ea02','50db72b9-2a06-4a39-9f23-a9325ee78cdc','c8dfb9c2-143c-4317-8051-5ec8fb3ad1ab','0ebb970b-6026-46e0-b5b2-e1bb1125beda',
  'e4f9f3d5-a812-4345-844a-af383630271d','c474f944-3c68-403d-b677-d7845d3eab76','1d580d67-6297-4cd9-9300-a4eed652d1bc','51c77c7f-65ec-41b3-a6f0-b1994ae009cd',
  '45dc13d1-650f-448c-8809-73fc3cd9655b','13affe38-b268-4109-8c66-a7469f9823b7','5900a6c2-b8a7-4a7a-9360-f941739b7cee'
);

update public.reviews r set
  data_origin=case when s.data_origin='FIXTURE' then 'FIXTURE' else 'LEGACY' end,
  review_origin=case when s.data_origin='FIXTURE' then 'FIXTURE' else 'LEGACY' end
from public.spots s where s.id=r.spot_id and (r.data_origin is null or r.review_origin is null);

update public.backyrd_spot_intelligence_evidence_v1 e set data_origin=
  case when s.data_origin in ('FIXTURE','TEST') then s.data_origin else 'LEGACY' end
from public.spots s where s.id=e.spot_id and e.data_origin is null;

alter table public.spots alter column data_origin set default 'REAL';
alter table public.spots alter column data_origin set not null;
alter table public.reviews alter column data_origin set default 'REAL';
alter table public.reviews alter column data_origin set not null;
alter table public.reviews alter column review_origin set default 'STANDARD_REVIEW';
alter table public.reviews alter column review_origin set not null;
alter table public.backyrd_spot_intelligence_evidence_v1 alter column data_origin set default 'REAL';
alter table public.backyrd_spot_intelligence_evidence_v1 alter column data_origin set not null;

alter table public.spots drop constraint if exists spots_data_origin_check;
alter table public.spots add constraint spots_data_origin_check check(data_origin in ('REAL','FIXTURE','TEST','LEGACY','IMPORT'));
alter table public.reviews drop constraint if exists reviews_data_origin_check;
alter table public.reviews add constraint reviews_data_origin_check check(data_origin in ('REAL','FIXTURE','TEST','LEGACY','IMPORT'));
alter table public.reviews drop constraint if exists reviews_review_origin_check;
alter table public.reviews add constraint reviews_review_origin_check check(review_origin in ('SMART_REVIEW','STANDARD_REVIEW','LEGACY','IMPORT','FIXTURE'));
alter table public.backyrd_spot_intelligence_evidence_v1 drop constraint if exists backyrd_spot_intelligence_evidence_v1_data_origin_check;
alter table public.backyrd_spot_intelligence_evidence_v1 add constraint backyrd_spot_intelligence_evidence_v1_data_origin_check check(data_origin in ('REAL','FIXTURE','TEST','LEGACY','IMPORT'));

create index if not exists spots_data_origin_idx on public.spots(data_origin,status,city);
create index if not exists reviews_data_origin_idx on public.reviews(data_origin,review_origin,created_at);
create index if not exists backyrd_spot_evidence_origin_idx on public.backyrd_spot_intelligence_evidence_v1(data_origin,spot_id,status);

-- Authenticated Product clients can only create REAL Product reviews. Service
-- jobs must explicitly choose non-REAL origins. Existing legacy rows are left as-is.
create or replace function public.backyrd_assign_review_provenance_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.data_origin:='REAL';
    new.review_origin:=case when new.product_evidence_origin='smart_review_v1' then 'SMART_REVIEW' else 'STANDARD_REVIEW' end;
  elsif new.data_origin='REAL' and new.product_evidence_origin='smart_review_v1' then
    new.review_origin:='SMART_REVIEW';
  elsif new.review_origin='SMART_REVIEW' then
    new.product_evidence_origin:='smart_review_v1';
  end if;
  if new.review_origin='SMART_REVIEW' and new.product_evidence_origin is distinct from 'smart_review_v1' then
    raise exception 'smart_review_origin_contract_mismatch' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists trg_backyrd_assign_review_provenance_v1 on public.reviews;
create trigger trg_backyrd_assign_review_provenance_v1 before insert or update of data_origin,review_origin,product_evidence_origin
on public.reviews for each row execute function public.backyrd_assign_review_provenance_v1();

-- ---------------------------------------------------------------------------
-- 2. Controlled, versioned Product Mood vocabulary
-- ---------------------------------------------------------------------------

create table public.backyrd_product_mood_vocabulary_v1 (
  canonical_mood text primary key,
  display_label text not null,
  aliases text[] not null default '{}',
  semantic_concept text,
  semantic_direction smallint check(semantic_direction in (-1,1)),
  active boolean not null default true,
  contract_version text not null default 'backyrd-product-mood-vocabulary-v1',
  check(semantic_concept is not null or semantic_direction is null)
);

insert into public.mood_tokens(token,locale,valid,token_norm) values
 ('gemütlich','de-CH',true,'gemütlich'),('lebendig','de-CH',true,'lebendig'),
 ('romantisch','de-CH',true,'romantisch'),('laut','de-CH',true,'laut'),
 ('leise','de-CH',true,'leise'),('authentisch','de-CH',true,'authentisch'),
 ('versteckt','de-CH',true,'versteckt'),('urban','de-CH',true,'urban'),
 ('instagrammable','de-CH',true,'instagrammable'),('chillig','de-CH',true,'chillig'),
 ('rustikal','de-CH',true,'rustikal'),('modern','de-CH',true,'modern')
on conflict(token_norm) do update set valid=true;

insert into public.backyrd_product_mood_vocabulary_v1(canonical_mood,display_label,aliases,semantic_concept,semantic_direction) values
 ('gemütlich','gemütlich',array['gemuetlich','cozy','cosy'],'vibe.cozy',1),
 ('lebendig','lebendig',array['lively','lebhaft','belebt'],'vibe.lively',1),
 ('romantisch','romantisch',array['romantic'],'vibe.romantic',1),
 ('laut','laut',array['loud'],'vibe.lively',-1),
 ('leise','leise',array['ruhig','quiet'],'vibe.quiet',1),
 ('authentisch','authentisch',array['authentic'],'character.authentic_character',1),
 ('versteckt','versteckt',array['hidden'],'discovery.hidden_gem',1),
 ('urban','urban',array[]::text[],null,null),
 ('instagrammable','instagrammable',array[]::text[],null,null),
 ('chillig','chillig',array['chill'],null,null),
 ('rustikal','rustikal',array[]::text[],null,null),
 ('modern','modern',array[]::text[],'character.design_led',1)
on conflict(canonical_mood) do update set display_label=excluded.display_label,aliases=excluded.aliases,
 semantic_concept=excluded.semantic_concept,semantic_direction=excluded.semantic_direction,active=true,
 contract_version='backyrd-product-mood-vocabulary-v1';

create or replace function public.backyrd_resolve_product_mood_v1(p_input text)
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
  with normalized as (select lower(btrim(coalesce(p_input,''))) value), matched as (
    select v.* from public.backyrd_product_mood_vocabulary_v1 v, normalized n
    where v.active and (lower(v.canonical_mood)=n.value or n.value=any(v.aliases)) limit 1
  ), token as (
    select mt.id from public.mood_tokens mt join matched m on mt.token_norm=lower(m.canonical_mood)
    where mt.valid order by mt.id limit 1
  ) select case when exists(select 1 from matched) then jsonb_build_object(
      'valid',true,'canonicalMood',(select canonical_mood from matched),'displayLabel',(select display_label from matched),
      'moodTokenId',(select id from token),'semanticConcept',(select semantic_concept from matched),
      'semanticDirection',(select semantic_direction from matched),'contractVersion','backyrd-product-mood-vocabulary-v1')
    else jsonb_build_object('valid',false,'contractVersion','backyrd-product-mood-vocabulary-v1') end
$$;

create or replace function public.backyrd_validate_review_moods_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare a jsonb; b jsonb;
begin
  if new.data_origin in ('REAL','IMPORT') and new.review_origin in ('SMART_REVIEW','STANDARD_REVIEW','IMPORT') then
    if nullif(btrim(coalesce(new.mood_a,'')),'') is not null then
      a:=public.backyrd_resolve_product_mood_v1(new.mood_a);
      if not coalesce((a->>'valid')::boolean,false) then raise exception 'invalid_product_mood_a' using errcode='22023'; end if;
      new.mood_a:=a->>'canonicalMood'; new.mood_a_id:=(a->>'moodTokenId')::integer;
    else new.mood_a:=null; new.mood_a_id:=null; end if;
    if nullif(btrim(coalesce(new.mood_b,'')),'') is not null then
      b:=public.backyrd_resolve_product_mood_v1(new.mood_b);
      if not coalesce((b->>'valid')::boolean,false) then raise exception 'invalid_product_mood_b' using errcode='22023'; end if;
      new.mood_b:=b->>'canonicalMood'; new.mood_b_id:=(b->>'moodTokenId')::integer;
    else new.mood_b:=null; new.mood_b_id:=null; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_backyrd_validate_review_moods_v1 on public.reviews;
create trigger trg_backyrd_validate_review_moods_v1 before insert or update of mood_a,mood_b,mood_a_id,mood_b_id,data_origin,review_origin
on public.reviews for each row execute function public.backyrd_validate_review_moods_v1();

alter table public.backyrd_product_mood_vocabulary_v1 enable row level security;
create policy backyrd_product_mood_vocabulary_read_v1 on public.backyrd_product_mood_vocabulary_v1 for select to anon,authenticated using(active);
revoke all on table public.backyrd_product_mood_vocabulary_v1 from anon,authenticated;
grant select on table public.backyrd_product_mood_vocabulary_v1 to anon,authenticated,service_role;
revoke all on function public.backyrd_resolve_product_mood_v1(text),public.backyrd_assign_review_provenance_v1(),public.backyrd_validate_review_moods_v1() from public,anon;
grant execute on function public.backyrd_resolve_product_mood_v1(text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Basel Gold selection and explicit structured suitability source
-- ---------------------------------------------------------------------------

create table public.backyrd_basel_gold_spots_v1 (
  -- This migration carries the production-curated manifest. Local/CI databases
  -- intentionally do not seed production Spots, so referential validation is
  -- exposed by the readiness view instead of an environment-coupled FK.
  spot_id uuid primary key,
  selection_status text not null default 'SELECTED' check(selection_status in ('SELECTED','REMOVED')),
  coverage_bucket text not null,
  selection_reason text not null,
  selected_at timestamptz not null default now(),
  contract_version text not null default 'backyrd-basel-gold-set-v1'
);

insert into public.backyrd_basel_gold_spots_v1(spot_id,coverage_bucket,selection_reason) values
 ('5594d0b3-f5f1-465a-85de-db833ba64dda','RESTAURANT','verified admin source + category coverage'),
 ('288b0abc-1831-4cdb-9390-117e41a84de3','RESTAURANT','verified admin source + date coverage'),
 ('38995fe6-d59c-4a85-a451-d0329a718ab3','RESTAURANT','verified admin source + plant-based coverage'),
 ('f811788c-e994-4912-9784-c47274af02a7','RESTAURANT','verified admin source + broad occasion coverage'),
 ('3bc3ebdd-1a09-41c6-bdb2-855ee9bb9602','RESTAURANT','verified admin source + quiet/date coverage'),
 ('fe6f6795-3d29-42fb-9b1e-71cfe527434b','RESTAURANT','verified admin source + food experience coverage'),
 ('e6754a2d-f7bf-44ee-b2aa-276ecaa55b64','RESTAURANT','verified admin source + occasion coverage'),
 ('009b7d23-af2f-4c53-af2b-8bea0aae89bf','RESTAURANT','complete existing product facts'),
 ('605f7f86-32bc-46db-8b94-8e48601c4e97','RESTAURANT','complete existing product facts'),
 ('8dd00f81-3a83-42a6-b4cd-749637dbbf5b','RESTAURANT','complete existing product facts'),
 ('eaa0ef90-9899-4480-883d-c0659a7c426d','RESTAURANT','complete existing product facts'),
 ('cbcf0ca3-6f5b-4c58-a8aa-47678845d4a7','RESTAURANT','complete existing product facts'),
 ('c16f80e9-86db-4d60-8bdb-3cb3c95d8f4c','RESTAURANT','complete existing product facts'),
 ('da5d6b8b-3fa3-4982-b183-263378f83d0d','RESTAURANT','complete existing product facts'),
 ('19592839-0a45-4361-b532-4d3a35cec574','RESTAURANT','complete existing product facts'),
 ('a99874bb-f4ce-4dfe-a5ff-e24fb93c6226','RESTAURANT','complete existing product facts'),
 ('92741865-1bfe-4f79-a99b-9304b946d167','RESTAURANT','complete existing product facts'),
 ('1e71239c-acf3-4939-b51c-22681a2674aa','BAR','verified admin source + rooftop/night coverage'),
 ('7ad2fdc5-0a27-4f25-b9a5-4e01f1121b5f','BAR','verified admin source + date/night coverage'),
 ('7355270f-6207-4790-bc49-b9d53df5701d','BAR','verified admin source + nightlife coverage'),
 ('45ee2c4e-1f79-44c2-b32e-dc3f9d285daa','BAR','verified admin source + afterwork/date coverage'),
 ('13b1cbc5-ab34-4223-bbd3-f6a7aecd17c4','BAR','verified admin source + culture/music coverage'),
 ('b7318e56-5f26-48b4-aa5e-5aecf53d8c23','BAR','verified admin source + groups/night coverage'),
 ('6af2acea-675b-481e-8c00-1abc65279b17','BAR','verified admin source + gaming/social coverage'),
 ('5bd0aed8-de4d-4458-9ac7-8c4f50a808b2','BAR','verified admin source + conversation coverage'),
 ('5010be5d-8d4e-45b5-bb18-03cdd86ebee7','BAR','verified admin source + conversation/date coverage'),
 ('541e5e09-e8ac-4d1a-abba-af689591184d','BAR','verified admin source + quiet/wine coverage'),
 ('d9755d46-535d-40fa-9d22-090831781b11','BAR','verified admin source + afterwork/date coverage'),
 ('4ea159f7-2169-497f-b9d8-cd9f741de7b2','BAR','verified admin source + friends/afterwork coverage'),
 ('879350d7-d1d9-4e68-85aa-866f0fae96fa','CAFE','cafe coverage'),
 ('75ba6852-8bea-4be7-90fa-5c3438cc3a51','CAFE','cafe coverage + complete facts'),
 ('644fbd15-91f8-4ab7-8a4b-dbe06622d148','CAFE','cafe coverage'),
 ('4ef04e74-0f41-4ab7-bdfb-e3cafddcd0d4','CAFE','cafe coverage + complete facts'),
 ('96ff3b01-8ba2-4607-8ea7-678dbfaba8cc','CAFE','cafe coverage + complete facts'),
 ('743e5ca4-23ce-4d5c-a7cb-25271cf1a1cd','CAFE','cafe coverage + complete facts'),
 ('df035fda-40ea-4e7b-bde5-992b5aa5a1c2','CAFE','cafe/solo coverage'),
 ('01c40cfb-d002-4ad0-9c34-b8f4a598e232','MUSEUM_CULTURE','verified admin source + family/rain coverage'),
 ('a939c73b-7c61-49ae-ae42-4ada8d0747e0','MUSEUM_CULTURE','culture coverage'),
 ('e1ec19df-5213-4445-8f36-b3484f5fc221','MUSEUM_CULTURE','verified admin source + solo/date/rain coverage'),
 ('a9178789-196f-4b13-8b96-0a94bb29fd10','MUSEUM_CULTURE','culture coverage'),
 ('9f144aba-3d6f-403c-bdc8-e4e74cda0766','MUSEUM_CULTURE','culture coverage'),
 ('a2a12ea3-1a8b-4810-91db-3704a0c57ff6','MUSEUM_CULTURE','culture coverage'),
 ('ab4da026-0d47-4ea1-b626-5293106b4fc2','MUSEUM_CULTURE','family/culture target coverage; suitability unverified'),
 ('58cf34ca-d7fe-4a66-aada-da5edc201e73','MUSEUM_CULTURE','culture coverage + complete facts'),
 ('0547adcd-98a4-45c7-838f-0d0d0a7e7d01','MUSEUM_CULTURE','culture coverage'),
 ('af12fbf8-7205-40a5-b102-4dc849369dd3','MUSEUM_CULTURE','family/culture target coverage; suitability unverified'),
 ('57cb213c-9472-40b6-80be-a810fd77b7c9','ACTIVITY','activity coverage; suitability unverified'),
 ('83feeca5-fdc3-4e05-8ed5-3dfb24eaf911','ACTIVITY','verified admin source + family/indoor coverage'),
 ('c28c69c9-ff38-40cc-9f08-163c87e410e0','ACTIVITY','outdoor activity target coverage; suitability unverified'),
 ('64b82c94-c1ca-4860-bab8-38787ecd2516','ACTIVITY','verified admin source + indoor/rain coverage'),
 ('3b4df9a2-47be-4e66-a386-c7c0b4550ca8','ACTIVITY','verified admin source + family/experience coverage'),
 ('f8ae8625-aa9c-4647-9af5-c981fc40854a','ACTIVITY','verified admin source + family/outdoor coverage'),
 ('580d1398-38e7-46d2-8cff-07f0b167e2ae','ACTIVITY','activity coverage + complete facts'),
 ('308c3258-b8a1-4ad5-8579-8a75390125eb','SPECIAL_EXPERIENCE','special/outdoor target coverage; suitability unverified'),
 ('9e3e1c38-4e52-47d6-b24c-76d12386adf1','SPECIAL_EXPERIENCE','special/culture target coverage; suitability unverified'),
 ('0da020ba-2ef3-4840-9c07-f2376774e14f','SPECIAL_EXPERIENCE','family target coverage; suitability unverified'),
 ('514bdf47-f9f5-4cfd-80b2-b8677bc8e3da','NIGHTLIFE','only canonical nightlife category coverage'),
 ('d99b0a6a-b094-4f61-8573-250702a5fae8','OUTDOOR_VIEW','view/outdoor target coverage; suitability unverified'),
 ('01961cce-8d55-4e67-a25e-59bafa1122be','HOTEL','hotel/special stay coverage'),
 ('882524d5-4d08-4a25-8691-ce142aee4fc2','HOTEL','hotel/special stay coverage')
on conflict(spot_id) do update set selection_status='SELECTED',coverage_bucket=excluded.coverage_bucket,
 selection_reason=excluded.selection_reason,contract_version='backyrd-basel-gold-set-v1';

create table public.backyrd_spot_suitability_facts_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  dimension_key text not null check(dimension_key in ('family_kids','age_suitability','environment','rain_suitability','activity_type','conversation_suitability','social_context_suitability')),
  value jsonb not null check(jsonb_typeof(value) in ('object','array','string','boolean','number')),
  confidence numeric not null check(confidence between 0 and 1),
  source_origin text not null check(source_origin in ('REAL','LEGACY','IMPORT')),
  source_table text not null,
  source_record text not null,
  source_updated_at timestamptz,
  mapping_version text not null default 'backyrd-gold-suitability-mapping-v1',
  created_at timestamptz not null default now(),
  unique(spot_id,dimension_key,source_table,source_record,mapping_version)
);

-- Only verified Admin rows qualify. The objectively test-like Rio row is
-- excluded even though its legacy verification flag is true.
with qualified as (
  select i.* from public.spot_intelligence_v1 i join public.backyrd_basel_gold_spots_v1 g on g.spot_id=i.spot_id
  where i.source='admin' and i.is_verified and i.spot_id<>'07c38306-7f18-4600-a943-8a1963c28556'
), flattened as (
  select q.*,lower(array_to_string(q.best_for||q.occasion_tags||q.atmosphere_tags||q.avoid_if_tags||q.crowd_type,' ')) haystack from qualified q
)
insert into public.backyrd_spot_suitability_facts_v1(spot_id,dimension_key,value,confidence,source_origin,source_table,source_record,source_updated_at)
select spot_id,'family_kids',jsonb_build_object('suitable',true),.90,'LEGACY','spot_intelligence_v1',spot_id::text,updated_at from flattened where haystack ~ '(family|familie|familien|kids|kinder)'
union all select spot_id,'environment',to_jsonb(case when haystack~'indoor' and haystack~'outdoor' then 'MIXED' when haystack~'indoor' then 'INDOOR' else 'OUTDOOR' end),.90,'LEGACY','spot_intelligence_v1',spot_id::text,updated_at from flattened where haystack~'(indoor|outdoor)'
union all select spot_id,'rain_suitability',jsonb_build_object('suitable',true),.90,'LEGACY','spot_intelligence_v1',spot_id::text,updated_at from flattened where lower(array_to_string(best_for||occasion_tags,' '))~'(rainy day|regentag|regenwetter)'
union all select spot_id,'rain_suitability',jsonb_build_object('suitable',false),.90,'LEGACY','spot_intelligence_v1',spot_id::text,updated_at from flattened where lower(array_to_string(avoid_if_tags,' '))~'(regentag|regen|schlechtes wetter)' and not lower(array_to_string(best_for||occasion_tags,' '))~'(rainy day|regentag|regenwetter)'
union all select spot_id,'conversation_suitability',jsonb_build_object('level',case noise_level when 'quiet' then 'HIGH' when 'moderate' then 'MEDIUM' else 'LOW' end,'observedNoise',noise_level),.80,'LEGACY','spot_intelligence_v1',spot_id::text,updated_at from flattened where noise_level is not null
union all select spot_id,'activity_type',to_jsonb((select array_agg(distinct x order by x) from unnest(occasion_tags) x where lower(x) in ('museum','culture','workshop','sports','climbing','bouldering','gaming','quiz','karaoke','animals','waterpark','history','live music','concert'))),.85,'LEGACY','spot_intelligence_v1',spot_id::text,updated_at from flattened where exists(select 1 from unnest(occasion_tags) x where lower(x) in ('museum','culture','workshop','sports','climbing','bouldering','gaming','quiz','karaoke','animals','waterpark','history','live music','concert'))
union all select spot_id,'social_context_suitability',to_jsonb(crowd_type),.80,'LEGACY','spot_intelligence_v1',spot_id::text,updated_at from flattened where cardinality(crowd_type)>0
on conflict do nothing;

-- Age suitability is structurally supported, but no numeric ages are inferred
-- from broad family/kids labels. No age row is written without an explicit source.

-- ---------------------------------------------------------------------------
-- 4. Canonical N4 materialization from qualified Product/Admin sources
-- ---------------------------------------------------------------------------

insert into public.backyrd_spot_intelligence_dimensions_v1(dimension_key,value_kind,semantic_family,owner_access,supports_context,decision_purpose,schema_version) values
 ('family_kids','FACT','suitability','NONE',true,'Structured family/kids suitability with provenance.','backyrd-spot-intelligence-schema-v1'),
 ('age_suitability','FACT','suitability','NONE',true,'Explicit age suitability only; UNKNOWN when absent.','backyrd-spot-intelligence-schema-v1'),
 ('rain_suitability','FACT','weather','NONE',true,'Observed rain suitability.','backyrd-spot-intelligence-schema-v1'),
 ('activity_type','FACT','experience','NONE',true,'Canonical activity type when explicitly sourced.','backyrd-spot-intelligence-schema-v1'),
 ('social_context_suitability','FACT','social','NONE',true,'Structured social-context suitability.','backyrd-spot-intelligence-schema-v1'),
 ('conversation_suitability','FACT','social','NONE',true,'Conversation suitability derived from verified noise data.','backyrd-spot-intelligence-schema-v1'),
 ('weather.rain_suitable','INTERPRETATION','weather','NONE',true,'Positive rain-day fit.','backyrd-spot-intelligence-schema-v1')
on conflict(dimension_key) do nothing;

-- Canonical identity facts exist independently of reviews.
insert into public.backyrd_spot_intelligence_evidence_v1(
 spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,data_origin
)
select s.id,x.dimension_key,'FACT',x.value,'canonical_spot_data','basel-gold:'||s.id::text||':'||x.dimension_key,1,
 s.updated_at,s.updated_at,jsonb_build_object('sourceTable','spots','sourceRecord',s.id,'field',x.dimension_key,'goldContract','backyrd-gold-spot-contract-v1'),'REAL'
from public.spots s join public.backyrd_basel_gold_spots_v1 g on g.spot_id=s.id
join public.categories c on c.id=s.category_id
cross join lateral (values
 ('category',to_jsonb(c.name)),
 ('place_type',to_jsonb(case c.name when 'Restaurant' then 'restaurant' when 'Bar' then 'bar' when 'Café' then 'cafe' when 'Museum' then 'culture' when 'Aktivität' then 'activity' when 'Besonderes Erlebnis' then 'experience' when 'Nachtleben' then 'nightlife' when 'Unterkunft / Hotel' then 'hotel' else 'other' end)),
 ('city',to_jsonb(s.city))
) x(dimension_key,value)
where g.selection_status='SELECTED' and x.value is not null
on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,
 signal_confidence=excluded.signal_confidence,observed_at=excluded.observed_at,valid_from=excluded.valid_from,
 provenance=excluded.provenance,status='ACTIVE',data_origin=excluded.data_origin;

insert into public.backyrd_spot_intelligence_evidence_v1(
 spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,data_origin
)
select f.spot_id,f.dimension_key,'FACT',f.value,'backyrd_derived','qualified-legacy-suitability:'||f.id,.85,
 coalesce(f.source_updated_at,f.created_at),coalesce(f.source_updated_at,f.created_at),
 jsonb_build_object('sourceTable',f.source_table,'sourceRecord',f.source_record,'sourceOrigin',f.source_origin,
   'mappingVersion',f.mapping_version,'factId',f.id,'qualification','verified_admin_only'),'LEGACY'
from public.backyrd_spot_suitability_facts_v1 f
on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,
 signal_confidence=excluded.signal_confidence,provenance=excluded.provenance,status='ACTIVE',data_origin=excluded.data_origin;

-- Interpretation evidence is a conservative deterministic projection from
-- explicit structured facts or verified admin vocabulary. No review is used.
with facts as (select * from public.backyrd_spot_suitability_facts_v1)
insert into public.backyrd_spot_intelligence_evidence_v1(
 spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,data_origin
)
select spot_id,concept,'INTERPRETATION',to_jsonb(direction),'backyrd_derived','gold-interpretation:'||id||':'||concept,confidence,
 coalesce(source_updated_at,created_at),coalesce(source_updated_at,created_at),
 jsonb_build_object('sourceFactId',id,'sourceOrigin',source_origin,'mappingVersion',mapping_version,'qualification','verified_admin_only'),'LEGACY'
from facts cross join lateral (
 values
  (case when dimension_key='family_kids' and coalesce((value->>'suitable')::boolean,false) then 'occasion.kids_friendly' end,1::numeric),
  (case when dimension_key='family_kids' and coalesce((value->>'suitable')::boolean,false) then 'social_style.family_friendly' end,1::numeric),
  (case when dimension_key='environment' and value#>>'{}' in ('INDOOR','MIXED') then 'environment.indoor' end,1::numeric),
  (case when dimension_key='environment' and value#>>'{}' in ('OUTDOOR','MIXED') then 'environment.outdoor' end,1::numeric),
  (case when dimension_key='rain_suitability' and coalesce((value->>'suitable')::boolean,false) then 'weather.rain_suitable' end,1::numeric),
  (case when dimension_key='conversation_suitability' and value->>'level'='HIGH' then 'social_style.conversation_friendly' end,1::numeric),
  (case when dimension_key='conversation_suitability' and value->>'level'='LOW' then 'social_style.conversation_friendly' end,-1::numeric)
) mapped(concept,direction) where concept is not null
on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,
 signal_confidence=excluded.signal_confidence,provenance=excluded.provenance,status='ACTIVE',data_origin=excluded.data_origin;

-- A bounded mapping from explicitly verified legacy descriptors to already
-- canonical concepts. This is qualification, not wholesale Legacy promotion.
with source as (
 select i.*,lower(array_to_string(i.best_for||i.occasion_tags||i.atmosphere_tags||i.crowd_type,' ')) haystack
 from public.spot_intelligence_v1 i join public.backyrd_basel_gold_spots_v1 g on g.spot_id=i.spot_id
 where i.source='admin' and i.is_verified and i.spot_id<>'07c38306-7f18-4600-a943-8a1963c28556'
), mapped as (
 select s.*,m.concept from source s cross join lateral (values
  (case when haystack~'(gemütlich|heimelig|warm)' then 'vibe.cozy' end),
  (case when haystack~'(entspannt|locker|lässig|entschleunigt)' then 'vibe.relaxed' end),
  (case when haystack~'(romantisch|romantic)' then 'vibe.romantic' end),
  (case when haystack~'(lebendig|actionreich|energiegeladen)' then 'vibe.lively' end),
  (case when haystack~'(ruhig|stilles|still)' then 'vibe.quiet' end),
  (case when haystack~'(gesellig|social|gemeinschaft)' then 'vibe.social' end),
  (case when haystack~'(inspirierend|inspiration)' then 'vibe.inspiring' end),
  (case when haystack~'(spielerisch|play)' then 'vibe.playful' end),
  (case when haystack~'(elegant|stilvoll|raffiniert)' then 'vibe.elegant' end),
  (case when haystack~'(authentisch|historisch|lokal)' then 'character.authentic_character' end),
  (case when haystack~'(urban)' then 'vibe.urban' end),
  (case when haystack~'(groups|gruppen|gruppe)' then 'occasion.group_friendly' end),
  (case when haystack~'(solo)' then 'social_style.solo_friendly' end),
  (case when haystack~'(date|paare)' then 'social_style.romantic_friendly' end),
  (case when haystack~'(nightlife|night|später|late)' then 'context.night_friendly' end)
 ) m(concept) where m.concept is not null
)
insert into public.backyrd_spot_intelligence_evidence_v1(
 spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,data_origin
)
select spot_id,concept,'INTERPRETATION','1'::jsonb,'backyrd_derived','verified-admin-map:'||spot_id||':'||concept,.72,updated_at,updated_at,
 jsonb_build_object('sourceTable','spot_intelligence_v1','sourceRecord',spot_id,'sourceOrigin','LEGACY','source','admin',
  'isVerified',true,'mappingVersion','backyrd-gold-legacy-concept-mapping-v1'),'LEGACY' from mapped
on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,
 signal_confidence=excluded.signal_confidence,provenance=excluded.provenance,status='ACTIVE',data_origin=excluded.data_origin;

create or replace function public.backyrd_rebuild_gold_n4_snapshot_v1(p_spot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_intelligence jsonb; v_confidence numeric; v_completeness numeric; v_watermark timestamptz; v_fingerprint text;
begin
 if auth.role()<>'service_role' and current_user not in ('postgres','service_role') then raise exception 'gold_n4_service_only' using errcode='42501'; end if;
 if not exists(select 1 from public.backyrd_basel_gold_spots_v1 where spot_id=p_spot_id and selection_status='SELECTED') then raise exception 'spot_not_in_gold_set' using errcode='22023'; end if;
 with active as (
  select * from public.backyrd_spot_intelligence_evidence_v1 where spot_id=p_spot_id and status='ACTIVE'
   and data_origin not in ('FIXTURE','TEST') and valid_from<=now() and (valid_until is null or valid_until>now())
 ), facts as (
  select coalesce(jsonb_object_agg(dimension_key,value order by dimension_key),'{}'::jsonb) value from active where value_kind='FACT'
 ), concepts as (
  select coalesce(jsonb_object_agg(dimension_key,jsonb_build_object('presence',(value#>>'{}')::numeric,'confidence',signal_confidence,
   'evidenceId',id,'sourceReference',source_reference) order by dimension_key),'{}'::jsonb) value from active where value_kind='INTERPRETATION'
 ), stats as (
  select coalesce(avg(signal_confidence),0) avg_confidence,count(distinct dimension_key) dimension_count,max(observed_at) watermark from active
 ) select jsonb_build_object('placeType',(select value#>>'{}' from active where dimension_key='place_type' limit 1),
    'facts',(select value from facts),'concepts',(select value from concepts),'provenanceMode','EVIDENCE_BOUND'),
    least(1,(select avg_confidence from stats)),least(1,(select dimension_count::numeric/10 from stats)),(select watermark from stats)
 into v_intelligence,v_confidence,v_completeness,v_watermark;
 v_fingerprint:=encode(digest(convert_to(v_intelligence::text,'UTF8'),'sha256'),'hex');
 insert into public.backyrd_spot_intelligence_snapshots_v1(spot_id,context_key,intelligence,confidence,completeness,evidence_watermark,fingerprint,calculated_at,schema_version,confidence_contract_version)
 values(p_spot_id,'global',v_intelligence,v_confidence,v_completeness,v_watermark,v_fingerprint,now(),'backyrd-spot-intelligence-schema-v1','backyrd-spot-confidence-contract-v1')
 on conflict(spot_id,context_key) do update set intelligence=excluded.intelligence,confidence=excluded.confidence,completeness=excluded.completeness,
 evidence_watermark=excluded.evidence_watermark,fingerprint=excluded.fingerprint,calculated_at=excluded.calculated_at,
 schema_version=excluded.schema_version,confidence_contract_version=excluded.confidence_contract_version;
 return jsonb_build_object('spotId',p_spot_id,'fingerprint',v_fingerprint,'confidence',v_confidence,'completeness',v_completeness);
end $$;

-- N4 product reads exclude isolated TEST/FIXTURE sources fail-closed.
create or replace function public.backyrd_read_n4_for_user_intelligence_v1(p_spot_ids uuid[])
returns table(spot_id uuid,available boolean,concepts jsonb,place_type text,snapshot_identity text,freshness timestamptz)
language sql stable security definer set search_path=public,pg_catalog as $$
 with requested as (
  select distinct x spot_id from unnest(coalesce(p_spot_ids,'{}'::uuid[])) x join public.spots s on s.id=x where s.data_origin not in ('FIXTURE','TEST')
 ), concepts as (
  select e.spot_id,jsonb_agg(jsonb_build_object('concept',e.dimension_key,'presence',(e.value#>>'{}')::numeric,'confidence',e.signal_confidence,
   'provenance',jsonb_build_object('evidenceId',e.id,'sourceFamily',e.source_family,'sourceReference',e.source_reference,'dataOrigin',e.data_origin)) order by e.dimension_key,e.id)
   filter(where e.value_kind='INTERPRETATION' and (e.value#>>'{}')::numeric>0 and e.signal_confidence>=.35) concepts
  from public.backyrd_spot_intelligence_evidence_v1 e join requested r on r.spot_id=e.spot_id
  where e.status='ACTIVE' and e.data_origin not in ('FIXTURE','TEST') and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now()) group by e.spot_id
 ), snapshots as (
  select s.spot_id,s.fingerprint,s.evidence_watermark,nullif(coalesce(s.intelligence->>'placeType',s.intelligence->>'place_type'),'') place_type
  from public.backyrd_spot_intelligence_snapshots_v1 s join requested r on r.spot_id=s.spot_id where s.context_key='global'
 ) select r.spot_id,coalesce(jsonb_array_length(c.concepts),0)>0,coalesce(c.concepts,'[]'::jsonb),s.place_type,s.fingerprint,s.evidence_watermark
 from requested r left join concepts c on c.spot_id=r.spot_id left join snapshots s on s.spot_id=r.spot_id
$$;

-- Gold readiness: reviews are intentionally not required.
create or replace view public.backyrd_basel_gold_readiness_v1 as
with evidence as (
 select spot_id,count(*) filter(where value_kind='INTERPRETATION' and status='ACTIVE' and data_origin not in ('FIXTURE','TEST')) interpretations,
 count(distinct dimension_key) filter(where dimension_key in ('family_kids','age_suitability','environment','rain_suitability','activity_type','conversation_suitability','social_context_suitability') and status='ACTIVE' and data_origin not in ('FIXTURE','TEST')) suitability_dimensions
 from public.backyrd_spot_intelligence_evidence_v1 group by spot_id
), content as (
 select sd.spot_id,coalesce(nullif(btrim(sd.owner_description),''),nullif(btrim(sd.admin_description),''),nullif(btrim(sd.enriched_description),'')) description
 from public.spot_descriptions sd
)
select g.spot_id,s.name,c.name category,s.city,g.coverage_bucket,
 case when s.status='approved' and s.city='Basel' and s.address is not null and s.google_place_id is not null
  and length(coalesce(content.description,''))>=80 and (s.header_photo_path is not null or s.google_photo_enabled)
  and (s.website is not null or s.phone is not null) and exists(select 1 from public.spot_hours h where h.spot_id=s.id)
  and coalesce(e.suitability_dimensions,0)>=2 and coalesce(e.interpretations,0)>0 then 'GOLD_READY' else 'PARTIAL' end readiness,
 array_remove(array[
  case when s.status<>'approved' then 'NOT_APPROVED' end,
  case when s.city is distinct from 'Basel' or s.address is null or s.google_place_id is null then 'IDENTITY_OR_LOCATION_UNVERIFIED' end,
  case when length(coalesce(content.description,''))<80 then 'USABLE_DESCRIPTION_MISSING' end,
  case when s.header_photo_path is null and not s.google_photo_enabled then 'VISUAL_SOURCE_MISSING' end,
  case when s.website is null and s.phone is null then 'BASIC_FACTS_MISSING' end,
  case when not exists(select 1 from public.spot_hours h where h.spot_id=s.id) then 'OPENING_HOURS_MISSING' end,
  case when coalesce(e.suitability_dimensions,0)<2 then 'STRUCTURED_SUITABILITY_THIN' end,
  case when coalesce(e.interpretations,0)=0 then 'CANONICAL_N4_INTERPRETATION_MISSING' end,
  case when not exists(select 1 from public.backyrd_spot_suitability_facts_v1 f where f.spot_id=s.id and f.dimension_key='age_suitability') then 'AGE_SUITABILITY_UNKNOWN' end
 ],null) data_gaps,coalesce(e.suitability_dimensions,0) suitability_dimensions,coalesce(e.interpretations,0) n4_interpretations
from public.backyrd_basel_gold_spots_v1 g join public.spots s on s.id=g.spot_id join public.categories c on c.id=s.category_id
left join content on content.spot_id=s.id left join evidence e on e.spot_id=s.id where g.selection_status='SELECTED';

-- Fixture Spots remain auditable, but never qualify for real Product surfaces.
create or replace function public.distribution_trust_filter_entities_v1(p_entity_type text,p_entity_ids uuid[],p_surface text default 'discovery')
returns table(entity_id uuid,eligible boolean,distribution_priority integer)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
 if p_entity_type not in ('spot','review','social_post','moment','profile') then raise exception 'distribution_entity_type_invalid' using errcode='22023'; end if;
 if p_surface not in ('decision','search','discovery','feed','maps','owner','admin','internal') then raise exception 'distribution_surface_invalid' using errcode='22023'; end if;
 return query with requested as (
  select distinct id from unnest(coalesce(p_entity_ids,array[]::uuid[])) id where id is not null
 ), resolved as (
  select r.id,coalesce(st.effective_state,'normal') effective_state,
   case when p_entity_type='spot' then coalesce(sp.data_origin,'LEGACY')
        when p_entity_type='review' then coalesce(rv.data_origin,'LEGACY') else 'REAL' end data_origin
  from requested r left join public.safety_content_items i on i.entity_type=case when p_entity_type='moment' then 'social_post' else p_entity_type end and i.entity_id=r.id
  left join public.distribution_trust_states st on st.content_item_id=i.id
  left join public.spots sp on p_entity_type='spot' and sp.id=r.id
  left join public.reviews rv on p_entity_type='review' and rv.id=r.id
 ) select r.id,case when p_surface in ('owner','admin','internal') then true
      else r.effective_state in ('normal','reduced') and r.data_origin not in ('FIXTURE','TEST') end,
    case when r.data_origin in ('FIXTURE','TEST') and p_surface not in ('owner','admin','internal') then 0
      when r.effective_state='normal' then 100 when r.effective_state='reduced' then 50 when r.effective_state='quarantined' then 10 else 0 end
 from resolved r;
end $$;

alter table public.backyrd_basel_gold_spots_v1 enable row level security;
alter table public.backyrd_spot_suitability_facts_v1 enable row level security;
create policy backyrd_basel_gold_spots_no_client_v1 on public.backyrd_basel_gold_spots_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_spot_suitability_no_client_v1 on public.backyrd_spot_suitability_facts_v1 for all to anon,authenticated using(false) with check(false);
revoke all on table public.backyrd_basel_gold_spots_v1,public.backyrd_spot_suitability_facts_v1 from anon,authenticated;
grant all on table public.backyrd_basel_gold_spots_v1,public.backyrd_spot_suitability_facts_v1 to service_role;
revoke all on table public.backyrd_basel_gold_readiness_v1 from public,anon,authenticated;
grant select on public.backyrd_basel_gold_readiness_v1 to service_role;
revoke all on function public.backyrd_rebuild_gold_n4_snapshot_v1(uuid),public.backyrd_read_n4_for_user_intelligence_v1(uuid[]) from public,anon,authenticated;
grant execute on function public.backyrd_rebuild_gold_n4_snapshot_v1(uuid),public.backyrd_read_n4_for_user_intelligence_v1(uuid[]) to service_role;

do $$ declare r record; begin
 for r in select g.spot_id from public.backyrd_basel_gold_spots_v1 g join public.spots s on s.id=g.spot_id where g.selection_status='SELECTED' loop
  perform public.backyrd_rebuild_gold_n4_snapshot_v1(r.spot_id);
 end loop;
end $$;

comment on table public.backyrd_basel_gold_spots_v1 is 'Frozen v1 curated Basel coverage set. Selection is not a GOLD_READY claim.';
comment on view public.backyrd_basel_gold_readiness_v1 is 'Evidence-bound Gold contract. Reviews are optional; absent facts remain explicit gaps.';
comment on table public.backyrd_product_mood_vocabulary_v1 is 'Controlled Product Mood vocabulary. Unsupported valid moods do not create semantic claims.';
