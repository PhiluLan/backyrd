\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.learning_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'learning workshop: %',label; end if; end $$;
create function pg_temp.learning_actor(actor uuid,role_name text default 'authenticated') returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claim.role',role_name,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',role_name)::text,true);
end $$;
insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('c0900000-0000-4000-8000-000000000001','authenticated','authenticated','learning-admin@invalid','',now(),now()),
 ('c0900000-0000-4000-8000-000000000002','authenticated','authenticated','learning-user@invalid','',now(),now());
insert into public.profiles(id,is_admin) values('c0900000-0000-4000-8000-000000000001',true),('c0900000-0000-4000-8000-000000000002',false)
 on conflict(id) do update set is_admin=excluded.is_admin;
create temporary table learning_fixture(k text primary key,v jsonb);
grant all on table learning_fixture to authenticated,service_role;
insert into learning_fixture values('document','{"query":"Heute einen Kaffee trinken.","notes":"","obligations":["Kaffee ist Zweck."],"forbidden":[],"tags":[],"locale":"de-CH","reference":{"now":"2026-11-25T09:00:00Z","timezone":"Europe/Zurich"},"source":"synthetic","dataPolicy":"SYNTHETIC_OR_REDACTED"}');

set local role anon;
do $$ begin
 begin perform public.admin_nuknuk_learning_v1('list'); raise exception 'anon list accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_nuknuk_learning_proposal_v1('reserve',gen_random_uuid(),null,'{}','c0900000-0000-4000-8000-000000000001'); raise exception 'anon provider accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select pg_temp.learning_actor('c0900000-0000-4000-8000-000000000002');
do $$ begin
 begin perform public.admin_nuknuk_learning_v1('list'); raise exception 'ordinary user list accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_nuknuk_learning_v1('create',null,null,'{}'); raise exception 'ordinary user create accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_nuknuk_learning_v1('report',null,null,'{}'); raise exception 'ordinary user report accepted'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.learning_actor('c0900000-0000-4000-8000-000000000001');
do $$ declare doc jsonb; res jsonb; id uuid; begin
 select v into doc from learning_fixture where k='document';
 begin perform public.admin_nuknuk_learning_v1('create',null,null,jsonb_build_object('document',doc||'{"query":null}', 'familyTitle','Invalid','topic','everyday','split','TRAIN')); raise exception 'null source accepted'; exception when invalid_parameter_value then null; end;
 res:=public.admin_nuknuk_learning_v1('create',null,null,jsonb_build_object('document',doc,'familyTitle','Coffee','topic','everyday','split','TRAIN'));
 insert into learning_fixture values('train',res);
 id:=(res->>'id')::uuid;
 begin perform public.admin_nuknuk_learning_v1('review',id,1,'{"state":"approved","note":"yes"}'); raise exception 'untranslated approval accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_nuknuk_learning_v1('translate',id,1,'{"target":{"meaning":{}}}'); raise exception 'caller target forgery accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_nuknuk_learning_proposal_v1('translate',id,1,'{}','c0900000-0000-4000-8000-000000000001'); raise exception 'admin direct machine proposal accepted'; exception when insufficient_privilege then null; end;
 begin execute 'select * from nuknuk_learning_private.cases'; raise exception 'direct internal read accepted'; exception when insufficient_privilege then null; end;
 res:=public.admin_nuknuk_learning_v1('create',null,null,jsonb_build_object('document',jsonb_set(doc,'{query}','"Morgen Pizza essen."'),'familyTitle','Pizza DEV','topic','food','split','DEV'));
 insert into learning_fixture values('dev',res);
 res:=public.admin_nuknuk_learning_v1('create',null,null,jsonb_build_object('document',jsonb_set(doc,'{query}','"Am Samstag ins Kino."'),'familyTitle','Cinema TEST','topic','everyday','split','TEST'));
 insert into learning_fixture values('test',res);
 begin perform public.admin_nuknuk_learning_v1('create',null,null,jsonb_build_object('document',doc,'familyTitle','Leak','topic','everyday','split','TEST')); raise exception 'duplicate across splits accepted'; exception when unique_violation then null; end;
end $$;
reset role;
set local role service_role;
select pg_temp.learning_actor(null,'service_role');
do $$ declare row record; id uuid; begin
 for row in select * from learning_fixture where k in ('train','dev','test') loop
  id:=(row.v->>'id')::uuid;
  perform public.admin_nuknuk_learning_proposal_v1('translate',id,1,jsonb_build_object('target','{"meaning":{"entities":[],"facts":[]}}'::jsonb,'policy','backyrd.learning-teacher@1:sql-fixture'),'c0900000-0000-4000-8000-000000000001');
 end loop;
 begin perform public.admin_nuknuk_learning_proposal_v1('reserve',gen_random_uuid(),null,'{}','c0900000-0000-4000-8000-000000000002'); raise exception 'non-admin actor accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select pg_temp.learning_actor('c0900000-0000-4000-8000-000000000001');
do $$ declare row record; id uuid; detail jsonb; res jsonb; before_hash text; begin
 for row in select * from learning_fixture where k in ('train','dev','test') loop
  id:=(row.v->>'id')::uuid;
  detail:=public.admin_nuknuk_learning_v1('detail',id);
  perform pg_temp.learning_assert(detail#>>'{case,state}'='review','machine proposal is review only');
  begin perform public.admin_nuknuk_learning_v1('review',id,2,'{"state":"approved","note":"checked"}'); raise exception 'unchecked approval accepted'; exception when invalid_parameter_value then null; end;
  perform public.admin_nuknuk_learning_v1('review',id,2,'{"state":"approved","note":"All source obligations and target checked.","checks":{"meaning":true,"roles":true,"nothingInvented":true,"privacy":true}}');
 end loop;
 id:=(select (v->>'id')::uuid from learning_fixture where k='train');
 detail:=public.admin_nuknuk_learning_v1('detail',id);before_hash:=detail#>>'{case,approval_hash}';
 perform public.admin_nuknuk_learning_v1('comment',id,3,'{"note":"A comment does not change meaning."}');
 detail:=public.admin_nuknuk_learning_v1('detail',id);
 perform pg_temp.learning_assert(detail#>>'{case,approval_hash}'=before_hash and detail#>>'{case,revision}'='4','comment preserves content approval, changes optimistic version');
 begin perform public.admin_nuknuk_learning_v1('review',id,3,'{"state":"blocked","note":"stale editor"}'); raise exception 'stale review accepted'; exception when serialization_failure then null; end;
 res:=public.admin_nuknuk_learning_v1('prepare',null,null,'{"title":"Round one","kind":"TRAIN_DEV"}');insert into learning_fixture values('run',res);
 res:=public.admin_nuknuk_learning_v1('export',(res->>'id')::uuid);
 perform pg_temp.learning_assert(jsonb_array_length((res->>'manifestBytes')::jsonb->'rows')=2,'only TRAIN and DEV exported');
 perform pg_temp.learning_assert(not exists(select 1 from jsonb_array_elements((res->>'manifestBytes')::jsonb->'rows')x where x->>'split'='TEST'),'TEST absent from training');
 perform pg_temp.learning_assert(encode(extensions.digest(convert_to(res->>'manifestBytes','UTF8'),'sha256'),'hex')=res->>'manifestHash','exact export bytes bound');
 perform public.admin_nuknuk_learning_v1('save',id,4,jsonb_build_object('document',(detail#>'{case,document}')||'{"notes":"Correction needed."}'));
 detail:=public.admin_nuknuk_learning_v1('detail',id);
 perform pg_temp.learning_assert(detail#>>'{case,state}'='draft' and detail#>'{case,target}'='null'::jsonb and detail#>'{case,approval_hash}'='null'::jsonb,'editing revokes proposal and approval');
  begin perform public.admin_nuknuk_learning_v1('export',(select (v->>'id')::uuid from learning_fixture where k='run')); raise exception 'withdrawn frozen approval exported'; exception when invalid_parameter_value then null; end;
 perform pg_temp.learning_assert(jsonb_array_length(detail->'history')=5,'full append-only exchange recorded');
 res:=jsonb_build_object('version','backyrd.nuknuk-learning-report@1','kind','TRAINING_RECEIPT','manifestHash',(select v->>'manifestHash' from learning_fixture where k='run'),'adapterHash',null,'trainingStatus','FAILED','rows','[]'::jsonb,'productionActivated',false);
 begin perform public.admin_nuknuk_learning_v1('report',(select (v->>'id')::uuid from learning_fixture where k='run'),null,jsonb_build_object('manifestHash',res->>'manifestHash','report',res||'{"productionActivated":true}')); raise exception 'deployment claim accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.admin_nuknuk_learning_v1('report',(select (v->>'id')::uuid from learning_fixture where k='run'),null,jsonb_build_object('manifestHash',res->>'manifestHash','report',res-'trainingStatus')); raise exception 'missing adapter without failed receipt accepted'; exception when invalid_parameter_value then null; end;
 perform public.admin_nuknuk_learning_v1('report',(select (v->>'id')::uuid from learning_fixture where k='run'),null,jsonb_build_object('manifestHash',res->>'manifestHash','report',res));

 begin perform public.admin_nuknuk_learning_v1('prepare',null,null,'{"title":"test","kind":"TEST"}'); raise exception 'unbound TEST opened'; exception when invalid_parameter_value then null; end;
 res:=public.admin_nuknuk_learning_v1('prepare',null,null,jsonb_build_object('title','Final TEST','kind','TEST','adapterHash',repeat('1',64)));insert into learning_fixture values('test-run',res);
 begin perform public.admin_nuknuk_learning_v1('prepare',null,null,jsonb_build_object('title','Repeated TEST','kind','TEST','adapterHash',repeat('2',64))); raise exception 'consumed test family reused'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role service_role;
select pg_temp.learning_actor(null,'service_role');
do $$ declare res jsonb; id uuid; i integer; begin
 id:=(select (v->>'id')::uuid from learning_fixture where k='train');
 res:=public.admin_nuknuk_learning_proposal_v1('variants',id,5,'{"queries":["Ich hätte heute gerne Kaffee."]}','c0900000-0000-4000-8000-000000000001');
 perform pg_temp.learning_assert((res->>'variantsCreated')::integer=1,'variant created');
 perform public.admin_nuknuk_learning_proposal_v1('situations',gen_random_uuid(),null,'{"topic":"everyday","split":"TRAIN","reference":{"now":"2026-11-25T09:00:00Z","timezone":"Europe/Zurich"},"rows":[{"title":"A different activity","query":"Ich möchte heute ein Buch in einem ruhigen Café lesen.","obligations":["Lesen und Kaffeeort erhalten."],"forbidden":[]}]}','c0900000-0000-4000-8000-000000000001');
 for i in 1..30 loop perform public.admin_nuknuk_learning_proposal_v1('reserve',gen_random_uuid(),null,'{}','c0900000-0000-4000-8000-000000000001'); end loop;
 begin perform public.admin_nuknuk_learning_proposal_v1('reserve',gen_random_uuid(),null,'{}','c0900000-0000-4000-8000-000000000001'); raise exception 'provider quota exceeded'; exception when program_limit_exceeded then null; end;
end $$;
reset role;
do $$ declare count_rows integer; begin
 select count(*) into count_rows from nuknuk_learning_private.cases c join nuknuk_learning_private.families f on f.id=c.family_id
 where c.parent_id=(select (v->>'id')::uuid from learning_fixture where k='train') and f.split='TRAIN' and c.state='draft' and c.target is null and c.approval_hash is null;
 perform pg_temp.learning_assert(count_rows=1,'variants inherit split, never approval or target');
 perform pg_temp.learning_assert(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nuknuk_learning_private' and c.relkind='r' and not c.relrowsecurity),'RLS on all internal tables');
 perform pg_temp.learning_assert(not has_function_privilege('anon','public.admin_nuknuk_learning_v1(text,uuid,integer,jsonb)','execute'),'anonymous RPC denied');
 perform pg_temp.learning_assert(not has_function_privilege('authenticated','public.admin_nuknuk_learning_proposal_v1(text,uuid,integer,jsonb,uuid)','execute'),'client proposal forgery denied');
end $$;
rollback;
