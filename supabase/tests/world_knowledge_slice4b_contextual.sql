\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'world knowledge slice4b failed: %',p_message; end if; end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$
declare actual_state text; begin begin execute p_sql; exception when others then get stacked diagnostics actual_state=returned_sqlstate; if actual_state=p_state then return; end if; raise exception '% (expected %, received %)',p_message,p_state,actual_state; end; raise exception '% (unexpected success)',p_message; end$$;

select set_config('app.world_knowledge_founder_authoring_enabled','on',true);

select pg_temp.assert(world_knowledge_private.attribute_value_valid_v3('backyrd.world-knowledge.registry@2.1','purpose.primary_visit','KNOWN_VALUE','"NATURE_ANIMAL_EXPERIENCE"'),'primary purpose rejected');
select pg_temp.assert(world_knowledge_private.attribute_value_valid_v3('backyrd.world-knowledge.registry@2.1','offering.onsite','KNOWN_VALUE','[{"kind":"KIOSK","relationship":"EMBEDDED_FACILITY","area":"Eingang"}]'),'on-site offering rejected');
select pg_temp.assert(not world_knowledge_private.attribute_value_valid_v3('backyrd.world-knowledge.registry@2.1','offering.onsite','KNOWN_VALUE','[{"kind":"CAFE","relationship":"NEARBY","area":null}]'),'nearby offering accepted');
select pg_temp.assert(world_knowledge_private.attribute_value_valid_v3('backyrd.world-knowledge.registry@2.1','context.visit_situations','KNOWN_VALUE','[{"situation":"FAMILY","conditions":{"dayparts":["AFTERNOON"],"days":["SATURDAY"],"area":null,"occasion":null,"groupSize":{"min":2,"max":6},"ageContext":"MIXED_AGES","accompaniment":"ADULT","eventMode":"NORMAL_OPERATION"}}]'),'conditional visit situation rejected');
select pg_temp.assert(not world_knowledge_private.attribute_value_valid_v3('backyrd.world-knowledge.registry@2.1','context.atmosphere','KNOWN_VALUE','[{"atmosphere":"TRENDY","conditions":{"dayparts":[],"days":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":null}}]'),'unregistered atmosphere accepted');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000',pg_temp.id('wk4b-admin'),'authenticated','authenticated','wk4b-admin@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
update public.profiles set is_admin=true where id=pg_temp.id('wk4b-admin');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk4b-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table wk4b_spot as select (public.world_founder_create_spot_v1('Context Test',null,'wk4b-create')->>'spotId')::uuid spot_id;
select public.world_admin_submit_claim_v1(spot_id,'purpose.primary_visit','KNOWN_VALUE','"NATURE_ANIMAL_EXPERIENCE"',clock_timestamp(),null,null,'PUBLIC',null,'wk4b-purpose') from wk4b_spot;
select public.world_admin_submit_claim_v1(spot_id,'offering.onsite','KNOWN_VALUE','[{"kind":"KIOSK","relationship":"EMBEDDED_FACILITY","area":"Eingang"}]',clock_timestamp(),null,null,'PUBLIC',null,'wk4b-onsite') from wk4b_spot;
select public.world_admin_submit_claim_v1(spot_id,'context.visit_situations','KNOWN_VALUE','[{"situation":"FAMILY","conditions":{"dayparts":["AFTERNOON"],"days":["SATURDAY"],"area":null,"occasion":null,"groupSize":{"min":2,"max":6},"ageContext":"MIXED_AGES","accompaniment":"ADULT","eventMode":"NORMAL_OPERATION"}}]',clock_timestamp(),null,null,'PUBLIC',null,'wk4b-visit') from wk4b_spot;
select public.world_admin_submit_claim_v1(spot_id,'context.atmosphere','KNOWN_VALUE','[{"atmosphere":"QUIET","conditions":{"dayparts":["MORNING"],"days":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":"NORMAL_OPERATION"}}]',clock_timestamp()-interval '2 seconds',null,null,'PUBLIC',null,'wk4b-atmosphere-founder') from wk4b_spot;
select public.world_admin_submit_claim_v1(spot_id,'context.atmosphere','KNOWN_VALUE','[{"atmosphere":"LIVELY","conditions":{"dayparts":["MORNING"],"days":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":"NORMAL_OPERATION"}}]',clock_timestamp()-interval '1 second',null,null,'PUBLIC',null,'wk4b-atmosphere-owner') from wk4b_spot;
select pg_temp.assert((public.world_authoring_get_spot_v1((select spot_id from wk4b_spot))#>>'{answers,purpose.primary_visit,value}')='NATURE_ANIMAL_EXPERIENCE','context answer not restored');
reset role;

grant select on wk4b_spot to service_role;
set local role service_role;
create temporary table wk4b_manifest as select public.world_shadow_rebuild_spot_v1(spot_id,clock_timestamp()+interval '1 second','FULL','wk4b-rebuild') payload from wk4b_spot;
select pg_temp.assert((select payload#>>'{worldSnapshot,registryVersion}'='backyrd.world-knowledge.registry@2.1' from wk4b_manifest),'registry 2.1 snapshot missing');
select pg_temp.assert((select not payload->'decisionProjection'->'facts' @> '[{"key":"purpose.primary_visit"}]'::jsonb from wk4b_manifest),'context leaked into Decision projection');
select pg_temp.assert((select not payload->'decisionProjection'->'facts' @> '[{"key":"offering.onsite"}]'::jsonb from wk4b_manifest),'on-site offering leaked into Decision projection');
select pg_temp.assert((select payload->'worldSnapshot'->'conflicts' @> '[{"key":"context.atmosphere"}]'::jsonb from wk4b_manifest),'context conflict was silently resolved by newest value');
create temporary table wk4b_cohort as select public.world_founder_export_cohort_v1('wk4b-context') payload;
select pg_temp.assert((select payload->>'contractVersion'='backyrd.world-knowledge.founder-cohort-shadow@3.0' from wk4b_cohort),'context cohort contract missing');
select pg_temp.assert((select payload#>>'{spots,0,contextHandoff,contractVersion}'='backyrd.world-knowledge.context-handoff-shadow@1.0' from wk4b_cohort),'context handoff missing');
select pg_temp.assert((select payload#>>'{spots,0,contextHandoff,entries,purpose.primary_visit,value}'='NATURE_ANIMAL_EXPERIENCE' from wk4b_cohort),'context handoff purpose missing');
select pg_temp.assert((select not exists(select 1 from jsonb_each(payload#>'{spots,0,contextHandoff,entries}') entry where entry.value->>'resolution' in ('UNKNOWN','DISPUTED')) from wk4b_cohort),'non-known context appeared in the known-entry partition');
select pg_temp.assert((select (payload#>'{spots,0,contextHandoff,entries}')::text !~* 'subscription|payment|owner[_ ]?tier|private_source|user_taste' from wk4b_cohort),'private or commercial data leaked into contextual entries');
reset role;

select pg_temp.assert(not has_function_privilege('anon','public.world_founder_export_cohort_v1(text)','execute') and not has_function_privilege('authenticated','public.world_founder_export_cohort_v1(text)','execute'),'client context export access');
select pg_temp.assert(not has_function_privilege('service_role','world_knowledge_private.context_handoff_v1(jsonb)','execute'),'private context helper directly executable');
select pg_temp.assert(not exists(
  select 1
  from world_knowledge_private.security_inventory_v1
  where object_name in ('authoring_section_review_events_v1','authoring_taxonomy_candidates_v1','authoring_taxonomy_candidates_v2')
    and (not service_role_access or expected_mutation_authority<>'AUTHORIZED_SERVER_RPC_APPEND_ONLY')
),'append-only authoring tables absent or misclassified in security inventory');
select pg_temp.assert(not has_table_privilege('service_role','world_knowledge_private.authoring_section_review_events_v1','UPDATE,DELETE'),'append-only review events unexpectedly mutable');
select pg_temp.assert(not has_table_privilege('service_role','world_knowledge_private.authoring_taxonomy_candidates_v1','UPDATE,DELETE'),'append-only taxonomy v1 unexpectedly mutable');
select pg_temp.assert(not has_table_privilege('service_role','world_knowledge_private.authoring_taxonomy_candidates_v2','UPDATE,DELETE'),'append-only taxonomy v2 unexpectedly mutable');

rollback;
