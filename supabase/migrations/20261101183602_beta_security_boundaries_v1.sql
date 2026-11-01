-- Fix lookup authority without changing function bodies, invoker status or ACLs.
-- Only schemas already closed to untrusted CREATE may precede pg_temp.
do $$ begin
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE')
 or has_schema_privilege('anon','extensions','CREATE') or has_schema_privilege('authenticated','extensions','CREATE') then
  raise exception 'beta_security_trusted_schema_create_boundary_invalid';
 end if;
end $$;

alter function public.backyrd_claim_domain_root_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_claim_email_domain_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_claim_norm_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_claim_tokens_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_context_feature_learning_multiplier_v1(text,numeric,text,text,text,text,jsonb) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_decision_context_key_v1(text,text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_get_decision_context_v2(text,integer[],text,integer) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_get_decision_debug_v11(text,integer[],text,integer,numeric,numeric,numeric,numeric) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_get_decision_debug_v2(text,integer[],text,integer,numeric,numeric) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_get_decision_debug_v3(text,integer[],text,integer,numeric,numeric) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_get_decision_debug_v4(text,integer[],text,integer,numeric,numeric) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_get_decision_spots_v10(text,integer[],text,integer) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_get_decision_spots_v9(text,integer[],text,integer) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_gold_default_human_scope_v1() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_infer_place_type_from_category_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_jsonb_collect_texts_v1(jsonb,text[]) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_ml_clean_text_v13(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_ml_event_strength_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_ml_feature_cap_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_ml_norm_text_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_normalize_owner_email_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_normalize_owner_phone_v1(text,text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_normalize_owner_website_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_owner_text_risk_flags_v1(text[]) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_place_type_event_strength_v1(text,numeric) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_place_type_from_category_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_place_type_label_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_set_updated_at_v1() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.backyrd_touch_updated_at_v1() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.current_user_id() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.get_my_admin_role_v1() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.match_mood(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.mood_tokens_set_token_norm() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.normalize_mood_text(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.rebuild_user_taste_profile_v3(numeric,numeric) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.rpc_match_mood(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.safety_owner_change_text_v1(text,jsonb) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.safety_text_has_local_policy_violation_v1(text) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.set_profiles_updated_at_v1() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.set_spot_intelligence_updated_at_v1() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.set_updated_at() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.spots_with_review_count() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.touch_spot_descriptions_updated_at() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.touch_spot_enrichment_jobs_updated_at() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.touch_updated_at() set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.validate_owner_spot_contact_v1(text,text,text,text) set search_path = pg_catalog, public, extensions, pg_temp;

-- Preserve the deliberate privacy projection and existing public API shape.
-- Do NOT grant raw aggregate access or switch to invoker under wider base ACLs.
-- Public Mood signals must obey the same Spot visibility as public count RPCs.
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
join public.backyrd_mood_concepts_v1 c on c.concept_key=p.concept_key and c.active
join public.spots s on s.id=p.spot_id
where s.status='approved'
  and coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE')
  and public.distribution_trust_entity_is_eligible_v1('spot',s.id,'discovery');

comment on view public.backyrd_spot_mood_profile_public_v1 is
 'Deliberate security-barrier privacy projection: only approved, distribution-eligible Product Spots. Contributor identities and raw expressions never exposed; one-person counts masked. Existing two-person public display and separate internal Decision threshold preserved. Base table remains admin-only; owner evaluation is intentional.';

-- Internal workers/backfills have no client use and no in-body actor checks.
-- Keep service-role execution for the existing Edge worker; deny browser RPC entry.
revoke all on function public.backyrd_backfill_contextual_taste_v1(integer) from public,anon,authenticated;
grant execute on function public.backyrd_backfill_contextual_taste_v1(integer) to service_role;
revoke all on function public.backyrd_backfill_place_type_preferences_v1(integer) from public,anon,authenticated;
grant execute on function public.backyrd_backfill_place_type_preferences_v1(integer) to service_role;
revoke all on function public.backyrd_backfill_taxonomy_embeddings_v1(integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.backyrd_backfill_taxonomy_embeddings_v1(integer,integer,boolean) to service_role;
revoke all on function public.backyrd_claim_spot_embedding_jobs_v13(integer) from public,anon,authenticated;
grant execute on function public.backyrd_claim_spot_embedding_jobs_v13(integer) to service_role;
revoke all on function public.backyrd_embedding_queue_status_v13() from public,anon,authenticated;
grant execute on function public.backyrd_embedding_queue_status_v13() to service_role;
revoke all on function public.backyrd_embedding_status_v13() from public,anon,authenticated;
grant execute on function public.backyrd_embedding_status_v13() to service_role;
revoke all on function public.backyrd_get_pending_spot_embedding_documents_v13(integer) from public,anon,authenticated;
grant execute on function public.backyrd_get_pending_spot_embedding_documents_v13(integer) to service_role;
revoke all on function public.backyrd_mark_spot_embedding_job_done_v13(uuid,text) from public,anon,authenticated;
grant execute on function public.backyrd_mark_spot_embedding_job_done_v13(uuid,text) to service_role;
revoke all on function public.backyrd_refresh_all_spot_ml_documents_v13(integer) from public,anon,authenticated;
grant execute on function public.backyrd_refresh_all_spot_ml_documents_v13(integer) to service_role;
revoke all on function public.upsert_cluster_and_map_token(integer,text,numeric,text) from public,anon,authenticated;
grant execute on function public.upsert_cluster_and_map_token(integer,text,numeric,text) to service_role;
