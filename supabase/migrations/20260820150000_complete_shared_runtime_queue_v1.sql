-- Sprint 2 execution closure: queue/concurrency/persistence only.
alter table public.backyrd_user_intelligence_work_v1
  add column if not exists lease_token uuid,
  add column if not exists target_watermark timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists processing_reason text not null default 'MEMORY_COMMITTED';

create table public.backyrd_user_intelligence_user_leases_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lease_token uuid not null,
  target_watermark timestamptz not null,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.backyrd_user_intelligence_user_leases_v1 enable row level security;
revoke all on public.backyrd_user_intelligence_user_leases_v1 from public,anon,authenticated;
grant all on public.backyrd_user_intelligence_user_leases_v1 to service_role;

create or replace function public.backyrd_claim_user_intelligence_work_v1(p_lease_seconds integer default 300)
returns table(lease_token uuid,user_id uuid,target_watermark timestamptz,work_ids uuid[],attempt integer,processing_reason text)
language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid;v_token uuid:=gen_random_uuid();v_watermark timestamptz;v_ids uuid[];v_attempt int;v_reason text;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 if not coalesce((select enabled from public.backyrd_user_intelligence_runtime_settings_v1 where singleton),false) then return; end if;
 update public.backyrd_user_intelligence_work_v1 w set state='RETRYABLE',lease_token=null,locked_at=null,available_at=now(),failure_code='LEASE_EXPIRED',updated_at=now()
 from public.backyrd_user_intelligence_user_leases_v1 l where w.user_id=l.user_id and w.lease_token=l.lease_token and l.expires_at<=now() and w.state='PROCESSING';
 delete from public.backyrd_user_intelligence_user_leases_v1 where expires_at<=now();
 select w.user_id into v_user from public.backyrd_user_intelligence_work_v1 w
 where w.state in ('PENDING','RETRYABLE') and w.available_at<=now()
 and not exists(select 1 from public.backyrd_user_intelligence_user_leases_v1 l where l.user_id=w.user_id)
 order by w.created_at for update skip locked limit 1;
 if v_user is null then return; end if;
 select max(m.ingested_at) into v_watermark from public.backyrd_memory_events_v1 m where m.user_id=v_user;
 if v_watermark is null then return; end if;
 insert into public.backyrd_user_intelligence_user_leases_v1(user_id,lease_token,target_watermark,expires_at) values(v_user,v_token,v_watermark,now()+make_interval(secs=>greatest(30,least(p_lease_seconds,1800)))) on conflict on constraint backyrd_user_intelligence_user_leases_v1_pkey do nothing;
 if not found then return; end if;
 with claimed as (
   update public.backyrd_user_intelligence_work_v1 w set state='PROCESSING',lease_token=v_token,target_watermark=v_watermark,claimed_at=now(),locked_at=now(),attempts=attempts+1,updated_at=now()
   from public.backyrd_memory_events_v1 m where w.source_memory_event_id=m.id and w.user_id=v_user and w.state in ('PENDING','RETRYABLE') and m.ingested_at<=v_watermark
   returning w.source_memory_event_id,w.attempts
 ) select array_agg(source_memory_event_id),max(attempts) into v_ids,v_attempt from claimed;
 select string_agg(distinct w.processing_reason,',' order by w.processing_reason) into v_reason from public.backyrd_user_intelligence_work_v1 w where w.source_memory_event_id=any(v_ids);
 return query select v_token,v_user,v_watermark,coalesce(v_ids,'{}'::uuid[]),coalesce(v_attempt,1),coalesce(v_reason,'MEMORY_COMMITTED');
end $$;

create or replace function public.backyrd_fail_user_intelligence_work_v1(p_user_id uuid,p_lease_token uuid,p_retryable boolean,p_failure_code text)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 update public.backyrd_user_intelligence_work_v1 set state=case when p_retryable and attempts<8 then 'RETRYABLE' else 'FAILED' end,available_at=case when p_retryable and attempts<8 then now()+interval '1 minute' else available_at end,locked_at=null,lease_token=null,failure_code=left(p_failure_code,120),updated_at=now() where user_id=p_user_id and lease_token=p_lease_token and state='PROCESSING';
 delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token;
end $$;

create or replace function public.backyrd_reconcile_user_intelligence_work_v1(p_user_id uuid,p_work_ids uuid[])
returns text language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_total integer;v_committed integer;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 select count(*),count(*) filter(where state='COMMITTED') into v_total,v_committed from public.backyrd_user_intelligence_work_v1 where user_id=p_user_id and source_memory_event_id=any(p_work_ids);
 if v_total=coalesce(array_length(p_work_ids,1),0) and v_total>0 and v_total=v_committed then return 'COMMITTED'; end if;
 if v_total=0 then return 'MISSING'; end if;
 return 'UNCOMMITTED';
end $$;

-- Every observable event may change the canonical card's behavioral/evidence
-- composition. Satisfaction is still qualified only by the shared runtime.
create or replace function public.backyrd_user_intelligence_enqueue_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce((select enabled from public.backyrd_user_intelligence_runtime_settings_v1 where singleton),false) then
  insert into public.backyrd_user_intelligence_work_v1(source_memory_event_id,user_id,processing_reason)
  values(new.id,new.user_id,'MEMORY_COMMITTED') on conflict(source_memory_event_id) do nothing;
 end if;
 return new;
end $$;

-- Lifecycle/repair rebuilds reuse an existing canonical source identity. This
-- does not fabricate Memory; it only makes the affected user processable.
create or replace function public.backyrd_enqueue_user_intelligence_rebuild_v1(p_user_id uuid,p_reason text default 'FULL_REBUILD')
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_event uuid;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then return false; end if;
 select id into v_event from public.backyrd_memory_events_v1 where user_id=p_user_id order by ingested_at desc,id desc limit 1;
 if v_event is null then
  perform public.backyrd_purge_shared_user_intelligence_v1(p_user_id);
  return true;
 end if;
 insert into public.backyrd_user_intelligence_work_v1(source_memory_event_id,user_id,state,attempts,available_at,locked_at,failure_code,lease_token,target_watermark,claimed_at,processing_reason)
 values(v_event,p_user_id,'PENDING',0,now(),null,null,null,null,null,left(coalesce(p_reason,'FULL_REBUILD'),80))
 on conflict(source_memory_event_id) do update set state='PENDING',attempts=0,available_at=now(),locked_at=null,failure_code=null,lease_token=null,target_watermark=null,claimed_at=null,processing_reason=excluded.processing_reason,updated_at=now();
 return true;
end $$;

alter table public.backyrd_user_intelligence_snapshots_v2 drop constraint if exists backyrd_user_intelligence_snapshots_v2_user_id_snapshot_hash_key;
create unique index if not exists backyrd_user_intelligence_snapshot_replay_v2 on public.backyrd_user_intelligence_snapshots_v2(user_id,source_hash,snapshot_hash);

create or replace function public.backyrd_read_latest_shared_user_card_v1(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_card jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 select s.card into v_card from public.backyrd_user_intelligence_latest_v1 l join public.backyrd_user_intelligence_snapshots_v2 s on s.snapshot_id=l.snapshot_id where l.user_id=p_user_id;
 return v_card;
end $$;

create or replace function public.backyrd_persist_shared_user_intelligence_v2(p_user_id uuid,p_runtime_version text,p_input_contract_version text,p_source_watermark timestamptz,p_source_hash text,p_snapshot_hash text,p_card jsonb,p_nodes jsonb,p_ledger jsonb,p_work_ids uuid[],p_lease_token uuid) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_snapshot uuid;v_previous uuid;v_node jsonb;v_change jsonb;v_latest_watermark timestamptz;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'user_intelligence_consent_required' using errcode='42501'; end if;
 if not exists(select 1 from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token and target_watermark=p_source_watermark and expires_at>now()) then raise exception 'user_intelligence_lease_invalid' using errcode='40001'; end if;
 if jsonb_typeof(p_card)<>'object' or jsonb_typeof(p_nodes)<>'array' or jsonb_typeof(p_ledger)<>'array' or p_card->>'userId'<>p_user_id::text or p_card->>'userCardHash'<>p_snapshot_hash or p_snapshot_hash!~'^[0-9a-f]{64}$' or p_source_hash!~'^[0-9a-f]{64}$' or jsonb_array_length(p_nodes)<>(select count(distinct x->>'nodeKey') from jsonb_array_elements(p_nodes)x) then raise exception 'invalid_shared_runtime_result' using errcode='22023'; end if;
 select snapshot_id,source_watermark into v_previous,v_latest_watermark from public.backyrd_user_intelligence_latest_v1 where user_id=p_user_id for update;
 if v_latest_watermark is not null and v_latest_watermark>p_source_watermark then
   update public.backyrd_user_intelligence_work_v1 set state='COMMITTED',locked_at=null,lease_token=null,updated_at=now() where source_memory_event_id=any(p_work_ids) and user_id=p_user_id;
   delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token; return v_previous;
 end if;
 select snapshot_id into v_snapshot from public.backyrd_user_intelligence_snapshots_v2 where user_id=p_user_id and source_hash=p_source_hash and snapshot_hash=p_snapshot_hash;
 if v_snapshot is null then
   insert into public.backyrd_user_intelligence_snapshots_v2(user_id,runtime_version,input_contract_version,source_watermark,source_hash,snapshot_hash,card,node_count) values(p_user_id,p_runtime_version,p_input_contract_version,p_source_watermark,p_source_hash,p_snapshot_hash,p_card,jsonb_array_length(p_nodes)) returning snapshot_id into v_snapshot;
   for v_node in select value from jsonb_array_elements(p_nodes) loop insert into public.backyrd_user_intelligence_snapshot_nodes_v1(snapshot_id,node_key,node) values(v_snapshot,v_node->>'nodeKey',v_node); end loop;
   for v_change in select value from jsonb_array_elements(p_ledger) loop insert into public.backyrd_user_intelligence_change_ledger_v1(user_id,node_key,previous_node,next_node,reason_code,engine_version,change_hash) values(p_user_id,v_change->>'nodeKey',v_change->'before',coalesce(v_change->'after','{}'::jsonb),coalesce(v_change->>'reasonCode','SHARED_RUNTIME_REBUILD'),p_runtime_version,v_change->>'changeId') on conflict do nothing; end loop;
 end if;
 insert into public.backyrd_user_intelligence_latest_v1(user_id,snapshot_id,source_watermark) values(p_user_id,v_snapshot,p_source_watermark) on conflict(user_id) do update set snapshot_id=excluded.snapshot_id,source_watermark=excluded.source_watermark,updated_at=now();
 update public.backyrd_user_intelligence_work_v1 set state='COMMITTED',locked_at=null,lease_token=null,updated_at=now() where source_memory_event_id=any(p_work_ids) and user_id=p_user_id and lease_token=p_lease_token;
 delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token;
 return v_snapshot;
end $$;

create or replace function public.backyrd_purge_shared_user_intelligence_v1(p_user_id uuid) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 delete from public.backyrd_user_intelligence_work_v1 where user_id=p_user_id;
 delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id;
 delete from public.backyrd_user_intelligence_change_ledger_v1 where user_id=p_user_id;
 delete from public.backyrd_user_intelligence_latest_v1 where user_id=p_user_id;
 delete from public.backyrd_user_intelligence_snapshots_v2 where user_id=p_user_id;
 delete from public.backyrd_user_intelligence_nodes_v2 where user_id=p_user_id;
 delete from public.backyrd_user_card_snapshots_v1 where user_id=p_user_id;
end $$;

create or replace function public.backyrd_user_intelligence_runtime_purge_v1() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if new.purpose_key='personalized_recommendations' and new.status='withdrawn' and (tg_op='INSERT' or old.status is distinct from new.status) then
   delete from public.backyrd_user_intelligence_work_v1 where user_id=new.user_id;
   delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=new.user_id;
   delete from public.backyrd_user_intelligence_change_ledger_v1 where user_id=new.user_id;
   delete from public.backyrd_user_intelligence_latest_v1 where user_id=new.user_id;
   delete from public.backyrd_user_intelligence_snapshots_v2 where user_id=new.user_id;
   delete from public.backyrd_user_evidence_chains_v1 where user_id=new.user_id;
   delete from public.backyrd_user_intelligence_nodes_v2 where user_id=new.user_id;
   delete from public.backyrd_user_card_snapshots_v1 where user_id=new.user_id;
 end if; return new;
end $$;

create or replace function public.backyrd_rebuild_user_intelligence_v1(p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$ begin raise exception 'shared_runtime_worker_required' using errcode='0A000'; end $$;
create or replace function public.backyrd_process_user_intelligence_work_v1(p_limit integer default 25) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$ begin raise exception 'shared_runtime_queue_runner_required' using errcode='0A000'; end $$;

revoke all on function public.backyrd_claim_user_intelligence_work_v1(integer),public.backyrd_fail_user_intelligence_work_v1(uuid,uuid,boolean,text),public.backyrd_reconcile_user_intelligence_work_v1(uuid,uuid[]),public.backyrd_enqueue_user_intelligence_rebuild_v1(uuid,text),public.backyrd_read_latest_shared_user_card_v1(uuid),public.backyrd_persist_shared_user_intelligence_v2(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,uuid[],uuid),public.backyrd_purge_shared_user_intelligence_v1(uuid) from public,anon,authenticated;
grant execute on function public.backyrd_claim_user_intelligence_work_v1(integer),public.backyrd_fail_user_intelligence_work_v1(uuid,uuid,boolean,text),public.backyrd_reconcile_user_intelligence_work_v1(uuid,uuid[]),public.backyrd_enqueue_user_intelligence_rebuild_v1(uuid,text),public.backyrd_read_latest_shared_user_card_v1(uuid),public.backyrd_persist_shared_user_intelligence_v2(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,uuid[],uuid),public.backyrd_purge_shared_user_intelligence_v1(uuid) to service_role;
