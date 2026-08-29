-- The Stage runtime writes through the service role but must not receive
-- direct EXECUTE on the deterministic website helper. Run the table trigger
-- in its trusted owner boundary so EVIDENCE_PENDING inserts can proceed while
-- unsafe eligibility transitions still fail closed.

create or replace function public.backyrd_city_bootstrap_enforce_website_identity_v1()
returns trigger
language plpgsql security definer
set search_path=public,pg_catalog
as $$
begin
  if new.lifecycle_state in ('PRODUCT_ELIGIBLE','PUBLISHED')
    and not public.backyrd_city_bootstrap_website_matches_name_v1(new.display_name,new.website)
  then
    raise exception 'city_bootstrap_website_identity_ambiguous' using errcode='22023';
  end if;
  return new;
end $$;

revoke all on function public.backyrd_city_bootstrap_enforce_website_identity_v1()
  from public,anon,authenticated,service_role;

comment on function public.backyrd_city_bootstrap_enforce_website_identity_v1() is
  'Internal SECURITY DEFINER trigger boundary. Keeps website validation private while allowing authorized table writers to invoke it implicitly.';
