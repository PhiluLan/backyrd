-- Human Spot Intelligence V2
-- Adaptive authoring metadata and a Founder/Admin-only human-to-canonical
-- boundary. Canonical Spot truth, frozen N4 registries and ranking semantics
-- remain authoritative and unchanged.

do $$ begin
  if (select count(*) from public.backyrd_taste_concepts_v1) <> 45 then raise exception 'frozen_taste_registry_must_remain_45'; end if;
  if (select count(*) from public.backyrd_spot_intelligence_dimensions_v1) <> 60 then raise exception 'frozen_n4_registry_must_remain_60'; end if;
end $$;

create table public.backyrd_human_spot_archetypes_v2 (
  archetype_id text primary key,
  label_de text not null,
  group_de text not null,
  description_de text not null,
  sort_order integer not null,
  active boolean not null default true,
  contract_version text not null default 'backyrd-human-spot-intelligence-v2'
);

insert into public.backyrd_human_spot_archetypes_v2(archetype_id,label_de,group_de,description_de,sort_order) values
 ('BREWPUB','Brewpub / Brauerei mit Ausschank','Essen & Trinken','Bier-orientierter Gastronomiebetrieb, oft mit eigener Brauerei.',10),
 ('BAR','Bar','Essen & Trinken','Bar mit Fokus auf Drinks und Zusammensein.',20),
 ('COCKTAIL_BAR','Cocktailbar','Essen & Trinken','Bar mit Cocktail-Fokus.',30),
 ('WINE_BAR','Weinbar','Essen & Trinken','Bar mit Wein-Fokus.',40),
 ('RESTAURANT','Restaurant','Essen & Trinken','Ort für Mahlzeiten.',50),
 ('CAFE','Café','Essen & Trinken','Café für Kaffee, kleine Speisen und Aufenthalt.',60),
 ('BAKERY','Bäckerei','Essen & Trinken','Bäckerei oder Konditorei.',70),
 ('NIGHTLIFE','Club / Nachtleben','Nachtleben','Ort für Nachtleben, Musik oder Tanzen.',80),
 ('MUSEUM','Museum / Ausstellung','Kultur','Museum oder Ausstellungshaus.',100),
 ('CULTURAL_VENUE','Kulturort','Kultur','Kino, Theater, Galerie oder anderer Kulturort.',110),
 ('ZOO','Zoo / Tierpark','Draußen & Ausflug','Ort für Tiere und Ausflüge.',120),
 ('INDOOR_ACTIVITY','Indoor-Aktivität','Aktivitäten','Aktive Freizeit in Innenräumen.',130),
 ('OUTDOOR_ACTIVITY','Outdoor-Aktivität','Aktivitäten','Aktive Freizeit draußen.',140),
 ('BOULDER_CLIMBING','Bouldern / Klettern','Aktivitäten','Boulder- oder Kletterhalle.',150),
 ('SPORT_VENUE','Sportort','Aktivitäten','Ort für Training oder Sport.',160),
 ('PARK_GARDEN','Park / Garten','Draußen & Ausflug','Park, Garten oder Grünraum.',170),
 ('VIEWPOINT_LANDMARK','Aussicht / Sehenswürdigkeit','Draußen & Ausflug','Aussichtspunkt oder Landmarke.',180),
 ('HOTEL','Hotel / Unterkunft','Übernachten','Unterkunft oder Hotel.',190),
 ('SHOP_RETAIL','Laden / Shopping','Shopping','Laden oder Retail-Ort.',200),
 ('EVENT_VENUE','Eventort','Kultur & Events','Ort mit wechselndem Programm.',210),
 ('MULTI_PURPOSE','Vielseitiger Ort','Sonstiges','Ort mit mehreren gleichwertigen Nutzungen.',220),
 ('UNKNOWN','Noch nicht eingeordnet','Sonstiges','Nur die wichtigsten gemeinsamen Fragen anzeigen.',999);

create table public.backyrd_human_spot_questions_v2 (
  question_id text primary key,
  section_id text not null check(section_id in ('IDENTITY','PURPOSE','FIT','EXPERIENCE','PRACTICAL')),
  label_de text not null,
  help_de text,
  control_type text not null check(control_type in ('SINGLE_CHOICE','MULTI_CHOICE','TRI_STATE_MAP','AGE_RANGE','DURATION_RANGE','ACCESSIBILITY_MAP')),
  canonical_field_key text not null references public.backyrd_spot_fact_catalog_v1(field_key),
  mapping_class text not null check(mapping_class in ('CANONICAL_WRITE','DISPLAY_METADATA','PROPOSAL_ONLY','NON_CANONICAL_NOTE')),
  archetypes text[] not null default '{}',
  common boolean not null default false,
  priority text not null check(priority in ('ESSENTIAL','HIGH_VALUE','OPTIONAL')),
  sort_order integer not null,
  options jsonb not null default '[]'::jsonb check(jsonb_typeof(options)='array'),
  relevance jsonb not null default '{}'::jsonb check(jsonb_typeof(relevance)='object'),
  engine_use text[] not null default '{}',
  owner_access text not null check(owner_access in ('OWNER_BASIC','OWNER_PRO','FOUNDER_ONLY')),
  active boolean not null default true,
  contract_version text not null default 'backyrd-human-spot-intelligence-v2'
);

insert into public.backyrd_human_spot_questions_v2
(question_id,section_id,label_de,help_de,control_type,canonical_field_key,mapping_class,archetypes,common,priority,sort_order,options,relevance,engine_use,owner_access) values
('purpose.activities','PURPOSE','Was machen Gäste hier hauptsächlich?','Nur Dinge auswählen, die allgemein für den Ort gelten – nicht nur für ein einzelnes Event.','MULTI_CHOICE','activity.types','CANONICAL_WRITE',array['MUSEUM','CULTURAL_VENUE','ZOO','INDOOR_ACTIVITY','OUTDOOR_ACTIVITY','BOULDER_CLIMBING','SPORT_VENUE','PARK_GARDEN','VIEWPOINT_LANDMARK','NIGHTLIFE','EVENT_VENUE','MULTI_PURPOSE'],false,'ESSENTIAL',10,
 '[{"id":"museum","label":"Ausstellungen ansehen","value":"MUSEUM","archetypes":["MUSEUM","CULTURAL_VENUE"]},{"id":"culture","label":"Kultur erleben","value":"CULTURE","archetypes":["MUSEUM","CULTURAL_VENUE","EVENT_VENUE"]},{"id":"history","label":"Geschichte entdecken","value":"HISTORY","archetypes":["MUSEUM","CULTURAL_VENUE","VIEWPOINT_LANDMARK"]},{"id":"animals","label":"Tiere erleben","value":"ANIMALS","archetypes":["ZOO"]},{"id":"walk","label":"Spazieren / erkunden","value":"WALK","archetypes":["ZOO","PARK_GARDEN","VIEWPOINT_LANDMARK","OUTDOOR_ACTIVITY"]},{"id":"playground","label":"Spielplatz nutzen","value":"PLAYGROUND","archetypes":["ZOO","PARK_GARDEN","OUTDOOR_ACTIVITY"]},{"id":"sports","label":"Sport / Training","value":"SPORTS","archetypes":["INDOOR_ACTIVITY","OUTDOOR_ACTIVITY","BOULDER_CLIMBING","SPORT_VENUE"]},{"id":"climbing","label":"Klettern","value":"CLIMBING","archetypes":["BOULDER_CLIMBING","INDOOR_ACTIVITY","OUTDOOR_ACTIVITY"]},{"id":"bouldering","label":"Bouldern","value":"BOULDERING","archetypes":["BOULDER_CLIMBING","INDOOR_ACTIVITY"]},{"id":"gaming","label":"Gaming","value":"GAMING","archetypes":["INDOOR_ACTIVITY","MULTI_PURPOSE"]},{"id":"workshop","label":"An Workshops teilnehmen","value":"WORKSHOP","archetypes":["MUSEUM","CULTURAL_VENUE","EVENT_VENUE","MULTI_PURPOSE"]},{"id":"quiz","label":"Quiz-Abende","value":"QUIZ","archetypes":["NIGHTLIFE","EVENT_VENUE","MULTI_PURPOSE"],"scopeGuard":true},{"id":"karaoke","label":"Karaoke","value":"KARAOKE","archetypes":["NIGHTLIFE","EVENT_VENUE"],"scopeGuard":true},{"id":"live_music","label":"Live-Musik","value":"LIVE_MUSIC","archetypes":["NIGHTLIFE","CULTURAL_VENUE","EVENT_VENUE"],"scopeGuard":true},{"id":"concert","label":"Konzerte","value":"CONCERT","archetypes":["NIGHTLIFE","CULTURAL_VENUE","EVENT_VENUE"],"scopeGuard":true},{"id":"waterpark","label":"Wasserpark / Wassererlebnis","value":"WATERPARK","archetypes":["INDOOR_ACTIVITY","OUTDOOR_ACTIVITY","MULTI_PURPOSE"]}]',
 '{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION'],'OWNER_BASIC'),
('fit.audience','FIT','Mit wem passt der Ort?','Jede Situation einzeln beurteilen. Unbekannt bedeutet ausdrücklich: nicht sicher beurteilt.','TRI_STATE_MAP','social.suitability','CANONICAL_WRITE','{}',true,'ESSENTIAL',20,
 '[{"id":"solo","label":"Alleine","value":"solo"},{"id":"date","label":"Date / zu zweit","value":"date"},{"id":"friends","label":"Mit Freunden","value":"friends"},{"id":"family","label":"Mit Familie","value":"family"},{"id":"groups","label":"In Gruppen","value":"groups"},{"id":"work","label":"Mit Kolleg:innen / Business","value":"work"}]','{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION'],'OWNER_PRO'),
('fit.dayparts','FIT','Wann passt der Ort besonders gut?','Das ist qualitative Eignung – nicht die Öffnungszeit.','MULTI_CHOICE','time.dayparts','CANONICAL_WRITE','{}',true,'HIGH_VALUE',30,
 '[{"id":"morning","label":"Morgens","value":"MORNING"},{"id":"afternoon","label":"Nachmittags","value":"AFTERNOON"},{"id":"evening","label":"Abends","value":"EVENING"},{"id":"night","label":"Spätabends / nachts","value":"NIGHT"},{"id":"weekday","label":"Werktags","value":"WEEKDAY"},{"id":"weekend","label":"Am Wochenende","value":"WEEKEND"}]','{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION'],'OWNER_PRO'),
('experience.atmosphere','EXPERIENCE','Wie fühlt sich der Ort normalerweise an?','Nur Eigenschaften auswählen, die für den Ort allgemein gelten.','MULTI_CHOICE','atmosphere.descriptors','CANONICAL_WRITE','{}',true,'ESSENTIAL',40,
 '[{"id":"cozy","label":"Gemütlich","value":"COZY"},{"id":"relaxed","label":"Entspannt","value":"RELAXED"},{"id":"romantic","label":"Romantisch","value":"ROMANTIC"},{"id":"lively","label":"Lebendig","value":"LIVELY"},{"id":"quiet","label":"Ruhig","value":"QUIET"},{"id":"social","label":"Gesellig","value":"SOCIAL"},{"id":"inspiring","label":"Inspirierend","value":"INSPIRING"},{"id":"playful","label":"Verspielt","value":"PLAYFUL"},{"id":"elegant","label":"Elegant","value":"ELEGANT"},{"id":"design_led","label":"Designgeprägt","value":"DESIGN_LED"},{"id":"authentic","label":"Authentisch","value":"AUTHENTIC"},{"id":"hidden_gem","label":"Besonders / Geheimtipp","value":"HIDDEN_GEM"}]','{}',array['N4','USER_EVIDENCE_ATTRIBUTION'],'OWNER_PRO'),
('experience.environment','EXPERIENCE','Wo hält man sich hauptsächlich auf?','Bei einem echten Innen- und Außenbereich „Drinnen und draußen“ wählen.','SINGLE_CHOICE','suitability.environment','CANONICAL_WRITE','{}',true,'ESSENTIAL',50,
 '[{"id":"indoor","label":"Drinnen","value":"INDOOR"},{"id":"outdoor","label":"Draußen","value":"OUTDOOR"},{"id":"mixed","label":"Drinnen und draußen","value":"MIXED"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}',array['DECISION_FACTUAL_MATCHER','ELIGIBILITY','REASON_AUTHORIZATION'],'OWNER_BASIC'),
('experience.rain','EXPERIENCE','Funktioniert der Ort auch bei schlechtem Wetter?','Bei gemischten Orten darf die Eignung eingeschränkt sein.','SINGLE_CHOICE','suitability.rain','CANONICAL_WRITE','{}',true,'HIGH_VALUE',60,
 '[{"id":"suitable","label":"Sehr gut","value":"SUITABLE"},{"id":"limited","label":"Teilweise","value":"LIMITED"},{"id":"not_suitable","label":"Eher nicht","value":"NOT_SUITABLE"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}',array['DECISION_FACTUAL_MATCHER','ELIGIBILITY','REASON_AUTHORIZATION'],'OWNER_BASIC'),
('experience.noise','EXPERIENCE','Wie laut ist es normalerweise?','Lautstärke und Gesprächseignung werden getrennt erfasst.','SINGLE_CHOICE','character.noise','CANONICAL_WRITE','{}',true,'HIGH_VALUE',70,
 '[{"id":"quiet","label":"Ruhig","value":"QUIET"},{"id":"moderate","label":"Mittel","value":"MODERATE"},{"id":"loud","label":"Lebhaft / eher laut","value":"LOUD"},{"id":"variable","label":"Je nach Zeitpunkt unterschiedlich","value":"VARIABLE"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION'],'OWNER_PRO'),
('experience.conversation','EXPERIENCE','Kann man sich gut unterhalten?','Nicht allein aus der Lautstärke ableiten.','SINGLE_CHOICE','suitability.conversation','CANONICAL_WRITE','{}',true,'HIGH_VALUE',80,
 '[{"id":"high","label":"Sehr gut","value":"HIGH"},{"id":"medium","label":"Meistens gut","value":"MEDIUM"},{"id":"low","label":"Nur eingeschränkt","value":"LOW"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION','USER_EVIDENCE_ATTRIBUTION'],'OWNER_PRO'),
('experience.duration','EXPERIENCE','Wie lange bleiben Menschen hier typischerweise?','Eine grobe, ehrliche Spanne reicht.','DURATION_RANGE','duration.approximate','CANONICAL_WRITE','{}',true,'HIGH_VALUE',90,
 '[{"id":"under_30","label":"Unter 30 Min.","value":{"min":0,"max":30}},{"id":"30_60","label":"30–60 Min.","value":{"min":30,"max":60}},{"id":"60_120","label":"1–2 Std.","value":{"min":60,"max":120}},{"id":"120_240","label":"2–4 Std.","value":{"min":120,"max":240}},{"id":"open","label":"Länger / offen","value":{"min":120,"max":null}}]','{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION'],'OWNER_BASIC'),
('practical.planning','PRACTICAL','Wie spontan kann man hierherkommen?','Buchungsmöglichkeit und Empfehlung nicht mit Öffnungszeiten verwechseln.','SINGLE_CHOICE','reservation.character','CANONICAL_WRITE','{}',true,'HIGH_VALUE',100,
 '[{"id":"walk_in","label":"Einfach spontan","value":"WALK_IN"},{"id":"recommended","label":"Besser vorher reservieren","value":"RECOMMENDED"},{"id":"required","label":"Reservierung / Buchung nötig","value":"REQUIRED"},{"id":"book_ahead","label":"Frühzeitig planen","value":"BOOK_AHEAD"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION'],'OWNER_BASIC'),
('practical.family','PRACTICAL','Eignet sich der Ort grundsätzlich für Familien mit Kindern?','Ungeprüft ist nicht dasselbe wie ungeeignet.','SINGLE_CHOICE','suitability.family_kids','CANONICAL_WRITE','{}',true,'HIGH_VALUE',110,
 '[{"id":"suitable","label":"Gut geeignet","value":"SUITABLE"},{"id":"not_suitable","label":"Eher nicht geeignet","value":"NOT_SUITABLE"},{"id":"unknown","label":"Unbekannt / nicht beurteilt","value":"UNKNOWN"}]','{}',array['DECISION_FACTUAL_MATCHER','REASON_AUTHORIZATION'],'OWNER_BASIC'),
('practical.age','PRACTICAL','Für welches Alter ungefähr?','Alter ist Kontext und Eignung, keine Bewertung des Orts. Eine Obergrenze darf offen bleiben.','AGE_RANGE','suitability.age','CANONICAL_WRITE','{}',true,'OPTIONAL',120,
 '[]','{"showWhen":{"questionId":"practical.family","values":["SUITABLE"]}}',array['DECISION_FACTUAL_MATCHER','ELIGIBILITY','REASON_AUTHORIZATION'],'OWNER_PRO'),
('practical.accessibility','PRACTICAL','Welche Zugänglichkeitsmerkmale sind bestätigt?','Einzelne beobachtbare Merkmale – keine pauschale Aussage „vollständig barrierefrei“.','ACCESSIBILITY_MAP','accessibility.capabilities','CANONICAL_WRITE','{}',true,'HIGH_VALUE',130,
 '[{"id":"step_free","label":"Stufenloser Zugang","value":"step_free"},{"id":"wheelchair_spaces","label":"Rollstuhlgerechte Hauptbereiche","value":"wheelchair_spaces"},{"id":"accessible_toilet","label":"Barrierefreies WC","value":"accessible_toilet"},{"id":"elevator","label":"Aufzug","value":"elevator"},{"id":"hearing_support","label":"Unterstützung für Hörbeeinträchtigte","value":"hearing_support"},{"id":"assistance_dogs","label":"Assistenzhunde erlaubt","value":"assistance_dogs"}]','{}',array['DECISION_FACTUAL_MATCHER','ELIGIBILITY','REASON_AUTHORIZATION'],'OWNER_BASIC');

create table public.backyrd_spot_authoring_profiles_v2 (
  spot_id uuid primary key references public.spots(id) on delete cascade,
  primary_archetype text not null references public.backyrd_human_spot_archetypes_v2(archetype_id),
  secondary_archetypes text[] not null default '{}',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  contract_version text not null default 'backyrd-human-spot-intelligence-v2'
);

create table public.backyrd_human_spot_save_requests_v2 (
  spot_id uuid not null references public.spots(id) on delete cascade,
  idempotency_key text not null,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key(spot_id,idempotency_key)
);

create or replace function public.backyrd_human_spot_derived_archetype_v2(p_spot_id uuid)
returns text language sql stable security definer set search_path=public,pg_catalog as $$
  select coalesce(
    (select primary_archetype from public.backyrd_spot_authoring_profiles_v2 where spot_id=p_spot_id),
    case
      when exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='activity.types' and status='ACTIVE' and value ?| array['BOULDERING','CLIMBING']) then 'BOULDER_CLIMBING'
      when exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='activity.types' and status='ACTIVE' and value ? 'ANIMALS') then 'ZOO'
      else (select case lower(c.name)
        when 'bar' then 'BAR' when 'weinbar' then 'WINE_BAR' when 'restaurant' then 'RESTAURANT' when 'café' then 'CAFE'
        when 'museum' then 'MUSEUM' when 'kino' then 'CULTURAL_VENUE' when 'nachtleben' then 'NIGHTLIFE'
        when 'aktivität' then 'INDOOR_ACTIVITY' when 'aussichtspunkt' then 'VIEWPOINT_LANDMARK' when 'spaziergang' then 'PARK_GARDEN'
        when 'unterkunft / hotel' then 'HOTEL' when 'event' then 'EVENT_VENUE' when 'wellness & spa' then 'INDOOR_ACTIVITY'
        when 'besonderes erlebnis' then 'MULTI_PURPOSE' else 'UNKNOWN' end
        from public.spots s left join public.categories c on c.id=s.category_id where s.id=p_spot_id)
    end,
    'UNKNOWN'
  )
$$;

create or replace function public.backyrd_human_spot_summary_v2(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_spot public.spots%rowtype;v_archetype text;v_identity text;v_use text;v_fit text;v_feel text;v_text text;
begin
  select * into v_spot from public.spots where id=p_spot_id;
  if not found then raise exception 'spot_not_found' using errcode='22023'; end if;
  v_archetype:=public.backyrd_human_spot_derived_archetype_v2(p_spot_id);
  select label_de||' in '||coalesce(v_spot.city,'Basel') into v_identity from public.backyrd_human_spot_archetypes_v2 where archetype_id=v_archetype;
  select string_agg(case x.value
    when 'MUSEUM' then 'Ausstellungen' when 'CULTURE' then 'Kultur' when 'HISTORY' then 'Geschichte' when 'ANIMALS' then 'Tiere'
    when 'WALK' then 'Spazieren' when 'PLAYGROUND' then 'Spielplatz' when 'SPORTS' then 'Sport' when 'CLIMBING' then 'Klettern'
    when 'BOULDERING' then 'Bouldern' when 'WORKSHOP' then 'Workshops' when 'LIVE_MUSIC' then 'Live-Musik' when 'CONCERT' then 'Konzerte' else null end,', ' order by x.value)
    into v_use from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_array_elements_text(f.value) as x(value)
    where f.spot_id=p_spot_id and f.field_key='activity.types' and f.status='ACTIVE' and f.evidence_scope='SPOT';
  select string_agg(label,', ' order by ord) into v_fit from (
    select case e.key when 'solo' then 'alleine' when 'date' then 'Dates' when 'friends' then 'Freunde' when 'family' then 'Familien' when 'groups' then 'Gruppen' when 'work' then 'Kolleg:innen' end label,row_number() over() ord
    from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_each_text(f.value) e
    where f.spot_id=p_spot_id and f.field_key='social.suitability' and f.status='ACTIVE' and f.evidence_scope='SPOT' and e.value='SUITABLE'
  ) s where label is not null;
  select string_agg(case x.value when 'COZY' then 'gemütlich' when 'RELAXED' then 'entspannt' when 'ROMANTIC' then 'romantisch' when 'LIVELY' then 'lebendig' when 'QUIET' then 'ruhig' when 'SOCIAL' then 'gesellig' when 'INSPIRING' then 'inspirierend' when 'PLAYFUL' then 'verspielt' when 'ELEGANT' then 'elegant' when 'DESIGN_LED' then 'designgeprägt' when 'AUTHENTIC' then 'authentisch' when 'HIDDEN_GEM' then 'besonders' else null end,', ' order by x.value)
    into v_feel from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_array_elements_text(f.value) as x(value)
    where f.spot_id=p_spot_id and f.field_key='atmosphere.descriptors' and f.status='ACTIVE' and f.evidence_scope='SPOT';
  v_text:=coalesce(v_identity,'Ort in '||coalesce(v_spot.city,'Basel'))||'.';
  if nullif(v_use,'') is not null then v_text:=v_text||' Hier geht es vor allem um '||v_use||'.'; end if;
  if nullif(v_fit,'') is not null then v_text:=v_text||' Passend für '||v_fit||'.'; end if;
  if nullif(v_feel,'') is not null then v_text:=v_text||' Typischerweise '||v_feel||'.'; end if;
  return jsonb_build_object('text',v_text,'deterministic',true,'archetype',v_archetype,'contractVersion','backyrd-human-spot-intelligence-v2');
end $$;

create or replace function public.backyrd_human_spot_profile_v2(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;v_archetype text;v_secondary text[];v_profile jsonb;v_total integer;v_done integer;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  v_archetype:=public.backyrd_human_spot_derived_archetype_v2(p_spot_id);
  select secondary_archetypes into v_secondary from public.backyrd_spot_authoring_profiles_v2 where spot_id=p_spot_id;
  v_secondary:=coalesce(v_secondary,'{}');
  select count(*),count(*) filter(where exists(select 1 from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key=q.canonical_field_key and f.status in ('ACTIVE','UNKNOWN','STALE')))
    into v_total,v_done from public.backyrd_human_spot_questions_v2 q
    where q.active and (q.common or v_archetype=any(q.archetypes) or q.archetypes&&v_secondary);
  v_profile:=public.backyrd_gold_profile_v1(p_spot_id);
  return v_profile||jsonb_build_object(
    'contractVersion','backyrd-human-spot-intelligence-v2',
    'spot',(select jsonb_build_object('id',s.id,'name',s.name,'city',s.city,'category',c.name,'status',s.status,'dataOrigin',s.data_origin) from public.spots s left join public.categories c on c.id=s.category_id where s.id=p_spot_id),
    'authoring',jsonb_build_object('primaryArchetype',v_archetype,'secondaryArchetypes',v_secondary,'explicit',exists(select 1 from public.backyrd_spot_authoring_profiles_v2 where spot_id=p_spot_id)),
    'archetypes',(select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order),'[]') from public.backyrd_human_spot_archetypes_v2 a where a.active),
    'questions',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('relevant',q.common or v_archetype=any(q.archetypes) or q.archetypes&&v_secondary) order by q.sort_order),'[]') from public.backyrd_human_spot_questions_v2 q where q.active),
    'humanSummary',public.backyrd_human_spot_summary_v2(p_spot_id),
    'humanReadiness',jsonb_build_object('answered',v_done,'relevant',v_total,'coverage',case when v_total=0 then 0 else round(100*v_done::numeric/v_total) end,'status',case when v_total=0 or v_done::numeric/v_total<.35 then 'KAUM_BESCHRIEBEN' when v_done::numeric/v_total<.7 then 'GRUNDLAGEN' when v_done::numeric/v_total<.9 then 'GUT_BESCHRIEBEN' else 'SEHR_GUT_BESCHRIEBEN' end,
      'missing',(select coalesce(jsonb_agg(jsonb_build_object('questionId',q.question_id,'sectionId',q.section_id,'label',q.label_de,'priority',q.priority) order by q.sort_order),'[]') from public.backyrd_human_spot_questions_v2 q where q.active and (q.common or v_archetype=any(q.archetypes) or q.archetypes&&v_secondary) and not exists(select 1 from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key=q.canonical_field_key and f.status in ('ACTIVE','UNKNOWN','STALE'))))
  );
end $$;

create or replace function public.backyrd_human_spot_set_archetypes_v2(p_spot_id uuid,p_primary_archetype text,p_secondary_archetypes text[] default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;v_secondary text[];v_invalid integer;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_or_founder_required' using errcode='42501'; end if;
  if not exists(select 1 from public.backyrd_human_spot_archetypes_v2 where archetype_id=p_primary_archetype and active) then raise exception 'unknown_authoring_archetype' using errcode='22023'; end if;
  select count(*) into v_invalid from unnest(coalesce(p_secondary_archetypes,'{}')) as x(value)
  where value=p_primary_archetype or not exists(select 1 from public.backyrd_human_spot_archetypes_v2 where archetype_id=value and active);
  if v_invalid>0 then raise exception 'unknown_or_duplicate_primary_secondary_authoring_archetype' using errcode='22023'; end if;
  select coalesce(array_agg(distinct value order by value),'{}'::text[]) into v_secondary from unnest(coalesce(p_secondary_archetypes,'{}')) as x(value);
  insert into public.backyrd_spot_authoring_profiles_v2(spot_id,primary_archetype,secondary_archetypes,updated_by)
  values(p_spot_id,p_primary_archetype,v_secondary,(v_actor->>'actorId')::uuid)
  on conflict(spot_id) do update set primary_archetype=excluded.primary_archetype,secondary_archetypes=excluded.secondary_archetypes,updated_by=excluded.updated_by,updated_at=now();
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(p_spot_id,(v_actor->>'actorId')::uuid,'SET_ARCHETYPES','AUTHORING_PROFILE',p_spot_id,jsonb_build_object('primary',p_primary_archetype,'secondary',v_secondary,'ui','human-spot-intelligence-v2'));
  return public.backyrd_human_spot_profile_v2(p_spot_id);
end $$;

create or replace function public.backyrd_human_spot_validate_answer_v2(
  p_spot_id uuid,p_question_id text,p_value jsonb
) returns boolean language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_question public.backyrd_human_spot_questions_v2%rowtype;v_primary text;v_secondary text[];v_item jsonb;v_key text;v_entry text;
begin
  select * into v_question from public.backyrd_human_spot_questions_v2 where question_id=p_question_id and active;
  if not found or v_question.mapping_class<>'CANONICAL_WRITE' then return false; end if;
  v_primary:=public.backyrd_human_spot_derived_archetype_v2(p_spot_id);
  select coalesce(secondary_archetypes,'{}'::text[]) into v_secondary from public.backyrd_spot_authoring_profiles_v2 where spot_id=p_spot_id;
  v_secondary:=coalesce(v_secondary,'{}'::text[]);
  if not (v_question.common or v_primary=any(v_question.archetypes) or v_question.archetypes&&v_secondary) then return false; end if;
  if not public.backyrd_gold_validate_fact_value_v1(v_question.canonical_field_key,p_value) then return false; end if;
  if v_question.control_type in ('SINGLE_CHOICE','DURATION_RANGE') then
    return exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=p_value);
  elsif v_question.control_type='MULTI_CHOICE' then
    if jsonb_typeof(p_value)<>'array' then return false; end if;
    for v_item in select value from jsonb_array_elements(p_value) loop
      if not exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=v_item and
        (not o ? 'archetypes' or exists(select 1 from jsonb_array_elements_text(o->'archetypes') a(value) where value=v_primary or value=any(v_secondary)))) then return false; end if;
    end loop;
    return true;
  elsif v_question.control_type in ('TRI_STATE_MAP','ACCESSIBILITY_MAP') then
    if jsonb_typeof(p_value)<>'object' then return false; end if;
    for v_key,v_entry in select key,value from jsonb_each_text(p_value) loop
      if v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN') or
        not exists(select 1 from jsonb_array_elements(v_question.options) o where o->>'value'=v_key) then return false; end if;
    end loop;
    return true;
  elsif v_question.control_type='AGE_RANGE' then return true;
  end if;
  return false;
end $$;

create or replace function public.backyrd_human_spot_save_section_v2(
  p_spot_id uuid,p_section_id text,p_answers jsonb,p_source_type text default 'ADMIN_VERIFIED',
  p_source_url text default null,p_source_reference text default null,p_evidence_scope text default 'SPOT',
  p_idempotency_key text default null,p_expected_snapshot_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_actor jsonb;v_payload_hash text;v_request public.backyrd_human_spot_save_requests_v2%rowtype;v_source uuid;v_answer jsonb;v_question public.backyrd_human_spot_questions_v2%rowtype;v_value jsonb;v_status text;v_rebuild jsonb;v_result jsonb;v_current_hash text;v_count integer:=0;v_proposal jsonb;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_or_founder_required' using errcode='42501'; end if;
  if p_section_id not in ('IDENTITY','PURPOSE','FIT','EXPERIENCE','PRACTICAL') then raise exception 'unknown_authoring_section' using errcode='22023'; end if;
  if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)=0 then raise exception 'authoring_answers_required' using errcode='22023'; end if;
  if p_source_type not in ('ADMIN_VERIFIED','OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT') then raise exception 'authoring_source_not_allowed' using errcode='22023'; end if;
  if p_evidence_scope not in ('SPOT','EVENT','PROGRAM','TEMPORARY') then raise exception 'authoring_scope_not_allowed' using errcode='22023'; end if;
  v_payload_hash:=encode(extensions.digest(convert_to(jsonb_build_object('section',p_section_id,'answers',p_answers,'source',p_source_type,'url',p_source_url,'reference',p_source_reference,'scope',p_evidence_scope)::text,'UTF8'),'sha256'),'hex');
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency_key_required' using errcode='22023'; end if;
  select * into v_request from public.backyrd_human_spot_save_requests_v2 where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
  if found then
    if v_request.payload_hash<>v_payload_hash then raise exception 'authoring_idempotency_conflict' using errcode='23505'; end if;
    return v_request.result||jsonb_build_object('replayed',true);
  end if;
  select fingerprint into v_current_hash from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global';
  if p_expected_snapshot_hash is not null and v_current_hash is distinct from p_expected_snapshot_hash then raise exception 'authoring_state_changed_reload_required' using errcode='40001'; end if;
  insert into public.backyrd_human_spot_save_requests_v2(spot_id,idempotency_key,payload_hash) values(p_spot_id,p_idempotency_key,v_payload_hash);
  insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_url,source_reference,title,observed_at,last_checked_at,legal_use_status,created_by_type,created_by_id)
  values(p_spot_id,p_source_type,nullif(btrim(p_source_url),''),coalesce(nullif(btrim(p_source_reference),''),'human-spot-v2:'||p_section_id||':'||p_idempotency_key),'Human Spot Intelligence V2 · '||p_section_id,now(),now(),'NOT_REQUIRED',v_actor->>'role',(v_actor->>'actorId')::uuid) returning id into v_source;
  for v_answer in select value from jsonb_array_elements(p_answers) loop
    select * into v_question from public.backyrd_human_spot_questions_v2 where question_id=v_answer->>'questionId' and active for share;
    if not found or v_question.section_id<>p_section_id then raise exception 'unknown_or_wrong_section_question' using errcode='22023'; end if;
    if v_question.mapping_class<>'CANONICAL_WRITE' then raise exception 'question_not_canonical_write' using errcode='22023'; end if;
    v_value:=v_answer->'value';
    if v_value is null or not public.backyrd_human_spot_validate_answer_v2(p_spot_id,v_question.question_id,v_value) then raise exception 'invalid_human_answer' using errcode='22023'; end if;
    if p_evidence_scope='SPOT' then
      update public.backyrd_spot_accepted_facts_v1 set status='SUPERSEDED' where spot_id=p_spot_id and field_key=v_question.canonical_field_key and status in ('ACTIVE','UNKNOWN','STALE');
      v_status:=case when v_value='"UNKNOWN"'::jsonb then 'UNKNOWN' else 'ACTIVE' end;
      insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,status,confidence_policy_result,accepted_by,observed_at,last_checked_at,evidence_scope,interpretation_basis,semantic_contract_version,contract_version)
      values(p_spot_id,v_question.canonical_field_key,v_value,v_source,v_status,.95,(v_actor->>'actorId')::uuid,now(),now(),'SPOT',case when v_question.canonical_field_key='time.dayparts' then 'HUMAN_QUALITATIVE' else 'SOURCE_EXPLICIT' end,'backyrd-canonical-semantics-v1','backyrd-spot-accepted-fact-v1');
    else
      v_proposal:=public.backyrd_gold_submit_proposal_v1(p_spot_id,v_question.canonical_field_key,v_value,v_source,p_idempotency_key||':'||v_question.question_id,'Human Spot Intelligence V2',null);
      update public.backyrd_spot_fact_proposals_v1
      set evidence_scope=p_evidence_scope,interpretation_basis=case when v_question.canonical_field_key='time.dayparts' then 'HUMAN_QUALITATIVE' else 'SOURCE_EXPLICIT' end
      where id=(v_proposal->>'proposalId')::uuid;
    end if;
    v_count:=v_count+1;
  end loop;
  if p_evidence_scope='SPOT' then v_rebuild:=public.backyrd_gold_rebuild_spot_v1(p_spot_id); end if;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(p_spot_id,(v_actor->>'actorId')::uuid,case when p_evidence_scope='SPOT' then 'SAVE_SECTION_V2' else 'PROPOSE_SECTION_V2' end,'AUTHORING_SECTION',p_spot_id,jsonb_build_object('sectionId',p_section_id,'answerCount',v_count,'scope',p_evidence_scope,'sourceId',v_source,'rebuild',v_rebuild,'ui','human-spot-intelligence-v2'));
  v_result:=jsonb_build_object('ok',true,'persisted',v_count,'accepted',p_evidence_scope='SPOT','reviewRequired',p_evidence_scope<>'SPOT','rebuild',v_rebuild,'profile',public.backyrd_human_spot_profile_v2(p_spot_id));
  update public.backyrd_human_spot_save_requests_v2 set result=v_result where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
  return v_result;
end $$;

alter table public.backyrd_human_spot_archetypes_v2 enable row level security;
alter table public.backyrd_human_spot_questions_v2 enable row level security;
alter table public.backyrd_spot_authoring_profiles_v2 enable row level security;
alter table public.backyrd_human_spot_save_requests_v2 enable row level security;
create policy backyrd_human_spot_archetypes_read_v2 on public.backyrd_human_spot_archetypes_v2 for select to authenticated using(true);
create policy backyrd_human_spot_questions_read_v2 on public.backyrd_human_spot_questions_v2 for select to authenticated using(true);
create policy backyrd_spot_authoring_profiles_no_direct_v2 on public.backyrd_spot_authoring_profiles_v2 for all to anon,authenticated using(false) with check(false);
create policy backyrd_human_spot_save_requests_no_direct_v2 on public.backyrd_human_spot_save_requests_v2 for all to anon,authenticated using(false) with check(false);

revoke all on public.backyrd_human_spot_archetypes_v2,public.backyrd_human_spot_questions_v2,public.backyrd_spot_authoring_profiles_v2,public.backyrd_human_spot_save_requests_v2 from anon,authenticated;
grant select on public.backyrd_human_spot_archetypes_v2,public.backyrd_human_spot_questions_v2 to authenticated;
grant all on public.backyrd_human_spot_archetypes_v2,public.backyrd_human_spot_questions_v2,public.backyrd_spot_authoring_profiles_v2,public.backyrd_human_spot_save_requests_v2 to service_role;
revoke all on function public.backyrd_human_spot_derived_archetype_v2(uuid),public.backyrd_human_spot_summary_v2(uuid),public.backyrd_human_spot_profile_v2(uuid),public.backyrd_human_spot_set_archetypes_v2(uuid,text,text[]),public.backyrd_human_spot_validate_answer_v2(uuid,text,jsonb),public.backyrd_human_spot_save_section_v2(uuid,text,jsonb,text,text,text,text,text,text) from public,anon;
grant execute on function public.backyrd_human_spot_profile_v2(uuid),public.backyrd_human_spot_set_archetypes_v2(uuid,text,text[]),public.backyrd_human_spot_save_section_v2(uuid,text,jsonb,text,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.backyrd_human_spot_derived_archetype_v2(uuid),public.backyrd_human_spot_summary_v2(uuid) to service_role;
grant execute on function public.backyrd_human_spot_validate_answer_v2(uuid,text,jsonb) to service_role;

comment on table public.backyrd_spot_authoring_profiles_v2 is 'Authoring-only question relevance metadata. It is not canonical Spot truth and must never enter ranking.';
comment on table public.backyrd_human_spot_questions_v2 is 'Authoritative Human Spot Intelligence V2 question and human-to-canonical whitelist.';
comment on function public.backyrd_human_spot_save_section_v2(uuid,text,jsonb,text,text,text,text,text,text) is 'Founder/Admin-only atomic Human V2 section save: whitelisted intent -> canonical Accepted Facts -> one N4 rebuild.';
