-- Backyrd production reconciliation: remove broad policies and normalize grants.

drop policy if exists "Spots können von eingeloggten Usern erstellt werden"
  on public.spots;
drop policy if exists "admin read/write spots" on public.spots;
drop policy if exists "allow all reads/writes" on public.spots;
drop policy if exists mood_tokens_insert_auth on public.mood_tokens;
drop policy if exists review_photos_insert_authenticated
  on public.review_photos;

-- Preserve the reviewed least-privilege policies if production drift removed them.
-- SECURITY DEFINER is required here: admin_users RLS itself calls this helper.
-- Without the definer boundary, PostgreSQL recurses through the policy indefinitely.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;

drop policy if exists spots_insert_own on public.spots;
create policy spots_insert_own on public.spots
for insert to authenticated
with check (auth.uid() = created_by);

drop policy if exists mood_tokens_write_super on public.mood_tokens;
create policy mood_tokens_write_super on public.mood_tokens
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

do $$
declare
  v_view text;
begin
  foreach v_view in array array[
    'admin_concepts_overview_v1',
    'admin_user_overview_v1',
    'mood_match',
    'review_stats',
    'spot_effective_content_v1',
    'spot_moods_agg_reviews_v1',
    'spot_taxonomy_effective_v1',
    'taxonomy_catalog_v1',
    'spot_likes'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_view
        and c.relkind = 'v'
    ) then
      raise exception 'required_canonical_view_missing_or_not_view: %', v_view;
    end if;

    execute format(
      'alter view public.%I set (security_invoker = true)',
      v_view
    );
    execute format(
      'revoke all on public.%I from public, anon, authenticated',
      v_view
    );
    execute format('grant all on public.%I to service_role', v_view);
  end loop;
end;
$$;

grant select on public.admin_concepts_overview_v1 to authenticated;
grant select on public.admin_user_overview_v1 to authenticated;
grant select on public.spot_likes to authenticated;

grant select on public.mood_match to anon, authenticated;
grant select on public.review_stats to anon, authenticated;
grant select on public.spot_effective_content_v1 to anon, authenticated;
grant select on public.spot_moods_agg_reviews_v1 to anon, authenticated;
grant select on public.spot_taxonomy_effective_v1 to anon, authenticated;
grant select on public.taxonomy_catalog_v1 to anon, authenticated;

do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public', v_function);
  end loop;
end;
$$;

revoke truncate, references, trigger, maintain
  on all tables in schema public
  from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
