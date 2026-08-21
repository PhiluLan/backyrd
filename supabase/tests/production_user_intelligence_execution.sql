\set ON_ERROR_STOP on
begin;
update public.backyrd_user_intelligence_work_v1 set state='FAILED',lease_token=null,locked_at=null where state in('PENDING','RETRYABLE','PROCESSING');
delete from public.backyrd_user_intelligence_user_leases_v1;
create function pg_temp.uuid(p text) returns uuid language sql immutable as $$ select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.assert(p boolean,m text) returns void language plpgsql as $$ begin if p is not true then raise exception 'execution test failed: %',m; end if; end $$;
do $$ declare u uuid:=pg_temp.uuid('execution-user');s uuid:=pg_temp.uuid('execution-spot');begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','execution@fixture.invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.spots(id,name,lat,lng,status) values(s,'Execution',47,7,'approved');
 insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active) values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true) on conflict do nothing;
 insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values(u,'personalized_recommendations','granted',now(),'system_migration');
 insert into public.backyrd_internal_live_users_v1(user_id,enabled,activated_at) values(u,true,now());
 update public.backyrd_user_intelligence_runtime_settings_v1 set enabled=true;
end $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);select set_config('request.jwt.claim.role','service_role',true);
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('execution-user'),'idempotencyKey','execution:one','eventType','candidate_exposed','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '1 minute','observedAt',now()-interval '1 minute','spotId',pg_temp.uuid('execution-spot'),'sessionId','execution-session','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','fixture','sourceEventId','execution:one','sourceVersion','v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select * from public.backyrd_claim_user_intelligence_work_v1(60) \gset claim_
select pg_temp.assert(:'claim_user_id'::uuid=pg_temp.uuid('execution-user'),'service runner claims the expected user');
select pg_temp.assert((select count(*)=1 from public.backyrd_user_intelligence_work_v1 where user_id=pg_temp.uuid('execution-user') and state='PROCESSING'),'claim is atomic');
select public.backyrd_fail_user_intelligence_work_v1(:'claim_user_id',:'claim_lease_token',true,'TEMPORARY_FIXTURE');
update public.backyrd_user_intelligence_work_v1 set available_at=now() where user_id=pg_temp.uuid('execution-user');
select * from public.backyrd_claim_user_intelligence_work_v1(60) \gset retry_
select pg_temp.assert(:'retry_attempt'::int=2,'retry increments attempt exactly once');
select public.backyrd_fail_user_intelligence_work_v1(:'retry_user_id',:'retry_lease_token',false,'TERMINAL_FIXTURE');
select pg_temp.assert((select count(*)=1 from public.backyrd_user_intelligence_work_v1 where user_id=pg_temp.uuid('execution-user') and state='FAILED'),'terminal disposition is explicit');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uuid('execution-user'),'role','authenticated')::text,true);select set_config('request.jwt.claim.sub',pg_temp.uuid('execution-user')::text,true);select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
 begin perform public.backyrd_claim_user_intelligence_work_v1(60);raise exception 'client claimed work';exception when insufficient_privilege then null;end;
 begin perform public.backyrd_enqueue_user_intelligence_rebuild_v1(pg_temp.uuid('execution-user'),'FORGED');raise exception 'client queued rebuild';exception when insufficient_privilege then null;end;
 begin insert into public.backyrd_user_intelligence_snapshots_v2(user_id,runtime_version,input_contract_version,source_hash,snapshot_hash,card,node_count) values(pg_temp.uuid('execution-user'),'x','x',repeat('a',64),repeat('b',64),'{}',0);raise exception 'client forged snapshot';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
