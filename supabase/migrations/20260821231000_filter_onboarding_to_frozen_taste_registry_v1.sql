-- Keep Decision onboarding inside the frozen User Taste vocabulary. Canonical
-- N4 contains Spot-only concepts as well; those may describe a selected Spot
-- but must never be inserted as User Taste evidence unless the same key is an
-- authoritative member of the frozen 45-concept Taste registry.

create or replace function public.complete_decision_onboarding_v2(p_city text,p_spot_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid:=auth.uid();v_ids uuid[];v_count integer;v_spot uuid;v_snapshot text;v_inserted integer:=0;v_now timestamptz:=now();r record;
begin
 if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into v_ids from unnest(coalesce(p_spot_ids,'{}'::uuid[])) id where id is not null;
 v_count:=coalesce(cardinality(v_ids),0);if v_count<3 or v_count>8 then raise exception 'onboarding_spot_count_invalid';end if;
 if (select count(*) from public.spots where id=any(v_ids) and status='approved' and data_origin not in ('FIXTURE','TEST'))<>v_count then raise exception 'onboarding_spot_invalid';end if;
 insert into public.profiles(id,city,home_city,created_at,updated_at) values(v_user,p_city,p_city,now(),now()) on conflict(id) do update set city=coalesce(public.profiles.city,excluded.city),home_city=coalesce(public.profiles.home_city,excluded.home_city),updated_at=now();
 perform public.save_favorite_spot_seeds_v1(p_city:=p_city,p_spot_ids:=v_ids,p_raw_names:='{}'::text[]);
 foreach v_spot in array v_ids loop
  select snapshot_identity into v_snapshot from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot]) where spot_id=v_spot and available;
  if v_snapshot is null then continue;end if;
  for r in
   select c->>'concept' concept
   from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot]) n
   cross join lateral jsonb_array_elements(n.concepts)c
   join public.backyrd_taste_concepts_v1 t on t.concept_key=c->>'concept'
   where n.spot_id=v_spot and (c->>'confidence')::numeric>=.35
  loop
   insert into public.backyrd_self_declared_taste_v1(user_id,concept_key,source_kind,spot_id,source_n4_snapshot_identity,state)
   values(v_user,r.concept,'DECISION_ONBOARDING',v_spot,v_snapshot,'ACTIVE') on conflict(user_id,concept_key,source_kind,spot_id) do update set state='ACTIVE',source_n4_snapshot_identity=excluded.source_n4_snapshot_identity,corrected_at=null;
   v_inserted:=v_inserted+1;
  end loop;
 end loop;
 update public.profiles set decision_onboarding_completed_at=now(),onboarding_version='canonical-semantics-v1',updated_at=now() where id=v_user;
 perform public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',v_user,'idempotencyKey','decision-onboarding-v2:'||v_user||':'||md5(array_to_string(v_ids,',')),'eventType','memory_correction','occurredAt',v_now,'observedAt',v_now,'ingestedAt',v_now,'sessionId','decision-onboarding-v2','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','SELF_DECLARED','sourceVersion','backyrd-canonical-semantics-v1','sourceEventId','decision-onboarding-v2:'||v_user||':'||md5(array_to_string(v_ids,','))),'consentPurpose','personalized_recommendations','consentState','granted','contractVersion','backyrd-memory-event-contract-v1'));
 return jsonb_build_object('ok',true,'selectedCount',v_count,'declaredEvidenceCount',v_inserted,'semanticContractVersion','backyrd-canonical-semantics-v1');
end $$;

revoke all on function public.complete_decision_onboarding_v2(text,uuid[]) from public,anon;
grant execute on function public.complete_decision_onboarding_v2(text,uuid[]) to authenticated,service_role;

comment on function public.complete_decision_onboarding_v2(text,uuid[]) is
  'Canonical favorite-Spot onboarding. N4 is frozen at interpretation time; only keys also present in the frozen Taste registry become SELF_DECLARED User evidence.';
