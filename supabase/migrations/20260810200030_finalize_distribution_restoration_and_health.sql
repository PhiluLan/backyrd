-- Sprint 10.5-10.6: close the Distribution restoration lifecycle and expose
-- operational health to the Founder Control Center.
--
-- This migration does not change Trust policy, moderation, enforcement or
-- consumer eligibility. It makes expiring overrides self-restoring even when
-- no unrelated event schedules another evaluation.

create or replace function public.distribution_trust_set_override_v1(
  p_content_item_id uuid,p_forced_state text,p_reason_code text,p_note text default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_admin uuid:=auth.uid();v_existing public.distribution_trust_overrides%rowtype;
  v_override_id uuid;v_expected text;v_engine text;v_result jsonb;
begin
  if v_admin is null or not public.safety_is_admin_v1(v_admin) then
    raise exception 'admin_access_required' using errcode='42501';
  end if;
  if p_forced_state not in ('normal','reduced','quarantined','excluded') then
    raise exception 'distribution_state_invalid' using errcode='22023';
  end if;
  if p_expires_at is not null and p_expires_at<=now() then
    raise exception 'distribution_override_expiry_invalid' using errcode='22023';
  end if;
  if p_note is not null and length(btrim(p_note)) not between 1 and 2000 then
    raise exception 'distribution_override_note_invalid' using errcode='22023';
  end if;
  select recommended_state into v_expected from public.distribution_trust_reason_registry
  where reason_code=p_reason_code and reason_kind='override' and enabled;
  if v_expected is null or v_expected<>p_forced_state then
    raise exception 'distribution_override_reason_invalid' using errcode='22023';
  end if;
  perform 1 from public.safety_content_items where id=p_content_item_id for update;
  if not found then raise exception 'distribution_content_item_not_found' using errcode='P0002'; end if;
  select * into v_existing from public.distribution_trust_overrides
  where content_item_id=p_content_item_id and status='active' for update;
  if v_existing.id is not null and v_existing.forced_state=p_forced_state
     and v_existing.reason_code=p_reason_code and v_existing.note is not distinct from nullif(btrim(p_note),'')
     and v_existing.expires_at is not distinct from p_expires_at then
    v_result:=public.distribution_trust_evaluate_content_v1(p_content_item_id,now(),'manual_override');
    if v_existing.expires_at is not null then
      perform public.distribution_trust_schedule_content_v1(
        p_content_item_id,'override_expiry',v_existing.expires_at
      );
    end if;
    return v_result||jsonb_build_object('override_id',v_existing.id,'duplicate',true);
  end if;
  select version into v_engine from public.distribution_trust_engine_versions where status='active';
  if v_existing.id is not null then
    update public.distribution_trust_overrides set status='superseded',released_by=v_admin,released_at=now(),
      release_reason='superseded_by_new_override',updated_at=now() where id=v_existing.id;
    insert into public.distribution_trust_events(
      content_item_id,event_type,source,reason_codes,engine_version,override_id,actor_user_id,idempotency_key
    ) values(p_content_item_id,'override_superseded','admin',array[p_reason_code],v_engine,
      v_existing.id,v_admin,'override_superseded:'||v_existing.id) on conflict do nothing;
  end if;
  insert into public.distribution_trust_overrides(
    content_item_id,forced_state,reason_code,note,expires_at,created_by
  ) values(p_content_item_id,p_forced_state,p_reason_code,nullif(btrim(p_note),''),p_expires_at,v_admin)
  returning id into v_override_id;
  insert into public.distribution_trust_events(
    content_item_id,event_type,source,new_state,reason_codes,engine_version,override_id,
    actor_user_id,idempotency_key,metadata
  ) values(p_content_item_id,'override_created','admin',p_forced_state,array[p_reason_code],v_engine,
    v_override_id,v_admin,'override_created:'||v_override_id,
    jsonb_build_object('expires_at',p_expires_at)) on conflict do nothing;
  v_result:=public.distribution_trust_evaluate_content_v1(p_content_item_id,now(),'manual_override');
  if p_expires_at is not null then
    perform public.distribution_trust_schedule_content_v1(
      p_content_item_id,'override_expiry',p_expires_at
    );
  end if;
  return v_result||jsonb_build_object('override_id',v_override_id,'duplicate',false);
end;
$$;

create or replace function public.distribution_trust_evaluate_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_queue record;v_processed integer:=0;v_changed integer:=0;v_result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>10000 then
    raise exception 'distribution_evaluation_limit_invalid' using errcode='22023';
  end if;
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'distribution_evaluation_time_invalid' using errcode='22023';
  end if;
  for v_queue in select content_item_id from public.distribution_trust_evaluation_queue
    where next_evaluation_at<=p_as_of order by next_evaluation_at,content_item_id
    limit p_limit for update skip locked
  loop
    begin
      v_result:=public.distribution_trust_evaluate_content_v1(v_queue.content_item_id,p_as_of,'automatic');
      delete from public.distribution_trust_evaluation_queue where content_item_id=v_queue.content_item_id;

      -- A queue row represents the next required evaluation. If an unrelated
      -- change was processed before a future override expiry, preserve that
      -- future wake-up instead of silently losing automatic restoration.
      insert into public.distribution_trust_evaluation_queue(
        content_item_id,next_evaluation_at,schedule_reason
      )
      select o.content_item_id,o.expires_at,'override_expiry'
      from public.distribution_trust_overrides o
      where o.content_item_id=v_queue.content_item_id
        and o.status='active'
        and o.expires_at is not null
        and o.expires_at>p_as_of
      on conflict(content_item_id) do update set
        next_evaluation_at=least(public.distribution_trust_evaluation_queue.next_evaluation_at,excluded.next_evaluation_at),
        schedule_reason=excluded.schedule_reason,
        attempt_count=0,
        last_error=null,
        updated_at=now();

      v_processed:=v_processed+1;
      if coalesce((v_result->>'changed')::boolean,false) then v_changed:=v_changed+1; end if;
    exception when others then
      update public.distribution_trust_evaluation_queue set attempt_count=attempt_count+1,
        last_error=left(sqlstate||':'||sqlerrm,500),next_evaluation_at=p_as_of+interval '15 minutes',updated_at=now()
      where content_item_id=v_queue.content_item_id;
    end;
  end loop;
  return jsonb_build_object('processed',v_processed,'changed',v_changed);
end;
$$;

create or replace function public.distribution_trust_require_admin_event_actor_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if new.source='admin' and new.actor_user_id is null then
    new.actor_user_id:=auth.uid();
    if new.actor_user_id is null then
      raise exception 'distribution_admin_event_actor_required' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_distribution_trust_admin_event_actor_v1
before insert on public.distribution_trust_events
for each row execute function public.distribution_trust_require_admin_event_actor_v1();

create or replace function public.distribution_trust_founder_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'states',jsonb_build_object(
      'normal',(select count(*) from public.distribution_trust_states where effective_state='normal'),
      'reduced',(select count(*) from public.distribution_trust_states where effective_state='reduced'),
      'quarantined',(select count(*) from public.distribution_trust_states where effective_state='quarantined'),
      'excluded',(select count(*) from public.distribution_trust_states where effective_state='excluded')
    ),
    'active_overrides',(select count(*) from public.distribution_trust_overrides where status='active'),
    'expired_active_overrides',(select count(*) from public.distribution_trust_overrides
      where status='active' and expires_at is not null and expires_at<=now()),
    'due_evaluations',(select count(*) from public.distribution_trust_evaluation_queue
      where next_evaluation_at<=now()),
    'overdue_evaluations',(select count(*) from public.distribution_trust_evaluation_queue
      where next_evaluation_at<=now()-interval '10 minutes'),
    'failed_evaluations',(select count(*) from public.distribution_trust_evaluation_queue
      where attempt_count>0 or last_error is not null),
    'admin_events_missing_actor',(select count(*) from public.distribution_trust_events
      where source='admin' and actor_user_id is null),
    'restorations_24h',(select count(*) from public.distribution_trust_events
      where event_type='automatically_restored' and created_at>=now()-interval '24 hours'),
    'engine_version',(select version from public.distribution_trust_engine_versions where status='active'),
    'calculated_at',now(),
    'interpretation','Distribution states are reversible visibility decisions, not moderation outcomes.'
  );
end;
$$;

create or replace function public.founder_distribution_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return public.distribution_trust_founder_health_v1();
end;
$$;

create or replace function public.founder_trust_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'open_cases',(select count(*) from public.safety_cases
      where case_status in ('queued','evaluating','needs_review','appealed','failed')),
    'needs_human_review',(select count(*) from public.safety_cases
      where case_status in ('needs_review','appealed')),
    'failed_cases',(select count(*) from public.safety_cases where case_status='failed'),
    'distribution',public.founder_distribution_health_v1(),
    'calculated_at',now(),
    'interpretation','Signals, cases and Distribution states are operational indicators, never proof.'
  );
end;
$$;

revoke all on function public.founder_distribution_health_v1() from public,anon,authenticated;
grant execute on function public.founder_distribution_health_v1() to authenticated,service_role;
revoke all on function public.distribution_trust_founder_health_v1() from public,anon,authenticated;
grant execute on function public.distribution_trust_founder_health_v1() to authenticated,service_role;
revoke all on function public.distribution_trust_require_admin_event_actor_v1() from public,anon,authenticated;

comment on function public.founder_distribution_health_v1() is
  'Founder wrapper for the canonical admin-only Distribution health contract.';
comment on function public.distribution_trust_founder_health_v1() is
  'Canonical admin-only Distribution health. Counts lifecycle state without exposing Trust evidence.';
