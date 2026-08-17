\set ON_ERROR_STOP on

begin;

create function pg_temp.wave3a_uuid(p_label text) returns uuid
language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||
    substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||
    substr(md5(p_label),21,12))::uuid;
$$;

create function pg_temp.wave3a_assert(p_ok boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Wave 3A Taste acceptance failed: %', p_message;
  end if;
end;
$$;

create function pg_temp.wave3a_actor(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',p_user,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

insert into public.consent_purposes(
  key,title_de,description_de,category,legal_basis,requires_consent,
  is_required,default_enabled,sort_order,is_active
) values (
  'personalized_recommendations','Personalisierte Empfehlungen',
  'Synthetische Wave-3A-Fixture.','personalization','consent',true,false,false,10,true
) on conflict (key) do nothing;

do $$
declare
  v_user uuid := pg_temp.wave3a_uuid('consented-user');
  v_other uuid := pg_temp.wave3a_uuid('other-user');
  v_no_consent uuid := pg_temp.wave3a_uuid('no-consent-user');
begin
  insert into auth.users(
    instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,
    raw_user_meta_data,created_at,updated_at
  ) values
    ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','wave3a@fixture.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_other,'authenticated','authenticated','wave3a-other@fixture.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_no_consent,'authenticated','authenticated','wave3a-none@fixture.invalid','','{}','{}',now(),now());

  insert into public.user_consents(user_id,purpose_key,status,granted_at,source)
  values
    (v_user,'personalized_recommendations','granted',now(),'system_migration'),
    (v_other,'personalized_recommendations','granted',now(),'system_migration')
  on conflict (user_id,purpose_key) do update set
    status='granted', granted_at=excluded.granted_at, withdrawn_at=null, source='system_migration';

  perform pg_temp.wave3a_assert(
    (select count(*) >= 45 from public.backyrd_taste_concepts_v1),
    'controlled Taste Space registry is populated'
  );

  insert into public.backyrd_taste_evidence_v1(
    user_id,source_event_id,source_event_type,source_family,concept_key,
    scope_kind,scope_key,direction,strength,decay_class,occurred_at
  ) values
    (v_user,'save-1','saved','commitment','vibe.cozy','GLOBAL','global',1,0.38,'stable',now()-interval '1 day'),
    (v_user,'save-1','saved','commitment','vibe.cozy','PLACE_TYPE','cafe',1,0.38,'stable',now()-interval '1 day'),
    (v_other,'like-1','liked','explicit','energy.energetic','GLOBAL','global',1,0.22,'behavioral',now()-interval '2 days');

  insert into public.backyrd_user_taste_map_v1(
    user_id,concept_key,concept_family,scope_kind,scope_key,affinity,confidence,
    positive_evidence,positive_event_count,distinct_spot_count,distinct_session_count,
    source_families,first_evidence_at,last_evidence_at,decay_state,calculated_at,
    evidence_fingerprint
  ) values
    (v_user,'vibe.cozy','vibe','GLOBAL','global',0.33,0.18,0.38,1,1,1,
      array['commitment'],now()-interval '1 day',now()-interval '1 day','CURRENT',now(),repeat('a',64)),
    (v_other,'energy.energetic','energy','GLOBAL','global',0.22,0.12,0.22,1,1,1,
      array['explicit'],now()-interval '2 days',now()-interval '2 days','CURRENT',now(),repeat('b',64));

  begin
    insert into public.backyrd_taste_evidence_v1(
      user_id,source_event_id,source_event_type,source_family,concept_key,
      scope_kind,scope_key,direction,strength,decay_class,occurred_at
    ) values (
      v_no_consent,'forbidden','liked','explicit','vibe.cozy',
      'GLOBAL','global',1,0.22,'behavioral',now()
    );
    raise exception 'missing-consent evidence was unexpectedly accepted';
  exception when insufficient_privilege then
    perform pg_temp.wave3a_assert(sqlerrm = 'personalization_consent_required', 'missing consent fails for the expected reason');
  end;

  insert into public.backyrd_taste_evidence_v1(
    user_id,source_event_id,source_event_type,source_family,concept_key,
    scope_kind,scope_key,direction,strength,decay_class,occurred_at
  ) values (
    v_user,'save-1','saved','commitment','vibe.cozy',
    'GLOBAL','global',1,0.38,'stable',now()-interval '1 day'
  ) on conflict on constraint backyrd_taste_evidence_v1_idempotency do nothing;

  perform pg_temp.wave3a_assert(
    (select count(*) = 2 from public.backyrd_taste_evidence_v1 where user_id=v_user),
    'repeated evidence processing is idempotent'
  );
end;
$$;

set local role authenticated;
select pg_temp.wave3a_actor(pg_temp.wave3a_uuid('consented-user'));

do $$
declare v_user uuid := pg_temp.wave3a_uuid('consented-user');
begin
  perform pg_temp.wave3a_assert(
    (select count(*) = 1 from public.backyrd_get_my_taste_map_v1('GLOBAL','global',20)),
    'consented user can read only own projected Taste rows through the bounded RPC'
  );
  perform pg_temp.wave3a_assert(
    (select count(*) = 1 from public.backyrd_user_taste_map_v1),
    'RLS hides another user Taste Map'
  );
  begin
    perform count(*) from public.backyrd_taste_evidence_v1;
    raise exception 'authenticated user unexpectedly read raw Taste evidence';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.backyrd_user_taste_map_v1(
      user_id,concept_key,concept_family,scope_kind,scope_key,affinity,confidence,
      decay_state,calculated_at,evidence_fingerprint
    ) values (v_user,'vibe.lively','vibe','GLOBAL','global',1,1,'CURRENT',now(),repeat('c',64));
    raise exception 'authenticated user unexpectedly manipulated Taste state';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

update public.user_consents
set status='withdrawn', granted_at=null, withdrawn_at=now()
where user_id=pg_temp.wave3a_uuid('consented-user')
  and purpose_key='personalized_recommendations';

set local role authenticated;
select pg_temp.wave3a_actor(pg_temp.wave3a_uuid('consented-user'));

do $$
begin
  perform pg_temp.wave3a_assert(
    (select count(*) = 0 from public.backyrd_get_my_taste_map_v1(null,null,20)),
    'withdrawn personalization consent fails safe and hides Taste state'
  );
end;
$$;

reset role;

do $$
begin
  perform pg_temp.wave3a_assert(
    not has_table_privilege('anon','public.backyrd_taste_evidence_v1','select')
      and not has_table_privilege('authenticated','public.backyrd_taste_evidence_v1','select'),
    'raw evidence has no Product-role read grant'
  );
  perform pg_temp.wave3a_assert(
    not has_table_privilege('authenticated','public.backyrd_user_taste_map_v1','insert')
      and not has_table_privilege('authenticated','public.backyrd_user_taste_map_v1','update')
      and not has_table_privilege('authenticated','public.backyrd_user_taste_map_v1','delete'),
    'normal users cannot manipulate derived Taste state'
  );
  perform pg_temp.wave3a_assert(
    (select relrowsecurity from pg_class where oid='public.backyrd_taste_evidence_v1'::regclass)
      and (select relrowsecurity from pg_class where oid='public.backyrd_user_taste_map_v1'::regclass),
    'Taste storage RLS is enabled'
  );
end;
$$;

rollback;
