-- Canonicalize the Founder context handoff as a disjoint knowledge-state
-- partition. The resolver snapshot remains an audit representation and may
-- contain UNKNOWN/DISPUTED resolution entries; the Decision handoff exposes
-- those states exclusively through explicitUnknowns/conflicts.

create or replace function world_knowledge_private.context_handoff_v1(p_snapshot jsonb)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare
  keys constant text[]:=array['purpose.primary_visit','offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts'];
  body jsonb;
  facts jsonb;
  explicit_unknowns jsonb;
  conflicts jsonb;
  absent_keys jsonb;
begin
  if p_snapshot->>'registryVersion'<>'backyrd.world-knowledge.registry@2.1' or p_snapshot->>'policyVersion'<>'backyrd.world-knowledge.source-policy@4b.1' then
    raise exception 'context_handoff_version_mismatch' using errcode='22023';
  end if;

  select coalesce(jsonb_object_agg(f->>'key',f),'{}'::jsonb)
    into facts
  from jsonb_array_elements(coalesce(p_snapshot->'facts','[]'::jsonb)) f
  where f->>'key'=any(keys)
    and f->>'resolution' not in ('UNKNOWN','DISPUTED');

  select coalesce(jsonb_agg(u->>'key' order by u->>'key'),'[]'::jsonb)
    into explicit_unknowns
  from jsonb_array_elements(coalesce(p_snapshot->'explicitUnknowns','[]'::jsonb)) u
  where u->>'key'=any(keys);

  select coalesce(jsonb_agg(c order by c->>'key',c->>'scope'),'[]'::jsonb)
    into conflicts
  from jsonb_array_elements(coalesce(p_snapshot->'conflicts','[]'::jsonb)) c
  where c->>'key'=any(keys);

  select coalesce(jsonb_agg(k order by k),'[]'::jsonb)
    into absent_keys
  from unnest(keys) k
  where not facts ? k
    and not explicit_unknowns ? k
    and not exists (
      select 1
      from jsonb_array_elements(conflicts) c
      where c->>'key'=k
    );

  body:=jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.context-handoff-shadow@1.0',
    'registryVersion','backyrd.world-knowledge.registry@2.1',
    'policyVersion','backyrd.world-knowledge.source-policy@4b.1',
    'spotId',p_snapshot->>'spotId',
    'resolvedAt',p_snapshot->>'resolvedAt',
    'entries',facts,
    'absentKeys',absent_keys,
    'explicitUnknowns',explicit_unknowns,
    'conflicts',conflicts,
    'exclusions',jsonb_build_array('CAPABILITY_INTENT_MAPPING','CONTACTS','OWNER_TIER','PAYMENT','PRIVATE_PROVENANCE','RANKING_WEIGHTS','SUBSCRIPTION','USER_TASTE')
  );
  return body||jsonb_build_object('handoffHash',encode(extensions.digest(pg_catalog.convert_to(body::text,'UTF8'),'sha256'),'hex'));
end $$;

create or replace function public.world_founder_export_cohort_v1(p_cohort_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; body jsonb; body_hash text; cohort_count integer; current_count integer;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if length(trim(coalesce(p_cohort_id,''))) not between 1 and 128 then raise exception 'invalid_cohort_id' using errcode='22023'; end if;
  select count(*) into cohort_count from world_knowledge_private.founder_evaluation_spots_v1 f where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  if cohort_count not between 1 and 40 then raise exception 'founder_cohort_size_invalid' using errcode='22023'; end if;
  select count(*) into current_count from world_knowledge_private.founder_evaluation_spots_v1 f join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id where f.lifecycle_status='ACTIVE' and f.cohort_selected and p.registry_version='backyrd.world-knowledge.registry@2.1' and p.policy_version='backyrd.world-knowledge.source-policy@4b.1';
  if current_count<>cohort_count then raise exception 'founder_cohort_rebuild_required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'spotId',m.spot_id,
    'manifestHash',m.manifest_hash,
    'resolutionHash',m.resolution_hash,
    'inputHash',m.input_hash,
    'snapshotHash',encode(extensions.digest(pg_catalog.convert_to(m.world_snapshot::text,'UTF8'),'sha256'),'hex'),
    'contextHandoff',h.handoff,
    'contextHandoffHash',h.handoff->>'handoffHash'
  ) order by m.spot_id),'[]'::jsonb) into rows
  from world_knowledge_private.founder_evaluation_spots_v1 f
  join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id
  join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id
  cross join lateral (select world_knowledge_private.context_handoff_v1(m.world_snapshot) handoff) h
  where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  body:=jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.founder-cohort-shadow@3.0',
    'scope','FOUNDER_EVALUATION_ONLY',
    'cohortId',p_cohort_id,
    'registryVersion','backyrd.world-knowledge.registry@2.1',
    'policyVersion','backyrd.world-knowledge.source-policy@4b.1',
    'spots',rows,
    'exclusions',jsonb_build_array('ADMIN_NOTES','CAPABILITY_INTENT_MAPPING','OWNER_TIER','PAYMENT','PRIVATE_ACTOR_IDS','PRIVATE_SOURCE_REFERENCES','RAW_AI_OUTPUTS','RANKING_WEIGHTS','SUBSCRIPTION','USER_TASTE')
  );
  body_hash:=encode(extensions.digest(pg_catalog.convert_to(body::text,'UTF8'),'sha256'),'hex');
  return body||jsonb_build_object('cohortHash',body_hash);
end $$;

revoke execute on function world_knowledge_private.context_handoff_v1(jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.world_founder_export_cohort_v1(text) from public,anon,authenticated;
grant execute on function public.world_founder_export_cohort_v1(text) to service_role;
