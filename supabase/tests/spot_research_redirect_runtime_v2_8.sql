begin;
create or replace function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'Research redirect runtime v2.8 test failed: %',p_message;end if;end $$;
select pg_temp.assert(position('v_spot_name' in pg_get_functiondef('public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure))>0,'canonical Spot name is not bound to SQL finalizer');
select pg_temp.assert(position('backyrd-spot-research-policy-v2.8' in pg_get_functiondef('public.backyrd_city_bootstrap_enqueue_research_v1(uuid)'::regprocedure))>0,'City enqueue policy was not versioned to v2.8');
select pg_temp.assert(not has_function_privilege('service_role','public.backyrd_finalize_spot_research_pass_v3_entity_redirect_v27(uuid,uuid,text,jsonb,jsonb,jsonb)','EXECUTE'),'legacy v2.7 finalizer remains callable');
rollback;
