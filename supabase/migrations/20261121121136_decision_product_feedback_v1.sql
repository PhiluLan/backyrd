create table public.product_feedback_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('decision','profile','settings','general')),
  sentiment text not null check (sentiment in ('helpful','almost','not_helpful')),
  message text,
  decision_id uuid references public.decision_sessions(id) on delete set null,
  client_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_feedback_message_length check (message is null or char_length(message) <= 1000),
  constraint product_feedback_context_object check (jsonb_typeof(client_context) = 'object')
);

comment on table public.product_feedback_v1 is
  'Explicit product feedback submitted by signed-in users. It is separate from optional analytics and content reports.';

create index product_feedback_v1_user_created_idx
  on public.product_feedback_v1 (user_id, created_at desc);

create index product_feedback_v1_surface_created_idx
  on public.product_feedback_v1 (surface, created_at desc);

alter table public.product_feedback_v1 enable row level security;
revoke all on table public.product_feedback_v1 from public, anon, authenticated;
grant all on table public.product_feedback_v1 to service_role;

create or replace function public.submit_product_feedback_v1(
  p_surface text,
  p_sentiment text,
  p_message text default null,
  p_decision_id uuid default null,
  p_client_context jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
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
  if v_message is not null and char_length(v_message) > 1000 then
    raise exception 'feedback_message_too_long' using errcode = '22023';
  end if;
  if p_client_context is null or jsonb_typeof(p_client_context) <> 'object' then
    raise exception 'feedback_context_invalid' using errcode = '22023';
  end if;
  if p_decision_id is not null and not exists (
    select 1 from public.decision_sessions d where d.id = p_decision_id and d.user_id = v_actor
  ) then
    raise exception 'feedback_decision_not_owned' using errcode = '42501';
  end if;
  if (select count(*) from public.product_feedback_v1 f
      where f.user_id = v_actor and f.created_at >= now() - interval '24 hours') >= 30 then
    raise exception 'feedback_rate_limited' using errcode = '22023';
  end if;

  insert into public.product_feedback_v1(user_id, surface, sentiment, message, decision_id, client_context)
  values (v_actor, p_surface, p_sentiment, v_message, p_decision_id, p_client_context)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_product_feedback_v1(text,text,text,uuid,jsonb) from public, anon;
grant execute on function public.submit_product_feedback_v1(text,text,text,uuid,jsonb) to authenticated, service_role;

create or replace function public.admin_list_product_feedback_v1(
  p_limit integer default 100,
  p_before timestamptz default null
) returns table (
  id uuid,
  user_id uuid,
  surface text,
  sentiment text,
  message text,
  decision_id uuid,
  client_context jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return query
  select f.id, f.user_id, f.surface, f.sentiment, f.message, f.decision_id, f.client_context, f.created_at
  from public.product_feedback_v1 f
  where p_before is null or f.created_at < p_before
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

revoke all on function public.admin_list_product_feedback_v1(integer,timestamptz) from public, anon;
grant execute on function public.admin_list_product_feedback_v1(integer,timestamptz) to authenticated, service_role;
