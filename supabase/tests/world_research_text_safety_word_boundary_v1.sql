begin;
do $$
declare field text; term text;
begin
  foreach field in array array['description.highlight','description.discovery_source','discovery.profile','experience.profile'] loop
    if world_knowledge_private.text_requires_shadow_v1(field,to_jsonb('Chateaubriand, Fondue Bacchus und Zürcher Geschnetzeltes.'::text)) then
      raise exception 'culinary word false positive for %',field;
    end if;
    if world_knowledge_private.text_requires_shadow_v1(field,to_jsonb('Chateau Margaux'::text)) then
      raise exception 'wine name false positive for %',field;
    end if;
    foreach term in array array['hate','HATE','hate speech','hate-speech','hatespeech','hateful','hatefulness','haters','hated','rassistisch','Nazi','Hass','kill','illegal','verboten'] loop
      if not world_knowledge_private.text_requires_shadow_v1(field,to_jsonb(term)) then
        raise exception 'existing safety hold lost for % in %',term,field;
      end if;
    end loop;
  end loop;
  if world_knowledge_private.text_requires_shadow_v1('experience.profile','{"offers":[{"name":"Chateaubriand"}]}'::jsonb) then
    raise exception 'structured culinary word false positive';
  end if;
  if not world_knowledge_private.text_requires_shadow_v1('experience.profile','{"offers":[{"name":"hate"}]}'::jsonb) then
    raise exception 'structured safety signal lost';
  end if;
  if world_knowledge_private.text_requires_shadow_v1('identity.name',to_jsonb('hate'::text)) then
    raise exception 'safety scope was expanded';
  end if;
end $$;
rollback;
