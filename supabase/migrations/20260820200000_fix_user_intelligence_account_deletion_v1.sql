-- Account deletion is authoritative. The latest-snapshot pointer is derived
-- state and must never prevent the owning auth user (and their snapshots) from
-- being deleted. RESTRICT created a circular delete dependency through
-- auth.users -> snapshots and auth.users -> latest -> snapshots.
alter table public.backyrd_user_intelligence_latest_v1
  drop constraint if exists backyrd_user_intelligence_latest_v1_snapshot_id_fkey;

alter table public.backyrd_user_intelligence_latest_v1
  add constraint backyrd_user_intelligence_latest_v1_snapshot_id_fkey
  foreign key (snapshot_id)
  references public.backyrd_user_intelligence_snapshots_v2(snapshot_id)
  on delete cascade;
