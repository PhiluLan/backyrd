\set ON_ERROR_STOP on

select
  (select count(*) = 3 from information_schema.columns
    where table_schema='public' and column_name='client_request_id'
      and table_name in ('social_comments','social_posts','messages')
      and data_type='uuid' and is_nullable='YES')
  and (select count(*) = 3 from pg_indexes
    where schemaname='public'
      and indexname in ('social_comments_actor_request_uq','social_posts_actor_request_uq','messages_actor_request_uq')
      and indexdef ilike 'create unique index%client_request_id%where (client_request_id is not null)')
  and (select count(*) = 3 from pg_trigger
    where not tgisinternal and tgname in (
      'trg_sync_social_comment_count_gate6_v1',
      'trg_sync_social_reaction_counts_gate6_v1',
      'trg_guard_social_reaction_target_gate6_v1'))
  and (select count(*) = 7 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'spot_accepts_consumer_interactions_v1',
      'sync_social_comment_count_gate6_v1',
      'sync_social_reaction_counts_gate6_v1',
      'guard_social_reaction_target_gate6_v1',
      'create_social_comment_v2','create_social_post_v2','send_message_v2')
      and p.prosecdef
      and p.proconfig @> array['search_path=public, pg_catalog'])
  and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='admin_account_owned_storage_paths_v1'
      and p.prosecdef and p.proconfig @> array['search_path=public, storage, pg_catalog'])
  and exists (select 1 from pg_policies where schemaname='public' and tablename='favorites'
    and policyname='Users can insert their own favorites' and with_check like '%spot_accepts_consumer_interactions_v1%')
  and exists (select 1 from pg_policies where schemaname='public' and tablename='social_posts'
    and policyname='social_posts_insert_own_v1' and with_check like '%spot_accepts_consumer_interactions_v1%')
  as gate6_schema_is_exact
\gset
\if :gate6_schema_is_exact
  \echo 'Gate 6 schema, trigger, policy and SECURITY DEFINER structure passed.'
\else
  select 1/0;
\endif

begin;
-- Gate 7 is a later service-only operational schema delta. Remove it first so
-- this transaction continues to prove the exact pre-Gate-6 application state.
drop function public.backyrd_launch_operations_snapshot_v1();
drop function public.backyrd_has_claimable_embedding_job_v1();
drop function public.backyrd_consume_launch_cost_boundary_v1(text,text,integer,integer,integer,integer);
drop table public.backyrd_launch_cost_counters_v1;
drop policy "Users can insert their own favorites" on public.favorites;
create policy "Users can insert their own favorites" on public.favorites for insert with check (auth.uid() = user_id);
drop policy social_posts_insert_own_v1 on public.social_posts;
create policy social_posts_insert_own_v1 on public.social_posts for insert to authenticated with check (user_id = auth.uid());

drop trigger trg_sync_social_comment_count_gate6_v1 on public.social_comments;
drop trigger trg_sync_social_reaction_counts_gate6_v1 on public.social_post_reactions;
drop trigger trg_guard_social_reaction_target_gate6_v1 on public.social_post_reactions;
drop function public.sync_social_comment_count_gate6_v1();
drop function public.sync_social_reaction_counts_gate6_v1();
drop function public.guard_social_reaction_target_gate6_v1();
drop function public.create_social_comment_v2(uuid,text,uuid);
drop function public.create_social_post_v2(uuid,text,text,text[],text[],jsonb,uuid);
drop function public.send_message_v2(uuid,text,text,uuid);
drop function public.admin_account_owned_storage_paths_v1(uuid);
drop function public.spot_accepts_consumer_interactions_v1(uuid);
drop index public.social_comments_actor_request_uq;
drop index public.social_posts_actor_request_uq;
drop index public.messages_actor_request_uq;
alter table public.social_comments drop column client_request_id;
alter table public.social_posts drop column client_request_id;
alter table public.messages drop column client_request_id;

\echo 'Gate 6 reconstructed prior application schema fingerprint follows:'
\ir application-schema-fingerprint.sql
rollback;
