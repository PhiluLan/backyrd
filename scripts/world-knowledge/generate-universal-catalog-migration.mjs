import {readFileSync,writeFileSync} from 'node:fs';
import * as w from '../../packages/world-knowledge-core/dist/index.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const old=readFileSync(root+'/supabase/migrations/20261014072400_world_knowledge_scoped_experience_cards_v2_4.sql','utf8');
const sport=readFileSync(root+'/supabase/migrations/20261014211339_scoped_sport_authoring_catalog_v1_1.sql','utf8');
const q=v=>v===null||v===undefined?'null':"'"+String(v).replaceAll("'","''")+"'";
const j=v=>q(JSON.stringify(v))+'::jsonb';
const fn=(name,source=old)=>{const start=source.search(new RegExp('create(?: or replace)? function '+name.replaceAll('.','\\.')+'\\('));if(start<0)throw Error('missing:'+name);const end=source.indexOf('$$;',start);if(end<0)throw Error('unterminated:'+name);return source.slice(start,end+3);};
let sql=`-- Universal spot catalogue v2: explicit classifications, independent offers and areas.
-- Forward-only. Previous registry, policy, validators and manifests remain verifiable.
-- No production content backfill; existing authorisation/RLS and RPC signatures are preserved.
`;
const release=w.SLICE4F_REGISTRY_RELEASE,policy=w.ACCEPTED_SOURCE_POLICY,entitlement=w.ACCEPTED_ENTITLEMENT_POLICY;
sql+=`insert into world_knowledge_private.registry_releases(registry_version,registry_hash,predecessor_version,change_class,definitions,release_hash,approved_at,created_at) values(${q(w.REGISTRY_VERSION)},${q(w.REGISTRY_HASH)},${q(w.REGISTRY_V2_4_VERSION)},'ADDITIVE_ALLOWED_VALUE',${j(w.ATTRIBUTE_DEFINITIONS)},${q(release.releaseHash)},${q(release.createdAt)},${q(release.createdAt)});\n`;
for(const a of w.ATTRIBUTE_DEFINITIONS)sql+=`insert into world_knowledge_private.attribute_definitions(registry_version,attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization) values(${q(w.REGISTRY_VERSION)},${q(a.key)},${q(a.valueType)},${a.allowedValues?j(a.allowedValues):'null'},${a.min??'null'},${a.max??'null'},${q(a.engineAuthorization)});\n`;
sql+=`insert into world_knowledge_private.governance_approval_records(registry_version,authority_class,authority_reference,approved_at,record_hash) values(${q(w.REGISTRY_VERSION)},'PRODUCT_CTO',${q(w.SLICE4F_REGISTRY_APPROVAL_RECORD.recordId)},${q(release.createdAt)},${q(w.SLICE4F_REGISTRY_APPROVAL_RECORD.approvalHash)});\n`;
sql+=`insert into world_knowledge_private.source_policy_releases(policy_version,policy_hash,registry_version,registry_hash,policy,state,approved_at) values(${q(policy.policyVersion)},${q(policy.policyHash)},${q(w.REGISTRY_VERSION)},${q(w.REGISTRY_HASH)},${j(policy)},'ACCEPTED',${q(release.createdAt)});\n`;
sql+=`insert into world_knowledge_private.source_policy_attribute_rules select ${q(policy.policyVersion)},attribute_key,allowed_source_types,allowed_actor_types,source_reference_requirement,self_assertion_allowed,verification_process_ids,freshness_policy_ref,allowed_use_cases from world_knowledge_private.source_policy_attribute_rules where policy_version='backyrd.world-knowledge.source-policy@4e.1';\n`;
sql+=`insert into world_knowledge_private.entitlement_policy_releases(policy_version,policy_hash,registry_version,policy,state,approved_at) values(${q(entitlement.policyVersion)},${q(entitlement.policyHash)},${q(w.REGISTRY_VERSION)},${j(entitlement)},'ACCEPTED',${q(release.createdAt)});\n`;
sql+=`insert into world_knowledge_private.entitlement_attribute_rules select ${q(entitlement.policyVersion)},actor_scope,attribute_key from world_knowledge_private.entitlement_attribute_rules where policy_version='backyrd.world-knowledge.entitlement-policy@4e.1';\n`;
const validator=fn('world_knowledge_private.experience_profile_valid_v1',sport).replace('create or replace function world_knowledge_private.experience_profile_valid_v1','create function world_knowledge_private.experience_profile_valid_v2').replace(/'\{"type":"object"[\s\S]+?'::jsonb,p_value\)/,j(w.EXPERIENCE_PROFILE_SCHEMA)+',p_value)');
if(!validator.includes(JSON.stringify(w.EXPERIENCE_PROFILE_SCHEMA)))throw Error('schema_embedding_failed');sql+='\n'+validator+'\nrevoke all on function world_knowledge_private.experience_profile_valid_v2(jsonb) from public,anon,authenticated,service_role;\n';
sql+=`create function world_knowledge_private.attribute_value_valid_v7(p_registry_version text,p_attribute_key text,p_state text,p_value jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
 if p_registry_version<>${q(w.REGISTRY_VERSION)} then return false;end if;
 if p_state='UNKNOWN' then return p_value is null or p_value='null'::jsonb;end if;
 if p_attribute_key='experience.profile' then return p_state='KNOWN_VALUE' and world_knowledge_private.experience_profile_valid_v2(p_value);end if;
 if p_attribute_key='classification.place_types' then return p_state='KNOWN_VALUE' and world_knowledge_private.experience_json_schema_matches_v1(${j({type:'array',minItems:1,maxItems:20,uniqueItems:true,items:{enum:w.PLACE_TYPES}})},p_value);end if;
 return world_knowledge_private.attribute_value_valid_v6('backyrd.world-knowledge.registry@2.4',p_attribute_key,p_state,p_value);
end $$;
revoke all on function world_knowledge_private.attribute_value_valid_v7(text,text,text,jsonb) from public,anon,authenticated,service_role;
create function world_knowledge_private.validate_claim_insert_v7() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.registry_version=${q(w.REGISTRY_VERSION)} and not world_knowledge_private.attribute_value_valid_v7(new.registry_version,new.attribute_key,new.knowledge_state,new.value) then raise exception 'invalid_attribute_value' using errcode='22023';end if;
 return new;
end $$;
revoke all on function world_knowledge_private.validate_claim_insert_v7() from public,anon,authenticated,service_role;
create trigger world_00_validate_claim_insert_v7 before insert on world_knowledge_private.claims for each row execute function world_knowledge_private.validate_claim_insert_v7();
`;
const replacements=[['backyrd.world-knowledge.registry@2.4',w.REGISTRY_VERSION],['backyrd.world-knowledge.source-policy@4e.1',policy.policyVersion],['backyrd.world-knowledge.entitlement-policy@4e.1',entitlement.policyVersion],['2.4.0','2.5.0'],['world_knowledge_private.attribute_value_valid_v6','world_knowledge_private.attribute_value_valid_v7'],['world_knowledge_private.submit_authoritative_claim_v5','world_knowledge_private.submit_authoritative_claim_v6'],['world_knowledge_private.resolution_input_components_v6','world_knowledge_private.resolution_input_components_v7']];
const rewrite=body=>replacements.reduce((s,[a,b])=>s.replaceAll(a,b),body);
for(const name of ['world_knowledge_private.submit_authoritative_claim_v5','world_knowledge_private.resolution_input_components_v6','world_knowledge_private.authoring_actor_v1','public.world_owner_submit_claim_v1','public.world_admin_submit_claim_v1','public.world_product_owner_submit_claim_v1','public.world_product_admin_submit_claim_v1','public.world_shadow_rebuild_spot_v1','public.world_authoring_submit_taxonomy_candidate_v1','public.world_product_authoring_detail_v1','public.world_product_discovery_prepare_context_v1']){
 let body=rewrite(fn(name));
 // The new resolver may promote a pointer from any earlier accepted registry.
 if(name==='public.world_shadow_rebuild_spot_v1')body=body.replaceAll("'backyrd.world-knowledge.registry@2.3')","'backyrd.world-knowledge.registry@2.3','backyrd.world-knowledge.registry@2.4')");
 sql+='\n'+body+'\n';
}
// The complete live context and integrity dispatcher must accept old and new manifests.
let integrity=fn('world_knowledge_private.validate_resolution_manifest_v1');integrity=integrity.replace('  expected_components:=case','  expected_components:=case\n    when m.registry_version='+q(w.REGISTRY_VERSION)+' then world_knowledge_private.resolution_input_components_v7(m.spot_id,m.as_of,m.ledger_cutoff_at)');sql+='\n'+integrity+'\n';
let context=fn('public.backyrd_decision_vnext_product_context_v5');context=context.replace("and ((m.registry_version=",`and ((m.registry_version=${q(w.REGISTRY_VERSION)} and m.policy_version=${q(policy.policyVersion)}) or (m.registry_version=`);sql+='\n'+context+'\n';
sql+=`revoke all on function world_knowledge_private.submit_authoritative_claim_v6(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;\n`;
// Signature is copied exactly from the existing private function (see explicit revokes below).
sql=sql.replace(/revoke all on function world_knowledge_private.submit_authoritative_claim_v6\([^\n]+\n/,'');
sql+=`do $acl$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_knowledge_private' and p.proname in ('submit_authoritative_claim_v6','resolution_input_components_v7') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $acl$;\n`;
// Existing category-first invariant remains. Only the new registry permits
// independent canonical place types; old registry semantics remain unchanged.
const categoryGuard=fn('world_knowledge_private.validate_category_place_type_insert_v1',readFileSync(root+'/supabase/migrations/20260912084654_world_knowledge_slice_4a_authoring_product_readiness.sql','utf8'))
 .replace('if not world_knowledge_private.category_place_types_allowed_v1(current_category, new.value) then',"if new.registry_version <> '"+w.REGISTRY_VERSION+"' and not world_knowledge_private.category_place_types_allowed_v1(current_category, new.value) then");
sql+='\n'+categoryGuard+'\n';
writeFileSync(root+'/supabase/migrations/20261015110000_universal_spot_catalog_v2_5.sql',sql);
console.log(JSON.stringify({registry:w.REGISTRY_VERSION,hash:w.REGISTRY_HASH,policy:policy.policyVersion,bytes:sql.length,spots:w.SPOT_TYPE_CATALOG.length,offers:w.OFFER_CATALOG.length}));
