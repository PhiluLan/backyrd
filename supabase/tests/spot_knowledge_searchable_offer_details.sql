-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
do $$
declare
  c jsonb := '{"weekdays":[],"dayparts":[],"event":null,"validFrom":null,"validUntil":null}'::jsonb;
  p jsonb;
  fact jsonb;
  key text;
  role_name text;
begin
  p := jsonb_build_object('contractVersion','backyrd.world-knowledge.experience-profile@1.0',
    'category','ACTIVITIES_PLAY','reviewed',true,'properties','[]'::jsonb,'areas','[]'::jsonb,
    'offers',jsonb_build_array(jsonb_build_object('id','course','kind','WORKSHOP','name','Töpferkurs',
      'areaIds','[]'::jsonb,'properties','[]'::jsonb,'prices','[]'::jsonb,'schedule','[]'::jsonb,
      'validFrom',null,'validUntil',null)));
  if not world_knowledge_private.experience_profile_valid_v4(p) then raise exception 'old profile rejected';end if;
  foreach key in array array['participation.group_access','participation.subscription'] loop
    fact := jsonb_build_object('key',key,'label',null,'state','KNOWN','value','Einzelanmeldung möglich','conditions',c);
    p := jsonb_set(p,'{offers,0,properties}',jsonb_build_array(fact));
    if not world_knowledge_private.experience_profile_valid_v4(p) then raise exception 'new offer fact rejected: %',key;end if;
    if not world_knowledge_private.attribute_value_valid_v7('backyrd.world-knowledge.registry@2.5','experience.profile','KNOWN_VALUE',p) then raise exception 'claim validator not routed';end if;
    if world_knowledge_private.experience_profile_valid_v3(p) then raise exception 'historical validator changed';end if;
    if world_knowledge_private.experience_profile_valid_v4(jsonb_set(p,'{properties}',jsonb_build_array(fact))) then raise exception 'new fact widened to spot';end if;
    if world_knowledge_private.experience_profile_valid_v4(jsonb_set(p,'{offers,0,properties,0,value}','true'::jsonb)) then raise exception 'wrong value type accepted';end if;
    if world_knowledge_private.experience_profile_valid_v4(jsonb_set(p,'{offers,0,properties,0,state}','"UNKNOWN"'::jsonb)) then raise exception 'unknown with text accepted';end if;
    p := jsonb_set(p,'{offers,0,properties,0,state}','"UNKNOWN"'::jsonb);
    if not world_knowledge_private.experience_profile_valid_v4(jsonb_set(p,'{offers,0,properties,0,value}','null'::jsonb)) then raise exception 'explicit unknown rejected';end if;
  end loop;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(role_name,'world_knowledge_private.experience_profile_valid_v4(jsonb)','EXECUTE') then raise exception 'private validator exposed: %',role_name;end if;
    if has_function_privilege(role_name,'world_knowledge_private.attribute_value_valid_v7(text,text,text,jsonb)','EXECUTE') then raise exception 'private claim validator exposed: %',role_name;end if;
  end loop;
end $$;
rollback;
