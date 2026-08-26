-- Family / Child Moment Scope v1.
-- Additive context metadata only. childAge is retained in requested_context;
-- it never enters the frozen Taste concept or scope contracts.

alter table public.backyrd_decision_evidence_envelopes_v1
  alter column envelope_version set default 'backyrd-decision-evidence-envelope-v2';

alter table public.backyrd_decision_evidence_envelopes_v1
  add constraint backyrd_decision_evidence_child_age_v2 check (
    not (requested_context ? 'childAge') or (
      jsonb_typeof(requested_context->'childAge') = 'number'
      and (requested_context->>'childAge')::numeric = trunc((requested_context->>'childAge')::numeric)
      and (requested_context->>'childAge')::numeric between 0 and 120
    )
  ) not valid;

alter table public.backyrd_memory_event_evidence_envelopes_v1
  add constraint backyrd_memory_evidence_child_age_v2 check (
    not (requested_context ? 'childAge') or (
      jsonb_typeof(requested_context->'childAge') = 'number'
      and (requested_context->>'childAge')::numeric = trunc((requested_context->>'childAge')::numeric)
      and (requested_context->>'childAge')::numeric between 0 and 120
    )
  ) not valid;

alter table public.backyrd_decision_evidence_envelopes_v1
  validate constraint backyrd_decision_evidence_child_age_v2;
alter table public.backyrd_memory_event_evidence_envelopes_v1
  validate constraint backyrd_memory_evidence_child_age_v2;

comment on column public.backyrd_decision_evidence_envelopes_v1.moment_signature is
  'Immutable bounded learning moment. Canonical family_with_kids maps to the existing audience.family scope; child age remains non-Taste requested_context metadata.';
