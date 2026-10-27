begin;
do $$
declare field text; term text;
begin
  foreach field in array array['description.highlight','description.discovery_source','discovery.profile','experience.profile'] loop
    foreach term in array array['Rhassoul','RHASSOUL','Hamam mit Seifenschaum-Massage und Rhassoul','Chateaubriand','Chateau Margaux'] loop
      if world_knowledge_private.text_requires_shadow_v1(field,to_jsonb(term)) then
        raise exception 'legitimate treatment or culinary word held: % in %',term,field;
      end if;
    end loop;
    foreach term in array array['Hass','hassen','Hassrede','Rassenhass','Selbsthass','hasserfüllt','Rhassoul und Hass','Rhassoul-Hass','RhassoulHass','xRhassoul','Rhassouls','rassistisch','Nazi','hate','HATE','hate speech','hate-speech','hatespeech','hateful','haters','hated','kill','illegal','verboten'] loop
      if not world_knowledge_private.text_requires_shadow_v1(field,to_jsonb(term)) then
        raise exception 'existing safety signal lost: % in %',term,field;
      end if;
    end loop;
  end loop;
  if world_knowledge_private.text_requires_shadow_v1('experience.profile','{"offers":[{"name":"Hamam","properties":[{"value":"Rhassoul"}]}]}'::jsonb) then
    raise exception 'structured wellness treatment held';
  end if;
  if not world_knowledge_private.text_requires_shadow_v1('experience.profile','{"offers":[{"name":"Rhassoul"},{"name":"Hassrede"}]}'::jsonb) then
    raise exception 'benign word masked a different safety signal';
  end if;
  if world_knowledge_private.text_requires_shadow_v1('identity.name',to_jsonb('Hass'::text)) then
    raise exception 'detector scope expanded';
  end if;
end $$;
rollback;
