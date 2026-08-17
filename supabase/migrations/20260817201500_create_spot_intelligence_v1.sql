-- N4 Spot Intelligence v1: additive evidence, Owner-claim and derived-snapshot boundary.
-- No Product ranking or billing integration is activated by this migration.

create table public.backyrd_spot_intelligence_dimensions_v1 (
  dimension_key text primary key,
  value_kind text not null check (value_kind in ('FACT','INTERPRETATION')),
  semantic_family text not null,
  owner_access text not null check (owner_access in ('FREE','PREMIUM','NONE')),
  supports_context boolean not null default false,
  decision_purpose text not null,
  schema_version text not null default 'backyrd-spot-intelligence-schema-v1'
);

insert into public.backyrd_spot_intelligence_dimensions_v1 values
  ('category','FACT','identity','FREE',false,'Canonical category identity.','backyrd-spot-intelligence-schema-v1'),
  ('place_type','FACT','identity','FREE',false,'Canonical portable Place Type.','backyrd-spot-intelligence-schema-v1'),
  ('city','FACT','identity','FREE',false,'Local Spot city; never User identity.','backyrd-spot-intelligence-schema-v1'),
  ('price_level','FACT','practical','FREE',false,'Observed price level.','backyrd-spot-intelligence-schema-v1'),
  ('accessibility','FACT','practical','FREE',false,'Structured accessibility state.','backyrd-spot-intelligence-schema-v1'),
  ('environment','FACT','practical','FREE',true,'Indoor/outdoor availability.','backyrd-spot-intelligence-schema-v1'),
  ('reservation_character','FACT','practical','FREE',true,'Walk-in or reservation behavior.','backyrd-spot-intelligence-schema-v1'),
  ('duration_character','FACT','experience','FREE',true,'Typical commitment duration.','backyrd-spot-intelligence-schema-v1');

insert into public.backyrd_spot_intelligence_dimensions_v1(
  dimension_key,value_kind,semantic_family,owner_access,supports_context,decision_purpose
)
select concept_key,'INTERPRETATION',concept_family,'PREMIUM',true,
  'Shared User/Spot concept from '||taste_space_version
from public.backyrd_taste_concepts_v1;

insert into public.backyrd_spot_intelligence_dimensions_v1 values
  ('planning.low_friction','INTERPRETATION','planning','PREMIUM',true,'Low planning and execution friction.','backyrd-spot-intelligence-schema-v1'),
  ('planning.high_commitment','INTERPRETATION','planning','PREMIUM',true,'High planning or commitment requirement.','backyrd-spot-intelligence-schema-v1'),
  ('occasion.kids_friendly','INTERPRETATION','occasion','PREMIUM',true,'Support for family-with-kids Moments.','backyrd-spot-intelligence-schema-v1'),
  ('occasion.group_friendly','INTERPRETATION','occasion','PREMIUM',true,'Support for group Moments.','backyrd-spot-intelligence-schema-v1'),
  ('context.night_friendly','INTERPRETATION','context','PREMIUM',true,'Support for night Moments.','backyrd-spot-intelligence-schema-v1'),
  ('context.weekday_friendly','INTERPRETATION','context','PREMIUM',true,'Support for weekday Moments.','backyrd-spot-intelligence-schema-v1'),
  ('context.weekend_friendly','INTERPRETATION','context','PREMIUM',true,'Support for weekend Moments.','backyrd-spot-intelligence-schema-v1');

create table public.backyrd_spot_owner_intelligence_entitlements_v1 (
  spot_id uuid primary key references public.spots(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('FREE','PREMIUM')),
  source text not null check (source in ('SYSTEM_DEFAULT','BILLING_VERIFIED','ADMIN_GRANT','TEST_FIXTURE')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  updated_at timestamptz not null default now(),
  contract_version text not null default 'backyrd-owner-free-premium-boundary-v1',
  check (valid_until is null or valid_until > valid_from)
);

create table public.backyrd_spot_owner_claims_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 200),
  dimension_key text not null references public.backyrd_spot_intelligence_dimensions_v1(dimension_key),
  value jsonb not null,
  context_signature jsonb not null default '{}'::jsonb check (jsonb_typeof(context_signature)='object'),
  status text not null check (status in ('PENDING_EVIDENCE','NEEDS_REVIEW','ACCEPTED','REJECTED','SUPERSEDED')),
  contradiction_codes text[] not null default '{}',
  claim_hash text not null check (claim_hash ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  supersedes_claim_id uuid references public.backyrd_spot_owner_claims_v1(id) on delete restrict,
  owner_contract_version text not null default 'backyrd-owner-intelligence-contract-v1',
  unique(owner_id,idempotency_key)
);
create index backyrd_spot_owner_claims_v1_spot_status_idx on public.backyrd_spot_owner_claims_v1(spot_id,status,submitted_at desc);

create table public.backyrd_spot_intelligence_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  dimension_key text not null references public.backyrd_spot_intelligence_dimensions_v1(dimension_key),
  value_kind text not null check (value_kind in ('FACT','INTERPRETATION')),
  value jsonb not null,
  context_signature jsonb not null default '{}'::jsonb check (jsonb_typeof(context_signature)='object'),
  source_family text not null check (source_family in ('canonical_spot_data','backyrd_derived','owner_provided','community_derived','outcome_derived','external_imported','ai_derived')),
  source_reference text not null,
  independent_subject_hash text,
  signal_confidence numeric not null check (signal_confidence between 0 and 1),
  observed_at timestamptz not null,
  valid_from timestamptz not null,
  valid_until timestamptz,
  provenance jsonb not null check (jsonb_typeof(provenance)='object'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED','REJECTED','STALE')),
  evidence_contract_version text not null default 'backyrd-spot-evidence-contract-v1',
  created_at timestamptz not null default now(),
  unique(spot_id,source_family,source_reference,dimension_key,context_signature),
  check (valid_until is null or valid_until > valid_from)
);
create index backyrd_spot_intelligence_evidence_v1_lookup_idx on public.backyrd_spot_intelligence_evidence_v1(spot_id,status,dimension_key);

create table public.backyrd_spot_intelligence_snapshots_v1 (
  spot_id uuid not null references public.spots(id) on delete cascade,
  context_key text not null default 'global',
  intelligence jsonb not null check (jsonb_typeof(intelligence)='object'),
  confidence numeric not null check (confidence between 0 and 1),
  completeness numeric not null check (completeness between 0 and 1),
  contradictions jsonb not null default '[]'::jsonb check (jsonb_typeof(contradictions)='array'),
  evidence_watermark timestamptz,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  calculated_at timestamptz not null,
  schema_version text not null default 'backyrd-spot-intelligence-schema-v1',
  confidence_contract_version text not null default 'backyrd-spot-confidence-contract-v1',
  primary key(spot_id,context_key)
);

create table public.backyrd_spot_intelligence_audit_v1 (
  id bigint generated always as identity primary key,
  spot_id uuid not null references public.spots(id) on delete cascade,
  actor_id uuid,
  action text not null,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index backyrd_spot_intelligence_audit_v1_spot_time_idx on public.backyrd_spot_intelligence_audit_v1(spot_id,occurred_at desc);

create or replace function public.backyrd_spot_context_valid_v1(p_context jsonb)
returns boolean language sql immutable parallel safe
set search_path=public,pg_catalog
as $$
  select jsonb_typeof(coalesce(p_context,'{}'::jsonb))='object'
    and not exists(select 1 from jsonb_object_keys(coalesce(p_context,'{}'::jsonb)) k where k not in ('audience','time'))
    and (not (coalesce(p_context,'{}'::jsonb) ? 'audience') or p_context->>'audience' in ('solo','date','friends','family','work'))
    and (not (coalesce(p_context,'{}'::jsonb) ? 'time') or p_context->>'time' in ('morning','afternoon','evening','night','weekday','weekend'));
$$;

create or replace function public.backyrd_spot_intelligence_forbidden_json_v1(p_value jsonb)
returns boolean language sql immutable parallel safe
set search_path=public,pg_catalog
as $$ select coalesce(p_value::text ~* '"[^" ]*(latent|ground[_-]?truth|oracle|expected[_-]?utility|trust[_-]?score|moderation|private[_-]?user|payment|ranking[_-]?bonus|distribution[_-]?priority)[^" ]*"',false); $$;

create or replace function public.backyrd_spot_intelligence_validate_service_row_v1()
returns trigger language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare v_dimension public.backyrd_spot_intelligence_dimensions_v1%rowtype;
begin
  select * into v_dimension from public.backyrd_spot_intelligence_dimensions_v1 where dimension_key=new.dimension_key;
  if not found or new.value_kind<>v_dimension.value_kind then raise exception 'spot_dimension_kind_mismatch' using errcode='22023'; end if;
  if not public.backyrd_spot_context_valid_v1(new.context_signature) then raise exception 'invalid_spot_context' using errcode='22023'; end if;
  if public.backyrd_spot_intelligence_forbidden_json_v1(new.value) or public.backyrd_spot_intelligence_forbidden_json_v1(new.provenance) then raise exception 'forbidden_spot_intelligence_field' using errcode='22023'; end if;
  if new.value_kind='INTERPRETATION' and (jsonb_typeof(new.value)<>'number' or (new.value#>>'{}')::numeric not between -1 and 1 or (new.value#>>'{}')::numeric=0) then raise exception 'invalid_interpretation_value' using errcode='22023'; end if;
  if new.source_family='ai_derived' and not (new.provenance?'model' and new.provenance?'modelVersion' and new.provenance?'sourceInputHash') then raise exception 'ai_provenance_required' using errcode='22023'; end if;
  if new.observed_at>now() or new.valid_from>now() then raise exception 'future_spot_evidence_not_allowed' using errcode='22023'; end if;
  return new;
end; $$;
create trigger trg_backyrd_spot_intelligence_evidence_validate_v1 before insert or update on public.backyrd_spot_intelligence_evidence_v1 for each row execute function public.backyrd_spot_intelligence_validate_service_row_v1();

create or replace function public.backyrd_spot_snapshot_validate_v1()
returns trigger language plpgsql security definer
set search_path=public,pg_catalog
as $$ begin
  if public.backyrd_spot_intelligence_forbidden_json_v1(new.intelligence) then raise exception 'forbidden_snapshot_feature' using errcode='22023'; end if;
  return new;
end; $$;
create trigger trg_backyrd_spot_snapshot_validate_v1 before insert or update on public.backyrd_spot_intelligence_snapshots_v1 for each row execute function public.backyrd_spot_snapshot_validate_v1();

create or replace function public.backyrd_submit_spot_intelligence_claim_v1(
  p_spot_id uuid,p_dimension_key text,p_value jsonb,p_context_signature jsonb default '{}'::jsonb,p_idempotency_key text default null
) returns jsonb language plpgsql security definer
set search_path=public,pg_catalog,extensions
as $$
declare v_actor uuid:=auth.uid();v_owner uuid;v_tier text:='FREE';v_dimension public.backyrd_spot_intelligence_dimensions_v1%rowtype;
  v_hash text;v_existing public.backyrd_spot_owner_claims_v1%rowtype;v_status text:='PENDING_EVIDENCE';v_codes text[]:='{}';v_id uuid;v_opposite text;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select owner_id into v_owner from public.spots where id=p_spot_id;
  if v_owner is null or v_owner<>v_actor then raise exception 'spot_owner_required' using errcode='42501'; end if;
  select * into v_dimension from public.backyrd_spot_intelligence_dimensions_v1 where dimension_key=p_dimension_key;
  if not found or v_dimension.owner_access='NONE' then raise exception 'owner_dimension_not_editable' using errcode='22023'; end if;
  select tier into v_tier from public.backyrd_spot_owner_intelligence_entitlements_v1
   where spot_id=p_spot_id and owner_id=v_actor and valid_from<=now() and (valid_until is null or valid_until>now());
  v_tier:=coalesce(v_tier,'FREE');
  if v_dimension.owner_access='PREMIUM' and v_tier<>'PREMIUM' then raise exception 'premium_intelligence_entitlement_required' using errcode='42501'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 200 then raise exception 'claim_idempotency_key_required' using errcode='22023'; end if;
  if not public.backyrd_spot_context_valid_v1(p_context_signature) then raise exception 'invalid_spot_context' using errcode='22023'; end if;
  if public.backyrd_spot_intelligence_forbidden_json_v1(p_value) then raise exception 'forbidden_owner_claim_field' using errcode='22023'; end if;
  if v_dimension.value_kind='INTERPRETATION' and (jsonb_typeof(p_value)<>'number' or (p_value#>>'{}')::numeric not between -1 and 1 or (p_value#>>'{}')::numeric=0) then raise exception 'invalid_interpretation_value' using errcode='22023'; end if;
  if (select count(*) from public.backyrd_spot_owner_claims_v1 where owner_id=v_actor and submitted_at>now()-interval '1 hour')>=50 then raise exception 'owner_claim_rate_limit' using errcode='54000'; end if;
  v_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_spot_id,p_dimension_key,p_value::text,p_context_signature::text,v_actor),'UTF8'),'sha256'),'hex');
  select * into v_existing from public.backyrd_spot_owner_claims_v1 where owner_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.claim_hash<>v_hash then raise exception 'owner_claim_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('claimId',v_existing.id,'inserted',false,'status',v_existing.status,'contradictions',v_existing.contradiction_codes);
  end if;
  v_opposite:=case p_dimension_key when 'vibe.quiet' then 'vibe.lively' when 'vibe.lively' then 'vibe.quiet' when 'energy.calm' then 'energy.energetic' when 'energy.energetic' then 'energy.calm' when 'price.budget' then 'price.premium' when 'price.premium' then 'price.budget' when 'discovery.mainstream' then 'discovery.hidden_gem' when 'discovery.hidden_gem' then 'discovery.mainstream' when 'planning.low_friction' then 'planning.high_commitment' when 'planning.high_commitment' then 'planning.low_friction' end;
  if v_opposite is not null and (p_value#>>'{}')::numeric>0 and exists(select 1 from public.backyrd_spot_owner_claims_v1 where spot_id=p_spot_id and owner_id=v_actor and dimension_key=v_opposite and context_signature=p_context_signature and status in ('PENDING_EVIDENCE','NEEDS_REVIEW','ACCEPTED') and (value#>>'{}')::numeric>0) then
    v_status:='NEEDS_REVIEW';v_codes:=array['CONTRADICTORY_OWNER_CLAIMS'];
  end if;
  insert into public.backyrd_spot_owner_claims_v1(spot_id,owner_id,idempotency_key,dimension_key,value,context_signature,status,contradiction_codes,claim_hash)
  values(p_spot_id,v_actor,p_idempotency_key,p_dimension_key,p_value,p_context_signature,v_status,v_codes,v_hash) returning id into v_id;
  insert into public.backyrd_spot_intelligence_audit_v1(spot_id,actor_id,action,subject_id,metadata) values(p_spot_id,v_actor,'OWNER_CLAIM_SUBMITTED',v_id,jsonb_build_object('dimension',p_dimension_key,'status',v_status));
  return jsonb_build_object('claimId',v_id,'inserted',true,'status',v_status,'contradictions',v_codes);
end; $$;

create or replace function public.backyrd_get_my_spot_intelligence_claims_v1(p_spot_id uuid,p_limit integer default 100)
returns table(claim_id uuid,dimension_key text,value jsonb,context_signature jsonb,status text,contradiction_codes text[],submitted_at timestamptz)
language sql stable security definer set search_path=public,pg_catalog as $$
  select c.id,c.dimension_key,c.value,c.context_signature,c.status,c.contradiction_codes,c.submitted_at
  from public.backyrd_spot_owner_claims_v1 c join public.spots s on s.id=c.spot_id
  where auth.uid() is not null and s.owner_id=auth.uid() and c.owner_id=auth.uid() and c.spot_id=p_spot_id
  order by c.submitted_at desc limit greatest(1,least(coalesce(p_limit,100),200));
$$;

alter table public.backyrd_spot_intelligence_dimensions_v1 enable row level security;
alter table public.backyrd_spot_owner_intelligence_entitlements_v1 enable row level security;
alter table public.backyrd_spot_owner_claims_v1 enable row level security;
alter table public.backyrd_spot_intelligence_evidence_v1 enable row level security;
alter table public.backyrd_spot_intelligence_snapshots_v1 enable row level security;
alter table public.backyrd_spot_intelligence_audit_v1 enable row level security;

create policy backyrd_spot_dimensions_no_client_v1 on public.backyrd_spot_intelligence_dimensions_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_spot_entitlements_no_client_v1 on public.backyrd_spot_owner_intelligence_entitlements_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_spot_owner_claims_read_own_v1 on public.backyrd_spot_owner_claims_v1 for select to authenticated using(auth.uid()=owner_id and exists(select 1 from public.spots s where s.id=backyrd_spot_owner_claims_v1.spot_id and s.owner_id=auth.uid()));
create policy backyrd_spot_evidence_no_client_v1 on public.backyrd_spot_intelligence_evidence_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_spot_snapshots_no_client_v1 on public.backyrd_spot_intelligence_snapshots_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_spot_audit_no_client_v1 on public.backyrd_spot_intelligence_audit_v1 for all to anon,authenticated using(false) with check(false);

revoke all on table public.backyrd_spot_intelligence_dimensions_v1,public.backyrd_spot_owner_intelligence_entitlements_v1,public.backyrd_spot_owner_claims_v1,public.backyrd_spot_intelligence_evidence_v1,public.backyrd_spot_intelligence_snapshots_v1,public.backyrd_spot_intelligence_audit_v1 from anon,authenticated;
grant select on table public.backyrd_spot_owner_claims_v1 to authenticated;
grant all on table public.backyrd_spot_intelligence_dimensions_v1,public.backyrd_spot_owner_intelligence_entitlements_v1,public.backyrd_spot_owner_claims_v1,public.backyrd_spot_intelligence_evidence_v1,public.backyrd_spot_intelligence_snapshots_v1,public.backyrd_spot_intelligence_audit_v1 to service_role;

revoke all on function public.backyrd_spot_context_valid_v1(jsonb),public.backyrd_spot_intelligence_forbidden_json_v1(jsonb),public.backyrd_spot_intelligence_validate_service_row_v1(),public.backyrd_spot_snapshot_validate_v1() from public,anon,authenticated;
revoke all on function public.backyrd_submit_spot_intelligence_claim_v1(uuid,text,jsonb,jsonb,text),public.backyrd_get_my_spot_intelligence_claims_v1(uuid,integer) from public,anon;
grant execute on function public.backyrd_submit_spot_intelligence_claim_v1(uuid,text,jsonb,jsonb,text),public.backyrd_get_my_spot_intelligence_claims_v1(uuid,integer) to authenticated,service_role;

comment on table public.backyrd_spot_intelligence_evidence_v1 is 'N4 immutable source Evidence. Owner claims do not become canonical truth without service qualification.';
comment on table public.backyrd_spot_intelligence_snapshots_v1 is 'Rebuildable N4 Spot Intelligence. Completeness and payment status are prohibited Decision boosts.';
