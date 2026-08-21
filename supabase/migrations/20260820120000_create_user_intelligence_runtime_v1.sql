-- Production Sprint 2. Additive, background-only N5.7/N5.8 runtime.
-- It deliberately does not read legacy taste tables and never changes Decision v13.

create table public.backyrd_user_intelligence_runtime_settings_v1 (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false,
  engine_version text not null default 'backyrd-n5-8-4-production-runtime-v1', updated_at timestamptz not null default now()
);
insert into public.backyrd_user_intelligence_runtime_settings_v1(singleton) values(true) on conflict do nothing;

create table public.backyrd_user_evidence_chains_v1 (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  source_memory_event_id uuid not null references public.backyrd_memory_events_v1(id) on delete cascade,
  review_id uuid, spot_id uuid not null references public.spots(id) on delete cascade,
  journey_key text not null, occurred_at timestamptz not null, outcome text not null check(outcome in ('POSITIVE','NEGATIVE','MIXED','UNKNOWN')),
  direct_claims jsonb not null default '[]'::jsonb check(jsonb_typeof(direct_claims)='array'),
  context_signature jsonb not null default '{}'::jsonb check(jsonb_typeof(context_signature)='object'),
  place_type text, qualification_version text not null default 'backyrd-n5-8-review-understanding-v1',
  qualification_hash text not null check(qualification_hash ~ '^[0-9a-f]{64}$'), created_at timestamptz not null default now(),
  unique(user_id,source_memory_event_id)
);
create index backyrd_user_evidence_chains_user_time_v1 on public.backyrd_user_evidence_chains_v1(user_id,occurred_at);

create table public.backyrd_user_intelligence_nodes_v2 (
  user_id uuid not null references auth.users(id) on delete cascade, node_key text not null,
  concept_key text not null, scope_kind text not null check(scope_kind in ('GLOBAL','CONTEXT','PLACE_TYPE')), scope_key text not null,
  polarity text not null check(polarity in ('POSITIVE','NEGATIVE','MIXED','UNKNOWN')),
  knowledge_state text not null check(knowledge_state in ('UNKNOWN','HYPOTHESIS_POSITIVE','HYPOTHESIS_NEGATIVE','POSITIVE','NEGATIVE','MIXED')),
  affinity numeric not null check(affinity between -1 and 1), confidence numeric not null check(confidence between 0 and 1),
  high_eligible boolean not null default false, high_audit jsonb not null default '{}'::jsonb,
  evidence_composition jsonb not null default '{}'::jsonb, evidence_depth jsonb not null default '{}'::jsonb,
  contradictions jsonb not null default '[]'::jsonb, first_evidence_at timestamptz, last_evidence_at timestamptz,
  trend text not null default 'STABLE', engine_version text not null, node_hash text not null check(node_hash ~ '^[0-9a-f]{64}$'),
  calculated_at timestamptz not null default now(), primary key(user_id,node_key)
);
create table public.backyrd_user_intelligence_change_ledger_v1 (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, node_key text not null,
  previous_node jsonb, next_node jsonb not null, triggering_chain_ids uuid[] not null default '{}', reason_code text not null,
  engine_version text not null, change_hash text not null check(change_hash ~ '^[0-9a-f]{64}$'), occurred_at timestamptz not null default now(),
  unique(user_id,node_key,change_hash)
);
create table public.backyrd_user_card_snapshots_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade, card jsonb not null check(jsonb_typeof(card)='object'),
  snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'), engine_version text not null,
  source_event_count integer not null, source_watermark timestamptz, calculated_at timestamptz not null default now()
);
create table public.backyrd_user_intelligence_work_v1 (
  source_memory_event_id uuid primary key references public.backyrd_memory_events_v1(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, state text not null default 'PENDING' check(state in ('PENDING','PROCESSING','COMMITTED','RETRYABLE','FAILED')),
  attempts integer not null default 0 check(attempts between 0 and 8), available_at timestamptz not null default now(), locked_at timestamptz,
  failure_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.backyrd_n58_review_qualification_v1(p_review_id uuid,p_spot_id uuid,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare r record; v_text text; v_outcome text:='UNKNOWN'; v_claims jsonb:='[]'::jsonb; v_mood text;
begin
  select id,text,mood_a,mood_b into r from public.reviews where id=p_review_id and spot_id=p_spot_id and user_id=p_user_id and product_evidence_origin='smart_review_v1';
  if not found or not exists(select 1 from public.review_photos where review_id=p_review_id and uploaded_by=p_user_id) then return jsonb_build_object('qualified',false,'outcome','UNKNOWN','claims','[]'::jsonb); end if;
  v_text:=lower(coalesce(r.text,''));
  if v_text ~ '\m(super|toll|perfekt|grossartig|großartig|entspannt|komme wieder|voll mein ding|war gut)\M' and v_text !~ '\m(katastrophal|schlecht|enttäuschend|eher nicht|komme nicht wieder|viel zu laut|zu hektisch|ungemütlich)\M' then v_outcome:='POSITIVE';
  elsif v_text ~ '\m(katastrophal|schlecht|enttäuschend|eher nicht|komme nicht wieder|viel zu laut|zu hektisch|ungemütlich)\M' and v_text !~ '\m(super|toll|perfekt|grossartig|großartig|entspannt|komme wieder|voll mein ding|war gut)\M' then v_outcome:='NEGATIVE';
  elsif v_text<>'' then v_outcome:='MIXED'; end if;
  -- Text claims are lexically explicit. Mood claims require a known non-UNKNOWN outcome.
  if v_text ~ '\m(gemütlich|kuschelig|wohnlich)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','vibe.cozy','sign',case when v_text~'\m(ungemütlich|kalt eingerichtet)\M' then -1 else 1 end,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(leise|ruhig|nicht so laut)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','vibe.quiet','sign',1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(viel zu laut|zu laut)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','vibe.lively','sign',-1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(gut unterhalten|konnte man sich unterhalten|gespräch möglich)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','social_style.conversation_friendly','sign',1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(nicht unterhalten|kein gespräch möglich)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','social_style.conversation_friendly','sign',-1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(authentisch|echt und unverstellt)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','character.authentic_character','sign',1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(geheimtipp|versteckt)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','discovery.hidden_gem','sign',1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(günstig|preiswert)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','price.budget','sign',1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_text ~ '\m(zu teuer|überteuert)\M' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','price.premium','sign',-1,'channel','DIRECT_REVIEW','confidence',0.9)); end if;
  if v_outcome in ('POSITIVE','NEGATIVE') then
    foreach v_mood in array array[lower(coalesce(r.mood_a,'')),lower(coalesce(r.mood_b,''))] loop
      if v_mood='gemütlich' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','vibe.cozy','sign',case when v_outcome='POSITIVE' then 1 else -1 end,'channel','DIRECT_MOOD','confidence',0.78));
      elsif v_mood in ('leise','ruhig') then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','vibe.quiet','sign',case when v_outcome='POSITIVE' then 1 else -1 end,'channel','DIRECT_MOOD','confidence',0.68));
      elsif v_mood='laut' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','vibe.lively','sign',-1,'channel','DIRECT_MOOD','confidence',0.7));
      elsif v_mood='hektisch' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','energy.energetic','sign',-1,'channel','DIRECT_MOOD','confidence',0.76));
      elsif v_mood='authentisch' then v_claims:=v_claims||jsonb_build_array(jsonb_build_object('concept','character.authentic_character','sign',1,'channel','DIRECT_MOOD','confidence',0.78)); end if;
    end loop;
  end if;
  return jsonb_build_object('qualified',true,'outcome',v_outcome,'claims',v_claims);
end $$;

create or replace function public.backyrd_user_intelligence_enqueue_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if (select enabled from public.backyrd_user_intelligence_runtime_settings_v1 where singleton) and new.event_type='verified_visit' then
  insert into public.backyrd_user_intelligence_work_v1(source_memory_event_id,user_id) values(new.id,new.user_id) on conflict do nothing;
 end if; return new; end $$;
create trigger trg_backyrd_user_intelligence_enqueue_v1 after insert on public.backyrd_memory_events_v1 for each row execute function public.backyrd_user_intelligence_enqueue_v1();

create or replace function public.backyrd_rebuild_user_intelligence_v1(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_engine constant text:='backyrd-n5-8-4-production-runtime-v1'; v_card jsonb; v_hash text; v_count integer; v_watermark timestamptz;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') then delete from public.backyrd_user_evidence_chains_v1 where user_id=p_user_id; delete from public.backyrd_user_intelligence_nodes_v2 where user_id=p_user_id; delete from public.backyrd_user_card_snapshots_v1 where user_id=p_user_id; return jsonb_build_object('purged',true); end if;
 delete from public.backyrd_user_evidence_chains_v1 where user_id=p_user_id;
 insert into public.backyrd_user_evidence_chains_v1(user_id,source_memory_event_id,review_id,spot_id,journey_key,occurred_at,outcome,direct_claims,context_signature,place_type,qualification_hash)
 select m.user_id,m.id,substring(m.provenance->>'sourceEventId' from 'smart_review:([^:]+)')::uuid,m.spot_id,concat_ws('|',m.user_id,m.session_id,m.decision_id,m.spot_id),m.occurred_at,q->>'outcome',q->'claims',m.moment_signature,m.spot_evidence->>'placeType',encode(digest(convert_to(q::text,'UTF8'),'sha256'),'hex')
 from public.backyrd_memory_events_v1 m cross join lateral public.backyrd_n58_review_qualification_v1(substring(m.provenance->>'sourceEventId' from 'smart_review:([^:]+)')::uuid,m.spot_id,m.user_id) q
 where m.user_id=p_user_id and m.event_type='verified_visit' and m.provenance->>'source'='product_memory_bridge' and q->>'qualified'='true';
 delete from public.backyrd_user_intelligence_nodes_v2 where user_id=p_user_id;
 -- Direct evidence is one outcome per journey. This preserves mood/review fusion without treating channels as independent outcomes.
 insert into public.backyrd_user_intelligence_nodes_v2(user_id,node_key,concept_key,scope_kind,scope_key,polarity,knowledge_state,affinity,confidence,high_eligible,high_audit,evidence_composition,evidence_depth,contradictions,first_evidence_at,last_evidence_at,engine_version,node_hash)
 select user_id,'GLOBAL:global:'||concept,concept,'GLOBAL','global',
   case when cnt_pos>0 and cnt_neg>0 then 'MIXED' when durable and signed>0 then 'POSITIVE' when durable and signed<0 then 'NEGATIVE' else 'UNKNOWN' end,
   case when cnt_pos>0 and cnt_neg>0 then 'MIXED' when durable and signed>0 then 'POSITIVE' when durable and signed<0 then 'NEGATIVE' when signed>=0 then 'HYPOTHESIS_POSITIVE' else 'HYPOTHESIS_NEGATIVE' end,
   signed,confidence,false,jsonb_build_object('eligible',false,'reasons',jsonb_build_array('CONFIDENCE_BELOW_HIGH_THRESHOLD_OR_SCOPE_BREADTH_UNMET')),
   jsonb_build_object('behavioral',0,'comparative',0,'mood',mood_count,'review',review_count,'explicit',0),jsonb_build_object('chains',journeys,'independentSessions',sessions,'independentSpots',spots,'outcomes',journeys),
   case when cnt_pos>0 and cnt_neg>0 then jsonb_build_array(jsonb_build_object('kind','DIRECT_SEMANTIC_CONFLICT','positive',cnt_pos,'negative',cnt_neg)) else '[]'::jsonb end,first_at,last_at,v_engine,
   encode(digest(convert_to(jsonb_build_object('concept',concept,'signed',signed,'confidence',confidence,'journeys',journeys,'sessions',sessions,'spots',spots)::text,'UTF8'),'sha256'),'hex')
 from (
  select c.user_id,x->>'concept' concept, sum((x->>'sign')::numeric*(x->>'confidence')::numeric)/nullif(sum((x->>'confidence')::numeric),0) signed,
   least(.88,round((case when count(distinct c.journey_key)>=2 and count(distinct c.spot_id)>=2 and greatest(sum(case when (x->>'sign')::int>0 then 1 else 0 end),sum(case when (x->>'sign')::int<0 then 1 else 0 end))::numeric/count(*)>=.67 then .52 else .24 end)+.12*least(3,count(distinct c.journey_key))+.08*least(2,count(distinct c.spot_id))-(case when bool_or((x->>'sign')::int>0) and bool_or((x->>'sign')::int<0) then .18 else 0 end),6),.88) confidence,
   count(distinct c.journey_key) journeys,count(distinct c.journey_key) sessions,count(distinct c.spot_id) spots,count(*) filter(where (x->>'sign')::int>0) cnt_pos,count(*) filter(where (x->>'sign')::int<0) cnt_neg,
   count(*) filter(where x->>'channel'='DIRECT_MOOD') mood_count,count(*) filter(where x->>'channel'='DIRECT_REVIEW') review_count,min(c.occurred_at) first_at,max(c.occurred_at) last_at,
   count(distinct c.journey_key)>=2 and count(distinct c.spot_id)>=2 and greatest(sum(case when (x->>'sign')::int>0 then 1 else 0 end),sum(case when (x->>'sign')::int<0 then 1 else 0 end))::numeric/count(*)>=.67 durable
  from public.backyrd_user_evidence_chains_v1 c cross join lateral jsonb_array_elements(c.direct_claims) x where c.user_id=p_user_id group by c.user_id,x->>'concept'
 ) direct;
 insert into public.backyrd_user_intelligence_change_ledger_v1(user_id,node_key,previous_node,next_node,triggering_chain_ids,reason_code,engine_version,change_hash)
 select n.user_id,n.node_key,null,jsonb_build_object('knowledgeState',n.knowledge_state,'polarity',n.polarity,'affinity',n.affinity,'confidence',n.confidence,'highEligible',n.high_eligible),
   coalesce((select array_agg(c.id order by c.id) from public.backyrd_user_evidence_chains_v1 c where c.user_id=n.user_id),'{}'::uuid[]),
   case when n.knowledge_state like 'HYPOTHESIS_%' then 'DIRECT_SEMANTIC_HYPOTHESIS_CREATED' when n.knowledge_state='MIXED' then 'DIRECT_SEMANTIC_CONTRADICTION_RETAINED' else 'DIRECT_SEMANTIC_PREFERENCE_INFERRED' end,v_engine,
   encode(digest(convert_to(jsonb_build_object('userId',n.user_id,'nodeKey',n.node_key,'after',jsonb_build_object('state',n.knowledge_state,'affinity',n.affinity,'confidence',n.confidence),'engine',v_engine)::text,'UTF8'),'sha256'),'hex')
 from public.backyrd_user_intelligence_nodes_v2 n where n.user_id=p_user_id
 on conflict(user_id,node_key,change_hash) do nothing;
 -- N5.8.4: relative disadvantage is never emitted as durable dislike without net-negative present evidence. Comparative rows require existing N4 evidence and therefore remain UNKNOWN until N4 is available.
 select count(*),max(occurred_at) into v_count,v_watermark from public.backyrd_memory_events_v1 where user_id=p_user_id;
 select jsonb_build_object('version',v_engine,'userId',p_user_id,'nodes',coalesce(jsonb_agg(jsonb_build_object('nodeKey',node_key,'concept',concept_key,'scope',jsonb_build_object('kind',scope_kind,'key',scope_key),'polarity',polarity,'knowledgeState',knowledge_state,'affinity',affinity,'confidence',confidence,'highEligible',high_eligible,'evidenceComposition',evidence_composition,'evidenceDepth',evidence_depth,'contradictions',contradictions) order by node_key),'[]'::jsonb),'sourceEventCount',v_count,'sourceWatermark',v_watermark) into v_card from public.backyrd_user_intelligence_nodes_v2 where user_id=p_user_id;
 v_hash:=encode(digest(convert_to(v_card::text,'UTF8'),'sha256'),'hex');
 insert into public.backyrd_user_card_snapshots_v1(user_id,card,snapshot_hash,engine_version,source_event_count,source_watermark) values(p_user_id,v_card,v_hash,v_engine,v_count,v_watermark) on conflict(user_id) do update set card=excluded.card,snapshot_hash=excluded.snapshot_hash,engine_version=excluded.engine_version,source_event_count=excluded.source_event_count,source_watermark=excluded.source_watermark,calculated_at=now();
 insert into public.backyrd_user_intelligence_state_v1(user_id,knowledge_state,source_event_count,source_watermark,taste_map_fingerprint,pattern_fingerprint,calculated_at,user_intelligence_schema_version,evidence_mapping_version) values(p_user_id,case when v_count=0 then 'COLD' when v_count<3 then 'EARLY' when v_count<10 then 'DEVELOPING' else 'MATURE' end,v_count,v_watermark,v_hash,null,now(),'backyrd-user-intelligence-runtime-v2',v_engine) on conflict(user_id) do update set knowledge_state=excluded.knowledge_state,source_event_count=excluded.source_event_count,source_watermark=excluded.source_watermark,taste_map_fingerprint=excluded.taste_map_fingerprint,calculated_at=excluded.calculated_at,user_intelligence_schema_version=excluded.user_intelligence_schema_version,evidence_mapping_version=excluded.evidence_mapping_version;
 return jsonb_build_object('userId',p_user_id,'snapshotHash',v_hash,'nodeCount',(select count(*) from public.backyrd_user_intelligence_nodes_v2 where user_id=p_user_id));
end $$;

create or replace function public.backyrd_process_user_intelligence_work_v1(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare w public.backyrd_user_intelligence_work_v1%rowtype; v_done int:=0; v_retry int:=0;
begin if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 for i in 1..greatest(1,least(coalesce(p_limit,25),100)) loop
  with next as (select source_memory_event_id from public.backyrd_user_intelligence_work_v1 where state in ('PENDING','RETRYABLE') and available_at<=now() order by created_at for update skip locked limit 1)
  update public.backyrd_user_intelligence_work_v1 q set state='PROCESSING',locked_at=now(),attempts=attempts+1,updated_at=now() from next where q.source_memory_event_id=next.source_memory_event_id returning q.* into w;
  exit when not found;
  begin perform public.backyrd_rebuild_user_intelligence_v1(w.user_id); update public.backyrd_user_intelligence_work_v1 set state='COMMITTED',locked_at=null,updated_at=now() where source_memory_event_id=w.source_memory_event_id; v_done:=v_done+1;
  exception when others then if w.attempts>=8 then update public.backyrd_user_intelligence_work_v1 set state='FAILED',locked_at=null,failure_code=sqlstate,updated_at=now() where source_memory_event_id=w.source_memory_event_id; else update public.backyrd_user_intelligence_work_v1 set state='RETRYABLE',locked_at=null,available_at=now()+interval '1 minute',failure_code=sqlstate,updated_at=now() where source_memory_event_id=w.source_memory_event_id; v_retry:=v_retry+1; end if; end;
 end loop; return jsonb_build_object('committed',v_done,'retryable',v_retry); end $$;

create or replace function public.backyrd_user_intelligence_runtime_purge_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin if new.purpose_key='personalized_recommendations' and new.status='withdrawn' and (tg_op='INSERT' or old.status is distinct from new.status) then delete from public.backyrd_user_evidence_chains_v1 where user_id=new.user_id; delete from public.backyrd_user_intelligence_nodes_v2 where user_id=new.user_id; delete from public.backyrd_user_card_snapshots_v1 where user_id=new.user_id; delete from public.backyrd_user_intelligence_work_v1 where user_id=new.user_id; end if; return new; end $$;
create trigger trg_backyrd_user_intelligence_runtime_consent_purge_v1 after insert or update of status on public.user_consents for each row execute function public.backyrd_user_intelligence_runtime_purge_v1();

alter table public.backyrd_user_evidence_chains_v1 enable row level security; alter table public.backyrd_user_intelligence_nodes_v2 enable row level security; alter table public.backyrd_user_intelligence_change_ledger_v1 enable row level security; alter table public.backyrd_user_card_snapshots_v1 enable row level security; alter table public.backyrd_user_intelligence_work_v1 enable row level security;
create policy user_intelligence_nodes_read_own_v2 on public.backyrd_user_intelligence_nodes_v2 for select to authenticated using(auth.uid()=user_id and public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations'));
create policy user_intelligence_cards_read_own_v1 on public.backyrd_user_card_snapshots_v1 for select to authenticated using(auth.uid()=user_id and public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations'));
revoke all on table public.backyrd_user_evidence_chains_v1,public.backyrd_user_intelligence_nodes_v2,public.backyrd_user_intelligence_change_ledger_v1,public.backyrd_user_card_snapshots_v1,public.backyrd_user_intelligence_work_v1 from public,anon,authenticated;
grant select on public.backyrd_user_intelligence_nodes_v2,public.backyrd_user_card_snapshots_v1 to authenticated; grant all on public.backyrd_user_evidence_chains_v1,public.backyrd_user_intelligence_nodes_v2,public.backyrd_user_intelligence_change_ledger_v1,public.backyrd_user_card_snapshots_v1,public.backyrd_user_intelligence_work_v1 to service_role;
revoke all on function public.backyrd_n58_review_qualification_v1(uuid,uuid,uuid),public.backyrd_user_intelligence_enqueue_v1(),public.backyrd_rebuild_user_intelligence_v1(uuid),public.backyrd_process_user_intelligence_work_v1(integer),public.backyrd_user_intelligence_runtime_purge_v1() from public,anon,authenticated;
grant execute on function public.backyrd_rebuild_user_intelligence_v1(uuid),public.backyrd_process_user_intelligence_work_v1(integer) to service_role;
