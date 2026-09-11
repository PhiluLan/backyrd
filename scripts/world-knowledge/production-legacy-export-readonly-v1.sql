\set ON_ERROR_STOP on
begin transaction read only;
set local statement_timeout = '15s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '20s';

select jsonb_build_object(
  'queryVersion','backyrd.world-knowledge.production-legacy-export-query@4a.1',
  'sourceSnapshotAt',pg_catalog.transaction_timestamp(),
  'statusCounts',(select jsonb_object_agg(status,total) from (select status,count(*) total from public.spots group by status order by status) x),
  'records',coalesce((select jsonb_agg(record order by record->>'spotId') from (
    select jsonb_build_object(
      'spotId',s.id,
      'lifecycle',case s.status when 'approved' then 'ACTIVE_PUBLISHED' when 'pending' then 'DRAFT' when 'archived' then 'ARCHIVED' else 'UNCLEAR' end,
      'fields',jsonb_strip_nulls(jsonb_build_object(
        'name',s.name,'address',s.address,'city',s.city,'country',s.country,
        'lat',s.lat,'lng',s.lng,'category',c.name,
        'website',s.website,'phone',s.phone,'email',s.email,'price_level',s.price_level,
        'hours_regular',(select jsonb_agg(jsonb_build_object('day',h.day_of_week,'open',h.open_time,'close',h.close_time) order by h.day_of_week,h.idx,h.open_time) from public.spot_hours h where h.spot_id=s.id)
      ))
    ) record from public.spots s left join public.categories c on c.id=s.category_id
  ) rows),'[]'::jsonb),
  'excludedDataClasses',jsonb_build_array('AUTH_USERS','PRIVATE_OWNER_CONTACTS','ADMIN_NOTES','ACTOR_IDENTITIES','SUBSCRIPTION','PAYMENT','OWNER_TIER','BILLING','ADVERTISING','SPONSORING','PRIVATE_SOURCE_REFERENCES','RAW_AI_OUTPUTS','USER_INTELLIGENCE','ANALYTICS')
)::text;

commit;
