-- Backyrd canonical database webhook metadata.
-- Required Vault names only; no values belong in Git:
--   backyrd_project_url
--   backyrd_service_role_key
--   backyrd_message_push_webhook_secret
-- BASELINE_REVIEW_REQUIRED: the two latter names were not present in the audited
-- Vault inventory and must be provisioned before this webhook can deliver.

do $$
declare
  v_missing text[];
begin
  select array_agg(required.name order by required.name)
  into v_missing
  from (
    values
      ('backyrd_project_url'),
      ('backyrd_service_role_key'),
      ('backyrd_message_push_webhook_secret')
  ) as required(name)
  where not exists (
    select 1 from vault.secrets s where s.name = required.name
  );

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'missing_required_vault_secret_names: %',
      array_to_string(v_missing, ', ');
  end if;
end;
$$;

create or replace function public.send_message_push_webhook_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_project_url text;
  v_service_role_key text;
  v_webhook_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'backyrd_project_url';
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets where name = 'backyrd_service_role_key';
  select decrypted_secret into v_webhook_secret
  from vault.decrypted_secrets where name = 'backyrd_message_push_webhook_secret';

  if v_project_url is null or v_service_role_key is null or v_webhook_secret is null then
    raise warning 'send-message-push webhook skipped: required Vault secret is missing';
    return new;
  end if;

  perform net.http_post(
    url := v_project_url || '/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_service_role_key,
      'Authorization', 'Bearer ' || v_service_role_key,
      'x-backyrd-webhook-secret', v_webhook_secret
    ),
    body := to_jsonb(new)
  );
  return new;
exception when others then
  raise warning 'send-message-push webhook failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.send_message_push_webhook_v1() from public, anon, authenticated;
grant execute on function public.send_message_push_webhook_v1() to service_role;

drop trigger if exists "send-message-push" on public.message_push_outbox;
create trigger "send-message-push"
after insert on public.message_push_outbox
for each row execute function public.send_message_push_webhook_v1();

-- BASELINE_REVIEW_REQUIRED: production has an active mood-token trigger targeting
-- cluster-mood, but its Edge Function lives under mobile/supabase/functions and has
-- no request authentication. The trigger is intentionally not recreated until the
-- function is moved to supabase/functions and hardened.

-- BASELINE_REVIEW_REQUIRED: notify-achievement is also non-canonical and its
-- production trigger is disabled. It is intentionally excluded rather than revived.
