-- Backyrd production reconciliation: retire legacy trigger-driven integrations.
-- These triggers are absent from the canonical fresh-environment contract.

drop trigger if exists trg_mood_tokens_cluster_job on public.mood_tokens;
drop function if exists public.enqueue_mood_cluster_job();

drop trigger if exists trg_check_review_achievements on public.reviews;
do $$
begin
  if to_regprocedure('public.check_review_achievements()') is not null then
    execute $comment$
      comment on function public.check_review_achievements() is
        'Legacy trigger entry point retained for service-role compatibility; automatic review invocation is retired.'
    $comment$;
  end if;
end;
$$;

drop trigger if exists trigger_notify_achievement on public.user_achievements;
drop function if exists public.notify_new_achievement();
