\set ON_ERROR_STOP on

-- V15_ASSERT:positive_atomic_publish
-- V15_ASSERT:reservation_user_review_path_bucket_mime_expiry_bound
-- V15_ASSERT:direct_review_photos_insert_denied
-- V15_ASSERT:foreign_user_denied
-- V15_ASSERT:foreign_review_denied
-- V15_ASSERT:foreign_path_denied
-- V15_ASSERT:foreign_bucket_denied
-- V15_ASSERT:mime_mismatch_denied
-- V15_ASSERT:missing_reservation_denied
-- V15_ASSERT:expired_reservation_denied
-- V15_ASSERT:consumed_reservation_denied
-- V15_ASSERT:bind_failure_no_review_or_smart_evidence
begin;

create function pg_temp.review_media_assert(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'Review media atomic v1 failed: %',p_message; end if;
end$$;

do $$
declare
  u1 uuid := '91000000-0000-4000-8000-000000000001';
  u2 uuid := '91000000-0000-4000-8000-000000000002';
  s1 uuid := '91000000-0000-4000-8000-000000000010';
  s2 uuid := '91000000-0000-4000-8000-000000000011';
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','review-media-1@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','review-media-2@test.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(u1),(u2) on conflict do nothing;
  insert into public.consent_purposes(
    key,title_de,description_de,category,legal_basis,requires_consent,
    is_required,default_enabled,sort_order,is_active
  ) values(
    'personalized_recommendations','Personalisierung','Review-Media-Test',
    'personalization','consent',true,false,false,1,true
  ) on conflict do nothing;
  insert into public.user_consents(user_id,purpose_key,status,granted_at,source)
  values(u1,'personalized_recommendations','granted',now(),'system_migration');
  update public.backyrd_memory_bridge_settings_v1 set enabled=true;
  insert into public.spots(id,name,lat,lng,status,city,data_origin) values
    (s1,'Review Media Atomic',47.0,7.0,'approved','Basel','LEGACY'),
    (s2,'Review Media Standard',47.1,7.1,'approved','Basel','LEGACY');
end$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select public.reserve_review_media_upload_v1(
  '91000000-0000-4000-8000-000000000020',
  '91000000-0000-4000-8000-000000000010',
  array['91000000-0000-4000-8000-000000000020/0.jpg'],
  array['image/jpeg'],array[12582912::bigint],true
);

select pg_temp.review_media_assert(
  not exists(select 1 from public.reviews where id='91000000-0000-4000-8000-000000000020'),
  'reservation published a Review before media binding'
);

select pg_temp.review_media_assert(
  not public.review_media_upload_is_reserved_v1(
    'spot-photos','91000000-0000-4000-8000-000000000020/0.jpg',
    '91000000-0000-4000-8000-000000000001','{"size":1024,"mimetype":"image/jpeg"}'::jsonb)
  and not public.review_media_upload_is_reserved_v1(
    'review-photos','91000000-0000-4000-8000-000000000099/0.jpg',
    '91000000-0000-4000-8000-000000000001','{"size":1024,"mimetype":"image/jpeg"}'::jsonb)
  and not public.review_media_upload_is_reserved_v1(
    'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
    '91000000-0000-4000-8000-000000000002','{"size":1024,"mimetype":"image/jpeg"}'::jsonb)
  and not public.review_media_upload_is_reserved_v1(
    'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
    '91000000-0000-4000-8000-000000000001','{"size":1024,"mimetype":"image/png"}'::jsonb)
  and not public.review_media_upload_is_reserved_v1(
    'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
    '91000000-0000-4000-8000-000000000001','{"size":12582913,"mimetype":"image/jpeg"}'::jsonb),
  'reservation accepted a foreign bucket, path, owner, MIME or oversized object'
);

do $$begin
  begin
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(
      'review-photos','91000000-0000-4000-8000-000000000099/0.jpg',
      '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb);
    raise exception 'wrong Review path passed Storage RLS';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(
      'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
      '91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb);
    raise exception 'foreign owner passed Storage RLS';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(
      'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
      '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
      '{"size":1024,"mimetype":"image/png"}'::jsonb);
    raise exception 'wrong MIME passed Storage RLS';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(
      'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
      '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
      '{"size":12582913,"mimetype":"image/jpeg"}'::jsonb);
    raise exception 'oversized object passed Storage RLS';
  exception when insufficient_privilege then null; end;
end$$;

do $$begin
  begin
    perform public.finalize_review_with_media_v1(
      '91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000010',
      'must roll back','cozy',null,
      array['91000000-0000-4000-8000-000000000020/0.jpg'],
      array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000020/0.jpg'],true
    );
    raise exception 'missing object accepted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.review_media_assert(
    not exists(select 1 from public.reviews where id='91000000-0000-4000-8000-000000000020'),
    'failed binding left a published Review'
  );
end$$;

reset role;
select pg_temp.review_media_assert(
  not exists(select 1 from public.backyrd_memory_bridge_outbox_v1
    where source_type='smart_review' and source_id='91000000-0000-4000-8000-000000000020'),
  'failed binding emitted Smart Review evidence'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
values(
  'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '{"size":1024,"mimetype":"image/jpeg"}'::jsonb
);

do $$begin
  begin
    perform public.finalize_review_with_media_v1(
      '91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000010',
      'must roll back','cozy',null,
      array['91000000-0000-4000-8000-000000000020/0.jpg'],
      array['https://attacker.invalid/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000020/0.jpg'],true);
    raise exception 'foreign media URL accepted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.review_media_assert(
    not exists(select 1 from public.reviews where id='91000000-0000-4000-8000-000000000020')
    and not exists(select 1 from public.review_photos where review_id='91000000-0000-4000-8000-000000000020'),
    'invalid media binding left publication state'
  );
end$$;

select public.finalize_review_with_media_v1(
  '91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000010',
  'atomic smart review','cozy',null,
  array['91000000-0000-4000-8000-000000000020/0.jpg'],
  array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000020/0.jpg'],true
);

select pg_temp.review_media_assert(
  (select count(*)=1 from public.reviews where id='91000000-0000-4000-8000-000000000020')
  and (select count(*)=1 from public.review_photos where review_id='91000000-0000-4000-8000-000000000020'),
  'successful finalization did not commit Review and photo together'
);

reset role;
select pg_temp.review_media_assert(
  (select finalized_at is not null from public.review_media_upload_reservations_v1
    where review_id='91000000-0000-4000-8000-000000000020'),
  'successful finalization did not consume its reservation'
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- Exact retry returns the same identity without duplicate rows/evidence.
select public.finalize_review_with_media_v1(
  '91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000010',
  'atomic smart review','cozy',null,
  array['91000000-0000-4000-8000-000000000020/0.jpg'],
  array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000020/0.jpg'],true
);
select pg_temp.review_media_assert(
  (select count(*)=1 from public.review_photos where review_id='91000000-0000-4000-8000-000000000020'),
  'identical retry duplicated media metadata'
);
select pg_temp.review_media_assert(
  not public.review_media_upload_is_reserved_v1(
    'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
    '91000000-0000-4000-8000-000000000001','{"size":1024,"mimetype":"image/jpeg"}'::jsonb),
  'consumed reservation still grants Storage INSERT authority'
);

-- Smart evidence is emitted exactly once, including after an exact retry.
reset role;
select pg_temp.review_media_assert(
  (select count(*)=1 from public.backyrd_memory_bridge_outbox_v1
    where source_type='smart_review' and source_id='91000000-0000-4000-8000-000000000020'),
  'identical retry duplicated or omitted Smart Review evidence'
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$begin
  begin
    insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(
      'review-photos','91000000-0000-4000-8000-000000000020/0.jpg',
      '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb);
    raise exception 'consumed reservation accepted a second upload';
  exception when insufficient_privilege then null; end;
end$$;

-- Standard Review publication uses the same atomic contract and a second Spot
-- so the canonical one-Review-per-user/Spot/day Product rule remains intact.
select public.reserve_review_media_upload_v1(
  '91000000-0000-4000-8000-000000000021',
  '91000000-0000-4000-8000-000000000011',
  array['91000000-0000-4000-8000-000000000021/0.png'],
  array['image/png'],array[12582912::bigint],false
);
insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(
  'review-photos','91000000-0000-4000-8000-000000000021/0.png',
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '{"size":2048,"mimetype":"image/png"}'::jsonb
);
select public.finalize_review_with_media_v1(
  '91000000-0000-4000-8000-000000000021','91000000-0000-4000-8000-000000000011',
  'atomic standard review',null,null,
  array['91000000-0000-4000-8000-000000000021/0.png'],
  array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000021/0.png'],false
);
select pg_temp.review_media_assert(
  exists(select 1 from public.reviews
    where id='91000000-0000-4000-8000-000000000021'
      and review_origin='STANDARD_REVIEW' and product_evidence_origin is null)
  and exists(select 1 from public.review_photos
    where review_id='91000000-0000-4000-8000-000000000021'),
  'standard Review did not publish atomically through the shared contract'
);

-- An expired reservation grants neither upload nor publication authority.
select public.reserve_review_media_upload_v1(
  '91000000-0000-4000-8000-000000000030',
  '91000000-0000-4000-8000-000000000010',
  array['91000000-0000-4000-8000-000000000030/0.jpg'],
  array['image/jpeg'],array[12582912::bigint],false
);
reset role;
update public.review_media_upload_reservations_v1
set expires_at=now()-interval '1 minute'
where review_id='91000000-0000-4000-8000-000000000030';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.review_media_assert(
  not public.review_media_upload_is_reserved_v1(
    'review-photos','91000000-0000-4000-8000-000000000030/0.jpg',
    '91000000-0000-4000-8000-000000000001','{"size":1024,"mimetype":"image/jpeg"}'::jsonb),
  'expired reservation still grants Storage INSERT authority'
);
do $$begin
  begin
    perform public.finalize_review_with_media_v1(
      '91000000-0000-4000-8000-000000000030','91000000-0000-4000-8000-000000000010',
      null,null,null,array['91000000-0000-4000-8000-000000000030/0.jpg'],
      array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000030/0.jpg'],false);
    raise exception 'expired reservation finalized';
  exception when insufficient_privilege then null; end;
  perform pg_temp.review_media_assert(
    not exists(select 1 from public.reviews where id='91000000-0000-4000-8000-000000000030'),
    'expired finalization left a published Review'
  );
end$$;

-- Direct metadata inserts remain unavailable to Product clients.
do $$begin
  begin
    insert into public.review_photos(review_id,url,uploaded_by) values(
      '91000000-0000-4000-8000-000000000020','https://example.invalid/forbidden',
      '91000000-0000-4000-8000-000000000001');
    raise exception 'direct review_photos insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.finalize_review_with_media_v1(
      '91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000010',
      'foreign retry',null,null,
      array['91000000-0000-4000-8000-000000000020/0.jpg'],
      array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000020/0.jpg'],true);
    raise exception 'foreign finalization accepted';
  exception when insufficient_privilege then null; end;
end$$;

-- Another user cannot reserve or finalize the first user's Review identity.
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$begin
  begin
    perform public.reserve_review_media_upload_v1(
      '91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000010',
      array['91000000-0000-4000-8000-000000000020/0.jpg'],
      array['image/jpeg'],array[12582912::bigint],true);
    raise exception 'foreign reservation accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.finalize_review_with_media_v1(
      '91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000010',
      'atomic smart review','cozy',null,
      array['91000000-0000-4000-8000-000000000020/0.jpg'],
      array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/91000000-0000-4000-8000-000000000020/0.jpg'],true);
    raise exception 'foreign user finalized another user Review';
  exception when insufficient_privilege then null; end;
end$$;

reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select pg_temp.review_media_assert(
  not has_function_privilege('anon','public.reserve_review_media_upload_v1(uuid,uuid,text[],text[],bigint[],boolean)','execute')
  and not has_function_privilege('anon','public.review_media_upload_is_reserved_v1(text,text,uuid,jsonb)','execute')
  and not has_function_privilege('anon','public.finalize_review_with_media_v1(uuid,uuid,text,text,text,text[],text[],boolean)','execute'),
  'anonymous role can invoke Review media publication functions'
);
set local role anon;
do $$begin
  begin
    insert into storage.objects(bucket_id,name,metadata) values(
      'review-photos','91000000-0000-4000-8000-000000000040/0.jpg',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb);
    raise exception 'anonymous Storage upload accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_review_media_upload_v1(
      '91000000-0000-4000-8000-000000000040','91000000-0000-4000-8000-000000000010',
      array['91000000-0000-4000-8000-000000000040/0.jpg'],
      array['image/jpeg'],array[12582912::bigint],false);
    raise exception 'anonymous reservation accepted';
  exception when insufficient_privilege then null; end;
end$$;
reset role;

rollback;
