-- Unified User Learning final wiring.
-- Additive observability only: the frozen learning formulas and thresholds are unchanged.

alter table public.backyrd_user_evidence_processing_v1
  add column if not exists fusion_disposition text,
  add column if not exists card_disposition text,
  add column if not exists fusion_input_count integer check(fusion_input_count between 0 and 1000),
  add column if not exists card_contribution_count integer check(card_contribution_count between 0 and 1000),
  add column if not exists hypothesis_change_count integer check(hypothesis_change_count between 0 and 1000),
  add column if not exists active_node_contribution_count integer check(active_node_contribution_count between 0 and 1000),
  add column if not exists suppression_reason text;

create or replace function public.backyrd_persist_shared_user_intelligence_v4(
  p_user_id uuid,p_runtime_version text,p_input_contract_version text,p_source_watermark timestamptz,p_source_hash text,p_snapshot_hash text,
  p_card jsonb,p_nodes jsonb,p_ledger jsonb,p_dispositions jsonb,p_work_ids uuid[],p_lease_token uuid
) returns uuid language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_snapshot uuid;v_disposition jsonb;v_event uuid;v_hash text;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501';end if;
 v_snapshot:=public.backyrd_persist_shared_user_intelligence_v3(p_user_id,p_runtime_version,p_input_contract_version,p_source_watermark,p_source_hash,p_snapshot_hash,p_card,p_nodes,p_ledger,p_dispositions,p_work_ids,p_lease_token);
 -- v3 intentionally turns a stale worker completion into a no-op. Preserve
 -- that retry-safe contract instead of trying to attach new lineage to the
 -- already-newer snapshot returned by v3.
 if exists(select 1 from public.backyrd_user_intelligence_snapshots_v2 where snapshot_id=v_snapshot and source_watermark>p_source_watermark) then return v_snapshot;end if;
 for v_disposition in select value from jsonb_array_elements(p_dispositions) loop
  v_event:=nullif(v_disposition->>'eventId','')::uuid;
  if v_event is null or not exists(select 1 from public.backyrd_user_evidence_processing_v1 where memory_event_id=v_event and user_id=p_user_id and snapshot_id=v_snapshot) then raise exception 'user_evidence_lineage_event_invalid' using errcode='22023';end if;
  if coalesce((v_disposition->>'fusionInputCount')::integer,0) not between 0 and 1000 or coalesce((v_disposition->>'cardContributionCount')::integer,0) not between 0 and 1000 or coalesce((v_disposition->>'hypothesisChangeCount')::integer,0) not between 0 and 1000 or coalesce((v_disposition->>'activeNodeContributionCount')::integer,0) not between 0 and 1000 then raise exception 'user_evidence_lineage_count_invalid' using errcode='22023';end if;
  v_hash:=encode(digest(convert_to(jsonb_build_object(
    'eventId',v_event,'processingDisposition',v_disposition->>'processingDisposition','evidenceCount',coalesce((v_disposition->>'evidenceCount')::integer,0),
    'fusionDisposition',v_disposition->>'fusionDisposition','cardDisposition',v_disposition->>'cardDisposition','fusionInputCount',coalesce((v_disposition->>'fusionInputCount')::integer,0),
    'cardContributionCount',coalesce((v_disposition->>'cardContributionCount')::integer,0),'hypothesisChangeCount',coalesce((v_disposition->>'hypothesisChangeCount')::integer,0),
    'activeNodeContributionCount',coalesce((v_disposition->>'activeNodeContributionCount')::integer,0),'suppressionReason',v_disposition->>'suppressionReason',
    'envelopeHash',v_disposition->>'envelopeHash','runtimeVersion',p_runtime_version,'sourceWatermark',p_source_watermark
  )::text,'UTF8'),'sha256'),'hex');
  update public.backyrd_user_evidence_processing_v1 set
    fusion_disposition=nullif(v_disposition->>'fusionDisposition',''),card_disposition=nullif(v_disposition->>'cardDisposition',''),
    fusion_input_count=coalesce((v_disposition->>'fusionInputCount')::integer,0),card_contribution_count=coalesce((v_disposition->>'cardContributionCount')::integer,0),
    hypothesis_change_count=coalesce((v_disposition->>'hypothesisChangeCount')::integer,0),active_node_contribution_count=coalesce((v_disposition->>'activeNodeContributionCount')::integer,0),
    suppression_reason=nullif(v_disposition->>'suppressionReason',''),disposition_hash=v_hash
  where memory_event_id=v_event and user_id=p_user_id and snapshot_id=v_snapshot;
 end loop;
 return v_snapshot;
end $$;

revoke all on function public.backyrd_persist_shared_user_intelligence_v4(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.backyrd_persist_shared_user_intelligence_v4(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid) to service_role;

comment on column public.backyrd_user_evidence_processing_v1.fusion_disposition is 'Whether constructed evidence was consumed by Unified Fusion; null on historical pre-v4 processing rows.';
comment on column public.backyrd_user_evidence_processing_v1.card_disposition is 'Bounded node/active node/no-contribution result for this event; null on historical pre-v4 processing rows.';
