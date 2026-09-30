-- Research completion is distinct from provider completion: proposals remain
-- immutable and only an Admin review can close the visible work item.
alter table public.world_research_automation_jobs_v1
  add column reviewed_at timestamptz,
  add column reviewed_by uuid,
  add column review_outcome text
    check (review_outcome in ('IMPORTED', 'NO_CHANGES')),
  add constraint world_research_automation_review_completion_consistent_v1
    check ((reviewed_at is null and review_outcome is null and reviewed_by is null)
      or (reviewed_at is not null and review_outcome is not null));

-- Existing imported provenance is conclusive evidence of an Admin import.
-- The older proposal for the same Spot is retained but no longer presented as
-- actionable once a later reviewed proposal exists.
update public.world_research_automation_jobs_v1 j
set reviewed_at = e.imported_at, review_outcome = 'IMPORTED', updated_at = greatest(j.updated_at, e.imported_at)
from (
  select batch_id, spot_id, count(*) as imported_count, max(created_at) as imported_at
  from world_knowledge_private.research_claim_evidence_v1
  group by batch_id, spot_id
) e
where j.status = 'READY_FOR_REVIEW'
  and j.spot_id = e.spot_id
  and j.export_document#>>'{batch,batchId}' = e.batch_id::text
  and e.imported_count >= jsonb_array_length(j.result_document#>'{research,spots,0,claims}')
  and j.reviewed_at is null;

comment on column public.world_research_automation_jobs_v1.reviewed_at is
  'Admin review completion, separate from provider completed_at. Null means the proposal remains actionable.';
comment on column public.world_research_automation_jobs_v1.review_outcome is
  'IMPORTED when canonical research provenance was written; NO_CHANGES when the Admin deliberately closed a fully reviewed proposal without writes.';
