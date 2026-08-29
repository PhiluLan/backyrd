\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Research entity-scope v2.5 test failed: %',p_message; end if; end $$;

select pg_temp.assert(public.backyrd_research_public_host_v1('https://www.example.org/path')='example.org','www host normalization failed');
select pg_temp.assert(public.backyrd_research_public_host_v1('https://example.org/')='example.org','root host normalization failed');
select pg_temp.assert(public.backyrd_research_public_host_v1('http://example.org/') is null,'HTTP URL passed');
select pg_temp.assert(public.backyrd_research_public_host_v1('https://localhost/path') is null,'localhost passed');
select pg_temp.assert(public.backyrd_research_public_host_v1('https://127.0.0.1/path') is null,'loopback passed');
select pg_temp.assert(public.backyrd_research_public_host_v1('https://user:secret@example.org/path') is null,'credential-bearing URL passed');
select pg_temp.assert(public.backyrd_research_public_host_v1('https://example.org/#fragment') is null,'non-canonical fragment passed');

select pg_temp.assert(exists(select 1 from information_schema.columns where table_schema='public' and table_name='backyrd_spot_research_extractions_v2' and column_name='entity_scope'),'extraction entity scope missing');
select pg_temp.assert(exists(select 1 from information_schema.columns where table_schema='public' and table_name='backyrd_spot_research_extractions_v2' and column_name='scope_resolution'),'extraction scope resolution missing');
select pg_temp.assert(exists(select 1 from information_schema.columns where table_schema='public' and table_name='backyrd_spot_fact_proposals_v1' and column_name='research_entity_scope'),'proposal entity scope missing');

select pg_temp.assert(has_function_privilege('service_role','public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb)','execute'),'service role cannot execute hardened v3 finalizer');
select pg_temp.assert(not has_function_privilege('service_role','public.backyrd_finalize_spot_research_pass_v3_legacy(uuid,uuid,text,jsonb,jsonb,jsonb)','execute'),'service role can bypass hardened v3 through legacy implementation');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb)','execute'),'client can execute hardened v3 finalizer');

select pg_temp.assert(position('x->>''entityScope''<>''SPOT''' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'SPOT entity guard missing');
select pg_temp.assert(position('x->>''durability''<>''PERSISTENT''' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'persistent durability guard missing');
select pg_temp.assert(position('x->>''scopeResolution''<>''PASS''' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'deterministic resolution guard missing');
select pg_temp.assert(position('backyrd_research_public_host_v1' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'official-host guard missing');
select pg_temp.assert(position('research_proposal_extraction_mismatch' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'proposal-to-extraction guard missing');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','33333333-3333-4333-8333-333333333333','authenticated','authenticated','entity-scope-test@invalid.test','','{}','{}',now(),now());
insert into public.spots(id,name,lat,lng,status,city,website,data_origin)
values('44444444-4444-4444-8444-444444444444','Entity Scope Test',47.56,7.59,'approved','Basel','https://entity-scope.example/','TEST');
insert into public.backyrd_spot_research_jobs_v1(id,spot_id,actor_id,state,contract_version,source_scope,source_scope_hash,current_pass,phase)
values('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','RUNNING','backyrd-spot-research-agent-v2.1','{"officialWebsite":"https://entity-scope.example/"}',repeat('a',64),'A','PASS_A_RUNNING');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare v_base jsonb:=jsonb_build_object('fieldKey','activity.types','value','["MUSEUM"]'::jsonb,'evidenceScope','SPOT','entityScope','SPOT','subjectName','Entity Scope Test','durability','PERSISTENT','scopeResolution','PASS','sourceUrl','https://entity-scope.example/visit');
begin
  begin
    perform public.backyrd_finalize_spot_research_pass_v3('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','A','[]',jsonb_build_array(v_base||jsonb_build_object('entityScope','EVENT')),'{}');
    raise exception 'event entity bypassed database boundary';
  exception when invalid_parameter_value then perform pg_temp.assert(sqlerrm='research_spot_entity_scope_required','event entity did not fail closed'); end;
  begin
    perform public.backyrd_finalize_spot_research_pass_v3('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','A','[]',jsonb_build_array(v_base||jsonb_build_object('scopeResolution','PROMPT_INJECTION_SIGNAL')),'{}');
    raise exception 'non-PASS deterministic result bypassed database boundary';
  exception when invalid_parameter_value then perform pg_temp.assert(sqlerrm='research_spot_entity_scope_required','scope resolution did not fail closed'); end;
  begin
    perform public.backyrd_finalize_spot_research_pass_v3('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','A','[]',jsonb_build_array(v_base||jsonb_build_object('fieldKey','contact.website','value','"https://attacker.invalid/"'::jsonb)),'{}');
    raise exception 'foreign proposed website bypassed database boundary';
  exception when invalid_parameter_value then perform pg_temp.assert(sqlerrm in ('research_spot_entity_scope_required','research_proposal_instance_scope_mismatch'),'foreign website did not fail closed'); end;
  begin
    perform public.backyrd_finalize_spot_research_pass_v3('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','A','[]',jsonb_build_array(v_base),'{}');
    raise exception 'orphan proposal bypassed extraction lineage';
  exception when invalid_parameter_value then perform pg_temp.assert(sqlerrm='research_proposal_extraction_mismatch','orphan proposal did not fail closed'); end;
end $$;
reset role;
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_fact_proposals_v1 where spot_id='44444444-4444-4444-8444-444444444444'),'invalid scope created a proposal');

select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
select pg_temp.assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen taste registry changed');

rollback;
