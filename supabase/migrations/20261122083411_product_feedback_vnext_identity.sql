-- Keep historical UUID feedback and its FK intact; current Product IDs are text.
alter table public.product_feedback_v1 add column product_decision_id text;
alter table public.product_feedback_v1 add constraint product_feedback_one_decision_identity
  check (decision_id is null or product_decision_id is null);

-- Replace rather than overload: PostgREST cannot disambiguate JSON string IDs.
drop function public.submit_product_feedback_v1(text,text,text,uuid,jsonb);
create function public.submit_product_feedback_v1(
  p_surface text, p_sentiment text, p_message text default null,
  p_decision_id text default null, p_client_context jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_legacy_id uuid;
  v_product_id text;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_surface is null or p_surface not in ('decision','profile','settings','general') then
    raise exception 'feedback_surface_invalid' using errcode = '22023';
  end if;
  if p_sentiment is null or p_sentiment not in ('helpful','almost','not_helpful') then
    raise exception 'feedback_sentiment_invalid' using errcode = '22023';
  end if;
  if char_length(v_message) > 1000 then
    raise exception 'feedback_message_too_long' using errcode = '22023';
  end if;
  if p_client_context is null or jsonb_typeof(p_client_context) <> 'object' then
    raise exception 'feedback_context_invalid' using errcode = '22023';
  end if;
  if p_decision_id is not null then
    if length(p_decision_id) between 1 and 240 and exists (
      select 1 from decision_vnext_private.product_idempotency_records_v1 r
      where r.auth_user_id = v_actor
        and r.purpose = 'PRODUCT_DECISION_VNEXT_EVALUATION'
        and r.expires_at > clock_timestamp()
        and r.response_envelope_bytes::jsonb #>> '{response,decisionId}' = p_decision_id
        and r.response_envelope_bytes::jsonb #>> '{response,status}' = 'AVAILABLE'
    ) then
      v_product_id := p_decision_id;
    elsif p_decision_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (select 1 from public.decision_sessions d
        where d.id::text = lower(p_decision_id) and d.user_id = v_actor) then
      v_legacy_id := p_decision_id::uuid;
    else
      raise exception 'feedback_decision_not_owned' using errcode = '42501';
    end if;
  end if;
  if (select count(*) from public.product_feedback_v1 f
      where f.user_id = v_actor and f.created_at >= now() - interval '24 hours') >= 30 then
    raise exception 'feedback_rate_limited' using errcode = '22023';
  end if;
  insert into public.product_feedback_v1
    (user_id, surface, sentiment, message, decision_id, product_decision_id, client_context)
  values (v_actor, p_surface, p_sentiment, v_message, v_legacy_id, v_product_id, p_client_context)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_product_feedback_v1(text,text,text,text,jsonb) from public, anon;
grant execute on function public.submit_product_feedback_v1(text,text,text,text,jsonb) to authenticated, service_role;

-- JSON consumers already treat decision_id as a string; preserve the field name.
drop function public.admin_list_product_feedback_v1(integer,timestamptz);
create function public.admin_list_product_feedback_v1(
  p_limit integer default 100, p_before timestamptz default null
) returns table (
  id uuid, user_id uuid, surface text, sentiment text, message text,
  decision_id text, client_context jsonb, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return query select f.id, f.user_id, f.surface, f.sentiment, f.message,
    coalesce(f.product_decision_id, f.decision_id::text), f.client_context, f.created_at
  from public.product_feedback_v1 f
  where p_before is null or f.created_at < p_before
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;
revoke all on function public.admin_list_product_feedback_v1(integer,timestamptz) from public, anon;
grant execute on function public.admin_list_product_feedback_v1(integer,timestamptz) to authenticated, service_role;
notify pgrst, 'reload schema';
