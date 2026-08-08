-- Backyrd Social Feed V1
-- Spot-first social layer: posts, media, reactions, comments, follows, feed events.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

create or replace function public.backyrd_touch_updated_at_v1()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  spot_id uuid references public.spots(id) on delete set null,

  caption text,
  visibility text not null default 'public'
    check (visibility in ('public', 'followers', 'private')),

  mood_tags text[] not null default '{}',
  occasion_tags text[] not null default '{}',

  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),

  status text not null default 'published'
    check (status in ('draft', 'published', 'hidden', 'deleted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_post_media (
  id uuid primary key default gen_random_uuid(),

  post_id uuid not null references public.social_posts(id) on delete cascade,

  storage_path text not null,
  public_url text,
  media_type text not null default 'image'
    check (media_type in ('image', 'video')),

  width integer,
  height integer,
  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);

create table if not exists public.social_post_reactions (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  reaction_type text not null
    check (reaction_type in ('like', 'save', 'want_to_go', 'been_there', 'fits_me')),

  created_at timestamptz not null default now(),

  primary key (post_id, user_id, reaction_type)
);

create table if not exists public.social_comments (
  id uuid primary key default gen_random_uuid(),

  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  body text not null,
  status text not null default 'published'
    check (status in ('published', 'hidden', 'deleted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spot_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (user_id, spot_id)
);

create table if not exists public.social_feed_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users(id) on delete cascade,
  post_id uuid references public.social_posts(id) on delete cascade,
  spot_id uuid references public.spots(id) on delete set null,

  event_type text not null check (
    event_type in (
      'post_impression',
      'post_open',
      'post_like',
      'post_unlike',
      'post_save',
      'post_unsave',
      'post_comment',
      'spot_open_from_post',
      'follow_user',
      'unfollow_user',
      'hide_post'
    )
  ),

  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Existing legacy follows table:
-- public.follows(follower uuid, following uuid, created_at timestamptz)
-- We keep it and use it as the canonical user follow table for V1.

create unique index if not exists follows_follower_following_uidx
  on public.follows (follower, following);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------

create index if not exists social_posts_created_at_idx
  on public.social_posts (created_at desc);

create index if not exists social_posts_user_id_created_at_idx
  on public.social_posts (user_id, created_at desc);

create index if not exists social_posts_spot_id_created_at_idx
  on public.social_posts (spot_id, created_at desc);

create index if not exists social_posts_status_visibility_created_idx
  on public.social_posts (status, visibility, created_at desc);

create index if not exists social_post_media_post_sort_idx
  on public.social_post_media (post_id, sort_order asc);

create index if not exists social_post_reactions_user_idx
  on public.social_post_reactions (user_id, reaction_type);

create index if not exists social_comments_post_created_idx
  on public.social_comments (post_id, created_at asc)
  where status = 'published';

create index if not exists spot_follows_spot_idx
  on public.spot_follows (spot_id, created_at desc);

create index if not exists social_feed_events_user_created_idx
  on public.social_feed_events (user_id, created_at desc);

create index if not exists social_feed_events_post_created_idx
  on public.social_feed_events (post_id, created_at desc);

-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------

drop trigger if exists trg_social_posts_updated_at on public.social_posts;
create trigger trg_social_posts_updated_at
before update on public.social_posts
for each row
execute function public.backyrd_touch_updated_at_v1();

drop trigger if exists trg_social_comments_updated_at on public.social_comments;
create trigger trg_social_comments_updated_at
before update on public.social_comments
for each row
execute function public.backyrd_touch_updated_at_v1();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.social_posts enable row level security;
alter table public.social_post_media enable row level security;
alter table public.social_post_reactions enable row level security;
alter table public.social_comments enable row level security;
alter table public.spot_follows enable row level security;
alter table public.social_feed_events enable row level security;
alter table public.follows enable row level security;

drop policy if exists social_posts_select_visible_v1 on public.social_posts;
create policy social_posts_select_visible_v1
on public.social_posts
for select
to authenticated
using (
  status = 'published'
  and (
    visibility = 'public'
    or user_id = auth.uid()
    or (
      visibility = 'followers'
      and exists (
        select 1
        from public.follows f
        where f.follower = auth.uid()
          and f.following = social_posts.user_id
      )
    )
  )
);

drop policy if exists social_posts_insert_own_v1 on public.social_posts;
create policy social_posts_insert_own_v1
on public.social_posts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists social_posts_update_own_v1 on public.social_posts;
create policy social_posts_update_own_v1
on public.social_posts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists social_post_media_select_visible_v1 on public.social_post_media;
create policy social_post_media_select_visible_v1
on public.social_post_media
for select
to authenticated
using (
  exists (
    select 1
    from public.social_posts p
    where p.id = social_post_media.post_id
      and p.status = 'published'
      and (
        p.visibility = 'public'
        or p.user_id = auth.uid()
        or (
          p.visibility = 'followers'
          and exists (
            select 1
            from public.follows f
            where f.follower = auth.uid()
              and f.following = p.user_id
          )
        )
      )
  )
);

drop policy if exists social_post_media_insert_own_post_v1 on public.social_post_media;
create policy social_post_media_insert_own_post_v1
on public.social_post_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.social_posts p
    where p.id = social_post_media.post_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists social_post_reactions_select_own_v1 on public.social_post_reactions;
create policy social_post_reactions_select_own_v1
on public.social_post_reactions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists social_post_reactions_insert_own_v1 on public.social_post_reactions;
create policy social_post_reactions_insert_own_v1
on public.social_post_reactions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists social_post_reactions_delete_own_v1 on public.social_post_reactions;
create policy social_post_reactions_delete_own_v1
on public.social_post_reactions
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists social_comments_select_visible_v1 on public.social_comments;
create policy social_comments_select_visible_v1
on public.social_comments
for select
to authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.social_posts p
    where p.id = social_comments.post_id
      and p.status = 'published'
  )
);

drop policy if exists social_comments_insert_own_v1 on public.social_comments;
create policy social_comments_insert_own_v1
on public.social_comments
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists social_comments_update_own_v1 on public.social_comments;
create policy social_comments_update_own_v1
on public.social_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists follows_select_authenticated_v1 on public.follows;
create policy follows_select_authenticated_v1
on public.follows
for select
to authenticated
using (true);

drop policy if exists follows_insert_own_v1 on public.follows;
create policy follows_insert_own_v1
on public.follows
for insert
to authenticated
with check (follower = auth.uid());

drop policy if exists follows_delete_own_v1 on public.follows;
create policy follows_delete_own_v1
on public.follows
for delete
to authenticated
using (follower = auth.uid());

drop policy if exists spot_follows_select_own_v1 on public.spot_follows;
create policy spot_follows_select_own_v1
on public.spot_follows
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists spot_follows_insert_own_v1 on public.spot_follows;
create policy spot_follows_insert_own_v1
on public.spot_follows
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists spot_follows_delete_own_v1 on public.spot_follows;
create policy spot_follows_delete_own_v1
on public.spot_follows
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists social_feed_events_insert_own_v1 on public.social_feed_events;
create policy social_feed_events_insert_own_v1
on public.social_feed_events
for insert
to authenticated
with check (user_id = auth.uid() or user_id is null);

drop policy if exists social_feed_events_select_own_v1 on public.social_feed_events;
create policy social_feed_events_select_own_v1
on public.social_feed_events
for select
to authenticated
using (user_id = auth.uid());

-- ------------------------------------------------------------
-- RPC: create_social_post_v1
-- ------------------------------------------------------------

create or replace function public.create_social_post_v1(
  p_spot_id uuid default null,
  p_caption text default null,
  p_visibility text default 'public',
  p_mood_tags text[] default '{}',
  p_occasion_tags text[] default '{}',
  p_media jsonb default '[]'::jsonb
)
returns table (
  post_id uuid,
  created_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
  v_visibility text := lower(trim(coalesce(p_visibility, 'public')));
  v_item jsonb;
  v_order integer := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_visibility not in ('public', 'followers', 'private') then
    raise exception 'invalid_visibility';
  end if;

  if p_spot_id is not null and not exists (
    select 1 from public.spots s where s.id = p_spot_id
  ) then
    raise exception 'spot_not_found';
  end if;

  insert into public.social_posts (
    user_id,
    spot_id,
    caption,
    visibility,
    mood_tags,
    occasion_tags,
    status
  )
  values (
    v_user_id,
    p_spot_id,
    nullif(trim(coalesce(p_caption, '')), ''),
    v_visibility,
    coalesce(p_mood_tags, '{}'),
    coalesce(p_occasion_tags, '{}'),
    'published'
  )
  returning id into v_post_id;

  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) = 'array' then
    for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb))
    loop
      if nullif(trim(coalesce(v_item->>'storage_path', '')), '') is not null then
        insert into public.social_post_media (
          post_id,
          storage_path,
          public_url,
          media_type,
          width,
          height,
          sort_order
        )
        values (
          v_post_id,
          trim(v_item->>'storage_path'),
          nullif(trim(coalesce(v_item->>'public_url', '')), ''),
          coalesce(nullif(trim(v_item->>'media_type'), ''), 'image'),
          nullif(v_item->>'width', '')::integer,
          nullif(v_item->>'height', '')::integer,
          v_order
        );

        v_order := v_order + 1;
      end if;
    end loop;
  end if;

  post_id := v_post_id;
  created_at := now();
  message := 'social_post_created';
  return next;
end;
$$;

-- ------------------------------------------------------------
-- RPC: get_social_feed_v1
-- ------------------------------------------------------------

create or replace function public.get_social_feed_v1(
  p_limit integer default 30,
  p_cursor timestamptz default null,
  p_city text default null,
  p_feed_mode text default 'for_you'
)
returns table (
  post_id uuid,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,

  spot_id uuid,
  spot_name text,
  spot_city text,
  category_name text,

  caption text,
  visibility text,
  mood_tags text[],
  occasion_tags text[],

  media jsonb,

  like_count integer,
  comment_count integer,
  save_count integer,

  viewer_has_liked boolean,
  viewer_has_saved boolean,
  viewer_follows_author boolean,

  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 80));
  v_mode text := lower(trim(coalesce(p_feed_mode, 'for_you')));
  v_city text := nullif(trim(coalesce(p_city, '')), '');
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  return query
  with visible_posts as (
    select p.*
    from public.social_posts p
    left join public.spots sp on sp.id = p.spot_id
    where p.status = 'published'
      and (p_cursor is null or p.created_at < p_cursor)
      and (
        p.visibility = 'public'
        or p.user_id = v_user_id
        or (
          p.visibility = 'followers'
          and exists (
            select 1
            from public.follows f
            where f.follower = v_user_id
              and f.following = p.user_id
          )
        )
      )
      and (
        v_city is null
        or lower(coalesce(sp.city, '')) = lower(v_city)
      )
      and (
        v_mode <> 'following'
        or p.user_id = v_user_id
        or exists (
          select 1
          from public.follows f
          where f.follower = v_user_id
            and f.following = p.user_id
        )
      )
  ),
  ranked as (
    select
      p.*,
      (
        case when p.user_id = v_user_id then 0.20 else 0 end
        + case when exists (
            select 1
            from public.follows f
            where f.follower = v_user_id
              and f.following = p.user_id
          ) then 0.55 else 0 end
        + case when exists (
            select 1
            from public.spot_follows sf
            where sf.user_id = v_user_id
              and sf.spot_id = p.spot_id
          ) then 0.25 else 0 end
        + least(1.0, greatest(0.0, extract(epoch from (now() - p.created_at)) / 86400.0 * -0.08 + 1.0))
      ) as feed_score
    from visible_posts p
  )
  select
    r.id as post_id,
    r.user_id,

    coalesce(
      nullif(to_jsonb(pr)->>'display_name', ''),
      nullif(to_jsonb(pr)->>'first_name', ''),
      nullif(to_jsonb(pr)->>'username', ''),
      'User'
    ) as display_name,
    nullif(to_jsonb(pr)->>'username', '') as username,
    nullif(to_jsonb(pr)->>'avatar_url', '') as avatar_url,

    sp.id as spot_id,
    sp.name as spot_name,
    sp.city as spot_city,
    c.name as category_name,

    r.caption,
    r.visibility,
    r.mood_tags,
    r.occasion_tags,

    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'storage_path', m.storage_path,
          'public_url', m.public_url,
          'media_type', m.media_type,
          'width', m.width,
          'height', m.height,
          'sort_order', m.sort_order
        )
        order by m.sort_order asc
      )
      from public.social_post_media m
      where m.post_id = r.id
    ), '[]'::jsonb) as media,

    r.like_count,
    r.comment_count,
    r.save_count,

    exists (
      select 1
      from public.social_post_reactions rx
      where rx.post_id = r.id
        and rx.user_id = v_user_id
        and rx.reaction_type = 'like'
    ) as viewer_has_liked,

    exists (
      select 1
      from public.social_post_reactions rx
      where rx.post_id = r.id
        and rx.user_id = v_user_id
        and rx.reaction_type = 'save'
    ) as viewer_has_saved,

    exists (
      select 1
      from public.follows f
      where f.follower = v_user_id
        and f.following = r.user_id
    ) as viewer_follows_author,

    r.created_at
  from ranked r
  left join public.profiles pr on pr.id = r.user_id
  left join public.spots sp on sp.id = r.spot_id
  left join public.categories c on c.id = sp.category_id
  order by
    r.feed_score desc,
    r.created_at desc
  limit v_limit;
end;
$$;

-- ------------------------------------------------------------
-- RPC: react_to_social_post_v1
-- ------------------------------------------------------------

create or replace function public.react_to_social_post_v1(
  p_post_id uuid,
  p_reaction_type text,
  p_active boolean default null
)
returns table (
  post_id uuid,
  reaction_type text,
  active boolean,
  like_count integer,
  save_count integer,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_reaction_type, '')));
  v_exists boolean;
  v_active boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_post_id is null then
    raise exception 'post_id_required';
  end if;

  if v_type not in ('like', 'save', 'want_to_go', 'been_there', 'fits_me') then
    raise exception 'invalid_reaction_type';
  end if;

  if not exists (
    select 1
    from public.social_posts p
    where p.id = p_post_id
      and p.status = 'published'
  ) then
    raise exception 'post_not_found';
  end if;

  select exists (
    select 1
    from public.social_post_reactions r
    where r.post_id = p_post_id
      and r.user_id = v_user_id
      and r.reaction_type = v_type
  )
  into v_exists;

  v_active := coalesce(p_active, not v_exists);

  if v_active then
    insert into public.social_post_reactions (
      post_id,
      user_id,
      reaction_type
    )
    values (
      p_post_id,
      v_user_id,
      v_type
    )
    on conflict do nothing;
  else
    delete from public.social_post_reactions r
    where r.post_id = p_post_id
      and r.user_id = v_user_id
      and r.reaction_type = v_type;
  end if;

  update public.social_posts p
  set
    like_count = (
      select count(*)::integer
      from public.social_post_reactions r
      where r.post_id = p_post_id
        and r.reaction_type = 'like'
    ),
    save_count = (
      select count(*)::integer
      from public.social_post_reactions r
      where r.post_id = p_post_id
        and r.reaction_type = 'save'
    ),
    updated_at = now()
  where p.id = p_post_id;

  insert into public.social_feed_events (
    user_id,
    post_id,
    spot_id,
    event_type,
    context
  )
  select
    v_user_id,
    p.id,
    p.spot_id,
    case
      when v_type = 'like' and v_active then 'post_like'
      when v_type = 'like' and not v_active then 'post_unlike'
      when v_type = 'save' and v_active then 'post_save'
      when v_type = 'save' and not v_active then 'post_unsave'
      else 'post_open'
    end,
    jsonb_build_object(
      'reaction_type', v_type,
      'active', v_active
    )
  from public.social_posts p
  where p.id = p_post_id;

  post_id := p_post_id;
  reaction_type := v_type;
  active := v_active;

  select p.like_count, p.save_count
  into like_count, save_count
  from public.social_posts p
  where p.id = p_post_id;

  message := case when v_active then 'reaction_added' else 'reaction_removed' end;
  return next;
end;
$$;

-- ------------------------------------------------------------
-- RPC: create_social_comment_v1
-- ------------------------------------------------------------

create or replace function public.create_social_comment_v1(
  p_post_id uuid,
  p_body text
)
returns table (
  comment_id uuid,
  post_id uuid,
  body text,
  created_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment_id uuid;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_post_id is null then
    raise exception 'post_id_required';
  end if;

  if v_body is null then
    raise exception 'comment_body_required';
  end if;

  if length(v_body) > 1000 then
    raise exception 'comment_too_long';
  end if;

  if not exists (
    select 1
    from public.social_posts p
    where p.id = p_post_id
      and p.status = 'published'
  ) then
    raise exception 'post_not_found';
  end if;

  insert into public.social_comments (
    post_id,
    user_id,
    body,
    status
  )
  values (
    p_post_id,
    v_user_id,
    v_body,
    'published'
  )
  returning id into v_comment_id;

  update public.social_posts p
  set
    comment_count = (
      select count(*)::integer
      from public.social_comments c
      where c.post_id = p_post_id
        and c.status = 'published'
    ),
    updated_at = now()
  where p.id = p_post_id;

  insert into public.social_feed_events (
    user_id,
    post_id,
    spot_id,
    event_type,
    context
  )
  select
    v_user_id,
    p.id,
    p.spot_id,
    'post_comment',
    jsonb_build_object('comment_id', v_comment_id)
  from public.social_posts p
  where p.id = p_post_id;

  comment_id := v_comment_id;
  post_id := p_post_id;
  body := v_body;
  created_at := now();
  message := 'comment_created';
  return next;
end;
$$;

-- ------------------------------------------------------------
-- RPC: get_social_comments_v1
-- ------------------------------------------------------------

create or replace function public.get_social_comments_v1(
  p_post_id uuid,
  p_limit integer default 50
)
returns table (
  comment_id uuid,
  post_id uuid,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  return query
  select
    c.id as comment_id,
    c.post_id,
    c.user_id,

    coalesce(
      nullif(to_jsonb(pr)->>'display_name', ''),
      nullif(to_jsonb(pr)->>'first_name', ''),
      nullif(to_jsonb(pr)->>'username', ''),
      'User'
    ) as display_name,
    nullif(to_jsonb(pr)->>'username', '') as username,
    nullif(to_jsonb(pr)->>'avatar_url', '') as avatar_url,

    c.body,
    c.created_at
  from public.social_comments c
  left join public.profiles pr on pr.id = c.user_id
  where c.post_id = p_post_id
    and c.status = 'published'
  order by c.created_at asc
  limit v_limit;
end;
$$;

-- ------------------------------------------------------------
-- RPC: follow_user_v1 / unfollow_user_v1
-- ------------------------------------------------------------

create or replace function public.follow_user_v1(
  p_user_id uuid
)
returns table (
  following_id uuid,
  is_following boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if p_user_id = v_user_id then
    raise exception 'cannot_follow_self';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  insert into public.follows (
    follower,
    following,
    created_at
  )
  values (
    v_user_id,
    p_user_id,
    now()
  )
  on conflict (follower, following) do nothing;

  insert into public.social_feed_events (
    user_id,
    event_type,
    context
  )
  values (
    v_user_id,
    'follow_user',
    jsonb_build_object('following_id', p_user_id)
  );

  following_id := p_user_id;
  is_following := true;
  message := 'user_followed';
  return next;
end;
$$;

create or replace function public.unfollow_user_v1(
  p_user_id uuid
)
returns table (
  following_id uuid,
  is_following boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  delete from public.follows f
  where f.follower = v_user_id
    and f.following = p_user_id;

  insert into public.social_feed_events (
    user_id,
    event_type,
    context
  )
  values (
    v_user_id,
    'unfollow_user',
    jsonb_build_object('following_id', p_user_id)
  );

  following_id := p_user_id;
  is_following := false;
  message := 'user_unfollowed';
  return next;
end;
$$;

-- ------------------------------------------------------------
-- RPC: follow_spot_v1 / unfollow_spot_v1
-- ------------------------------------------------------------

create or replace function public.follow_spot_v1(
  p_spot_id uuid
)
returns table (
  spot_id uuid,
  is_following boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_spot_id is null then
    raise exception 'spot_id_required';
  end if;

  if not exists (select 1 from public.spots s where s.id = p_spot_id) then
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
  on conflict (user_id, spot_id) do nothing;

  spot_id := p_spot_id;
  is_following := true;
  message := 'spot_followed';
  return next;
end;
$$;

create or replace function public.unfollow_spot_v1(
  p_spot_id uuid
)
returns table (
  spot_id uuid,
  is_following boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_spot_id is null then
    raise exception 'spot_id_required';
  end if;

  delete from public.spot_follows sf
  where sf.user_id = v_user_id
    and sf.spot_id = p_spot_id;

  spot_id := p_spot_id;
  is_following := false;
  message := 'spot_unfollowed';
  return next;
end;
$$;

-- ------------------------------------------------------------
-- RPC: log_social_feed_event_v1
-- ------------------------------------------------------------

create or replace function public.log_social_feed_event_v1(
  p_event_type text,
  p_post_id uuid default null,
  p_spot_id uuid default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_id uuid;
  v_spot_id uuid := p_spot_id;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_event_type not in (
    'post_impression',
    'post_open',
    'post_like',
    'post_unlike',
    'post_save',
    'post_unsave',
    'post_comment',
    'spot_open_from_post',
    'follow_user',
    'unfollow_user',
    'hide_post'
  ) then
    raise exception 'invalid_event_type';
  end if;

  if p_post_id is not null and v_spot_id is null then
    select p.spot_id
    into v_spot_id
    from public.social_posts p
    where p.id = p_post_id;
  end if;

  insert into public.social_feed_events (
    user_id,
    post_id,
    spot_id,
    event_type,
    context
  )
  values (
    v_user_id,
    p_post_id,
    v_spot_id,
    v_event_type,
    coalesce(p_context, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

notify pgrst, 'reload schema';