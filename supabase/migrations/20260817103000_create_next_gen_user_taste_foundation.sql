-- Wave 3A: storage and access boundary for the versioned Next-Gen Taste Engine.
-- This migration does not connect Product events or Decision ranking to the engine.

create table public.backyrd_taste_concepts_v1 (
  concept_key text primary key,
  concept_family text not null,
  label text not null,
  taste_space_version text not null default 'backyrd-taste-space-v1',
  created_at timestamptz not null default now(),
  unique (concept_key, concept_family)
);

insert into public.backyrd_taste_concepts_v1(concept_key, concept_family, label)
values
  ('vibe.cozy','vibe','cozy'), ('vibe.relaxed','vibe','relaxed'),
  ('vibe.romantic','vibe','romantic'), ('vibe.lively','vibe','lively'),
  ('vibe.quiet','vibe','quiet'), ('vibe.social','vibe','social'),
  ('vibe.inspiring','vibe','inspiring'), ('vibe.playful','vibe','playful'),
  ('vibe.elegant','vibe','elegant'), ('vibe.authentic','vibe','authentic'),
  ('vibe.urban','vibe','urban'),
  ('energy.calm','energy','calm'), ('energy.balanced','energy','balanced'),
  ('energy.energetic','energy','energetic'),
  ('social_style.solo_friendly','social_style','solo friendly'),
  ('social_style.conversation_friendly','social_style','conversation friendly'),
  ('social_style.group_friendly','social_style','group friendly'),
  ('social_style.family_friendly','social_style','family friendly'),
  ('social_style.romantic_friendly','social_style','romantic friendly'),
  ('occasion.work_friendly','occasion','work friendly'),
  ('occasion.celebration_friendly','occasion','celebration friendly'),
  ('occasion.morning_friendly','occasion','morning friendly'),
  ('occasion.afternoon_friendly','occasion','afternoon friendly'),
  ('occasion.evening_friendly','occasion','evening friendly'),
  ('price.budget','price','budget'), ('price.balanced_price','price','balanced price'),
  ('price.premium','price','premium'),
  ('discovery.mainstream','discovery','mainstream'),
  ('discovery.hidden_gem','discovery','hidden gem'), ('discovery.novel','discovery','novel'),
  ('character.design_led','character','design led'),
  ('character.authentic_character','character','authentic character'),
  ('character.distinctive','character','distinctive'),
  ('environment.indoor','environment','indoor'), ('environment.outdoor','environment','outdoor'),
  ('place_type.cafe','place_type','cafe'), ('place_type.bar','place_type','bar'),
  ('place_type.restaurant','place_type','restaurant'), ('place_type.nightlife','place_type','nightlife'),
  ('place_type.culture','place_type','culture'), ('place_type.outing','place_type','outing'),
  ('place_type.activity','place_type','activity'), ('place_type.experience','place_type','experience'),
  ('place_type.hotel','place_type','hotel'), ('place_type.other','place_type','other');

comment on table public.backyrd_taste_concepts_v1 is
  'Controlled universal User/Spot concept registry for backyrd-taste-space-v1.';

create table public.backyrd_taste_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_event_id text not null,
  source_event_type text not null,
  source_family text not null check (source_family in (
    'exposure','interaction','explicit','explicit_negative','commitment',
    'outcome','onboarding','state_change','correction'
  )),
  concept_key text not null references public.backyrd_taste_concepts_v1(concept_key),
  scope_kind text not null check (scope_kind in ('GLOBAL','PLACE_TYPE','CONTEXT')),
  scope_key text not null,
  direction smallint not null check (direction in (-1,0,1)),
  strength numeric not null check (strength >= 0 and strength <= 1),
  decay_class text not null check (decay_class in ('transient','contextual','onboarding','behavioral','stable')),
  spot_id uuid references public.spots(id) on delete set null,
  session_id text,
  occurred_at timestamptz not null,
  evidence_model_version text not null default 'backyrd-taste-evidence-v1',
  created_at timestamptz not null default now(),
  constraint backyrd_taste_evidence_v1_idempotency unique (
    user_id, source_event_id, concept_key, scope_kind, scope_key
  ),
  constraint backyrd_taste_evidence_v1_scope_key check (
    (scope_kind = 'GLOBAL' and scope_key = 'global')
    or (scope_kind = 'PLACE_TYPE' and scope_key in (
      'cafe','bar','restaurant','nightlife','culture','outing','activity','experience','hotel','other'
    ))
    or (scope_kind = 'CONTEXT' and scope_key in (
      'audience.solo','audience.date','audience.friends','audience.family','audience.work',
      'time.morning','time.afternoon','time.evening','time.weekend','time.weekday'
    ))
  ),
  constraint backyrd_taste_evidence_v1_direction_strength check (
    (direction = 0 and strength = 0) or (direction <> 0 and strength > 0)
  )
);

comment on table public.backyrd_taste_evidence_v1 is
  'Consent-gated, normalized evidence ledger for the Wave 3A Next-Gen Taste Engine. Service-written; not Product-wired.';

create index backyrd_taste_evidence_v1_user_time_idx
  on public.backyrd_taste_evidence_v1(user_id, occurred_at desc);
create index backyrd_taste_evidence_v1_user_concept_idx
  on public.backyrd_taste_evidence_v1(user_id, concept_key, scope_kind, scope_key);

create table public.backyrd_user_taste_map_v1 (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_key text not null,
  concept_family text not null,
  scope_kind text not null check (scope_kind in ('GLOBAL','PLACE_TYPE','CONTEXT')),
  scope_key text not null,
  affinity numeric not null check (affinity >= -1 and affinity <= 1),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  positive_evidence numeric not null default 0 check (positive_evidence >= 0),
  negative_evidence numeric not null default 0 check (negative_evidence >= 0),
  positive_event_count integer not null default 0 check (positive_event_count >= 0),
  negative_event_count integer not null default 0 check (negative_event_count >= 0),
  distinct_spot_count integer not null default 0 check (distinct_spot_count >= 0),
  distinct_session_count integer not null default 0 check (distinct_session_count >= 0),
  source_families text[] not null default '{}'::text[],
  first_evidence_at timestamptz,
  last_evidence_at timestamptz,
  decay_state text not null check (decay_state in ('CURRENT','AGING','STALE','UNKNOWN')),
  calculated_at timestamptz not null,
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  taste_space_version text not null default 'backyrd-taste-space-v1',
  learning_engine_version text not null default 'backyrd-taste-learning-v1',
  confidence_model_version text not null default 'backyrd-taste-confidence-v1',
  decay_model_version text not null default 'backyrd-taste-decay-v1',
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_key, scope_kind, scope_key),
  foreign key (concept_key, concept_family)
    references public.backyrd_taste_concepts_v1(concept_key, concept_family),
  constraint backyrd_user_taste_map_v1_time_order check (
    first_evidence_at is null or last_evidence_at is null or first_evidence_at <= last_evidence_at
  )
);

comment on table public.backyrd_user_taste_map_v1 is
  'Bounded, confidence-aware derived state from backyrd_taste_evidence_v1. No ranking or Product integration in Wave 3A.';

create index backyrd_user_taste_map_v1_projection_idx
  on public.backyrd_user_taste_map_v1(user_id, scope_kind, scope_key, confidence desc);

create or replace function public.backyrd_taste_require_personalization_consent_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.user_has_active_consent_v1(new.user_id, 'personalized_recommendations') then
    raise exception 'personalization_consent_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_backyrd_taste_evidence_v1_consent
before insert or update on public.backyrd_taste_evidence_v1
for each row execute function public.backyrd_taste_require_personalization_consent_v1();

create trigger trg_backyrd_user_taste_map_v1_consent
before insert or update on public.backyrd_user_taste_map_v1
for each row execute function public.backyrd_taste_require_personalization_consent_v1();

create or replace function public.backyrd_get_my_taste_map_v1(
  p_scope_kind text default null,
  p_scope_key text default null,
  p_limit integer default 200
)
returns table (
  concept_key text,
  concept_family text,
  scope_kind text,
  scope_key text,
  affinity numeric,
  confidence numeric,
  positive_evidence numeric,
  negative_evidence numeric,
  positive_event_count integer,
  negative_event_count integer,
  distinct_spot_count integer,
  distinct_session_count integer,
  source_families text[],
  first_evidence_at timestamptz,
  last_evidence_at timestamptz,
  decay_state text,
  calculated_at timestamptz,
  taste_space_version text,
  learning_engine_version text,
  confidence_model_version text,
  decay_model_version text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    m.concept_key, m.concept_family, m.scope_kind, m.scope_key,
    m.affinity, m.confidence, m.positive_evidence, m.negative_evidence,
    m.positive_event_count, m.negative_event_count,
    m.distinct_spot_count, m.distinct_session_count, m.source_families,
    m.first_evidence_at, m.last_evidence_at, m.decay_state, m.calculated_at,
    m.taste_space_version, m.learning_engine_version,
    m.confidence_model_version, m.decay_model_version
  from public.backyrd_user_taste_map_v1 m
  where auth.uid() is not null
    and m.user_id = auth.uid()
    and public.user_has_active_consent_v1(auth.uid(), 'personalized_recommendations')
    and (p_scope_kind is null or m.scope_kind = upper(p_scope_kind))
    and (p_scope_key is null or m.scope_key = p_scope_key)
  order by abs(m.affinity) * m.confidence desc, m.concept_key
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

alter table public.backyrd_taste_concepts_v1 enable row level security;
alter table public.backyrd_taste_evidence_v1 enable row level security;
alter table public.backyrd_user_taste_map_v1 enable row level security;

create policy backyrd_taste_concepts_v1_no_client_access
  on public.backyrd_taste_concepts_v1
  for all to anon, authenticated
  using (false) with check (false);

create policy backyrd_taste_evidence_v1_no_client_access
  on public.backyrd_taste_evidence_v1
  for all to anon, authenticated
  using (false) with check (false);

create policy backyrd_user_taste_map_v1_read_own_consented
  on public.backyrd_user_taste_map_v1
  for select to authenticated
  using (
    auth.uid() = user_id
    and public.user_has_active_consent_v1(auth.uid(), 'personalized_recommendations')
  );

create policy backyrd_user_taste_map_v1_no_client_write
  on public.backyrd_user_taste_map_v1
  for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.backyrd_taste_concepts_v1 from anon, authenticated;
revoke all on table public.backyrd_taste_evidence_v1 from anon, authenticated;
revoke all on table public.backyrd_user_taste_map_v1 from anon, authenticated;
grant select on table public.backyrd_user_taste_map_v1 to authenticated;
grant all on table public.backyrd_taste_concepts_v1 to service_role;
grant all on table public.backyrd_taste_evidence_v1 to service_role;
grant all on table public.backyrd_user_taste_map_v1 to service_role;

revoke all on function public.backyrd_taste_require_personalization_consent_v1() from public, anon, authenticated;
grant execute on function public.backyrd_taste_require_personalization_consent_v1() to service_role;
revoke all on function public.backyrd_get_my_taste_map_v1(text, text, integer) from public, anon;
grant execute on function public.backyrd_get_my_taste_map_v1(text, text, integer) to authenticated, service_role;
