-- Complete the bounded candidate-window alignment at the storage boundary.
-- The previous forward migration updated the service RPC, while this check
-- still enforced the original ten-candidate integration limit.
alter table public.backyrd_internal_decision_handoffs_v1
  drop constraint if exists backyrd_internal_decision_handoffs_v1_candidate_ids_check;

alter table public.backyrd_internal_decision_handoffs_v1
  add constraint backyrd_internal_decision_handoffs_v1_candidate_ids_check
  check(cardinality(candidate_ids) between 1 and 20);

