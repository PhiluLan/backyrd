-- Explicit product feedback triage, independent of moderation and ranking.
alter table public.product_feedback_v1
  add column review_status text not null default 'new' check (review_status in ('new','reviewing','done')),
  add column issue_kind text check (issue_kind in ('understanding','spot_data','recommendation','usability','other')),
  add column internal_note text not null default '' check (length(internal_note) <= 2000),
  add column issue_ref text not null default '' check (length(issue_ref) <= 120),
  add column review_revision integer not null default 0,
  add column reviewed_at timestamptz,
  add column decision_context jsonb check (decision_context is null or jsonb_typeof(decision_context) = 'object');

create table public.product_feedback_review_events_v1 (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.product_feedback_v1(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  revision integer not null,
  before_review jsonb not null,
  after_review jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(feedback_id, revision)
);
alter table public.product_feedback_review_events_v1 enable row level security;
revoke all on public.product_feedback_review_events_v1 from public, anon, authenticated;
grant all on public.product_feedback_review_events_v1 to service_role;

-- Capture only the bounded display summary when feedback is explicitly sent.
-- No query, participant details, device coordinates, provider payload or taste profile.
create function decision_vnext_private.capture_product_feedback_context_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_response jsonb; v_ranked jsonb;
begin
  new.decision_context := null;
  if new.product_decision_id is null then return new; end if;
  select r.response_envelope_bytes::jsonb->'response' into v_response
  from decision_vnext_private.product_idempotency_records_v1 r
  where r.auth_user_id = new.user_id and r.purpose = 'PRODUCT_DECISION_VNEXT_EVALUATION'
    and r.expires_at > clock_timestamp()
    and r.response_envelope_bytes::jsonb #>> '{response,decisionId}' = new.product_decision_id
    and r.response_envelope_bytes::jsonb #>> '{response,status}' = 'AVAILABLE'
  order by r.created_at desc limit 1;
  if v_response is null then return new; end if;
  select coalesce(jsonb_agg(x.summary order by x.position), '[]'::jsonb) into v_ranked
  from (
    select c.ordinality as position, jsonb_build_object(
      'name',left(c.value #>> '{presentation,name}',160),
      'tier',c.value->>'tier', 'availability',c.value->>'actualAvailability'
    ) as summary
    from jsonb_array_elements(coalesce(v_response->'candidates','[]'::jsonb)) with ordinality c(value,ordinality)
    where c.value->>'rank' is not null and coalesce(c.value->>'contextualReject','false') = 'false'
    order by c.ordinality limit 5
  ) x;
  new.decision_context := jsonb_build_object(
    'version',1, 'captured_at',clock_timestamp(),
    'city',left(v_response #>> '{interpretation,targetCity}',160),
    'intent',left(v_response #>> '{interpretation,primaryIntent}',160),
    'day_phase',left(v_response #>> '{interpretation,dateTime,dayPhase}',80),
    'candidate_count',jsonb_array_length(coalesce(v_response->'candidates','[]'::jsonb)),
    'ranked_candidates',v_ranked,
    'ranking_version',left(v_response->>'rankingPolicyVersion',160)
  );
  return new;
end;
$$;
revoke all on function decision_vnext_private.capture_product_feedback_context_v1() from public, anon, authenticated, service_role;
create trigger product_feedback_capture_context_v1 before insert on public.product_feedback_v1
for each row execute function decision_vnext_private.capture_product_feedback_context_v1();

-- v1 remains backward-compatible for older internal consumers. v2 is the inbox
-- contract, with exact filtering, counts and stable (timestamp, UUID) pagination.
create function public.admin_list_product_feedback_v2(
  p_status text default null, p_sentiment text default null, p_kind text default null,
  p_from timestamptz default null, p_search text default null,
  p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 30
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_summary jsonb; v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if (p_status is not null and p_status not in ('new','reviewing','done'))
    or (p_sentiment is not null and p_sentiment not in ('helpful','almost','not_helpful'))
    or (p_kind is not null and p_kind not in ('understanding','spot_data','recommendation','usability','other'))
    or length(coalesce(p_search,'')) > 120
    or ((p_before is null) <> (p_before_id is null)) then
    raise exception 'feedback_filter_invalid' using errcode = '22023';
  end if;
  with filtered as (
    select f.* from public.product_feedback_v1 f
    where (p_status is null or f.review_status=p_status)
      and (p_sentiment is null or f.sentiment=p_sentiment)
      and (p_kind is null or f.issue_kind=p_kind)
      and (p_from is null or f.created_at>=p_from)
      and (nullif(btrim(p_search),'') is null
        or strpos(lower(coalesce(f.message,'')||' '||f.issue_ref||' '||f.internal_note),lower(btrim(p_search))) > 0)
  ) select jsonb_build_object('total',count(*),'new',count(*) filter(where review_status='new'),
      'reviewing',count(*) filter(where review_status='reviewing'),'done',count(*) filter(where review_status='done'),
      'helpful',count(*) filter(where sentiment='helpful'),'almost',count(*) filter(where sentiment='almost'),
      'not_helpful',count(*) filter(where sentiment='not_helpful')) into v_summary from filtered;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into v_rows from (
    select f.id,f.surface,f.sentiment,f.message,f.created_at,f.review_status,f.issue_kind,f.issue_ref
    from public.product_feedback_v1 f
    where (p_status is null or f.review_status=p_status)
      and (p_sentiment is null or f.sentiment=p_sentiment)
      and (p_kind is null or f.issue_kind=p_kind)
      and (p_from is null or f.created_at>=p_from)
      and (nullif(btrim(p_search),'') is null
        or strpos(lower(coalesce(f.message,'')||' '||f.issue_ref||' '||f.internal_note),lower(btrim(p_search))) > 0)
      and (p_before is null or (f.created_at,f.id)<(p_before,p_before_id))
    order by f.created_at desc,f.id desc limit v_limit+1
  ) x;
  return jsonb_build_object('summary',v_summary,'rows',v_rows,'page_size',v_limit);
end;
$$;
revoke all on function public.admin_list_product_feedback_v2(text,text,text,timestamptz,text,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_product_feedback_v2(text,text,text,timestamptz,text,timestamptz,uuid,integer) to authenticated;

create function public.admin_product_feedback_detail_v1(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_feedback jsonb; v_history jsonb;
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select jsonb_build_object('id',f.id,'surface',f.surface,'sentiment',f.sentiment,'message',f.message,
    'created_at',f.created_at,'review_status',f.review_status,'issue_kind',f.issue_kind,
    'internal_note',f.internal_note,'issue_ref',f.issue_ref,'review_revision',f.review_revision,
    'reviewed_at',f.reviewed_at,'decision_id',coalesce(f.product_decision_id,f.decision_id::text),
    'decision_context',f.decision_context,'client_context',jsonb_build_object(
      'platform',left(f.client_context->>'platform',40),'app_version',left(f.client_context->>'app_version',80),
      'update_id',left(f.client_context->>'update_id',80))) into v_feedback
  from public.product_feedback_v1 f where f.id=p_id;
  if v_feedback is null then raise exception 'feedback_not_found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.revision desc),'[]'::jsonb) into v_history from (
    select e.revision,e.actor_id,e.before_review,e.after_review,e.created_at
    from public.product_feedback_review_events_v1 e where e.feedback_id=p_id
    order by e.revision desc limit 50
  ) x;
  return jsonb_build_object('feedback',v_feedback,'history',v_history);
end;
$$;
revoke all on function public.admin_product_feedback_detail_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_product_feedback_detail_v1(uuid) to authenticated;

create function public.admin_review_product_feedback_v1(
  p_id uuid,p_expected_revision integer,p_status text,p_kind text,p_note text,p_issue_ref text
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_old public.product_feedback_v1%rowtype; v_after jsonb; v_note text:=btrim(coalesce(p_note,'')); v_ref text:=btrim(coalesce(p_issue_ref,''));
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('new','reviewing','done')
    or (p_kind is not null and p_kind not in ('understanding','spot_data','recommendation','usability','other'))
    or length(v_note)>2000 or length(v_ref)>120 or (p_status='done' and v_note='') then
    raise exception 'feedback_review_invalid' using errcode='22023';
  end if;
  select * into v_old from public.product_feedback_v1 f where f.id=p_id for update;
  if not found then raise exception 'feedback_not_found' using errcode='P0002'; end if;
  if p_expected_revision is null or v_old.review_revision<>p_expected_revision then
    raise exception 'feedback_review_conflict' using errcode='40001';
  end if;
  if (v_old.review_status,v_old.issue_kind,v_old.internal_note,v_old.issue_ref) is not distinct from (p_status,p_kind,v_note,v_ref) then
    return v_old.review_revision;
  end if;
  v_after:=jsonb_build_object('status',p_status,'kind',p_kind,'note',v_note,'issue_ref',v_ref);
  update public.product_feedback_v1 set review_status=p_status,issue_kind=p_kind,internal_note=v_note,
    issue_ref=v_ref,review_revision=v_old.review_revision+1,reviewed_at=clock_timestamp() where id=p_id;
  insert into public.product_feedback_review_events_v1(feedback_id,actor_id,revision,before_review,after_review)
  values(p_id,auth.uid(),v_old.review_revision+1,jsonb_build_object('status',v_old.review_status,
    'kind',v_old.issue_kind,'note',v_old.internal_note,'issue_ref',v_old.issue_ref),v_after);
  return v_old.review_revision+1;
end;
$$;
revoke all on function public.admin_review_product_feedback_v1(uuid,integer,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_review_product_feedback_v1(uuid,integer,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
