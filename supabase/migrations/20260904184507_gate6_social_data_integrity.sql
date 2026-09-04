-- Gate 6: protect active product relations and make retryable social writes
-- explicitly idempotent. Historical rows are intentionally preserved.

create or replace function public.spot_accepts_consumer_interactions_v1(p_spot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p_spot_id is not null and exists (
    select 1
    from public.spots s
    where s.id = p_spot_id
      and s.status = 'approved'
      and coalesce(s.data_origin, 'REAL') not in ('TEST', 'FIXTURE')
  );
$$;

revoke all on function public.spot_accepts_consumer_interactions_v1(uuid) from public, anon;
grant execute on function public.spot_accepts_consumer_interactions_v1(uuid) to authenticated, service_role;

drop policy if exists "Users can insert their own favorites" on public.favorites;
create policy "Users can insert their own favorites"
on public.favorites for insert to authenticated
with check (
  auth.uid() = user_id
  and public.spot_accepts_consumer_interactions_v1(spot_id)
);

drop policy if exists social_posts_insert_own_v1 on public.social_posts;
create policy social_posts_insert_own_v1
on public.social_posts for insert to authenticated
with check (
  user_id = auth.uid()
  and (spot_id is null or public.spot_accepts_consumer_interactions_v1(spot_id))
);

alter table public.social_comments
  add column if not exists client_request_id uuid;
create unique index if not exists social_comments_actor_request_uq
  on public.social_comments(user_id, client_request_id)
  where client_request_id is not null;

alter table public.social_posts
  add column if not exists client_request_id uuid;
create unique index if not exists social_posts_actor_request_uq
  on public.social_posts(user_id, client_request_id)
  where client_request_id is not null;

alter table public.messages
  add column if not exists client_request_id uuid;
create unique index if not exists messages_actor_request_uq
  on public.messages(sender_id, client_request_id)
  where client_request_id is not null;

create or replace function public.sync_social_comment_count_gate6_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  perform pg_advisory_xact_lock(hashtextextended('social-comment:' || v_post_id::text, 0));
  update public.social_posts p set comment_count = (
    select count(*)::integer from public.social_comments c
    where c.post_id = v_post_id and c.status = 'published'
  ), updated_at = now() where p.id = v_post_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_social_comment_count_gate6_v1 on public.social_comments;
create trigger trg_sync_social_comment_count_gate6_v1
after insert or update of status, post_id or delete on public.social_comments
for each row execute function public.sync_social_comment_count_gate6_v1();
revoke all on function public.sync_social_comment_count_gate6_v1() from public, anon, authenticated, service_role;

create or replace function public.sync_social_reaction_counts_gate6_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  perform pg_advisory_xact_lock(hashtextextended('social-reaction:' || v_post_id::text, 0));
  update public.social_posts p set
    like_count = (select count(*)::integer from public.social_post_reactions r where r.post_id=v_post_id and r.reaction_type='like'),
    save_count = (select count(*)::integer from public.social_post_reactions r where r.post_id=v_post_id and r.reaction_type='save'),
    updated_at = now()
  where p.id = v_post_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_social_reaction_counts_gate6_v1 on public.social_post_reactions;
create trigger trg_sync_social_reaction_counts_gate6_v1
after insert or delete on public.social_post_reactions
for each row execute function public.sync_social_reaction_counts_gate6_v1();
revoke all on function public.sync_social_reaction_counts_gate6_v1() from public, anon, authenticated, service_role;

create or replace function public.create_social_comment_v2(
  p_post_id uuid,
  p_body text,
  p_client_request_id uuid
)
returns table(comment_id uuid, post_id uuid, body text, created_at timestamptz, message text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row public.social_comments%rowtype;
  v_inserted boolean := false;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_post_id is null then raise exception 'post_id_required'; end if;
  if p_client_request_id is null then raise exception 'client_request_id_required'; end if;
  if v_body is null then raise exception 'comment_body_required'; end if;
  if length(v_body) > 1000 then raise exception 'comment_too_long'; end if;

  if not exists (
    select 1 from public.social_posts p
    left join public.spots s on s.id = p.spot_id
    where p.id = p_post_id and p.status = 'published'
      and (p.spot_id is null or public.spot_accepts_consumer_interactions_v1(p.spot_id))
  ) then raise exception 'post_not_available'; end if;

  select * into v_row from public.social_comments c
  where c.user_id = v_user_id and c.client_request_id = p_client_request_id;
  if found then
    if v_row.post_id <> p_post_id or v_row.body <> v_body then raise exception 'idempotency_key_reused'; end if;
  else
    insert into public.social_comments(post_id, user_id, body, status, client_request_id)
    values (p_post_id, v_user_id, v_body, 'published', p_client_request_id)
    on conflict (user_id, client_request_id) where client_request_id is not null do nothing
    returning * into v_row;
    v_inserted := found;
    if not v_inserted then
      select * into strict v_row from public.social_comments c
      where c.user_id = v_user_id and c.client_request_id = p_client_request_id;
      if v_row.post_id <> p_post_id or v_row.body <> v_body then raise exception 'idempotency_key_reused'; end if;
    end if;
  end if;

  if v_inserted then
    update public.social_posts p set comment_count = (
      select count(*)::integer from public.social_comments c
      where c.post_id = p_post_id and c.status = 'published'
    ), updated_at = now() where p.id = p_post_id;
    insert into public.social_feed_events(user_id, post_id, spot_id, event_type, context)
    select v_user_id, p.id, p.spot_id, 'post_comment', jsonb_build_object('comment_id', v_row.id)
    from public.social_posts p where p.id = p_post_id;
  end if;

  return query select v_row.id, v_row.post_id, v_row.body, v_row.created_at,
    case when v_inserted then 'comment_created' else 'comment_already_created' end;
end;
$$;

revoke all on function public.create_social_comment_v2(uuid, text, uuid) from public, anon;
grant execute on function public.create_social_comment_v2(uuid, text, uuid) to authenticated, service_role;

create or replace function public.send_message_v2(
  p_chat_id uuid,
  p_text text,
  p_image_url text,
  p_client_request_id uuid
)
returns setof public.messages
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_image text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_row public.messages%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_chat_id is null then raise exception 'chat_id_required'; end if;
  if p_client_request_id is null then raise exception 'client_request_id_required'; end if;
  if v_text is null and v_image is null then raise exception 'message_content_required'; end if;
  if v_text is not null and length(v_text) > 4000 then raise exception 'message_too_long'; end if;
  if v_image is not null and v_image not like ('chat/' || p_chat_id::text || '/%') then raise exception 'invalid_image_path'; end if;
  if not exists (select 1 from public.chats c where c.id = p_chat_id and v_user_id in (c.user_a, c.user_b))
    then raise exception 'chat_not_found' using errcode = '42501'; end if;
  if exists (
    select 1 from public.chats c
    where c.id = p_chat_id and public.users_are_blocked_v1(c.user_a, c.user_b)
  ) then raise exception 'chat_blocked' using errcode = '42501'; end if;

  select * into v_row from public.messages m
  where m.sender_id = v_user_id and m.client_request_id = p_client_request_id;
  if found then
    if v_row.chat_id <> p_chat_id or coalesce(v_row.text, '') <> coalesce(v_text, '')
      or coalesce(v_row.image_url, '') <> coalesce(v_image, '') then raise exception 'idempotency_key_reused'; end if;
    return next v_row; return;
  end if;

  insert into public.messages(chat_id, sender_id, text, image_url, client_request_id)
  values (p_chat_id, v_user_id, v_text, v_image, p_client_request_id)
  on conflict (sender_id, client_request_id) where client_request_id is not null do nothing
  returning * into v_row;
  if not found then
    select * into strict v_row from public.messages m
    where m.sender_id = v_user_id and m.client_request_id = p_client_request_id;
    if v_row.chat_id <> p_chat_id or coalesce(v_row.text, '') <> coalesce(v_text, '')
      or coalesce(v_row.image_url, '') <> coalesce(v_image, '') then raise exception 'idempotency_key_reused'; end if;
  end if;
  return next v_row;
end;
$$;

revoke all on function public.send_message_v2(uuid, text, text, uuid) from public, anon;
grant execute on function public.send_message_v2(uuid, text, text, uuid) to authenticated, service_role;

create or replace function public.create_social_post_v2(
  p_spot_id uuid,
  p_caption text,
  p_visibility text,
  p_mood_tags text[],
  p_occasion_tags text[],
  p_media jsonb,
  p_client_request_id uuid
)
returns table(post_id uuid, created_at timestamptz, message text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_visibility text := lower(btrim(coalesce(p_visibility, 'public')));
  v_post public.social_posts%rowtype;
  v_item jsonb;
  v_order integer := 0;
  v_inserted boolean := false;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_client_request_id is null then raise exception 'client_request_id_required'; end if;
  if v_visibility not in ('public', 'followers', 'private') then raise exception 'invalid_visibility'; end if;
  if p_spot_id is not null and not public.spot_accepts_consumer_interactions_v1(p_spot_id)
    then raise exception 'spot_not_available'; end if;
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' then raise exception 'invalid_media'; end if;

  select * into v_post from public.social_posts p
  where p.user_id = v_user_id and p.client_request_id = p_client_request_id;
  if found then
    if coalesce(v_post.spot_id::text, '') <> coalesce(p_spot_id::text, '')
      or coalesce(v_post.caption, '') <> coalesce(nullif(btrim(coalesce(p_caption, '')), ''), '')
      or v_post.visibility <> v_visibility then raise exception 'idempotency_key_reused'; end if;
    return query select v_post.id, v_post.created_at, 'social_post_already_created'::text; return;
  end if;

  insert into public.social_posts(user_id, spot_id, caption, visibility, mood_tags, occasion_tags, status, client_request_id)
  values (v_user_id, p_spot_id, nullif(btrim(coalesce(p_caption, '')), ''), v_visibility,
    coalesce(p_mood_tags, '{}'), coalesce(p_occasion_tags, '{}'), 'published', p_client_request_id)
  on conflict (user_id, client_request_id) where client_request_id is not null do nothing
  returning * into v_post;
  v_inserted := found;
  if not v_inserted then
    select * into strict v_post from public.social_posts p
    where p.user_id = v_user_id and p.client_request_id = p_client_request_id;
    return query select v_post.id, v_post.created_at, 'social_post_already_created'::text; return;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    if nullif(btrim(coalesce(v_item->>'storage_path', '')), '') is not null then
      if btrim(v_item->>'storage_path') not like (v_user_id::text || '/%') then raise exception 'invalid_media_owner'; end if;
      insert into public.social_post_media(post_id, storage_path, public_url, media_type, width, height, sort_order)
      values (v_post.id, btrim(v_item->>'storage_path'), nullif(btrim(coalesce(v_item->>'public_url', '')), ''),
        coalesce(nullif(btrim(v_item->>'media_type'), ''), 'image'), nullif(v_item->>'width', '')::integer,
        nullif(v_item->>'height', '')::integer, v_order);
      v_order := v_order + 1;
    end if;
  end loop;
  return query select v_post.id, v_post.created_at, 'social_post_created'::text;
end;
$$;

revoke all on function public.create_social_post_v2(uuid, text, text, text[], text[], jsonb, uuid) from public, anon;
grant execute on function public.create_social_post_v2(uuid, text, text, text[], text[], jsonb, uuid) to authenticated, service_role;

comment on column public.social_comments.client_request_id is 'Gate 6 retry identity, scoped to the authenticated actor.';
comment on column public.social_posts.client_request_id is 'Gate 6 retry identity, scoped to the authenticated actor.';
comment on column public.messages.client_request_id is 'Gate 6 retry identity, scoped to the authenticated actor.';

create or replace function public.admin_account_owned_storage_paths_v1(p_user_id uuid)
returns table(bucket_id text, object_path text)
language plpgsql
stable
security definer
set search_path = public, storage, pg_catalog
as $$
begin
  if auth.uid() is null or not public.consent_is_admin_v1() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'user_id_required'; end if;
  return query
  select o.bucket_id, o.name
  from storage.objects o
  where o.owner_id = p_user_id::text
    and o.bucket_id in ('profile-photos', 'review-photos', 'social-post-media', 'chat-uploads');
end;
$$;

revoke all on function public.admin_account_owned_storage_paths_v1(uuid) from public, anon;
grant execute on function public.admin_account_owned_storage_paths_v1(uuid) to authenticated, service_role;

create or replace function public.guard_social_reaction_target_gate6_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1 from public.social_posts p
    where p.id = new.post_id and p.status = 'published'
      and (p.spot_id is null or public.spot_accepts_consumer_interactions_v1(p.spot_id))
  ) then raise exception 'post_not_available'; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_social_reaction_target_gate6_v1 on public.social_post_reactions;
create trigger trg_guard_social_reaction_target_gate6_v1
before insert on public.social_post_reactions
for each row execute function public.guard_social_reaction_target_gate6_v1();
revoke all on function public.guard_social_reaction_target_gate6_v1() from public, anon, authenticated, service_role;
