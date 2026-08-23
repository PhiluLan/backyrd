-- Founder/Admin delete persistence repair.
--
-- Spots are archived rather than physically deleted: reviews, Decision history,
-- Gold/N4 evidence and moderation records remain attributable while every
-- active Product read continues to require status='approved'. Photo deletion
-- uses a service-only two-phase journal so Storage and Postgres can recover
-- safely across response loss.

alter type public.spot_status add value if not exists 'archived';

create table if not exists public.backyrd_admin_spot_photo_deletions_v1 (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  photo_id bigint not null,
  spot_id uuid not null references public.spots(id) on delete cascade,
  actor_id uuid not null,
  source_url text not null,
  storage_path text,
  header_was_reference boolean not null default false,
  state text not null default 'PENDING'
    check (state in ('PENDING','COMPLETED','FAILED')),
  storage_disposition text
    check (storage_disposition is null or storage_disposition in ('DELETED','MISSING','FAILED')),
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists backyrd_admin_spot_photo_deletions_pending_v1
  on public.backyrd_admin_spot_photo_deletions_v1(photo_id)
  where state='PENDING';

alter table public.backyrd_admin_spot_photo_deletions_v1 enable row level security;
revoke all on table public.backyrd_admin_spot_photo_deletions_v1 from public,anon,authenticated;
grant all on table public.backyrd_admin_spot_photo_deletions_v1 to service_role;

create or replace function public.backyrd_admin_photo_delete_actor_v1(p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_actor_id is null or not (
    exists(select 1 from public.admin_users a where a.user_id=p_actor_id)
    or exists(select 1 from public.profiles p where p.id=p_actor_id and coalesce(p.is_admin,false))
  ) then
    raise exception 'admin_or_founder_required' using errcode='42501';
  end if;
end $$;

create or replace function public.backyrd_admin_prepare_spot_photo_delete_v1(
  p_photo_id bigint,
  p_spot_id uuid,
  p_actor_id uuid,
  p_request_id uuid,
  p_storage_path text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_photo public.spot_photos%rowtype;
  v_spot public.spots%rowtype;
  v_job public.backyrd_admin_spot_photo_deletions_v1%rowtype;
begin
  perform public.backyrd_admin_photo_delete_actor_v1(p_actor_id);
  if p_photo_id is null or p_spot_id is null or p_request_id is null then
    raise exception 'photo_delete_identity_required' using errcode='22023';
  end if;
  if p_storage_path is null or btrim(p_storage_path)='' or length(p_storage_path)>1024
     or p_storage_path like '/%' or p_storage_path like '%..%'
     or p_storage_path like E'%\\%' then
    raise exception 'photo_storage_path_invalid' using errcode='22023';
  end if;

  select * into v_job
  from public.backyrd_admin_spot_photo_deletions_v1
  where request_id=p_request_id;
  if found then
    if v_job.photo_id<>p_photo_id or v_job.spot_id<>p_spot_id or v_job.actor_id<>p_actor_id then
      raise exception 'photo_delete_request_identity_mismatch' using errcode='23514';
    end if;
    return jsonb_build_object(
      'deletionId',v_job.id,'photoId',v_job.photo_id,'spotId',v_job.spot_id,
      'url',v_job.source_url,'storagePath',v_job.storage_path,
      'state',v_job.state,'replayed',true
    );
  end if;

  select * into v_spot from public.spots where id=p_spot_id for update;
  if not found then raise exception 'spot_not_found' using errcode='22023'; end if;
  select * into v_photo from public.spot_photos
  where id=p_photo_id and spot_id=p_spot_id for update;
  if not found then
    select * into v_job
    from public.backyrd_admin_spot_photo_deletions_v1
    where photo_id=p_photo_id and spot_id=p_spot_id and state='COMPLETED'
    order by completed_at desc limit 1;
    if found then
      return jsonb_build_object(
        'deletionId',v_job.id,'photoId',v_job.photo_id,'spotId',v_job.spot_id,
        'url',v_job.source_url,'storagePath',v_job.storage_path,
        'state',v_job.state,'replayed',true
      );
    end if;
    raise exception 'photo_not_found' using errcode='22023';
  end if;
  if exists(
    select 1 from public.spot_photos p
    where p.url=v_photo.url and p.id<>v_photo.id
  ) then
    raise exception 'photo_storage_object_has_multiple_references' using errcode='23514';
  end if;

  insert into public.backyrd_admin_spot_photo_deletions_v1(
    request_id,photo_id,spot_id,actor_id,source_url,storage_path,header_was_reference
  ) values(
    p_request_id,p_photo_id,p_spot_id,p_actor_id,v_photo.url,p_storage_path,
    v_spot.header_photo_path=v_photo.url
  ) returning * into v_job;

  return jsonb_build_object(
    'deletionId',v_job.id,'photoId',v_job.photo_id,'spotId',v_job.spot_id,
    'url',v_job.source_url,'storagePath',v_job.storage_path,
    'state',v_job.state,'headerWasReference',v_job.header_was_reference,
    'replayed',false
  );
end $$;

create or replace function public.backyrd_admin_finalize_spot_photo_delete_v1(
  p_deletion_id uuid,
  p_actor_id uuid,
  p_storage_disposition text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_job public.backyrd_admin_spot_photo_deletions_v1%rowtype;
  v_deleted integer:=0;
  v_header_cleared boolean:=false;
begin
  perform public.backyrd_admin_photo_delete_actor_v1(p_actor_id);
  if p_storage_disposition not in ('DELETED','MISSING') then
    raise exception 'photo_storage_disposition_invalid' using errcode='22023';
  end if;
  select * into v_job from public.backyrd_admin_spot_photo_deletions_v1
  where id=p_deletion_id for update;
  if not found then raise exception 'photo_delete_job_not_found' using errcode='22023'; end if;
  if v_job.actor_id<>p_actor_id then
    raise exception 'photo_delete_actor_mismatch' using errcode='42501';
  end if;
  if v_job.state='COMPLETED' then
    return jsonb_build_object(
      'deletedPhotoId',v_job.photo_id,'spotId',v_job.spot_id,
      'dbDeleted',true,'storageDisposition',v_job.storage_disposition,
      'headerCleared',v_job.header_was_reference,'replayed',true
    );
  end if;

  delete from public.spot_photos
  where id=v_job.photo_id and spot_id=v_job.spot_id and url=v_job.source_url;
  get diagnostics v_deleted=row_count;
  if v_deleted=0 and exists(select 1 from public.spot_photos where id=v_job.photo_id) then
    raise exception 'photo_delete_identity_changed' using errcode='23514';
  end if;

  if v_job.header_was_reference then
    update public.spots set header_photo_path=null
    where id=v_job.spot_id and header_photo_path=v_job.source_url;
    get diagnostics v_deleted=row_count;
    v_header_cleared:=v_deleted=1;
  end if;

  update public.backyrd_admin_spot_photo_deletions_v1
  set state='COMPLETED',storage_disposition=p_storage_disposition,
      failure_code=null,completed_at=now()
  where id=v_job.id;

  return jsonb_build_object(
    'deletedPhotoId',v_job.photo_id,'spotId',v_job.spot_id,
    'dbDeleted',true,'storageDisposition',p_storage_disposition,
    'headerCleared',v_header_cleared,'replayed',false
  );
end $$;

create or replace function public.backyrd_admin_fail_spot_photo_delete_v1(
  p_deletion_id uuid,
  p_actor_id uuid,
  p_failure_code text
) returns void
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  perform public.backyrd_admin_photo_delete_actor_v1(p_actor_id);
  update public.backyrd_admin_spot_photo_deletions_v1
  set state='FAILED',storage_disposition='FAILED',
      failure_code=left(coalesce(p_failure_code,'storage_delete_failed'),120),completed_at=now()
  where id=p_deletion_id and actor_id=p_actor_id and state='PENDING';
  if not found then raise exception 'photo_delete_job_not_pending' using errcode='22023'; end if;
end $$;

create or replace function public.backyrd_admin_archive_spot_v1(
  p_spot_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_actor jsonb;
  v_spot public.spots%rowtype;
  v_already boolean;
  v_previous_status text;
begin
  if p_request_id is null then raise exception 'spot_archive_request_id_required' using errcode='22023'; end if;
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then
    raise exception 'admin_or_founder_required' using errcode='42501';
  end if;
  select * into v_spot from public.spots where id=p_spot_id for update;
  if not found then raise exception 'spot_not_found' using errcode='22023'; end if;
  v_previous_status:=v_spot.status::text;
  v_already:=v_spot.status::text='archived';
  if not v_already then
    update public.spots set status='archived'::public.spot_status
    where id=p_spot_id returning * into v_spot;
    if not found then raise exception 'spot_archive_zero_rows' using errcode='P0001'; end if;
    insert into public.backyrd_spot_gold_authoring_audit_v1(
      spot_id,actor_id,action,subject_type,subject_id,metadata
    ) values(
      p_spot_id,(v_actor->>'actorId')::uuid,'ARCHIVE_SPOT','SPOT',p_spot_id,
      jsonb_build_object('requestId',p_request_id,'previousStatus',v_previous_status,'retention','DEPENDENCIES_RETAINED')
    );
  end if;
  return jsonb_build_object(
    'spotId',p_spot_id,'status','archived','archived',true,'replayed',v_already,
    'retained',jsonb_build_object(
      'reviews',(select count(*) from public.reviews where spot_id=p_spot_id),
      'photos',(select count(*) from public.spot_photos where spot_id=p_spot_id),
      'acceptedFacts',(select count(*) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id),
      'decisionImpressions',(select count(*) from public.decision_impressions where spot_id=p_spot_id)
    )
  );
end $$;

revoke all on function public.backyrd_admin_photo_delete_actor_v1(uuid) from public,anon,authenticated;
revoke all on function public.backyrd_admin_prepare_spot_photo_delete_v1(bigint,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.backyrd_admin_finalize_spot_photo_delete_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.backyrd_admin_fail_spot_photo_delete_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.backyrd_admin_photo_delete_actor_v1(uuid) to service_role;
grant execute on function public.backyrd_admin_prepare_spot_photo_delete_v1(bigint,uuid,uuid,uuid,text) to service_role;
grant execute on function public.backyrd_admin_finalize_spot_photo_delete_v1(uuid,uuid,text) to service_role;
grant execute on function public.backyrd_admin_fail_spot_photo_delete_v1(uuid,uuid,text) to service_role;

revoke all on function public.backyrd_admin_archive_spot_v1(uuid,uuid) from public,anon;
grant execute on function public.backyrd_admin_archive_spot_v1(uuid,uuid) to authenticated,service_role;

comment on function public.backyrd_admin_archive_spot_v1(uuid,uuid) is
  'Founder/Admin archival boundary. Product history and canonical intelligence remain attributable; active reads exclude archived status.';
comment on table public.backyrd_admin_spot_photo_deletions_v1 is
  'Service-only two-phase journal for authorized spot photo DB/Storage deletion and response-loss recovery.';
