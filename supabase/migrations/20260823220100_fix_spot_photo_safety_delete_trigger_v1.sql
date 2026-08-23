-- The shared Safety registry trigger historically cast every OLD.id to uuid
-- while planning its DELETE CASE. spot_photos.id is bigint, so a legitimate
-- photo deletion failed before the registry could be marked removed. Keep the
-- existing Safety semantics but give bigint-backed spot photos a typed trigger.

create or replace function public.safety_sync_spot_photo_to_registry_v2()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_entity_id uuid;
  v_images text[]:='{}'::text[];
begin
  v_entity_id:=public.safety_stable_entity_uuid_v1(
    'spot_photo',case when tg_op='DELETE' then old.id::text else new.id::text end
  );
  if tg_op='DELETE' then
    update public.safety_content_items
    set lifecycle_status='removed'
    where entity_type='spot_photo' and entity_id=v_entity_id;
    return old;
  end if;
  if nullif(trim(coalesce(new.url,'')),'') is not null then v_images:=array[new.url]; end if;
  perform public.safety_upsert_registry_item_v2(
    'spot','spot_photo',v_entity_id,new.uploaded_by,new.spot_id,null,v_images,'de-CH',
    jsonb_build_object(
      'registry_version','v2','source_table','spot_photos',
      'source_operation',tg_op,'synced_at',now()
    ),
    'live'
  );
  return new;
end $$;

revoke all on function public.safety_sync_spot_photo_to_registry_v2() from public,anon,authenticated;
grant execute on function public.safety_sync_spot_photo_to_registry_v2() to service_role;

drop trigger if exists trg_safety_registry_spot_photos_v2 on public.spot_photos;
create trigger trg_safety_registry_spot_photos_v2
after insert or update or delete on public.spot_photos
for each row execute function public.safety_sync_spot_photo_to_registry_v2();

comment on function public.safety_sync_spot_photo_to_registry_v2() is
  'Typed Safety registry synchronization for bigint-backed spot_photos, including durable removed lifecycle on deletion.';
