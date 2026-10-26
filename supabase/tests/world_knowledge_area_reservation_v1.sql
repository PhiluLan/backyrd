-- Run after 20261024171707_scoped_area_reservation_rules_v1.sql in an isolated DB.
begin;
do $$
declare base jsonb; scoped jsonb;
begin
 base:='{"contractVersion":"backyrd.world-knowledge.experience-profile@1.0","category":"DRINKS","properties":[],"areas":[{"id":"test-indoor","kind":"INDOOR","name":"Innenbereich","properties":[]}],"offers":[],"reviewed":true}'::jsonb;
 scoped:=jsonb_set(base,'{areas,0,properties}',jsonb_build_array(jsonb_build_object('key','participation.booking','label',null,'state','KNOWN','value','Im Innenbereich reservieren wir Plätze für 4 bis 30 Personen.','conditions',jsonb_build_object('weekdays','[]'::jsonb,'dayparts','[]'::jsonb,'event',null,'validFrom',null,'validUntil',null))));
-- backyrd:authorization-positive
 -- Internal validator accepts the valid backward-compatible and area-scoped profiles.
 if not world_knowledge_private.experience_profile_valid_v3(base) then raise exception 'baseline profile rejected';end if;
 if not world_knowledge_private.experience_profile_valid_v3(scoped) then raise exception 'area booking rejected';end if;
 if world_knowledge_private.experience_profile_valid_v2(scoped) then raise exception 'historic validator was changed';end if;
 if not world_knowledge_private.attribute_value_valid_v7('backyrd.world-knowledge.registry@2.5','experience.profile','KNOWN_VALUE',scoped) then raise exception 'active dispatcher rejected area booking';end if;
 if world_knowledge_private.experience_profile_valid_v3(jsonb_set(scoped,'{areas,0,properties,0,value}','true'::jsonb)) then raise exception 'wrong booking type accepted';end if;
 if world_knowledge_private.experience_profile_valid_v3(jsonb_set(scoped,'{properties}',scoped#>'{areas,0,properties}')) then raise exception 'area-only property accepted at spot scope';end if;
-- backyrd:authorization-negative
 -- Client roles cannot execute this private validator directly.
 if has_function_privilege('anon','world_knowledge_private.experience_profile_valid_v3(jsonb)','EXECUTE') or has_function_privilege('authenticated','world_knowledge_private.experience_profile_valid_v3(jsonb)','EXECUTE') then raise exception 'private validator exposed';end if;
end $$;
rollback;
