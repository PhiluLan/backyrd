\set ON_ERROR_STOP on

begin;

create function pg_temp.n4_uuid(p_label text) returns uuid language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||substr(md5(p_label),21,12))::uuid;
$$;
create function pg_temp.n4_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'N4 acceptance failed: %',p_message; end if; end; $$;
create function pg_temp.n4_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end; $$;

do $$
declare v_owner uuid:=pg_temp.n4_uuid('owner');v_other uuid:=pg_temp.n4_uuid('other');v_spot uuid:=pg_temp.n4_uuid('spot');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',v_owner,'authenticated','authenticated','n4-owner@fixture.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_other,'authenticated','authenticated','n4-other@fixture.invalid','','{}','{}',now(),now());
  insert into public.spots(id,name,lat,lng,city,status,owner_id) values(v_spot,'N4 Fixture',47.5596,7.5886,'Basel','approved',v_owner);
  insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source)
    values(v_spot,v_owner,'PREMIUM','TEST_FIXTURE');
  insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance)
    values(v_spot,'category','FACT','"bar"','canonical_spot_data','spots.category',0.98,now()-interval '1 day',now()-interval '1 day','{"source":"spots"}');
  perform pg_temp.n4_assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'dimension registry is complete');
end; $$;

set local role authenticated;
select pg_temp.n4_actor(pg_temp.n4_uuid('owner'));
do $$
declare v_spot uuid:=pg_temp.n4_uuid('spot');v_first jsonb;v_replay jsonb;v_conflict jsonb;
begin
  v_first:=public.backyrd_submit_spot_intelligence_claim_v1(v_spot,'vibe.quiet','0.9','{"time":"evening"}','quiet-1');
  perform pg_temp.n4_assert((v_first->>'inserted')::boolean,'first premium claim inserts');
  v_replay:=public.backyrd_submit_spot_intelligence_claim_v1(v_spot,'vibe.quiet','0.9','{"time":"evening"}','quiet-1');
  perform pg_temp.n4_assert(not (v_replay->>'inserted')::boolean,'exact replay is idempotent');
  v_conflict:=public.backyrd_submit_spot_intelligence_claim_v1(v_spot,'vibe.lively','0.9','{"time":"evening"}','lively-1');
  perform pg_temp.n4_assert(v_conflict->>'status'='NEEDS_REVIEW','contradictory claim is isolated for review');
  perform pg_temp.n4_assert((select count(*)=2 from public.backyrd_get_my_spot_intelligence_claims_v1(v_spot,100)),'owner can read own bounded claims');
  begin
    insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source) values(pg_temp.n4_uuid('other-spot'),pg_temp.n4_uuid('owner'),'PREMIUM','TEST_FIXTURE');
    raise exception 'client entitlement mutation accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance)
      values(v_spot,'vibe.cozy','INTERPRETATION','1','owner_provided','forged',1,now(),now(),'{}');
    raise exception 'client canonical evidence write accepted';
  exception when insufficient_privilege then null; end;
end; $$;

select pg_temp.n4_actor(pg_temp.n4_uuid('other'));
do $$ begin
  begin perform public.backyrd_submit_spot_intelligence_claim_v1(pg_temp.n4_uuid('spot'),'vibe.cozy','0.9','{}','cross-owner'); raise exception 'cross-owner claim accepted';
  exception when insufficient_privilege then perform pg_temp.n4_assert(sqlerrm='spot_owner_required','cross-owner write fails closed'); end;
  perform pg_temp.n4_assert((select count(*)=0 from public.backyrd_spot_owner_claims_v1),'RLS hides another Owners claims');
end; $$;
reset role;

do $$
declare v_spot uuid:=pg_temp.n4_uuid('spot');
begin
  begin
    insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance)
      values(v_spot,'vibe.cozy','INTERPRETATION','0.9','ai_derived','ai-bad',0.5,now(),now(),'{}');
    raise exception 'AI evidence without provenance accepted';
  exception when invalid_parameter_value then perform pg_temp.n4_assert(sqlerrm='ai_provenance_required','AI provenance is mandatory'); end;
  begin
    insert into public.backyrd_spot_intelligence_snapshots_v1(spot_id,intelligence,confidence,completeness,fingerprint,calculated_at)
      values(v_spot,'{"payment_status":"premium"}',0.8,0.8,repeat('a',64),now());
    raise exception 'payment feature entered snapshot';
  exception when invalid_parameter_value then perform pg_temp.n4_assert(sqlerrm='forbidden_snapshot_feature','payment cannot become Decision evidence'); end;
  perform pg_temp.n4_assert(not has_table_privilege('anon','public.backyrd_spot_intelligence_evidence_v1','select'),'anonymous raw Evidence read denied');
  perform pg_temp.n4_assert(not has_table_privilege('authenticated','public.backyrd_spot_intelligence_snapshots_v1','select'),'client snapshot read denied');
  perform pg_temp.n4_assert((select relrowsecurity from pg_class where oid='public.backyrd_spot_owner_claims_v1'::regclass),'Owner Claims RLS enabled');
  perform pg_temp.n4_assert((select count(*)=2 from public.backyrd_spot_intelligence_audit_v1),'Owner changes have an audit trail');
end; $$;

rollback;
