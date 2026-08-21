-- Make the internal worker credential rotation restartable. The initial
-- activation creates the Vault rows; later rotations must update them rather
-- than fail on Vault's unique secret names.
create or replace function public.backyrd_configure_internal_live_worker_v1(
  p_worker_url text,p_service_key text,p_internal_secret text
) returns void language plpgsql security definer set search_path=public,pg_catalog,vault,cron as $$
declare v_command text;v_service_secret_id uuid;v_internal_secret_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  if p_worker_url!~'^https://[a-z0-9-]+\.supabase\.co/functions/v1/decision-engine-worker$'
     or length(p_service_key)<40 or length(p_internal_secret)<32 then
    raise exception 'internal_live_worker_config_invalid' using errcode='22023';
  end if;
  select id into v_service_secret_id from vault.secrets where name='backyrd_internal_live_service_key' order by created_at desc limit 1;
  if v_service_secret_id is null then
    perform vault.create_secret(p_service_key,'backyrd_internal_live_service_key','Internal live worker service credential');
  else
    perform vault.update_secret(v_service_secret_id,p_service_key,'backyrd_internal_live_service_key','Internal live worker service credential');
  end if;
  select id into v_internal_secret_id from vault.secrets where name='backyrd_internal_live_worker_secret' order by created_at desc limit 1;
  if v_internal_secret_id is null then
    perform vault.create_secret(p_internal_secret,'backyrd_internal_live_worker_secret','Internal live worker invocation secret');
  else
    perform vault.update_secret(v_internal_secret_id,p_internal_secret,'backyrd_internal_live_worker_secret','Internal live worker invocation secret');
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname='backyrd-internal-live-worker-v1';
  v_command := format($cmd$select net.http_post(
    url:=%L,
    headers:=jsonb_build_object(
      'authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='backyrd_internal_live_service_key' order by created_at desc limit 1),
      'content-type','application/json',
      'x-backyrd-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='backyrd_internal_live_worker_secret' order by created_at desc limit 1)
    ),body:='{"mode":"LIVE_TICK"}'::jsonb,timeout_milliseconds:=50000
  )$cmd$,p_worker_url);
  perform cron.schedule('backyrd-internal-live-worker-v1','* * * * *',v_command);
end $$;

revoke all on function public.backyrd_configure_internal_live_worker_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.backyrd_configure_internal_live_worker_v1(text,text,text) to service_role;
