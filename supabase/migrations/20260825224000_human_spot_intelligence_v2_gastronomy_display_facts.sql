-- Honest gastronomy/purpose authoring through the existing canonical
-- DISPLAY_ONLY signature fact. This does not extend N4 or Decision semantics.
insert into public.backyrd_human_spot_questions_v2
(question_id,section_id,label_de,help_de,control_type,canonical_field_key,mapping_class,archetypes,common,priority,sort_order,options,relevance,engine_use,owner_access)
values(
  'purpose.gastronomy','PURPOSE','Wofür kommen Gäste hauptsächlich hierher?',
  'Diese bestätigten Angaben beschreiben den Ort. Backyrd zeigt sie an, nutzt Bier, Essen, Apéro oder Afterwork aber noch nicht als eigenes Decision-Signal.',
  'MULTI_CHOICE','signature.characteristics','CANONICAL_WRITE',
  array['BREWPUB','BAR','COCKTAIL_BAR','WINE_BAR','RESTAURANT','CAFE','BAKERY','NIGHTLIFE','MULTI_PURPOSE'],false,'ESSENTIAL',15,
  '[
    {"id":"drink","label":"Etwas trinken","value":"PURPOSE_DRINK"},
    {"id":"beer","label":"Bier trinken","value":"OFFERING_BEER"},
    {"id":"craft_beer","label":"Craft Beer entdecken","value":"OFFERING_CRAFT_BEER","archetypes":["BREWPUB","BAR"]},
    {"id":"own_beer","label":"Vor Ort gebrautes Bier","value":"OFFERING_OWN_BEER","archetypes":["BREWPUB"]},
    {"id":"wine","label":"Wein trinken","value":"OFFERING_WINE","archetypes":["WINE_BAR","BAR","RESTAURANT"]},
    {"id":"cocktails","label":"Cocktails trinken","value":"OFFERING_COCKTAILS","archetypes":["COCKTAIL_BAR","BAR","NIGHTLIFE"]},
    {"id":"coffee","label":"Kaffee trinken","value":"OFFERING_COFFEE","archetypes":["CAFE","BAKERY","RESTAURANT"]},
    {"id":"eat","label":"Etwas essen","value":"PURPOSE_EAT"},
    {"id":"snacks","label":"Snacks / kleine Gerichte","value":"OFFERING_SNACKS"},
    {"id":"meals","label":"Vollständige Mahlzeiten","value":"OFFERING_FULL_MEALS","archetypes":["BREWPUB","RESTAURANT","CAFE"]},
    {"id":"breakfast","label":"Frühstück","value":"OFFERING_BREAKFAST","archetypes":["CAFE","BAKERY","RESTAURANT"]},
    {"id":"brunch","label":"Brunch","value":"OFFERING_BRUNCH","archetypes":["CAFE","RESTAURANT"]},
    {"id":"apero","label":"Apéro","value":"PURPOSE_APERO","archetypes":["BREWPUB","BAR","COCKTAIL_BAR","WINE_BAR","RESTAURANT"]},
    {"id":"afterwork","label":"Afterwork","value":"PURPOSE_AFTERWORK","archetypes":["BREWPUB","BAR","COCKTAIL_BAR","WINE_BAR"]},
    {"id":"meet_friends","label":"Freunde treffen","value":"PURPOSE_MEET_FRIENDS"},
    {"id":"sit_together","label":"Zusammensitzen","value":"PURPOSE_SIT_TOGETHER"},
    {"id":"date","label":"Date / Abend zu zweit","value":"PURPOSE_DATE"},
    {"id":"group","label":"Gruppenabend","value":"PURPOSE_GROUP"},
    {"id":"long_stay","label":"Länger verweilen","value":"PURPOSE_LONG_STAY"}
  ]'::jsonb,'{}'::jsonb,array['DISPLAY_ONLY'],'OWNER_BASIC'
);

comment on table public.backyrd_human_spot_questions_v2 is
'Authoritative Human Spot Intelligence V2 whitelist. DISPLAY_ONLY engine_use is canonical descriptive truth but grants no factual match, ranking or reason authority.';
