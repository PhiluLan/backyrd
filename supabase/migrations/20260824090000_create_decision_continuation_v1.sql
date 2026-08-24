-- Durable, server-authoritative continuation for a frozen Production Decision.
-- This is additive and does not rewrite Spot, User, Review, Memory or ranking truth.

create table public.backyrd_decision_continuations_v1 (
  decision_id uuid primary key references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_version text not null default 'backyrd-decision-continuation-v1',
  candidate_order uuid[] not null,
  candidate_payload jsonb not null check(jsonb_typeof(candidate_payload)='object'),
  shown_spot_ids uuid[] not null default '{}',
  consumed_spot_ids uuid[] not null default '{}',
  page_size integer not null default 3 check(page_size between 1 and 3),
  page_count integer not null default 1 check(page_count>=1),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','EXHAUSTED')),
  final_source text not null,
  n6_disposition text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  exhausted_at timestamptz,
  check(cardinality(candidate_order) between 1 and 20)
);
create index backyrd_decision_continuations_user_v1 on public.backyrd_decision_continuations_v1(user_id,created_at desc);
alter table public.backyrd_decision_continuations_v1 enable row level security;
revoke all on public.backyrd_decision_continuations_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_continuations_v1 to service_role;

create table public.backyrd_decision_continuation_pages_v1 (
  decision_id uuid not null references public.backyrd_decision_continuations_v1(decision_id) on delete cascade,
  page_number integer not null check(page_number>=1),
  request_id uuid,
  previously_shown_spot_ids uuid[] not null default '{}',
  returned_spot_ids uuid[] not null default '{}',
  skipped_unavailable_spot_ids uuid[] not null default '{}',
  exhausted boolean not null,
  response_payload jsonb not null check(jsonb_typeof(response_payload)='object'),
  created_at timestamptz not null default now(),
  primary key(decision_id,page_number),
  unique(decision_id,request_id),
  check(cardinality(returned_spot_ids)<=3)
);
alter table public.backyrd_decision_continuation_pages_v1 enable row level security;
revoke all on public.backyrd_decision_continuation_pages_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_continuation_pages_v1 to service_role;

-- Candidate freeze rows and Product-visible exposures are intentionally
-- separate. A candidate evaluated by the orchestrator is not yet an exposure.
create table public.backyrd_decision_visible_impressions_v1 (
  decision_id uuid not null references public.backyrd_decision_continuations_v1(decision_id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  page_number integer not null,
  position_in_page integer not null check(position_in_page between 1 and 3),
  created_at timestamptz not null default now(),
  primary key(decision_id,spot_id),
  unique(decision_id,page_number,position_in_page),
  foreign key(decision_id,page_number) references public.backyrd_decision_continuation_pages_v1(decision_id,page_number) on delete cascade
);
alter table public.backyrd_decision_visible_impressions_v1 enable row level security;
revoke all on public.backyrd_decision_visible_impressions_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_visible_impressions_v1 to service_role;

create or replace function public.backyrd_initialize_decision_continuation_v1(
  p_decision_id uuid,
  p_user_id uuid,
  p_candidate_order uuid[],
  p_candidate_payload jsonb,
  p_initial_spot_ids uuid[],
  p_final_source text,
  p_n6_disposition text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_existing public.backyrd_decision_continuations_v1%rowtype;
  v_response jsonb;
  v_exhausted boolean;
  v_i integer;
begin
  if auth.role()<>'service_role' then raise exception 'decision_continuation_service_only' using errcode='42501'; end if;
  if not exists(select 1 from public.decision_sessions where id=p_decision_id and user_id=p_user_id) then
    raise exception 'decision_continuation_cross_user' using errcode='42501';
  end if;
  if p_candidate_order is null or cardinality(p_candidate_order) not between 1 and 20
     or cardinality(p_candidate_order)<>(select count(distinct value) from unnest(p_candidate_order) value)
     or p_initial_spot_ids is null or cardinality(p_initial_spot_ids) not between 1 and 3
     or p_initial_spot_ids<>p_candidate_order[1:cardinality(p_initial_spot_ids)]
     or jsonb_typeof(p_candidate_payload)<>'object'
     or (select count(*) from jsonb_object_keys(p_candidate_payload))<>cardinality(p_candidate_order)
     or octet_length(p_candidate_payload::text)>524288
     or exists(
       select 1 from unnest(p_candidate_order) spot_id
       where not (p_candidate_payload ? spot_id::text)
          or (p_candidate_payload -> (spot_id::text) ->> 'spot_id') is distinct from spot_id::text
     ) then
    raise exception 'decision_continuation_input_invalid' using errcode='22023';
  end if;

  select * into v_existing from public.backyrd_decision_continuations_v1 where decision_id=p_decision_id for update;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.candidate_order<>p_candidate_order
       or v_existing.candidate_payload<>p_candidate_payload then
      raise exception 'decision_continuation_reinitialize_mismatch' using errcode='22023';
    end if;
    select response_payload into v_response from public.backyrd_decision_continuation_pages_v1
      where decision_id=p_decision_id and page_number=1;
    return v_response;
  end if;

  v_exhausted := cardinality(p_initial_spot_ids)=cardinality(p_candidate_order);
  v_response := jsonb_build_object(
    'decisionId',p_decision_id,'page',1,'requestId',null,
    'candidates',(select coalesce(jsonb_agg(p_candidate_payload -> (spot_id::text) order by ord),'[]'::jsonb)
      from unnest(p_initial_spot_ids) with ordinality ids(spot_id,ord)),
    'previouslyShownSpotIds','[]'::jsonb,
    'returnedSpotIds',to_jsonb(p_initial_spot_ids),'exhausted',v_exhausted,
    'remainingCount',cardinality(p_candidate_order)-cardinality(p_initial_spot_ids),
    'finalSource',p_final_source,'n6Disposition',p_n6_disposition
  );
  insert into public.backyrd_decision_continuations_v1(
    decision_id,user_id,candidate_order,candidate_payload,shown_spot_ids,consumed_spot_ids,
    status,final_source,n6_disposition,exhausted_at
  ) values(
    p_decision_id,p_user_id,p_candidate_order,p_candidate_payload,p_initial_spot_ids,p_initial_spot_ids,
    case when v_exhausted then 'EXHAUSTED' else 'ACTIVE' end,p_final_source,p_n6_disposition,
    case when v_exhausted then now() else null end
  );
  insert into public.backyrd_decision_continuation_pages_v1(
    decision_id,page_number,previously_shown_spot_ids,returned_spot_ids,exhausted,response_payload
  ) values(p_decision_id,1,'{}',p_initial_spot_ids,v_exhausted,v_response);
  for v_i in 1..cardinality(p_initial_spot_ids) loop
    insert into public.backyrd_decision_visible_impressions_v1(decision_id,spot_id,page_number,position_in_page)
    values(p_decision_id,p_initial_spot_ids[v_i],1,v_i);
  end loop;
  return v_response;
end $$;

revoke all on function public.backyrd_initialize_decision_continuation_v1(uuid,uuid,uuid[],jsonb,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.backyrd_initialize_decision_continuation_v1(uuid,uuid,uuid[],jsonb,uuid[],text,text) to service_role;

create or replace function public.backyrd_next_decision_continuation_v1(
  p_decision_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_page_size integer default 3
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_row public.backyrd_decision_continuations_v1%rowtype;
  v_existing jsonb;
  v_previous uuid[];
  v_unavailable uuid[];
  v_next uuid[];
  v_consumed uuid[];
  v_remaining integer;
  v_page integer;
  v_exhausted boolean;
  v_response jsonb;
  v_i integer;
begin
  if auth.role()<>'service_role' then raise exception 'decision_continuation_service_only' using errcode='42501'; end if;
  if p_request_id is null or p_page_size not between 1 and 3 then
    raise exception 'decision_continuation_request_invalid' using errcode='22023';
  end if;
  select response_payload into v_existing from public.backyrd_decision_continuation_pages_v1
    where decision_id=p_decision_id and request_id=p_request_id;
  if found then return v_existing; end if;

  select * into v_row from public.backyrd_decision_continuations_v1
    where decision_id=p_decision_id and user_id=p_user_id for update;
  if not found then raise exception 'decision_continuation_not_found_or_cross_user' using errcode='42501'; end if;
  -- Recheck after acquiring the decision lock for concurrent double taps.
  select response_payload into v_existing from public.backyrd_decision_continuation_pages_v1
    where decision_id=p_decision_id and request_id=p_request_id;
  if found then return v_existing; end if;

  v_previous := v_row.shown_spot_ids;
  select coalesce(array_agg(candidate_id order by ord),'{}'::uuid[]) into v_unavailable
    from unnest(v_row.candidate_order) with ordinality candidates(candidate_id,ord)
    left join public.spots spot on spot.id=candidate_id
    where not(candidate_id=any(v_row.consumed_spot_ids))
      and (spot.id is null or lower(coalesce(spot.status::text,'')) not in ('approved','active'));
  v_consumed := v_row.consumed_spot_ids || v_unavailable;

  select coalesce(array_agg(candidate_id order by ord),'{}'::uuid[]) into v_next from (
    select candidate_id,ord from unnest(v_row.candidate_order) with ordinality candidates(candidate_id,ord)
    where not(candidate_id=any(v_consumed)) order by ord limit p_page_size
  ) next_page;
  v_consumed := v_consumed || v_next;
  select count(*) into v_remaining from unnest(v_row.candidate_order) candidate_id
    where not(candidate_id=any(v_consumed));
  v_exhausted := v_remaining=0;
  v_page := v_row.page_count+1;
  v_response := jsonb_build_object(
    'decisionId',p_decision_id,'page',v_page,'requestId',p_request_id,
    'candidates',(select coalesce(jsonb_agg(v_row.candidate_payload -> (spot_id::text) order by ord),'[]'::jsonb)
      from unnest(v_next) with ordinality ids(spot_id,ord)),
    'previouslyShownSpotIds',to_jsonb(v_previous),
    'returnedSpotIds',to_jsonb(v_next),'exhausted',v_exhausted,'remainingCount',v_remaining,
    'skippedUnavailableSpotIds',to_jsonb(v_unavailable),
    'finalSource',v_row.final_source,'n6Disposition',v_row.n6_disposition
  );
  insert into public.backyrd_decision_continuation_pages_v1(
    decision_id,page_number,request_id,previously_shown_spot_ids,returned_spot_ids,
    skipped_unavailable_spot_ids,exhausted,response_payload
  ) values(p_decision_id,v_page,p_request_id,v_previous,v_next,v_unavailable,v_exhausted,v_response);
  for v_i in 1..coalesce(cardinality(v_next),0) loop
    insert into public.backyrd_decision_visible_impressions_v1(decision_id,spot_id,page_number,position_in_page)
    values(p_decision_id,v_next[v_i],v_page,v_i);
  end loop;
  update public.backyrd_decision_continuations_v1 set
    shown_spot_ids=shown_spot_ids||v_next,consumed_spot_ids=v_consumed,page_count=v_page,
    status=case when v_exhausted then 'EXHAUSTED' else 'ACTIVE' end,
    exhausted_at=case when v_exhausted then now() else null end,updated_at=now()
  where decision_id=p_decision_id;
  return v_response;
end $$;

revoke all on function public.backyrd_next_decision_continuation_v1(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.backyrd_next_decision_continuation_v1(uuid,uuid,uuid,integer) to service_role;

comment on table public.backyrd_decision_continuations_v1 is
  'Frozen, server-only ranked order and seen-state for Product continuation. Subscription and commercial signals are prohibited.';
comment on table public.backyrd_decision_visible_impressions_v1 is
  'Exactly-once Product-visible candidate exposure per Decision, distinct from internal candidate-freeze rows.';
