begin;

create function pg_temp.unified_wiring_assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if p_ok is not true then raise exception 'unified wiring failed: %',p_message;end if;end$$;

select pg_temp.unified_wiring_assert((select count(*)=7 from information_schema.columns where table_schema='public' and table_name='backyrd_user_evidence_processing_v1' and column_name in('fusion_disposition','card_disposition','fusion_input_count','card_contribution_count','hypothesis_change_count','active_node_contribution_count','suppression_reason')),'lineage columns missing');
select pg_temp.unified_wiring_assert(to_regprocedure('public.backyrd_persist_shared_user_intelligence_v4(uuid,text,text,timestamp with time zone,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid)') is not null,'v4 persistence RPC missing');
select pg_temp.unified_wiring_assert(not has_function_privilege('anon','public.backyrd_persist_shared_user_intelligence_v4(uuid,text,text,timestamp with time zone,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid)','EXECUTE'),'anon can execute User Intelligence persistence');
select pg_temp.unified_wiring_assert(not has_function_privilege('authenticated','public.backyrd_persist_shared_user_intelligence_v4(uuid,text,text,timestamp with time zone,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid)','EXECUTE'),'authenticated can execute User Intelligence persistence');
select pg_temp.unified_wiring_assert(has_function_privilege('service_role','public.backyrd_persist_shared_user_intelligence_v4(uuid,text,text,timestamp with time zone,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid)','EXECUTE'),'service role cannot execute User Intelligence persistence');

rollback;
