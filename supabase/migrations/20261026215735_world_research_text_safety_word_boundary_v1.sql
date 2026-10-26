-- Keep the existing safety policy and its scope; match the English hate word
-- family as words, rather than the letters inside culinary names such as
-- Chateaubriand or Chateau. Existing held claims are not released by this change.
begin;
create or replace function world_knowledge_private.text_requires_shadow_v1(p_attribute_key text,p_value jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_attribute_key in ('description.highlight','description.discovery_source','discovery.profile','experience.profile')
    and case when p_attribute_key in ('discovery.profile','experience.profile') then coalesce(p_value::text,'') else coalesce(p_value#>>'{}','') end
      ~* '(rassist|nazi|\mhate(s|d|rs?|ful(ly|ness)?|speech)?\M|hass|kill|illegal|verboten)';
$$;
comment on function world_knowledge_private.text_requires_shadow_v1(text,jsonb) is
  'Existing content-safety hold policy; English hate terms use word boundaries so culinary names such as Chateaubriand do not produce a substring false positive. No automatic release of existing held claims.';
commit;
