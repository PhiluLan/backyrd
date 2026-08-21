-- Sprint 2.5: persistence only. The shared JS runtime remains the sole
-- intelligence authority; this migration contains no inference logic.
create table public.backyrd_user_intelligence_snapshots_v2 (
  snapshot_id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  runtime_version text not null, input_contract_version text not null, source_watermark timestamptz, source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'), card jsonb not null check(jsonb_typeof(card)='object'), node_count integer not null check(node_count>=0), status text not null default 'COMMITTED' check(status='COMMITTED'), created_at timestamptz not null default now(), unique(user_id,snapshot_hash)
);
create table public.backyrd_user_intelligence_snapshot_nodes_v1 (
  snapshot_id uuid not null references public.backyrd_user_intelligence_snapshots_v2(snapshot_id) on delete cascade, node_key text not null, node jsonb not null check(jsonb_typeof(node)='object'), primary key(snapshot_id,node_key)
);
create table public.backyrd_user_intelligence_latest_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade, snapshot_id uuid not null references public.backyrd_user_intelligence_snapshots_v2(snapshot_id) on delete restrict, source_watermark timestamptz, updated_at timestamptz not null default now()
);
alter table public.backyrd_user_intelligence_snapshots_v2 enable row level security;
alter table public.backyrd_user_intelligence_snapshot_nodes_v1 enable row level security;
alter table public.backyrd_user_intelligence_latest_v1 enable row level security;
create policy user_intelligence_snapshot_v2_read_own on public.backyrd_user_intelligence_snapshots_v2 for select to authenticated using(auth.uid()=user_id and public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations'));
create policy user_intelligence_latest_v1_read_own on public.backyrd_user_intelligence_latest_v1 for select to authenticated using(auth.uid()=user_id and public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations'));
revoke all on public.backyrd_user_intelligence_snapshots_v2,public.backyrd_user_intelligence_snapshot_nodes_v1,public.backyrd_user_intelligence_latest_v1 from public,anon,authenticated;
grant select on public.backyrd_user_intelligence_snapshots_v2,public.backyrd_user_intelligence_latest_v1 to authenticated;
grant all on public.backyrd_user_intelligence_snapshots_v2,public.backyrd_user_intelligence_snapshot_nodes_v1,public.backyrd_user_intelligence_latest_v1 to service_role;

create or replace function public.backyrd_persist_shared_user_intelligence_v1(p_user_id uuid,p_runtime_version text,p_input_contract_version text,p_source_watermark timestamptz,p_source_hash text,p_snapshot_hash text,p_card jsonb,p_nodes jsonb,p_ledger jsonb,p_work_ids uuid[] default '{}') returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_snapshot uuid; v_previous uuid; v_node jsonb; v_change jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') then raise exception 'user_intelligence_consent_required' using errcode='42501'; end if;
 if jsonb_typeof(p_card)<>'object' or jsonb_typeof(p_nodes)<>'array' or jsonb_typeof(p_ledger)<>'array' or p_card->>'userId'<>p_user_id::text then raise exception 'invalid_shared_runtime_result' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select snapshot_id into v_previous from public.backyrd_user_intelligence_latest_v1 where user_id=p_user_id for update;
 if exists(select 1 from public.backyrd_user_intelligence_latest_v1 where user_id=p_user_id and source_watermark>p_source_watermark) then return v_previous; end if;
 insert into public.backyrd_user_intelligence_snapshots_v2(user_id,runtime_version,input_contract_version,source_watermark,source_hash,snapshot_hash,card,node_count) values(p_user_id,p_runtime_version,p_input_contract_version,p_source_watermark,p_source_hash,p_snapshot_hash,p_card,jsonb_array_length(p_nodes)) on conflict(user_id,snapshot_hash) do update set snapshot_hash=excluded.snapshot_hash returning snapshot_id into v_snapshot;
 for v_node in select value from jsonb_array_elements(p_nodes) loop insert into public.backyrd_user_intelligence_snapshot_nodes_v1(snapshot_id,node_key,node) values(v_snapshot,v_node->>'nodeKey',v_node) on conflict do nothing; end loop;
 for v_change in select value from jsonb_array_elements(p_ledger) loop insert into public.backyrd_user_intelligence_change_ledger_v1(user_id,node_key,previous_node,next_node,reason_code,engine_version,change_hash) values(p_user_id,v_change->>'nodeKey',v_change->'before',coalesce(v_change->'after','{}'::jsonb),coalesce(v_change->>'reasonCode','SHARED_RUNTIME_REBUILD'),p_runtime_version,coalesce(v_change->>'changeId',p_snapshot_hash)) on conflict do nothing; end loop;
 insert into public.backyrd_user_intelligence_latest_v1(user_id,snapshot_id,source_watermark) values(p_user_id,v_snapshot,p_source_watermark) on conflict(user_id) do update set snapshot_id=excluded.snapshot_id,source_watermark=excluded.source_watermark,updated_at=now();
 update public.backyrd_user_intelligence_work_v1 set state='COMMITTED',locked_at=null,updated_at=now() where source_memory_event_id=any(p_work_ids) and user_id=p_user_id;
 return v_snapshot;
end $$;
revoke all on function public.backyrd_persist_shared_user_intelligence_v1(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.backyrd_persist_shared_user_intelligence_v1(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,uuid[]) to service_role;
