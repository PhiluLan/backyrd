-- Preserve explicit TEST/FIXTURE provenance for privileged database jobs while
-- continuing to make the authenticated Product boundary authoritative.

create or replace function public.backyrd_assign_review_provenance_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    new.data_origin := 'REAL';
    new.review_origin := case
      when new.product_evidence_origin = 'smart_review_v1' then 'SMART_REVIEW'
      else 'STANDARD_REVIEW'
    end;
  elsif new.data_origin = 'REAL' and new.product_evidence_origin = 'smart_review_v1' then
    new.review_origin := 'SMART_REVIEW';
  elsif new.review_origin = 'SMART_REVIEW' then
    new.product_evidence_origin := 'smart_review_v1';
  end if;

  if new.review_origin = 'SMART_REVIEW'
     and new.product_evidence_origin is distinct from 'smart_review_v1' then
    raise exception 'smart_review_origin_contract_mismatch' using errcode = '22023';
  end if;

  return new;
end
$$;

revoke all on function public.backyrd_assign_review_provenance_v1() from public, anon;
grant execute on function public.backyrd_assign_review_provenance_v1() to authenticated, service_role;

comment on function public.backyrd_assign_review_provenance_v1() is
  'Forces authenticated Product writes to REAL provenance while preserving explicit privileged TEST/FIXTURE/IMPORT origins.';
