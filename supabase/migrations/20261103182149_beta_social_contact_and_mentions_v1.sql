-- Beta 3: contact rules and atomic, privacy-aware person tags.
CREATE OR REPLACE FUNCTION "public"."get_or_create_direct_chat_v2"("p_other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
declare
  v_me uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_chat_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if p_other_user_id is null then
    raise exception 'other_user_required';
  end if;

  if p_other_user_id = v_me then
    raise exception 'self_chat_not_allowed';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_other_user_id
  ) then
    raise exception 'user_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(least(v_me,p_other_user_id)::text || greatest(v_me,p_other_user_id)::text,0));
  if public.users_are_blocked_v1(v_me, p_other_user_id) then
    raise exception 'interaction_blocked';
  end if;

  v_user_a := least(v_me, p_other_user_id);
  v_user_b := greatest(v_me, p_other_user_id);


  select c.id
  into v_chat_id
  from public.chats c
  where c.user_a = v_user_a
    and c.user_b = v_user_b;

  if v_chat_id is null then
    insert into public.chats (
      user_a,
      user_b
    )
    values (
      v_user_a,
      v_user_b
    )
    returning id into v_chat_id;

    insert into public.chat_participants (
      chat_id,
      user_id
    )
    values
      (v_chat_id, v_user_a),
      (v_chat_id, v_user_b)
    on conflict (chat_id, user_id)
    do nothing;
  end if;

  return v_chat_id;
end;
$$;

-- No private biography, city, counts or posts are exposed by this contact directory.
create or replace function public.search_message_recipients_v1(p_query text, p_limit integer default 20)
returns table(user_id uuid, display_name text, username text, avatar_url text)
language sql stable security definer set search_path = public, pg_catalog as $$
 select p.id, coalesce(nullif(btrim(p.display_name), ''), p.username, 'Backyrd Mitglied'), p.username, case when p.is_private then null else p.avatar_url end
 from public.profiles p
 where auth.uid() is not null and length(ltrim(btrim(p_query),'@')) >= 2
   and p.id <> auth.uid() and p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) and not public.users_are_blocked_v1(auth.uid(),p.id)
   and ((not p.is_private and (strpos(lower(coalesce(p.username,'')),lower(ltrim(btrim(p_query),'@')))>0 or strpos(lower(coalesce(p.display_name,'')),lower(ltrim(btrim(p_query),'@')))>0))
     or (p.is_private and lower(p.username)=lower(ltrim(btrim(p_query),'@'))))
 order by lower(coalesce(p.display_name,p.username,'')), p.id
 limit greatest(1,least(coalesce(p_limit,20),30));
$$;
revoke all on function public.search_message_recipients_v1(text,integer) from public, anon;
grant execute on function public.search_message_recipients_v1(text,integer) to authenticated;

create table public.social_post_mentions (
 post_id uuid not null references public.social_posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index social_post_mentions_user_idx on public.social_post_mentions(user_id,post_id);
alter table public.social_post_mentions enable row level security;
revoke all on public.social_post_mentions from public, anon, authenticated, service_role;
grant select on public.social_post_mentions to authenticated;
-- A tag never widens post visibility. Target privacy/block changes hide existing tags as well.
-- One visibility rule for feed, profile, deep links and person tags.
create or replace function public.social_post_is_visible_v1(p_post_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
 select auth.uid() is not null and exists(
   select 1 from public.social_posts p join public.profiles author on author.id=p.user_id
   where p.id=p_post_id and p.status='published'
     and (p.user_id=auth.uid() or (not author.is_private and
       (p.visibility='public' or (p.visibility='followers' and exists(
         select 1 from public.follows f where f.follower=auth.uid() and f.following=p.user_id)))))
     and not public.users_are_blocked_v1(auth.uid(),p.user_id)
     and p.id=any(public.safety_visible_social_post_ids_v1(array[p.id]))
 );
$$;
revoke all on function public.social_post_is_visible_v1(uuid) from public,anon;
grant execute on function public.social_post_is_visible_v1(uuid) to authenticated;

-- Profiles have self-only RLS. This narrow predicate checks visibility without granting profile access.
create or replace function public.social_post_mention_is_visible_v1(p_post_id uuid,p_target_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
 select auth.uid() is not null and exists(
   select 1 from public.social_posts post_row
   join public.profiles target on target.id=p_target_id
   where post_row.id=p_post_id and post_row.status='published' and not target.is_private
     and public.social_post_is_visible_v1(p_post_id)
     and not public.users_are_blocked_v1(auth.uid(),p_target_id)
     and not public.users_are_blocked_v1(post_row.user_id,p_target_id)
     and target.id=any(public.safety_visible_entity_ids_v1('profile',array[target.id]))
 );
$$;
revoke all on function public.social_post_mention_is_visible_v1(uuid,uuid) from public,anon;
grant execute on function public.social_post_mention_is_visible_v1(uuid,uuid) to authenticated;
create policy social_post_mentions_read_visible on public.social_post_mentions for select to authenticated using (
 public.social_post_mention_is_visible_v1(post_id,user_id)
);

create or replace function public.create_social_post_v3(
 p_spot_id uuid, p_caption text, p_visibility text, p_mood_tags text[], p_occasion_tags text[],
 p_media jsonb, p_client_request_id uuid, p_mentioned_user_ids uuid[] default '{}', p_expected_actor_id uuid default auth.uid()
) returns table(post_id uuid, created_at timestamptz, message text, safety_snapshot jsonb)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
 v_me uuid := auth.uid(); v_target uuid; v_tags uuid[]; v_post public.social_posts%rowtype;
 v_created record; v_existing uuid[]; v_snapshot jsonb;
begin
 if v_me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 if p_expected_actor_id is distinct from v_me then raise exception 'actor_changed' using errcode='42501'; end if;
 if p_client_request_id is null then raise exception 'client_request_id_required'; end if;
 if length(coalesce(p_caption,'')) > 1200 then raise exception 'caption_too_long'; end if;
 if jsonb_typeof(coalesce(p_media,'[]'::jsonb)) <> 'array' then raise exception 'invalid_media'; end if;
 if nullif(btrim(coalesce(p_caption,'')),'') is null and jsonb_array_length(coalesce(p_media,'[]'::jsonb))=0 then raise exception 'moment_content_required'; end if;
 if exists(select 1 from unnest(p_mood_tags) m where public.backyrd_resolve_mood_input_v2(m)->>'status'='INVALID') then raise exception 'invalid_mood_tags'; end if;
 if cardinality(coalesce(p_mentioned_user_ids,'{}')) > 10 then raise exception 'too_many_mentions'; end if;
 if cardinality(coalesce(p_mood_tags,'{}')) > 2 or exists(select 1 from unnest(p_mood_tags) m where m is null or length(btrim(m)) not between 1 and 40)
 then raise exception 'invalid_mood_tags'; end if;
 select coalesce(array_agg(distinct t order by t),'{}') into v_tags from unnest(p_mentioned_user_ids) t where t is not null;
 perform pg_advisory_xact_lock(hashtextextended(v_me::text || p_client_request_id::text,0));
 select * into v_post from public.social_posts p where p.user_id=v_me and p.client_request_id=p_client_request_id;
 if found then
   select coalesce(array_agg(m.user_id order by m.user_id),'{}') into v_existing from public.social_post_mentions m where m.post_id=v_post.id;
   if v_existing <> v_tags or v_post.mood_tags is distinct from coalesce(p_mood_tags,'{}')
      or v_post.occasion_tags is distinct from coalesce(p_occasion_tags,'{}') then raise exception 'idempotency_key_reused'; end if;
   if coalesce((select jsonb_agg(m.storage_path order by m.sort_order) from public.social_post_media m where m.post_id=v_post.id),'[]'::jsonb)
     <> coalesce((select jsonb_agg(m->>'storage_path') from jsonb_array_elements(coalesce(p_media,'[]'::jsonb)) m),'[]'::jsonb) then raise exception 'idempotency_key_reused'; end if;
   select * into strict v_created from public.create_social_post_v2(p_spot_id,p_caption,p_visibility,p_mood_tags,p_occasion_tags,p_media,p_client_request_id);
   select jsonb_build_object('ok',true,'content_item_id',item.id,'case_id',latest_case.id,
     'analysis_required',coalesce(latest_case.case_status in ('queued','failed'),false),'media_count',cardinality(item.image_urls))
   into v_snapshot
   from public.safety_content_items item left join lateral (
     select c.id,c.case_status from public.safety_cases c where c.content_item_id=item.id order by c.created_at desc,c.id desc limit 1
   ) latest_case on true where item.entity_type='social_post' and item.entity_id=v_post.id;
   return query select v_created.post_id::uuid,v_created.created_at::timestamptz,v_created.message::text,
     coalesce(v_snapshot,jsonb_build_object('ok',true,'analysis_required',false));
   return;
 end if;
 -- Locks prevent a target becoming private while this transaction is publishing a new tag.
 foreach v_target in array v_tags loop
   perform pg_advisory_xact_lock(hashtextextended(least(v_me,v_target)::text || greatest(v_me,v_target)::text,0));
   perform 1 from public.profiles p where p.id=v_target and p.is_private=false and p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) for share;
   if not found or public.users_are_blocked_v1(v_me,v_target) then
     raise exception 'mention_not_available' using errcode='42501';
   end if;
 end loop;
 select * into strict v_created from public.create_social_post_v2(p_spot_id,p_caption,p_visibility,p_mood_tags,p_occasion_tags,p_media,p_client_request_id);
 insert into public.social_post_mentions(post_id,user_id) select v_created.post_id,t from unnest(v_tags) t on conflict do nothing;
 v_snapshot := public.safety_register_content_snapshot_v1('social_post',v_created.post_id,'moment',v_me,p_spot_id,null,'{}','social_post_v3',jsonb_build_object('client_request_id',p_client_request_id));
 return query select v_created.post_id::uuid,v_created.created_at::timestamptz,v_created.message::text,v_snapshot;
end;
$$;
revoke all on function public.create_social_post_v3(uuid,text,text,text[],text[],jsonb,uuid,uuid[],uuid) from public,anon;
grant execute on function public.create_social_post_v3(uuid,text,text,text[],text[],jsonb,uuid,uuid[],uuid) to authenticated;

-- Minimal identities only, under the same visibility predicate as the table policy.
create or replace function public.get_social_post_mentions_v1(p_post_ids uuid[])
returns table(post_id uuid,user_id uuid,display_name text,username text)
language sql stable security definer set search_path = public, pg_catalog as $$
 select m.post_id,m.user_id,coalesce(nullif(btrim(p.display_name),''),p.username,'Backyrd Mitglied'),p.username
 from public.social_post_mentions m join public.profiles p on p.id=m.user_id
 where m.post_id=any(p_post_ids) and public.social_post_mention_is_visible_v1(m.post_id,m.user_id) order by m.created_at,m.user_id;
$$;
revoke all on function public.get_social_post_mentions_v1(uuid[]) from public,anon;
grant execute on function public.get_social_post_mentions_v1(uuid[]) to authenticated;

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
  perform pg_advisory_xact_lock(hashtextextended(least(c.user_a,c.user_b)::text || greatest(c.user_a,c.user_b)::text,0)) from public.chats c where c.id=p_chat_id;
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

create or replace function public.lock_social_block_pair_v1() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(least(new.blocker_id,new.blocked_id)::text || greatest(new.blocker_id,new.blocked_id)::text,0));
 return new;
end;
$$;
revoke all on function public.lock_social_block_pair_v1() from public,anon,authenticated,service_role;
drop trigger if exists lock_social_block_pair_v1 on public.user_blocks;
create trigger lock_social_block_pair_v1 before insert on public.user_blocks for each row execute function public.lock_social_block_pair_v1();

-- The editor reads source ownership on the server, never from a feed's optional metadata.
create or replace function public.get_my_moment_editor_v1(p_post_id uuid)
returns table(post_id uuid,caption text,mood_tags text[],review_id uuid)
language sql stable security definer set search_path = public, pg_catalog as $$
 select p.id,p.caption,p.mood_tags,p.review_id from public.social_posts p
 where p.id=p_post_id and p.user_id=auth.uid() and auth.uid() is not null and p.status='published' and public.social_post_is_visible_v1(p.id);
$$;
revoke all on function public.get_my_moment_editor_v1(uuid) from public,anon;
grant execute on function public.get_my_moment_editor_v1(uuid) to authenticated;

create or replace function public.update_my_moment_v1(
 p_post_id uuid,p_caption text,p_mood_tags text[],p_expected_caption text,p_expected_mood_tags text[]
) returns table(post_id uuid,caption text,mood_tags text[])
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_me uuid := auth.uid(); v_post public.social_posts%rowtype;
begin
 if v_me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 if length(coalesce(p_caption,''))>1200 or cardinality(coalesce(p_mood_tags,'{}'))>2
   or exists(select 1 from unnest(p_mood_tags) m where m is null or public.backyrd_resolve_mood_input_v2(m)->>'status'='INVALID')
 then raise exception 'invalid_moment_input'; end if;
 select * into v_post from public.social_posts p where p.id=p_post_id and p.user_id=v_me and p.status='published' and public.social_post_is_visible_v1(p.id) for update;
 if not found then raise exception 'moment_not_available' using errcode='42501'; end if;
 if v_post.caption is distinct from p_expected_caption or v_post.mood_tags is distinct from coalesce(p_expected_mood_tags,'{}') then raise exception 'moment_changed'; end if;
 if nullif(btrim(coalesce(p_caption,'')),'') is null and not exists(select 1 from public.social_post_media m where m.post_id=p_post_id) then raise exception 'moment_content_required'; end if;
 if v_post.review_id is not null then
   -- Canonical review triggers resolve the expressions and rebuild the qualitative place signal.
   update public.reviews r set text=nullif(btrim(p_caption),''),mood_a=p_mood_tags[1],mood_b=p_mood_tags[2],updated_at=now()
   where r.id=v_post.review_id and r.user_id=v_me;
   if not found then raise exception 'review_not_available' using errcode='42501'; end if;
 end if;
 update public.social_posts p set caption=nullif(btrim(p_caption),''),mood_tags=coalesce(p_mood_tags,'{}'),updated_at=now()
 where p.id=p_post_id and p.user_id=v_me;
 return query select p.id,p.caption,p.mood_tags from public.social_posts p where p.id=p_post_id;
end;
$$;
revoke all on function public.update_my_moment_v1(uuid,text,text[],text,text[]) from public,anon;
grant execute on function public.update_my_moment_v1(uuid,text,text[],text,text[]) to authenticated;

-- Feed removal is explicit: a separate place impression is retained, not silently deleted.
create or replace function public.remove_my_moment_v1(p_post_id uuid)
returns table(post_id uuid,status text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_me uuid := auth.uid();
begin
 if v_me is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 update public.social_posts p set status='deleted',updated_at=now()
 where p.id=p_post_id and p.user_id=v_me and p.status in ('published','deleted');
 if not found then raise exception 'moment_not_available' using errcode='42501'; end if;
 return query select p_post_id,'deleted'::text;
end;
$$;
revoke all on function public.remove_my_moment_v1(uuid) from public,anon;
grant execute on function public.remove_my_moment_v1(uuid) to authenticated;

-- All clients, including older RPC callers, obey the same publication and visibility rules.
CREATE OR REPLACE FUNCTION "public"."get_social_feed_v1"("p_limit" integer DEFAULT 30, "p_cursor" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_city" "text" DEFAULT NULL::"text", "p_feed_mode" "text" DEFAULT 'for_you'::"text") RETURNS TABLE("post_id" "uuid", "user_id" "uuid", "display_name" "text", "username" "text", "avatar_url" "text", "spot_id" "uuid", "spot_name" "text", "spot_city" "text", "category_name" "text", "caption" "text", "visibility" "text", "mood_tags" "text"[], "occasion_tags" "text"[], "media" "jsonb", "like_count" integer, "comment_count" integer, "save_count" integer, "viewer_has_liked" boolean, "viewer_has_saved" boolean, "viewer_follows_author" boolean, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with limited_posts as (
    select sp.*
    from public.social_posts sp
    left join public.spots s on s.id = sp.spot_id
    where
      auth.uid() is not null
      and coalesce((to_jsonb(sp)->>'is_deleted')::boolean, false) = false
      and public.social_post_is_visible_v1(sp.id)
      and (p_cursor is null or sp.created_at < p_cursor)
      and (
        p_city is null
        or trim(p_city) = ''
        or lower(coalesce(s.city, '')) = lower(trim(p_city))
      )
      and (
        case
          when lower(coalesce(p_feed_mode, 'for_you')) = 'following' then
            exists (
              select 1
              from public.follows f
              where f.follower = auth.uid()
                and f.following = sp.user_id
            )
          else
            (
              coalesce(sp.visibility, 'public') = 'public'
              or sp.user_id = auth.uid()
              or (
                coalesce(sp.visibility, 'public') = 'followers'
                and exists (
                  select 1
                  from public.follows f
                  where f.follower = auth.uid()
                    and f.following = sp.user_id
                )
              )
            )
        end
      )
    order by sp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 80))
  )

  select
    sp.id as post_id,
    sp.user_id,

    case when p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) then coalesce(
      nullif(trim(to_jsonb(p)->>'display_name'), ''),
      nullif(trim(to_jsonb(p)->>'first_name'), ''),
      nullif(trim(to_jsonb(p)->>'name'), ''),
      nullif(trim(to_jsonb(p)->>'full_name'), ''),
      'Backyrd User'
    ) else 'Mitglied' end as display_name,

    case when p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) then nullif(trim(to_jsonb(p)->>'username'), '') else null end as username,
    case when p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) then nullif(trim(to_jsonb(p)->>'avatar_url'), '') else null end as avatar_url,

    s.id as spot_id,
    s.name as spot_name,
    s.city as spot_city,
    c.name as category_name,

    sp.caption,
    coalesce(sp.visibility, 'public') as visibility,
    coalesce(sp.mood_tags, '{}'::text[]) as mood_tags,
    coalesce(sp.occasion_tags, '{}'::text[]) as occasion_tags,

    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'storage_path', to_jsonb(m)->>'storage_path',
          'public_url', to_jsonb(m)->>'public_url',
          'media_type', to_jsonb(m)->>'media_type',
          'width', nullif(to_jsonb(m)->>'width', '')::integer,
          'height', nullif(to_jsonb(m)->>'height', '')::integer,
          'sort_order', nullif(to_jsonb(m)->>'sort_order', '')::integer
        )
        order by
          coalesce(nullif(to_jsonb(m)->>'sort_order', '')::integer, 0) asc,
          m.created_at asc
      )
      from public.social_post_media m
      where m.post_id = sp.id
    ), '[]'::jsonb) as media,

    (
      select count(*)::integer
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.reaction_type = 'like'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as like_count,

    (
      select count(*)::integer
      from public.social_comments cm
      where cm.post_id = sp.id
        and coalesce((to_jsonb(cm)->>'is_deleted')::boolean, false) = false
    ) as comment_count,

    (
      select count(*)::integer
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.reaction_type = 'save'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as save_count,

    exists (
      select 1
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.user_id = auth.uid()
        and r.reaction_type = 'like'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as viewer_has_liked,

    exists (
      select 1
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.user_id = auth.uid()
        and r.reaction_type = 'save'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as viewer_has_saved,

    exists (
      select 1
      from public.follows f
      where f.follower = auth.uid()
        and f.following = sp.user_id
    ) as viewer_follows_author,

    sp.created_at
  from limited_posts sp
  join public.profiles p on p.id = sp.user_id
  left join public.spots s on s.id = sp.spot_id
  left join public.categories c on c.id = s.category_id
  order by sp.created_at desc;
$$;

-- All clients, including older RPC callers, obey the same publication and visibility rules.
CREATE OR REPLACE FUNCTION "public"."get_social_user_posts_v1"("p_user_id" "uuid", "p_limit" integer DEFAULT 40, "p_cursor" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("post_id" "uuid", "user_id" "uuid", "display_name" "text", "username" "text", "avatar_url" "text", "spot_id" "uuid", "spot_name" "text", "spot_city" "text", "category_name" "text", "caption" "text", "visibility" "text", "mood_tags" "text"[], "occasion_tags" "text"[], "media" "jsonb", "like_count" integer, "comment_count" integer, "save_count" integer, "viewer_has_liked" boolean, "viewer_has_saved" boolean, "viewer_follows_author" boolean, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with limited_posts as (
    select sp.*
    from public.social_posts sp
    where sp.user_id = p_user_id
      and coalesce((to_jsonb(sp)->>'is_deleted')::boolean, false) = false
      and public.social_post_is_visible_v1(sp.id)
      and (
        coalesce(sp.visibility, 'public') = 'public'
        or sp.user_id = auth.uid()
        or (
          coalesce(sp.visibility, 'public') = 'followers'
          and exists (
            select 1
            from public.follows f
            where f.follower = auth.uid()
              and f.following = sp.user_id
          )
        )
      )
      and (p_cursor is null or sp.created_at < p_cursor)
    order by sp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 40), 80))
  )
  select
    sp.id as post_id,
    sp.user_id,

    case when p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) then coalesce(
      nullif(trim(to_jsonb(p)->>'display_name'), ''),
      nullif(trim(to_jsonb(p)->>'first_name'), ''),
      nullif(trim(to_jsonb(p)->>'name'), ''),
      'Backyrd User'
    ) else 'Mitglied' end as display_name,

    case when p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) then nullif(trim(to_jsonb(p)->>'username'), '') else null end as username,
    case when p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id])) then nullif(trim(to_jsonb(p)->>'avatar_url'), '') else null end as avatar_url,

    s.id as spot_id,
    s.name as spot_name,
    s.city as spot_city,
    c.name as category_name,

    sp.caption,
    coalesce(sp.visibility, 'public') as visibility,
    coalesce(sp.mood_tags, '{}'::text[]) as mood_tags,
    coalesce(sp.occasion_tags, '{}'::text[]) as occasion_tags,

    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'storage_path', m.storage_path,
          'public_url', to_jsonb(m)->>'public_url',
          'media_type', to_jsonb(m)->>'media_type',
          'width', nullif(to_jsonb(m)->>'width', '')::integer,
          'height', nullif(to_jsonb(m)->>'height', '')::integer,
          'sort_order', nullif(to_jsonb(m)->>'sort_order', '')::integer
        )
        order by
          coalesce(nullif(to_jsonb(m)->>'sort_order', '')::integer, 0) asc,
          m.created_at asc
      )
      from public.social_post_media m
      where m.post_id = sp.id
    ), '[]'::jsonb) as media,

    (
      select count(*)::integer
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.reaction_type = 'like'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as like_count,

    (
      select count(*)::integer
      from public.social_comments cm
      where cm.post_id = sp.id
        and coalesce((to_jsonb(cm)->>'is_deleted')::boolean, false) = false
    ) as comment_count,

    (
      select count(*)::integer
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.reaction_type = 'save'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as save_count,

    exists (
      select 1
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.user_id = auth.uid()
        and r.reaction_type = 'like'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as viewer_has_liked,

    exists (
      select 1
      from public.social_post_reactions r
      where r.post_id = sp.id
        and r.user_id = auth.uid()
        and r.reaction_type = 'save'
        and coalesce((to_jsonb(r)->>'active')::boolean, true) = true
    ) as viewer_has_saved,

    exists (
      select 1
      from public.follows f
      where f.follower = auth.uid()
        and f.following = sp.user_id
    ) as viewer_follows_author,

    sp.created_at
  from limited_posts sp
  join public.profiles p on p.id = sp.user_id
  left join public.spots s on s.id = sp.spot_id
  left join public.categories c on c.id = s.category_id
  order by sp.created_at desc;
$$;

-- A shared URL grants no access: the same viewer rule is checked on every read.
create or replace function public.get_social_post_v1(p_post_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
 select jsonb_build_object(
  'post_id',p.id,'user_id',p.user_id,'display_name',case when author.id=any(public.safety_visible_entity_ids_v1('profile',array[author.id])) then coalesce(nullif(btrim(author.display_name),''),author.username,'Backyrd Mitglied') else 'Mitglied' end,
  'username',case when author.id=any(public.safety_visible_entity_ids_v1('profile',array[author.id])) then author.username else null end,'avatar_url',case when author.id=any(public.safety_visible_entity_ids_v1('profile',array[author.id])) then author.avatar_url else null end,'spot_id',p.spot_id,'spot_name',s.name,'spot_city',s.city,'category_name',c.name,
  'caption',p.caption,'mood_tags',p.mood_tags,'occasion_tags',p.occasion_tags,'visibility',p.visibility,'created_at',p.created_at,
  'like_count',p.like_count,'save_count',p.save_count,'comment_count',p.comment_count,
  'viewer_has_liked',exists(select 1 from public.social_post_reactions r where r.post_id=p.id and r.user_id=auth.uid() and r.reaction_type='like'),
  'viewer_has_saved',exists(select 1 from public.social_post_reactions r where r.post_id=p.id and r.user_id=auth.uid() and r.reaction_type='save'),
  'viewer_follows_author',exists(select 1 from public.follows f where f.follower=auth.uid() and f.following=p.user_id),
  'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storage_path',m.storage_path,'public_url',m.public_url,'media_type',m.media_type,'width',m.width,'height',m.height,'sort_order',m.sort_order) order by m.sort_order) from public.social_post_media m where m.post_id=p.id),'[]'::jsonb)
 ) from public.social_posts p join public.profiles author on author.id=p.user_id
 left join public.spots s on s.id=p.spot_id left join public.categories c on c.id=s.category_id
 where p.id=p_post_id and public.social_post_is_visible_v1(p.id);
$$;
revoke all on function public.get_social_post_v1(uuid) from public,anon;
grant execute on function public.get_social_post_v1(uuid) to authenticated;

-- The output field spot_id must not shadow the follow uniqueness key.
CREATE OR REPLACE FUNCTION "public"."follow_spot_v1"("p_spot_id" "uuid") RETURNS TABLE("spot_id" "uuid", "is_following" boolean, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_spot_id is null then
    raise exception 'spot_id_required';
  end if;

  if not public.spot_accepts_consumer_interactions_v1(p_spot_id) then
    raise exception 'spot_not_found';
  end if;

  insert into public.spot_follows (
    user_id,
    spot_id,
    created_at
  )
  values (
    v_user_id,
    p_spot_id,
    now()
  )
  on conflict on constraint spot_follows_pkey do nothing;

  spot_id := p_spot_id;
  is_following := true;
  message := 'spot_followed';
  return next;
end;
$$;

-- Reporting links to evidence; a reporter must never rewrite canonical content or attribution.
CREATE OR REPLACE FUNCTION "public"."safety_get_or_create_reportable_content_v1"("p_content_type" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_actor_user_id" "uuid" DEFAULT NULL::"uuid", "p_spot_id" "uuid" DEFAULT NULL::"uuid", "p_text_content" "text" DEFAULT NULL::"text", "p_image_urls" "text"[] DEFAULT '{}'::"text"[], "p_locale" "text" DEFAULT 'de-CH'::"text", "p_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_content_item_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id_required';
  end if;

  if p_content_type not in (
    'review',
    'moment',
    'comment',
    'profile',
    'spot',
    'owner_spot_profile'
  ) then
    raise exception 'unsupported_content_type';
  end if;

  if p_entity_type = 'social_post' then
    if not public.social_post_is_visible_v1(p_entity_id) then
      raise exception 'content_not_available' using errcode='42501';
    end if;
    p_content_type := 'moment';
    select p.user_id,p.spot_id,concat_ws(E'\n',nullif(btrim(p.caption),''),nullif(array_to_string(p.mood_tags,' · '),'')),
      coalesce((select array_agg(coalesce(m.storage_path,m.public_url) order by m.sort_order) from public.social_post_media m where m.post_id=p.id),'{}'::text[])
    into p_actor_user_id,p_spot_id,p_text_content,p_image_urls
    from public.social_posts p where p.id=p_entity_id;
  end if;

  select id
  into v_content_item_id
  from public.safety_content_items
  where entity_type = p_entity_type
    and entity_id = p_entity_id
  order by created_at desc
  limit 1;

  if v_content_item_id is null then
    insert into public.safety_content_items(
      content_type,
      entity_type,
      entity_id,
      actor_user_id,
      spot_id,
      text_content,
      image_urls,
      locale,
      context,
      lifecycle_status
    )
    values(
      p_content_type,
      p_entity_type,
      p_entity_id,
      p_actor_user_id,
      p_spot_id,
      nullif(trim(coalesce(p_text_content, '')), ''),
      coalesce(p_image_urls, '{}'::text[]),
      nullif(trim(coalesce(p_locale, '')), ''),
      coalesce(p_context, '{}'::jsonb),
      'live'
    )
    returning id into v_content_item_id;

  end if;

  return jsonb_build_object(
    'ok', true,
    'content_item_id', v_content_item_id,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id
  );
end;
$$;

-- Custom Mood expressions are user content and belong in the same moderation evidence as the caption.
CREATE OR REPLACE FUNCTION "public"."safety_sync_source_to_registry_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
declare
  v_images text[] := '{}'::text[];
  v_text text;
  v_actor uuid;
  v_spot uuid;
  v_content_type text;
  v_entity_type text;
  v_entity_id uuid;
  v_lifecycle text := 'live';
begin
  if tg_op = 'DELETE' then
    v_entity_id := case
      when tg_table_name = 'spot_photos'
        then public.safety_stable_entity_uuid_v1(
          'spot_photo',
          old.id::text
        )
      else old.id::uuid
    end;

    update public.safety_content_items
    set lifecycle_status = 'removed'
    where entity_type = case tg_table_name
      when 'social_posts' then 'social_post'
      when 'social_comments' then 'social_comment'
      when 'reviews' then 'review'
      when 'review_comments' then 'review_comment'
      when 'profiles' then 'profile'
      when 'spot_photos' then 'spot_photo'
      else tg_table_name
    end
      and entity_id = v_entity_id;

    return old;
  end if;

  if tg_table_name = 'social_posts' then
    v_content_type := 'moment';
    v_entity_type := 'social_post';
    v_entity_id := new.id;
    v_actor := new.user_id;
    v_spot := new.spot_id;
    v_text := concat_ws(E'\n',nullif(btrim(new.caption),''),nullif(array_to_string(new.mood_tags,' · '),''));

    select coalesce(
      array_agg(m.storage_path order by m.sort_order)
        filter (
          where nullif(trim(m.storage_path), '') is not null
        ),
      '{}'::text[]
    )
    into v_images
    from public.social_post_media m
    where m.post_id = new.id;

    v_lifecycle := case new.status
      when 'hidden' then 'hidden'
      when 'deleted' then 'removed'
      when 'draft' then 'limited'
      else 'live'
    end;

  elsif tg_table_name = 'social_comments' then
    v_content_type := 'comment';
    v_entity_type := 'social_comment';
    v_entity_id := new.id;
    v_actor := new.user_id;
    v_text := new.body;
    v_lifecycle := case new.status
      when 'hidden' then 'hidden'
      when 'deleted' then 'removed'
      else 'live'
    end;

  elsif tg_table_name = 'reviews' then
    v_content_type := 'review';
    v_entity_type := 'review';
    v_entity_id := new.id;
    v_actor := new.user_id;
    v_spot := new.spot_id;
    v_text := new.text;

    if nullif(trim(coalesce(new.photo_path, '')), '') is not null then
      v_images := array[new.photo_path];
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'reviews'
        and column_name = 'moderation_status'
    ) then
      v_lifecycle := case
        when to_jsonb(new)->>'moderation_status' = 'hidden'
          then 'hidden'
        when to_jsonb(new)->>'moderation_status' = 'flagged'
          then 'limited'
        else 'live'
      end;
    end if;

  elsif tg_table_name = 'review_comments' then
    v_content_type := 'comment';
    v_entity_type := 'review_comment';
    v_entity_id := new.id;
    v_actor := new.user_id;
    v_text := new.text;

    select r.spot_id
    into v_spot
    from public.reviews r
    where r.id = new.review_id;

  elsif tg_table_name = 'profiles' then
    v_content_type := 'profile';
    v_entity_type := 'profile';
    v_entity_id := new.id;
    v_actor := new.id;

    v_text := concat_ws(
      E'\n',
      nullif(trim(coalesce(new.display_name, '')), ''),
      nullif(trim(coalesce(new.username, '')), ''),
      nullif(trim(coalesce(new.bio, '')), ''),
      nullif(trim(coalesce(new.interests, '')), ''),
      nullif(trim(coalesce(new.personality, '')), '')
    );

    v_images := array_remove(
      array[
        nullif(trim(coalesce(new.avatar_url, '')), ''),
        nullif(trim(coalesce(new.header_photo_url, '')), '')
      ],
      null
    );

  elsif tg_table_name = 'spot_photos' then
    v_content_type := 'spot';
    v_entity_type := 'spot_photo';
    v_entity_id := public.safety_stable_entity_uuid_v1(
      'spot_photo',
      new.id::text
    );
    v_actor := new.uploaded_by;
    v_spot := new.spot_id;

    if nullif(trim(coalesce(new.url, '')), '') is not null then
      v_images := array[new.url];
    end if;

  else
    return new;
  end if;

  perform public.safety_upsert_registry_item_v2(
    v_content_type,
    v_entity_type,
    v_entity_id,
    v_actor,
    v_spot,
    v_text,
    v_images,
    'de-CH',
    jsonb_build_object(
      'registry_version', 'v2',
      'source_table', tg_table_name,
      'source_operation', tg_op,
      'synced_at', now()
    ),
    v_lifecycle
  );

  return new;
end;
$$;

create or replace function public.get_my_saved_moments_v1(p_limit integer default 100)
returns setof jsonb language sql stable security definer set search_path = public, pg_catalog as $$
 select public.get_social_post_v1(r.post_id)
 from public.social_post_reactions r
 where auth.uid() is not null and r.user_id=auth.uid() and r.reaction_type='save'
   and public.social_post_is_visible_v1(r.post_id)
 order by r.created_at desc,r.post_id
 limit greatest(1,least(coalesce(p_limit,100),200));
$$;
revoke all on function public.get_my_saved_moments_v1(integer) from public,anon;
grant execute on function public.get_my_saved_moments_v1(integer) to authenticated;

-- Preserve the existing snapshot/media bookkeeping verbatim, with no new purge.
-- Only the wrapper below is callable by clients; it supplies canonical source data.
alter function public.safety_register_content_snapshot_v1(text,uuid,text,uuid,uuid,text,text[],text,jsonb)
 rename to safety_register_content_snapshot_internal_v1;
revoke all on function public.safety_register_content_snapshot_internal_v1(text,uuid,text,uuid,uuid,text,text[],text,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION "public"."safety_register_content_snapshot_v1"("p_entity_type" "text", "p_entity_id" "uuid", "p_content_type" "text", "p_actor_user_id" "uuid" DEFAULT NULL::"uuid", "p_spot_id" "uuid" DEFAULT NULL::"uuid", "p_text_content" "text" DEFAULT NULL::"text", "p_image_urls" "text"[] DEFAULT '{}'::"text"[], "p_source_surface" "text" DEFAULT NULL::"text", "p_source_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor_user_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_entity_type = 'social_post' then
    if not public.social_post_is_visible_v1(p_entity_id) and not public.safety_is_admin_v1() then
      raise exception 'content_under_review' using errcode='42501';
    end if;
    select p.user_id,p.spot_id,concat_ws(E'\n',nullif(btrim(p.caption),''),nullif(array_to_string(p.mood_tags,' · '),'')),
      coalesce((select array_agg(coalesce(nullif(m.storage_path,''),m.public_url) order by m.sort_order) from public.social_post_media m where m.post_id=p.id),'{}'::text[])
    into v_actor_user_id,p_spot_id,p_text_content,p_image_urls
    from public.social_posts p where p.id=p_entity_id;
    if not found or (v_actor_user_id is distinct from auth.uid() and not public.safety_is_admin_v1()) then
      raise exception 'actor_mismatch' using errcode='42501';
    end if;
    p_content_type := 'moment';
  end if;


  return public.safety_register_content_snapshot_internal_v1(
    p_entity_type,p_entity_id,p_content_type,coalesce(v_actor_user_id,p_actor_user_id),
    p_spot_id,p_text_content,p_image_urls,p_source_surface,p_source_context
  );
end;
$$;
revoke all on function public.safety_register_content_snapshot_v1(text,uuid,text,uuid,uuid,text,text[],text,jsonb) from public,anon;
grant execute on function public.safety_register_content_snapshot_v1(text,uuid,text,uuid,uuid,text,text[],text,jsonb) to authenticated,service_role;

-- Account exports include the new relation without exposing another person's caption or profile.
grant select on public.social_post_mentions to service_role;
create or replace function public.account_person_mentions_export_v1(p_user_id uuid)
returns table(post_id uuid,user_id uuid,created_at timestamptz)
language sql stable security invoker set search_path = public, pg_catalog as $$
 select m.post_id,m.user_id,m.created_at from public.social_post_mentions m
 join public.social_posts p on p.id=m.post_id
 where p.user_id=p_user_id or m.user_id=p_user_id;
$$;
revoke all on function public.account_person_mentions_export_v1(uuid) from public,anon,authenticated;
grant execute on function public.account_person_mentions_export_v1(uuid) to service_role;

-- Public identity lookup respects moderated profile content.
CREATE OR REPLACE FUNCTION "public"."search_social_users_v1"("p_query" "text", "p_limit" integer DEFAULT 30) RETURNS TABLE("user_id" "uuid", "display_name" "text", "username" "text", "avatar_url" "text", "city" "text", "bio" "text", "is_local" boolean, "viewer_follows_user" boolean, "follower_count" integer, "following_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
declare
  v_me uuid := auth.uid();
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
begin
  if v_me is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if length(v_query) < 2 then
    return;
  end if;

  return query
  select
    p.id,
    coalesce(
      nullif(btrim(p.display_name), ''),
      nullif(btrim(p.first_name), ''),
      nullif(btrim(p.username), ''),
      'Backyrd User'
    ),
    nullif(btrim(p.username), ''),
    nullif(btrim(p.avatar_url), ''),
    nullif(btrim(p.city), ''),
    nullif(btrim(p.bio), ''),
    coalesce(p.is_local, false),
    exists (
      select 1
      from public.follows f
      where f.follower = v_me
        and f.following = p.id
    ),
    (
      select count(*)::integer
      from public.follows f
      where f.following = p.id
    ),
    (
      select count(*)::integer
      from public.follows f
      where f.follower = p.id
    )
  from public.profiles p
  where p.id <> v_me
    and p.is_private = false
    and p.id=any(public.safety_visible_entity_ids_v1('profile',array[p.id]))
    and not public.users_are_blocked_v1(v_me, p.id)
    and (
      lower(coalesce(p.username, '')) like '%' || v_query || '%'
      or lower(coalesce(p.display_name, '')) like '%' || v_query || '%'
      or lower(coalesce(p.first_name, '')) like '%' || v_query || '%'
      or lower(coalesce(p.last_name, '')) like '%' || v_query || '%'
    )
  order by
    case
      when lower(coalesce(p.username, '')) = v_query then 0
      when lower(coalesce(p.username, '')) like v_query || '%' then 1
      when lower(coalesce(p.display_name, '')) like v_query || '%' then 2
      else 3
    end,
    lower(coalesce(p.display_name, p.username, p.first_name, ''))
  limit v_limit;
end;
$$;

-- Public identity lookup respects moderated profile content.
CREATE OR REPLACE FUNCTION "public"."get_social_profile_v2"("p_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text", "username" "text", "avatar_url" "text", "header_photo_url" "text", "bio" "text", "city" "text", "is_local" boolean, "is_private" boolean, "post_count" integer, "follower_count" integer, "following_count" integer, "viewer_follows_user" boolean, "is_me" boolean, "can_follow" boolean, "can_message" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if not public.social_profile_is_accessible_v1(p_user_id) then
    return;
  end if;

  if p_user_id <> v_me and not (p_user_id=any(public.safety_visible_entity_ids_v1('profile',array[p_user_id]))) then return; end if;

  return query
  select
    p.id,
    coalesce(
      nullif(btrim(p.display_name), ''),
      nullif(btrim(p.first_name), ''),
      nullif(btrim(p.username), ''),
      'Backyrd User'
    ),
    nullif(btrim(p.username), ''),
    nullif(btrim(p.avatar_url), ''),
    nullif(btrim(p.header_photo_url), ''),
    nullif(btrim(p.bio), ''),
    nullif(btrim(p.city), ''),
    coalesce(p.is_local, false),
    p.is_private,
    (
      select count(*)::integer
      from public.social_posts sp
      where sp.user_id = p.id
        and sp.status = 'published'
        and (
          p.id = v_me
          or p.is_private = false
        )
    ),
    (
      select count(*)::integer
      from public.follows f
      where f.following = p.id
    ),
    (
      select count(*)::integer
      from public.follows f
      where f.follower = p.id
    ),
    exists (
      select 1
      from public.follows f
      where f.follower = v_me
        and f.following = p.id
    ),
    p.id = v_me,
    p.id <> v_me
      and p.is_private = false
      and not public.users_are_blocked_v1(v_me, p.id),
    p.id <> v_me
      and p.is_private = false
      and not public.users_are_blocked_v1(v_me, p.id)
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

-- All current clients write through authenticated RPCs. Direct writes would
-- bypass media ownership, edit concurrency and the canonical safety receipt.
revoke insert, update, delete on public.social_posts, public.social_post_media from public, anon, authenticated;
-- v1 has no media-owner check; shipped clients use v2, new clients use v3.
revoke execute on function public.create_social_post_v1(uuid,text,text,text[],text[],jsonb) from public, anon, authenticated;

-- Storage policies must use the same protected visibility predicate as the feed.
-- Joining self-only profiles from the caller policy hides other public authors.
create or replace function public.social_media_object_is_visible_v1(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.social_post_media m
   where m.storage_path=p_path and public.social_post_is_visible_v1(m.post_id));
$$;
revoke all on function public.social_media_object_is_visible_v1(text) from public,anon;
grant execute on function public.social_media_object_is_visible_v1(text) to authenticated;
drop policy if exists social_post_media_authenticated_visible_read_v1 on storage.objects;
create policy social_post_media_authenticated_visible_read_v1 on storage.objects for select to authenticated
 using (bucket_id='social-post-media' and public.social_media_object_is_visible_v1(name));
