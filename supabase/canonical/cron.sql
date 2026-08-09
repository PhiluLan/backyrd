-- Backyrd canonical pg_cron metadata.
-- Secret values are provisioned out of band and never belong in Git.

do $cron_reconcile$
declare
  v_job record;
  v_missing text[];
begin
  -- The Account Trust milestone job is database-local and secret-free.
  for v_job in
    select jobid from cron.job
    where jobname = 'backyrd-account-trust-identity-daily'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  select array_agg(required.name order by required.name)
  into v_missing
  from (
    values
      ('backyrd_project_url'),
      ('backyrd_publishable_key'),
      ('backyrd_service_role_key'),
      ('backyrd_safety_text_worker_secret'),
      ('backyrd_safety_image_worker_secret')
  ) as required(name)
  where not exists (
    select 1 from vault.secrets s where s.name = required.name
  );

  if coalesce(cardinality(v_missing), 0) > 0 then
    raise exception 'missing_required_vault_secret_names: %',
      array_to_string(v_missing, ', ');
  end if;

  -- Remove prior jobs by their stable Edge Function target, including historical
  -- jobs with generated names or embedded credentials.
  for v_job in
    select jobid
    from cron.job
    where command ilike '%/functions/v1/generate-spot-embeddings%'
       or command ilike '%/functions/v1/safety-text-worker%'
       or command ilike '%/functions/v1/safety-image-worker%'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'backyrd-generate-spot-embeddings-every-minute',
    '* * * * *',
    $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_project_url')
        || '/functions/v1/generate-spot-embeddings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_service_role_key')
      ),
      body := jsonb_build_object('limit', 10)
    );
    $command$
  );

  perform cron.schedule(
    'backyrd-safety-text-worker-every-minute',
    '* * * * *',
    $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_project_url')
        || '/functions/v1/safety-text-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_publishable_key'),
        'x-backyrd-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_safety_text_worker_secret')
      ),
      body := jsonb_build_object('source', 'pg_cron', 'invoked_at', now())
    );
    $command$
  );

  perform cron.schedule(
    'backyrd-safety-image-worker-every-minute',
    '* * * * *',
    $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_project_url')
        || '/functions/v1/safety-image-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_publishable_key'),
        'x-backyrd-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'backyrd_safety_image_worker_secret')
      ),
      body := jsonb_build_object('source', 'pg_cron', 'invoked_at', now())
    );
    $command$
  );

  perform cron.schedule(
    'backyrd-account-trust-identity-daily',
    '17 3 * * *',
    $command$
    select public.account_trust_evaluate_identity_due_v1(1000, now());
    $command$
  );
end;
$cron_reconcile$;
