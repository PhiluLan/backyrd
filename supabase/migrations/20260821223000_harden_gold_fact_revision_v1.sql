-- Harden Gold fact revision and Research proposal retry semantics before the
-- authoring foundation is activated. Derived suitability must never outlive
-- its accepted source fact.

alter table public.backyrd_spot_accepted_facts_v1
  drop constraint if exists backyrd_spot_accepted_facts_v1_spot_id_field_key_source_id_key;

with ranked as (
  select id,
         row_number() over (
           partition by spot_id,field_key
           order by (status='ACTIVE') desc,confidence_policy_result desc,
                    coalesce(last_checked_at,observed_at,accepted_at) desc,id desc
         ) as position
  from public.backyrd_spot_accepted_facts_v1
  where status in ('ACTIVE','UNKNOWN')
)
update public.backyrd_spot_accepted_facts_v1 fact
set status='SUPERSEDED'
from ranked
where ranked.id=fact.id and ranked.position>1;

create unique index backyrd_spot_accepted_facts_one_current_v1
  on public.backyrd_spot_accepted_facts_v1(spot_id,field_key)
  where status in ('ACTIVE','UNKNOWN');

delete from public.backyrd_spot_suitability_facts_v1 derived
where derived.source_table='backyrd_spot_accepted_facts_v1'
  and not exists (
    select 1
    from public.backyrd_spot_accepted_facts_v1 fact
    where fact.id::text=derived.source_record
      and fact.status in ('ACTIVE','UNKNOWN')
  );

create or replace function public.backyrd_remove_superseded_gold_suitability_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if tg_op='DELETE' then
    delete from public.backyrd_spot_suitability_facts_v1
    where source_table='backyrd_spot_accepted_facts_v1'
      and source_record=old.id::text;
    return old;
  elsif new.status not in ('ACTIVE','UNKNOWN') then
    delete from public.backyrd_spot_suitability_facts_v1
    where source_table='backyrd_spot_accepted_facts_v1'
      and source_record=old.id::text;
  end if;
  return new;
end $$;

drop trigger if exists trg_backyrd_remove_superseded_gold_suitability_v1
  on public.backyrd_spot_accepted_facts_v1;
create trigger trg_backyrd_remove_superseded_gold_suitability_v1
after update of status or delete on public.backyrd_spot_accepted_facts_v1
for each row execute function public.backyrd_remove_superseded_gold_suitability_v1();

create or replace function public.backyrd_gold_submit_research_proposal_v1(
 p_spot_id uuid,p_field_key text,p_value jsonb,p_source_url text,p_title text,
 p_observed_at timestamptz,p_evidence_excerpt text,p_confidence_rationale text,
 p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_source uuid;v_hash text;v_id uuid;v_existing record;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 if not public.backyrd_gold_validate_fact_value_v1(p_field_key,p_value) then raise exception 'invalid_typed_fact_value' using errcode='22023'; end if;
 if length(coalesce(p_idempotency_key,'')) not between 1 and 200 then raise exception 'idempotency_key_required' using errcode='22023'; end if;
 if nullif(btrim(p_source_url),'') is null then raise exception 'research_source_url_required' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_spot_id,p_field_key,p_value::text,btrim(p_source_url),coalesce(btrim(p_title),'')),'UTF8'),'sha256'),'hex');
 select p.id,p.proposal_hash,p.field_key,p.proposed_value,s.source_url
 into v_existing
 from public.backyrd_spot_fact_proposals_v1 p
 join public.backyrd_spot_sources_v1 s on s.id=p.source_id
 where p.spot_id=p_spot_id and p.idempotency_key=p_idempotency_key;
 if found then
   if v_existing.field_key<>p_field_key or v_existing.proposed_value<>p_value or btrim(v_existing.source_url)<>btrim(p_source_url) then
     raise exception 'proposal_idempotency_conflict' using errcode='23505';
   end if;
   return jsonb_build_object('proposalId',v_existing.id,'status','PENDING','canonicalWrite',false,'inserted',false);
 end if;
 insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_url,title,observed_at,last_checked_at,legal_use_status,created_by_type)
 values(p_spot_id,'RESEARCH',btrim(p_source_url),nullif(btrim(p_title),''),least(coalesce(p_observed_at,now()),now()),now(),'REVIEW_REQUIRED','RESEARCH_AGENT')
 returning id into v_source;
 insert into public.backyrd_spot_fact_proposals_v1(spot_id,field_key,proposed_value,source_id,proposed_by_type,confidence_rationale,evidence_excerpt,idempotency_key,proposal_hash)
 values(p_spot_id,p_field_key,p_value,v_source,'RESEARCH_AGENT',nullif(btrim(p_confidence_rationale),''),left(p_evidence_excerpt,2000),p_idempotency_key,v_hash)
 returning id into v_id;
 return jsonb_build_object('proposalId',v_id,'status','PENDING','canonicalWrite',false,'inserted',true);
end $$;

revoke all on function public.backyrd_gold_submit_research_proposal_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text)
  from public,anon,authenticated;
grant execute on function public.backyrd_gold_submit_research_proposal_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text)
  to service_role;

comment on function public.backyrd_remove_superseded_gold_suitability_v1() is
  'Deletes only derived suitability rows whose accepted Gold fact was superseded or removed.';
