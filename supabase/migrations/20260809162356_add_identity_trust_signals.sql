-- Sprint 9.1: privacy-friendly Identity Trust signals.
--
-- This migration only emits evidence into the Account Trust Engine. It does
-- not enforce, punish, rank, limit, hide, or distribute account content.

create table public.account_trust_identity_detector_config (
  detector_key text primary key
    check (detector_key ~ '^[a-z][a-z0-9_.-]*$'),
  detector_version text not null,
  enabled boolean not null default true,
  threshold_count integer check (threshold_count is null or threshold_count >= 2),
  observation_window interval
    check (observation_window is null or observation_window > interval '0 seconds'),
  signal_strength numeric(5,4) not null check (signal_strength between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_trust_identity_age_milestones (
  milestone_days integer primary key check (milestone_days > 0),
  signal_key text not null unique
    references public.account_trust_signal_registry(signal_key),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.account_trust_identity_disposable_email_domains (
  domain text primary key
    check (domain = lower(btrim(domain)) and domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'),
  enabled boolean not null default true,
  source text not null default 'backyrd_curated_v1',
  source_version text not null default '1',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_trust_identity_installation_accounts (
  technical_identity_hash text not null
    check (technical_identity_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null
    check (source in ('optional_analytics_installation')),
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (technical_identity_hash, user_id),
  check (last_observed_at >= first_observed_at)
);

create index account_trust_identity_installation_accounts_user_idx
  on public.account_trust_identity_installation_accounts (user_id, last_observed_at desc);

comment on table public.account_trust_identity_disposable_email_domains is
  'Versioned, conservative configuration for disposable-email detection; update through migrations.';
comment on table public.account_trust_identity_installation_accounts is
  'Pseudonymous associations derived only from an existing opt-in Analytics installation UUID. No raw identifier, IP, network, or fingerprint is stored.';

insert into public.account_trust_signal_registry (
  signal_key, dimension, polarity, base_score_impact, reason_code,
  definition_version, default_ttl, description, metadata
) values
  ('identity_email_verified', 'identity', 'supporting', 8, 'IDENTITY_EMAIL_VERIFIED',
   1, null, 'The account completed the canonical email-verification lifecycle.',
   '{"detector_family":"identity","signal_interpretation":"supporting_evidence"}'::jsonb),
  ('identity_account_age_7d', 'identity', 'supporting', 2, 'IDENTITY_ACCOUNT_AGE_7D',
   1, null, 'The account reached seven days of age.',
   '{"detector_family":"identity","milestone_days":7}'::jsonb),
  ('identity_account_age_30d', 'identity', 'supporting', 3, 'IDENTITY_ACCOUNT_AGE_30D',
   1, null, 'The account reached thirty days of age.',
   '{"detector_family":"identity","milestone_days":30}'::jsonb),
  ('identity_account_age_90d', 'identity', 'supporting', 4, 'IDENTITY_ACCOUNT_AGE_90D',
   1, null, 'The account reached ninety days of age.',
   '{"detector_family":"identity","milestone_days":90}'::jsonb),
  ('identity_account_age_180d', 'identity', 'supporting', 5, 'IDENTITY_ACCOUNT_AGE_180D',
   1, null, 'The account reached one hundred eighty days of age.',
   '{"detector_family":"identity","milestone_days":180}'::jsonb),
  ('identity_account_age_365d', 'identity', 'supporting', 6, 'IDENTITY_ACCOUNT_AGE_365D',
   1, null, 'The account reached one year of age.',
   '{"detector_family":"identity","milestone_days":365}'::jsonb),
  ('identity_disposable_email', 'identity', 'risk', -12, 'IDENTITY_DISPOSABLE_EMAIL',
   1, null, 'The canonical email domain matches the enabled disposable-email registry.',
   '{"detector_family":"identity","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('identity_signup_velocity', 'identity', 'risk', -18, 'IDENTITY_SIGNUP_VELOCITY',
   1, interval '30 days', 'An opt-in Analytics installation was associated with an unusual registration burst.',
   '{"detector_family":"identity","signal_interpretation":"indicator_not_proof","privacy_basis":"existing_opt_in_analytics"}'::jsonb),
  ('identity_multiple_registrations', 'identity', 'risk', -10, 'IDENTITY_MULTIPLE_REGISTRATIONS',
   1, null, 'An opt-in Analytics installation was associated with multiple accounts.',
   '{"detector_family":"identity","signal_interpretation":"indicator_not_proof","privacy_basis":"existing_opt_in_analytics"}'::jsonb);

insert into public.account_trust_identity_age_milestones (milestone_days, signal_key)
values
  (7, 'identity_account_age_7d'),
  (30, 'identity_account_age_30d'),
  (90, 'identity_account_age_90d'),
  (180, 'identity_account_age_180d'),
  (365, 'identity_account_age_365d');

insert into public.account_trust_identity_detector_config (
  detector_key, detector_version, threshold_count, observation_window,
  signal_strength, confidence, metadata
) values
  ('backyrd.identity.email_verified', '1.0.0', null, null, 1, 1,
   '{"source":"auth.users.email_confirmed_at"}'::jsonb),
  ('backyrd.identity.account_age', '1.0.0', null, null, 1, 1,
   '{"evaluation":"daily_milestones"}'::jsonb),
  ('backyrd.identity.disposable_email', '1.0.0', null, null, 0.80, 0.95,
   '{"matching":"exact_or_subdomain","configuration":"account_trust_identity_disposable_email_domains"}'::jsonb),
  ('backyrd.identity.signup_velocity', '1.0.0', 3, interval '30 minutes', 0.75, 0.70,
   '{"technical_identity":"hashed_opt_in_analytics_installation"}'::jsonb),
  ('backyrd.identity.multiple_registrations', '1.0.0', 2, null, 0.50, 0.65,
   '{"technical_identity":"hashed_opt_in_analytics_installation"}'::jsonb);

-- Deliberately small, conservative seed. The detector is data-driven; future
-- registry refreshes are ordinary versioned migrations, not function rewrites.
insert into public.account_trust_identity_disposable_email_domains (domain)
values
  ('10minutemail.com'),
  ('guerrillamail.com'),
  ('mailinator.com'),
  ('temp-mail.org'),
  ('tempmail.com');

create or replace function public.account_trust_evaluate_identity_user_v1(
  p_user_id uuid,
  p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user auth.users%rowtype;
  v_config public.account_trust_identity_detector_config%rowtype;
  v_milestone record;
  v_domain text;
  v_matched_domain text;
  v_emitted integer := 0;
  v_result jsonb;
begin
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'identity_evaluation_time_invalid' using errcode = '22023';
  end if;

  select * into v_user from auth.users u where u.id = p_user_id and u.deleted_at is null;
  if v_user.id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode = 'P0002';
  end if;

  select * into v_config
  from public.account_trust_identity_detector_config c
  where c.detector_key = 'backyrd.identity.email_verified' and c.enabled;
  if v_config.detector_key is not null and v_user.email_confirmed_at is not null then
    v_result := public.account_trust_emit_signal_v1(
      p_user_id, 'identity_email_verified', v_config.detector_key,
      v_config.detector_version, v_config.signal_strength, v_config.confidence,
      least(v_user.email_confirmed_at, p_as_of), null, 'email_verified:v1',
      jsonb_build_object('verification_method', 'canonical_email_confirmation'),
      '{"signal_interpretation":"supporting_evidence"}'::jsonb
    );
    if not coalesce((v_result ->> 'duplicate')::boolean, false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config
  from public.account_trust_identity_detector_config c
  where c.detector_key = 'backyrd.identity.account_age' and c.enabled;
  if v_config.detector_key is not null then
    for v_milestone in
      select m.milestone_days, m.signal_key
      from public.account_trust_identity_age_milestones m
      where m.enabled
        and p_as_of >= v_user.created_at + make_interval(days => m.milestone_days)
      order by m.milestone_days
    loop
      v_result := public.account_trust_emit_signal_v1(
        p_user_id, v_milestone.signal_key, v_config.detector_key,
        v_config.detector_version, v_config.signal_strength, v_config.confidence,
        v_user.created_at + make_interval(days => v_milestone.milestone_days),
        null, 'account_age:' || v_milestone.milestone_days::text,
        jsonb_build_object('milestone_days', v_milestone.milestone_days),
        '{"signal_interpretation":"supporting_evidence"}'::jsonb
      );
      if not coalesce((v_result ->> 'duplicate')::boolean, false) then v_emitted := v_emitted + 1; end if;
    end loop;
  end if;

  v_domain := lower(nullif(split_part(coalesce(v_user.email, ''), '@', 2), ''));
  select * into v_config
  from public.account_trust_identity_detector_config c
  where c.detector_key = 'backyrd.identity.disposable_email' and c.enabled;
  if v_config.detector_key is not null and v_domain is not null then
    select d.domain into v_matched_domain
    from public.account_trust_identity_disposable_email_domains d
    where d.enabled
      and (v_domain = d.domain or v_domain like '%.' || d.domain)
    order by length(d.domain) desc
    limit 1;

    if v_matched_domain is not null then
      v_result := public.account_trust_emit_signal_v1(
        p_user_id, 'identity_disposable_email', v_config.detector_key,
        v_config.detector_version, v_config.signal_strength, v_config.confidence,
        least(v_user.created_at, p_as_of), null,
        'disposable_domain:' || v_matched_domain,
        jsonb_build_object('matched_domain', v_matched_domain, 'match_type',
          case when v_domain = v_matched_domain then 'exact' else 'subdomain' end),
        '{"signal_interpretation":"indicator_not_proof"}'::jsonb
      );
      if not coalesce((v_result ->> 'duplicate')::boolean, false) then v_emitted := v_emitted + 1; end if;
    end if;
  end if;

  return jsonb_build_object('user_id', p_user_id, 'signals_emitted', v_emitted);
end;
$$;

create or replace function public.account_trust_evaluate_identity_due_v1(
  p_limit integer default 1000,
  p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user record;
  v_processed integer := 0;
  v_emitted integer := 0;
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'identity_evaluation_limit_invalid' using errcode = '22023';
  end if;
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'identity_evaluation_time_invalid' using errcode = '22023';
  end if;

  for v_user in
    select u.id
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.deleted_at is null
      and (
        (u.email_confirmed_at is not null and not exists (
          select 1 from public.account_trust_signals s
          where s.user_id = u.id and s.signal_key = 'identity_email_verified'
        ))
        or exists (
          select 1 from public.account_trust_identity_age_milestones m
          where m.enabled
            and p_as_of >= u.created_at + make_interval(days => m.milestone_days)
            and not exists (
              select 1 from public.account_trust_signals s
              where s.user_id = u.id and s.signal_key = m.signal_key
            )
        )
        or exists (
          select 1
          from public.account_trust_identity_disposable_email_domains d
          where d.enabled
            and (
              lower(split_part(coalesce(u.email, ''), '@', 2)) = d.domain
              or lower(split_part(coalesce(u.email, ''), '@', 2)) like '%.' || d.domain
            )
            and not exists (
              select 1 from public.account_trust_signals s
              where s.user_id = u.id and s.signal_key = 'identity_disposable_email'
            )
        )
      )
    order by u.created_at, u.id
    limit p_limit
  loop
    v_result := public.account_trust_evaluate_identity_user_v1(v_user.id, p_as_of);
    v_processed := v_processed + 1;
    v_emitted := v_emitted + coalesce((v_result ->> 'signals_emitted')::integer, 0);
  end loop;

  return jsonb_build_object('processed', v_processed, 'signals_emitted', v_emitted);
end;
$$;

create or replace function public.account_trust_evaluate_technical_identity_v1(
  p_technical_identity_hash text,
  p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_config public.account_trust_identity_detector_config%rowtype;
  v_account record;
  v_total integer;
  v_velocity_count integer;
  v_first_registration timestamptz;
  v_result jsonb;
  v_emitted integer := 0;
begin
  if p_technical_identity_hash is null or p_technical_identity_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'technical_identity_hash_invalid' using errcode = '22023';
  end if;
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'identity_evaluation_time_invalid' using errcode = '22023';
  end if;

  select count(distinct a.user_id) into v_total
  from public.account_trust_identity_installation_accounts a
  where a.technical_identity_hash = p_technical_identity_hash;

  select * into v_config
  from public.account_trust_identity_detector_config c
  where c.detector_key = 'backyrd.identity.multiple_registrations' and c.enabled;
  if v_config.detector_key is not null and v_total >= v_config.threshold_count then
    for v_account in
      select distinct a.user_id
      from public.account_trust_identity_installation_accounts a
      where a.technical_identity_hash = p_technical_identity_hash
    loop
      v_result := public.account_trust_emit_signal_v1(
        v_account.user_id, 'identity_multiple_registrations', v_config.detector_key,
        v_config.detector_version, v_config.signal_strength, v_config.confidence,
        p_as_of, null, 'technical_identity:' || p_technical_identity_hash,
        jsonb_build_object('account_count_at_detection', v_total,
          'threshold', v_config.threshold_count,
          'technical_identity_type', 'opt_in_analytics_installation'),
        '{"signal_interpretation":"indicator_not_proof","shared_infrastructure_excluded":true}'::jsonb
      );
      if not coalesce((v_result ->> 'duplicate')::boolean, false) then v_emitted := v_emitted + 1; end if;
    end loop;
  end if;

  select * into v_config
  from public.account_trust_identity_detector_config c
  where c.detector_key = 'backyrd.identity.signup_velocity' and c.enabled;
  if v_config.detector_key is not null then
    select min(u.created_at), count(distinct u.id)
      into v_first_registration, v_velocity_count
    from public.account_trust_identity_installation_accounts a
    join auth.users u on u.id = a.user_id and u.deleted_at is null
    where a.technical_identity_hash = p_technical_identity_hash
      and u.created_at >= p_as_of - v_config.observation_window
      and u.created_at <= p_as_of;

    if v_velocity_count >= v_config.threshold_count then
      for v_account in
        select distinct a.user_id
        from public.account_trust_identity_installation_accounts a
        join auth.users u on u.id = a.user_id and u.deleted_at is null
        where a.technical_identity_hash = p_technical_identity_hash
          and u.created_at >= p_as_of - v_config.observation_window
          and u.created_at <= p_as_of
      loop
        v_result := public.account_trust_emit_signal_v1(
          v_account.user_id, 'identity_signup_velocity', v_config.detector_key,
          v_config.detector_version, v_config.signal_strength, v_config.confidence,
          p_as_of, null,
          'technical_identity:' || p_technical_identity_hash || ':burst:' || extract(epoch from v_first_registration)::bigint::text,
          jsonb_build_object('account_count_at_detection', v_velocity_count,
            'threshold', v_config.threshold_count,
            'window_seconds', extract(epoch from v_config.observation_window)::integer,
            'technical_identity_type', 'opt_in_analytics_installation'),
          '{"signal_interpretation":"indicator_not_proof","shared_infrastructure_excluded":true}'::jsonb
        );
        if not coalesce((v_result ->> 'duplicate')::boolean, false) then v_emitted := v_emitted + 1; end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'associated_account_count', v_total,
    'velocity_account_count', coalesce(v_velocity_count, 0),
    'signals_emitted', v_emitted
  );
end;
$$;

create or replace function public.account_trust_record_technical_identity_v1(
  p_user_id uuid,
  p_installation_id uuid,
  p_observed_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_hash text;
begin
  if p_user_id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode = 'P0002';
  end if;
  if p_installation_id is null then
    raise exception 'installation_id_required' using errcode = '22023';
  end if;
  if p_observed_at is null or p_observed_at > now() + interval '5 minutes' then
    raise exception 'identity_observed_at_invalid' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_installation_id::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.account_trust_identity_installation_accounts (
    technical_identity_hash, user_id, source, first_observed_at, last_observed_at
  ) values (
    v_hash, p_user_id, 'optional_analytics_installation', p_observed_at, p_observed_at
  )
  on conflict (technical_identity_hash, user_id) do update set
    first_observed_at = least(
      public.account_trust_identity_installation_accounts.first_observed_at,
      excluded.first_observed_at
    ),
    last_observed_at = greatest(
      public.account_trust_identity_installation_accounts.last_observed_at,
      excluded.last_observed_at
    ),
    updated_at = now();

  return public.account_trust_evaluate_technical_identity_v1(v_hash, p_observed_at);
end;
$$;

-- Preserve the canonical Analytics contract and enrich it only when an
-- authenticated user has opted into the existing optional Analytics flow.
create or replace function public.analytics_register_installation_v1(
  p_installation_id uuid,
  p_platform text default null,
  p_app_version text default null,
  p_build_number text default null,
  p_device_model text default null,
  p_os_version text default null,
  p_locale text default null,
  p_country text default null,
  p_city text default null,
  p_properties jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  insert into public.analytics_installations(
    installation_id, user_id, platform, app_version, build_number,
    device_model, os_version, locale, country, city, properties
  ) values (
    p_installation_id, v_user_id, p_platform, p_app_version, p_build_number,
    p_device_model, p_os_version, p_locale, p_country, p_city,
    coalesce(p_properties, '{}'::jsonb)
  )
  on conflict (installation_id) do update
  set user_id = coalesce(v_user_id, analytics_installations.user_id),
      platform = coalesce(excluded.platform, analytics_installations.platform),
      app_version = coalesce(excluded.app_version, analytics_installations.app_version),
      build_number = coalesce(excluded.build_number, analytics_installations.build_number),
      device_model = coalesce(excluded.device_model, analytics_installations.device_model),
      os_version = coalesce(excluded.os_version, analytics_installations.os_version),
      locale = coalesce(excluded.locale, analytics_installations.locale),
      country = coalesce(excluded.country, analytics_installations.country),
      city = coalesce(excluded.city, analytics_installations.city),
      properties = analytics_installations.properties || excluded.properties,
      last_seen_at = now();

  if v_user_id is not null then
    perform public.account_trust_record_technical_identity_v1(
      v_user_id, p_installation_id, now()
    );
  end if;
end;
$$;

-- Keep one canonical auth.users lifecycle trigger. It creates/repairs the
-- profile on signup and evaluates Identity evidence on signup or first email
-- confirmation. Repeated updates are safe because every signal is idempotent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_avatar_url text;
  v_email text;
begin
  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), '');
  v_last_name := nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), '');
  v_avatar_url := nullif(trim(coalesce(new.raw_user_meta_data->>'avatar_url', '')), '');
  v_email := nullif(trim(coalesce(new.email, new.raw_user_meta_data->>'email', '')), '');
  v_display_name := nullif(trim(concat_ws(' ', v_first_name, v_last_name)), '');

  insert into public.profiles (
    id, first_name, last_name, display_name, avatar_url, contact_email, created_at, updated_at
  ) values (
    new.id, v_first_name, v_last_name, v_display_name, v_avatar_url, v_email, now(), now()
  )
  on conflict (id) do update set
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    contact_email = coalesce(public.profiles.contact_email, excluded.contact_email),
    updated_at = now();

  if tg_op = 'INSERT' then
    perform public.account_trust_evaluate_identity_user_v1(new.id, now());
  elsif new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public.account_trust_evaluate_identity_user_v1(new.id, now());
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email_confirmed_at on auth.users
for each row execute function public.handle_new_user();

-- Reuse already-collected, consented Analytics associations. Raw installation
-- identifiers are transformed immediately and never enter Trust tables.
insert into public.account_trust_identity_installation_accounts (
  technical_identity_hash, user_id, source, first_observed_at, last_observed_at
)
select
  encode(extensions.digest(convert_to(x.installation_id::text, 'UTF8'), 'sha256'), 'hex'),
  x.user_id,
  'optional_analytics_installation',
  min(x.observed_at),
  max(x.observed_at)
from (
  select i.installation_id, i.user_id, i.first_seen_at as observed_at
  from public.analytics_installations i
  where i.installation_id is not null and i.user_id is not null
  union all
  select s.installation_id, s.user_id, s.started_at
  from public.analytics_sessions s
  where s.installation_id is not null and s.user_id is not null
) x
join public.profiles p on p.id = x.user_id
group by x.installation_id, x.user_id
on conflict (technical_identity_hash, user_id) do update set
  first_observed_at = least(
    public.account_trust_identity_installation_accounts.first_observed_at,
    excluded.first_observed_at
  ),
  last_observed_at = greatest(
    public.account_trust_identity_installation_accounts.last_observed_at,
    excluded.last_observed_at
  ),
  updated_at = now();

do $identity_backfill$
declare
  v_hash record;
begin
  perform public.account_trust_evaluate_identity_due_v1(10000, now());
  for v_hash in
    select distinct technical_identity_hash
    from public.account_trust_identity_installation_accounts
  loop
    perform public.account_trust_evaluate_technical_identity_v1(
      v_hash.technical_identity_hash, now()
    );
  end loop;
end;
$identity_backfill$;

alter table public.account_trust_identity_detector_config enable row level security;
alter table public.account_trust_identity_age_milestones enable row level security;
alter table public.account_trust_identity_disposable_email_domains enable row level security;
alter table public.account_trust_identity_installation_accounts enable row level security;

revoke all on table public.account_trust_identity_detector_config from public, anon, authenticated;
revoke all on table public.account_trust_identity_age_milestones from public, anon, authenticated;
revoke all on table public.account_trust_identity_disposable_email_domains from public, anon, authenticated;
revoke all on table public.account_trust_identity_installation_accounts from public, anon, authenticated;

grant select, insert, update, delete on table public.account_trust_identity_detector_config to service_role;
grant select, insert, update, delete on table public.account_trust_identity_age_milestones to service_role;
grant select, insert, update, delete on table public.account_trust_identity_disposable_email_domains to service_role;
grant select, insert, update, delete on table public.account_trust_identity_installation_accounts to service_role;

revoke all on function public.account_trust_evaluate_identity_user_v1(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.account_trust_evaluate_identity_due_v1(integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.account_trust_evaluate_technical_identity_v1(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.account_trust_record_technical_identity_v1(uuid, uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.account_trust_evaluate_identity_user_v1(uuid, timestamptz)
  to service_role;
grant execute on function public.account_trust_evaluate_identity_due_v1(integer, timestamptz)
  to service_role;
grant execute on function public.account_trust_evaluate_technical_identity_v1(text, timestamptz)
  to service_role;
grant execute on function public.account_trust_record_technical_identity_v1(uuid, uuid, timestamptz)
  to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

comment on function public.account_trust_evaluate_identity_user_v1(uuid, timestamptz) is
  'Sprint 9.1 service-only detector for email verification, account-age milestones, and configured disposable domains.';
comment on function public.account_trust_record_technical_identity_v1(uuid, uuid, timestamptz) is
  'Records only a SHA-256 transformation of an existing opt-in Analytics installation UUID, then emits non-enforcing Identity Trust signals.';
