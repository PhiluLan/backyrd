-- Public Mood presentation starts at two distinct eligible contributors.
-- This projection is separate from the internal three-person Decision evidence
-- state. No Reviews, votes, stored aggregates, eligibility rules or grants change.
create or replace view public.backyrd_spot_mood_profile_public_v1
with (security_barrier=true) as
select p.spot_id,p.concept_key,
  coalesce(c.display_labels->>'de',c.canonical_label) label,
  c.canonical_label,
  case when p.eligible_contributors>=2 then p.concept_contributors else null end concept_contributors,
  case when p.eligible_contributors>=2 then p.eligible_contributors else null end eligible_contributors,
  case when p.eligible_contributors>=2 then p.percentage else null end percentage,
  case when p.eligible_contributors>=2 then 'ESTABLISHED'::text else 'EARLY'::text end evidence_state,
  p.rank,p.rebuilt_at
from public.backyrd_spot_mood_profile_v1 p
join public.backyrd_mood_concepts_v1 c on c.concept_key=p.concept_key and c.active;

comment on view public.backyrd_spot_mood_profile_public_v1 is
 'Public Mood display: counts and display evidence are available from two distinct eligible contributors per Spot; one-person counts remain masked. Internal aggregate/Decision evidence keeps its separate three-person threshold. No contributor identities or raw expressions.';
