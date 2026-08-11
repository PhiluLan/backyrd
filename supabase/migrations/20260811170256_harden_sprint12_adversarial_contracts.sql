-- Sprint 12 adversarial hardening.
--
-- 1. Every Account Trust signal must carry a stable idempotency key. PostgreSQL
--    unique constraints treat NULL values as distinct, so the former optional
--    key allowed replayed service calls to create duplicate evidence.
-- 2. A Trust Admin must not bypass S3/S4 oversight by downgrading an incident
--    before resolution. Major severity downgrades require Founder authority.

do $$
begin
  if exists (
    select 1 from public.account_trust_signals
    where nullif(btrim(deduplication_key),'') is null
  ) then
    raise exception 'account_trust_signal_idempotency_backfill_required'
      using errcode='23514',
        hint='Assign stable detector idempotency keys to existing signals before applying this migration.';
  end if;
end;
$$;

alter table public.account_trust_signals
  alter column deduplication_key set not null;

alter table public.account_trust_signals
  add constraint account_trust_signals_idempotency_key_required
  check (length(btrim(deduplication_key))>0) not valid;

alter table public.account_trust_signals
  validate constraint account_trust_signals_idempotency_key_required;

alter function public.account_trust_emit_signal_v1(
  uuid,text,text,text,numeric,numeric,timestamptz,timestamptz,text,jsonb,jsonb
) rename to account_trust_emit_signal_unvalidated_v1;

create or replace function public.account_trust_emit_signal_v1(
  p_user_id uuid,
  p_signal_key text,
  p_detector_key text,
  p_detector_version text,
  p_strength numeric default 1,
  p_confidence numeric default 1,
  p_observed_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_deduplication_key text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if nullif(btrim(coalesce(p_deduplication_key,'')),'') is null then
    raise exception 'account_trust_idempotency_key_required' using errcode='22023';
  end if;
  return public.account_trust_emit_signal_unvalidated_v1(
    p_user_id,p_signal_key,p_detector_key,p_detector_version,p_strength,p_confidence,
    p_observed_at,p_expires_at,btrim(p_deduplication_key),p_evidence,p_metadata
  );
end;
$$;

revoke all on function public.account_trust_emit_signal_unvalidated_v1(
  uuid,text,text,text,numeric,numeric,timestamptz,timestamptz,text,jsonb,jsonb
) from public,anon,authenticated,service_role;
revoke all on function public.account_trust_emit_signal_v1(
  uuid,text,text,text,numeric,numeric,timestamptz,timestamptz,text,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.account_trust_emit_signal_v1(
  uuid,text,text,text,numeric,numeric,timestamptz,timestamptz,text,jsonb,jsonb
) to service_role;

comment on function public.account_trust_emit_signal_v1(
  uuid,text,text,text,numeric,numeric,timestamptz,timestamptz,text,jsonb,jsonb
) is 'Canonical service-only Account Trust signal ingress. A non-empty detector idempotency key is mandatory.';

alter function public.governance_change_severity_v1(uuid,text,text)
  rename to governance_change_severity_uncontrolled_v1;

create or replace function public.governance_change_severity_v1(
  p_incident_id uuid,p_new_severity text,p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_actor uuid:=auth.uid();v_old_severity text;v_old_rank integer;v_new_rank integer;
begin
  select i.severity_key into v_old_severity
  from public.governance_incidents i where i.id=p_incident_id for update;
  if v_old_severity is null then
    raise exception 'governance_incident_not_found' using errcode='P0002';
  end if;
  select severity_rank into v_old_rank
  from public.governance_severity_registry where severity_key=v_old_severity;
  select severity_rank into v_new_rank
  from public.governance_severity_registry where severity_key=p_new_severity and enabled;
  if v_new_rank is null then
    raise exception 'governance_severity_invalid' using errcode='22023';
  end if;
  if v_old_rank>=3 and v_new_rank<v_old_rank
     and not public.governance_has_authority_v1('founder',v_actor) then
    raise exception 'governance_major_downgrade_founder_required' using errcode='42501';
  end if;
  return public.governance_change_severity_uncontrolled_v1(
    p_incident_id,p_new_severity,p_reason
  );
end;
$$;

revoke all on function public.governance_change_severity_uncontrolled_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.governance_change_severity_v1(uuid,text,text)
  from public,anon;
grant execute on function public.governance_change_severity_v1(uuid,text,text)
  to authenticated,service_role;

comment on function public.governance_change_severity_v1(uuid,text,text) is
  'Canonical Governance severity transition. Downgrading an S3/S4 incident requires Founder authority and remains audited.';
