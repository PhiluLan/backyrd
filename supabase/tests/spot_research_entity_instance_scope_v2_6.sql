begin;

create or replace function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Research entity-instance v2.6 test failed: %',p_message; end if; end $$;

select pg_temp.assert(not has_function_privilege('service_role','public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(uuid,uuid,text,jsonb,jsonb,jsonb)','EXECUTE'),'legacy v2.5 finalizer remains callable');
select pg_temp.assert(has_function_privilege('service_role','public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb)','EXECUTE'),'service role cannot execute v2.6 finalizer');
select pg_temp.assert(position('research_source_instance_scope_mismatch' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'source instance gate missing from finalizer');
select pg_temp.assert(position('research_proposal_instance_scope_mismatch' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'proposal instance gate missing from finalizer');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','77777777-7777-4777-8777-777777777777','authenticated','authenticated','entity-instance-test@invalid.test','','{}','{}',now(),now());
insert into public.spots(id,name,lat,lng,status,city,website,data_origin)
values('88888888-8888-4888-8888-888888888888','Instance Test',47.56,7.59,'approved','Basel','https://brand.example/basel-sbb','TEST');
insert into public.backyrd_spot_research_jobs_v1(id,spot_id,actor_id,state,contract_version,source_scope,source_scope_hash,current_pass,phase)
values('99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888','77777777-7777-4777-8777-777777777777','RUNNING','backyrd-spot-research-agent-v2.1','{"officialWebsite":"https://brand.example/basel-sbb"}',repeat('b',64),'A','PASS_A_RUNNING');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare v_extraction jsonb:=jsonb_build_object('sourceUrl','https://brand.example/');v_proposal jsonb:=jsonb_build_object('sourceUrl','https://brand.example/basel-sbb','fieldKey','contact.website','value','"https://brand.example/"'::jsonb);
begin
  begin
    perform public.backyrd_finalize_spot_research_pass_v3('99999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A',jsonb_build_array(v_extraction),'[]','{}');
    raise exception 'generic brand source bypassed concrete instance boundary';
  exception when invalid_parameter_value then perform pg_temp.assert(sqlerrm='research_source_instance_scope_mismatch','generic brand source did not fail closed'); end;
  begin
    perform public.backyrd_finalize_spot_research_pass_v3('99999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A','[]',jsonb_build_array(v_proposal),'{}');
    raise exception 'generic brand website bypassed concrete instance boundary';
  exception when invalid_parameter_value then perform pg_temp.assert(sqlerrm='research_proposal_instance_scope_mismatch','generic brand website did not fail closed'); end;
  begin
    perform public.backyrd_finalize_spot_research_pass_v3('99999999-9999-4999-8999-999999999999','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A',jsonb_build_array(v_extraction||jsonb_build_object('sourceUrl','https://brand.example/basel/events')),'[]','{}');
    raise exception 'sibling path bypassed concrete instance boundary';
  exception when invalid_parameter_value then perform pg_temp.assert(sqlerrm='research_source_instance_scope_mismatch','sibling path did not fail closed'); end;
end $$;
reset role;

rollback;
