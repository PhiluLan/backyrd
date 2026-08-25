-- Add confirmed DISPLAY_ONLY gastronomy/purpose truth to the human summary.
-- It remains absent from Decision matching and reason authorization.
create or replace function public.backyrd_human_spot_summary_v2(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_spot public.spots%rowtype;v_archetype text;v_identity text;v_use text;v_signature text;v_fit text;v_feel text;v_text text;v_lineage jsonb;
begin
  select * into v_spot from public.spots where id=p_spot_id;
  if not found then raise exception 'spot_not_found' using errcode='22023'; end if;
  v_archetype:=public.backyrd_human_spot_derived_archetype_v2(p_spot_id);
  select label_de||' in '||coalesce(v_spot.city,'Basel') into v_identity from public.backyrd_human_spot_archetypes_v2 where archetype_id=v_archetype;
  select string_agg(case x.value when 'MUSEUM' then 'Ausstellungen' when 'CULTURE' then 'Kultur' when 'HISTORY' then 'Geschichte' when 'ANIMALS' then 'Tiere' when 'WALK' then 'Spazieren' when 'PLAYGROUND' then 'Spielplatz' when 'SPORTS' then 'Sport' when 'CLIMBING' then 'Klettern' when 'BOULDERING' then 'Bouldern' when 'WORKSHOP' then 'Workshops' when 'LIVE_MUSIC' then 'Live-Musik' when 'CONCERT' then 'Konzerte' else null end,', ' order by x.value)
    into v_use from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_array_elements_text(f.value) as x(value)
    where f.spot_id=p_spot_id and f.field_key='activity.types' and f.status='ACTIVE' and f.evidence_scope='SPOT';
  select string_agg(case x.value when 'PURPOSE_DRINK' then 'etwas trinken' when 'OFFERING_BEER' then 'Bier' when 'OFFERING_CRAFT_BEER' then 'Craft Beer' when 'OFFERING_OWN_BEER' then 'vor Ort gebrautes Bier' when 'OFFERING_WINE' then 'Wein' when 'OFFERING_COCKTAILS' then 'Cocktails' when 'OFFERING_COFFEE' then 'Kaffee' when 'PURPOSE_EAT' then 'etwas essen' when 'OFFERING_SNACKS' then 'Snacks oder kleine Gerichte' when 'OFFERING_FULL_MEALS' then 'vollständige Mahlzeiten' when 'OFFERING_BREAKFAST' then 'Frühstück' when 'OFFERING_BRUNCH' then 'Brunch' when 'PURPOSE_APERO' then 'Apéro' when 'PURPOSE_AFTERWORK' then 'Afterwork' when 'PURPOSE_MEET_FRIENDS' then 'Freunde treffen' when 'PURPOSE_SIT_TOGETHER' then 'Zusammensitzen' when 'PURPOSE_DATE' then 'Dates' when 'PURPOSE_GROUP' then 'Gruppenabende' when 'PURPOSE_LONG_STAY' then 'länger verweilen' else null end,', ' order by x.value)
    into v_signature from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_array_elements_text(f.value) as x(value)
    where f.spot_id=p_spot_id and f.field_key='signature.characteristics' and f.status='ACTIVE' and f.evidence_scope='SPOT';
  select string_agg(label,', ' order by ord) into v_fit from (select case e.key when 'solo' then 'alleine' when 'date' then 'Dates' when 'friends' then 'Freunde' when 'family' then 'Familien' when 'groups' then 'Gruppen' when 'work' then 'Kolleg:innen' end label,row_number() over() ord from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_each_text(f.value) e where f.spot_id=p_spot_id and f.field_key='social.suitability' and f.status='ACTIVE' and f.evidence_scope='SPOT' and e.value='SUITABLE') s where label is not null;
  select string_agg(case x.value when 'COZY' then 'gemütlich' when 'RELAXED' then 'entspannt' when 'ROMANTIC' then 'romantisch' when 'LIVELY' then 'lebendig' when 'QUIET' then 'ruhig' when 'SOCIAL' then 'gesellig' when 'INSPIRING' then 'inspirierend' when 'PLAYFUL' then 'verspielt' when 'ELEGANT' then 'elegant' when 'DESIGN_LED' then 'designgeprägt' when 'AUTHENTIC' then 'authentisch' when 'HIDDEN_GEM' then 'besonders' else null end,', ' order by x.value)
    into v_feel from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_array_elements_text(f.value) as x(value) where f.spot_id=p_spot_id and f.field_key='atmosphere.descriptors' and f.status='ACTIVE' and f.evidence_scope='SPOT';
  v_text:=coalesce(v_identity,'Ort in '||coalesce(v_spot.city,'Basel'))||'.';
  if nullif(v_use,'') is not null then v_text:=v_text||' Hier geht es vor allem um '||v_use||'.'; end if;
  if nullif(v_signature,'') is not null then v_text:=v_text||' Bestätigt sind '||v_signature||'.'; end if;
  if nullif(v_fit,'') is not null then v_text:=v_text||' Passend für '||v_fit||'.'; end if;
  if nullif(v_feel,'') is not null then v_text:=v_text||' Typischerweise '||v_feel||'.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('clause',case field_key when 'activity.types' then 'PURPOSE' when 'signature.characteristics' then 'OFFERING_OR_PURPOSE_DISPLAY' when 'social.suitability' then 'AUDIENCE' when 'atmosphere.descriptors' then 'ATMOSPHERE' end,'acceptedFactId',id,'fieldKey',field_key,'sourceId',source_id) order by field_key),'[]'::jsonb) into v_lineage from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('activity.types','signature.characteristics','social.suitability','atmosphere.descriptors') and status='ACTIVE' and evidence_scope='SPOT';
  return jsonb_build_object('text',v_text,'deterministic',true,'archetype',v_archetype,'lineage',v_lineage,'contractVersion','backyrd-human-spot-intelligence-v2');
end $$;

revoke all on function public.backyrd_human_spot_summary_v2(uuid) from public,anon;
grant execute on function public.backyrd_human_spot_summary_v2(uuid) to service_role;
