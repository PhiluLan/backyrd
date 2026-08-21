export const SEMANTIC_CONTRACT_VERSION = "backyrd-canonical-semantics-v1";
export const CURRENT_MOMENT_VERSION = "backyrd-current-moment-schema-v2";

export const FROZEN_TASTE_CONCEPTS = Object.freeze([
  "vibe.cozy","vibe.relaxed","vibe.romantic","vibe.lively","vibe.quiet","vibe.social","vibe.inspiring","vibe.playful","vibe.elegant","vibe.authentic","vibe.urban",
  "energy.calm","energy.balanced","energy.energetic",
  "social_style.solo_friendly","social_style.conversation_friendly","social_style.group_friendly","social_style.family_friendly","social_style.romantic_friendly",
  "occasion.work_friendly","occasion.celebration_friendly","occasion.morning_friendly","occasion.afternoon_friendly","occasion.evening_friendly",
  "price.budget","price.balanced_price","price.premium",
  "discovery.mainstream","discovery.hidden_gem","discovery.novel",
  "character.design_led","character.authentic_character","character.distinctive",
  "environment.indoor","environment.outdoor",
  "place_type.cafe","place_type.bar","place_type.restaurant","place_type.nightlife","place_type.culture","place_type.outing","place_type.activity","place_type.experience","place_type.hotel","place_type.other"
]);
const CONCEPT_LABELS=Object.freeze({
 "vibe.cozy":["gemütlich","cozy"],"vibe.relaxed":["entspannt","relaxed"],"vibe.romantic":["romantisch","romantic"],"vibe.lively":["lebendig","lively"],"vibe.quiet":["ruhig","quiet"],"vibe.social":["gesellig","social"],"vibe.inspiring":["inspirierend","inspiring"],"vibe.playful":["spielerisch","playful"],"vibe.elegant":["elegant","elegant"],"vibe.authentic":["authentisch wirkend","authentic-feeling"],"vibe.urban":["urban","urban"],
 "energy.calm":["ruhige Energie","calm energy"],"energy.balanced":["ausgewogene Energie","balanced energy"],"energy.energetic":["energiegeladen","energetic"],
 "social_style.solo_friendly":["gut allein","solo-friendly"],"social_style.conversation_friendly":["gut zum Reden","conversation-friendly"],"social_style.group_friendly":["gruppenfreundlich","group-friendly"],"social_style.family_friendly":["familienfreundlich","family-friendly"],"social_style.romantic_friendly":["gut für ein Date","date-friendly"],
 "occasion.work_friendly":["arbeitsgeeignet","work-friendly"],"occasion.celebration_friendly":["für Feiern geeignet","celebration-friendly"],"occasion.morning_friendly":["morgens passend","morning-friendly"],"occasion.afternoon_friendly":["nachmittags passend","afternoon-friendly"],"occasion.evening_friendly":["abends passend","evening-friendly"],
 "price.budget":["preisgünstig","budget"],"price.balanced_price":["mittleres Preisniveau","balanced price"],"price.premium":["Premium-Preisniveau","premium"],
 "discovery.mainstream":["bekannt","mainstream"],"discovery.hidden_gem":["Geheimtipp","hidden gem"],"discovery.novel":["neu zu entdecken","novel"],
 "character.design_led":["designgeprägt","design-led"],"character.authentic_character":["authentischer Charakter","authentic character"],"character.distinctive":["eigenständig","distinctive"],
 "environment.indoor":["drinnen","indoor"],"environment.outdoor":["draußen","outdoor"],
 "place_type.cafe":["Café","café"],"place_type.bar":["Bar","bar"],"place_type.restaurant":["Restaurant","restaurant"],"place_type.nightlife":["Nachtleben","nightlife"],"place_type.culture":["Kultur","culture"],"place_type.outing":["Ausflug","outing"],"place_type.activity":["Aktivität","activity"],"place_type.experience":["Erlebnis","experience"],"place_type.hotel":["Hotel","hotel"],"place_type.other":["Anderes","other"]
});
export const CANONICAL_CONCEPTS=Object.freeze(FROZEN_TASTE_CONCEPTS.map((key)=>Object.freeze({key,family:key.split(".")[0],labels:{de:CONCEPT_LABELS[key][0],en:CONCEPT_LABELS[key][1]}})));

export const FROZEN_N4_EXTENSION_DIMENSIONS = Object.freeze([
  "planning.low_friction","planning.high_commitment","occasion.kids_friendly","occasion.group_friendly","context.night_friendly","context.weekday_friendly","context.weekend_friendly"
]);

export const N4_FACT_DIMENSIONS = Object.freeze(["city","place_type","price_level","accessibility","environment","reservation_character","duration_character","spot_id"]);
export const FROZEN_N4_DIMENSIONS = Object.freeze([...N4_FACT_DIMENSIONS,...FROZEN_TASTE_CONCEPTS,...FROZEN_N4_EXTENSION_DIMENSIONS]);

export const PLACE_TYPES = Object.freeze(["cafe","bar","restaurant","nightlife","culture","outing","activity","experience","hotel","other"]);
export const CATEGORY_PLACE_TYPE = Object.freeze({
  "aktivität":"activity", "aussichtspunkt":"outing", "bar":"bar", "besonderes erlebnis":"experience",
  "café":"cafe", "event":"experience", "kino":"culture", "museum":"culture", "nachtleben":"nightlife",
  "restaurant":"restaurant", "spaziergang":"outing", "unterkunft / hotel":"hotel", "weinbar":"bar", "wellness & spa":"experience"
});

export const PRODUCT_MOODS = Object.freeze([
  {id:"cozy",labels:{de:"gemütlich",en:"cozy"},aliases:["gemütlich","gemuetlich","cozy","cosy"],concept:"vibe.cozy",direction:1,status:"QUALIFYING"},
  {id:"lively",labels:{de:"lebendig",en:"lively"},aliases:["lebendig","lebhaft","lively"],concept:"vibe.lively",direction:1,status:"QUALIFYING"},
  {id:"romantic",labels:{de:"romantisch",en:"romantic"},aliases:["romantisch","romantic"],concept:"vibe.romantic",direction:1,status:"QUALIFYING"},
  {id:"loud",labels:{de:"laut",en:"loud"},aliases:["laut","loud"],concept:"vibe.lively",direction:-1,status:"QUALIFYING"},
  {id:"quiet",labels:{de:"leise",en:"quiet"},aliases:["leise","ruhig","quiet"],concept:"vibe.quiet",direction:1,status:"QUALIFYING"},
  {id:"authentic",labels:{de:"authentisch",en:"authentic"},aliases:["authentisch","authentic"],concept:"character.authentic_character",direction:1,status:"QUALIFYING"},
  {id:"hidden",labels:{de:"versteckt",en:"hidden"},aliases:["versteckt","hidden"],concept:"discovery.hidden_gem",direction:1,status:"QUALIFYING"},
  {id:"modern",labels:{de:"modern",en:"modern"},aliases:["modern"],concept:"character.design_led",direction:1,status:"QUALIFYING"},
  {id:"urban",labels:{de:"urban",en:"urban"},aliases:["urban"],concept:null,direction:0,status:"DISPLAY_ONLY"},
  {id:"instagrammable",labels:{de:"instagrammable",en:"instagrammable"},aliases:["instagrammable"],concept:null,direction:0,status:"DISPLAY_ONLY"},
  {id:"chill",labels:{de:"chillig",en:"chill"},aliases:["chillig","chill"],concept:null,direction:0,status:"DISPLAY_ONLY"},
  {id:"rustic",labels:{de:"rustikal",en:"rustic"},aliases:["rustikal","rustic"],concept:null,direction:0,status:"DISPLAY_ONLY"}
]);

export const FACT_KEYS = Object.freeze({
  IDENTITY_NAME:"identity.name",LOCATION_CITY:"location.city",LOCATION_COORDINATES:"location.coordinates",CATEGORY_PRIMARY:"category.primary",PLACE_TYPE:"place_type",OPENING_REGULAR:"opening.regular",OPENING_STATUS:"opening.status",
  FAMILY_KIDS:"suitability.family_kids", AGE:"suitability.age", ENVIRONMENT:"suitability.environment", RAIN:"suitability.rain",
  ACTIVITY:"activity.types", CONVERSATION:"suitability.conversation", SOCIAL:"social.suitability", ACCESSIBILITY:"accessibility.capabilities",
  PRICE:"price.level", DAYPART:"time.dayparts",RESERVATION:"reservation.character",DURATION:"duration.character",NOISE:"character.noise"
});
export const CANONICAL_FACTS=Object.freeze([
 {key:FACT_KEYS.IDENTITY_NAME,type:"TEXT"},{key:FACT_KEYS.LOCATION_CITY,type:"CITY"},{key:FACT_KEYS.LOCATION_COORDINATES,type:"GEO_POINT"},{key:FACT_KEYS.CATEGORY_PRIMARY,type:"CATEGORY_REF"},{key:FACT_KEYS.PLACE_TYPE,type:"ENUM",values:PLACE_TYPES},{key:FACT_KEYS.PRICE,type:"INTEGER_1_5"},{key:FACT_KEYS.OPENING_REGULAR,type:"SCHEDULE"},{key:FACT_KEYS.OPENING_STATUS,type:"ENUM",values:["OPEN","TEMPORARILY_CLOSED","CLOSED","UNKNOWN"]},
 {key:FACT_KEYS.FAMILY_KIDS,type:"ENUM",values:["SUITABLE","NOT_SUITABLE","UNKNOWN"]},{key:FACT_KEYS.AGE,type:"STRUCTURED_OBJECT",fields:["min_age","max_age","adult_supervision_required"]},{key:FACT_KEYS.ENVIRONMENT,type:"ENUM",values:["INDOOR","OUTDOOR","MIXED","UNKNOWN"]},{key:FACT_KEYS.RAIN,type:"ENUM",values:["SUITABLE","LIMITED","NOT_SUITABLE","UNKNOWN"]},{key:FACT_KEYS.ACTIVITY,type:"MULTI_ENUM"},{key:FACT_KEYS.CONVERSATION,type:"ENUM",values:["HIGH","MEDIUM","LOW","UNKNOWN"]},{key:FACT_KEYS.NOISE,type:"ENUM",values:["QUIET","MODERATE","LOUD","VARIABLE","UNKNOWN"]},{key:FACT_KEYS.SOCIAL,type:"MAP_TRISTATE"},{key:FACT_KEYS.ACCESSIBILITY,type:"MAP_TRISTATE"},{key:FACT_KEYS.RESERVATION,type:"ENUM",values:["WALK_IN","RECOMMENDED","REQUIRED","BOOK_AHEAD","UNKNOWN"]},{key:FACT_KEYS.DURATION,type:"ENUM",values:["SHORT","MEDIUM","LONG","FLEXIBLE","UNKNOWN"]},{key:FACT_KEYS.DAYPART,type:"MULTI_ENUM"}
]);
export const CONTEXT_KEYS=Object.freeze({social:["solo","date","friends","family","family_with_kids","work","group","unknown"],occasion:["breakfast","lunch","afterwork","dinner","late_night","celebration","tourist","business","casual","unknown"],provenance:["EXPLICIT","INFERRED","OBSERVED","UNKNOWN"]});
export const REVIEW_ORIGINS = Object.freeze({SMART_REVIEW:{reviewOrigin:"SMART_REVIEW",productEvidenceOrigin:"smart_review_v1"},STANDARD_REVIEW:{reviewOrigin:"STANDARD_REVIEW",productEvidenceOrigin:null}});
export const EVIDENCE_AUTHORITIES = Object.freeze({SELF_DECLARED:"DECLARED",DIRECT_REVIEW:"DIRECT_REVIEW",COMPARATIVE:"COMPARATIVE",BEHAVIORAL:"BEHAVIORAL",CURRENT_MOMENT:"CURRENT_CONTEXT_ONLY"});
export const FACTUAL_REASON_CODES = Object.freeze(["RAIN_SUITABLE","INDOOR_MATCH","CHILD_AGE_MATCH","FAMILY_SUITABLE","ACTIVITY_MATCH","ACCESSIBILITY_MATCH"]);
export const INVALID_SEMANTIC_INPUTS = Object.freeze(["a","b","i","l","s","test","test a","test b","test1","test2","v","unmapped-mood"]);

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("de-CH");
const fold = (value) => normalize(value).normalize("NFKD").replace(/[\u0300-\u036f]/g,"");

export function categoryToPlaceType(category) {
  const key=normalize(category);
  if(Object.hasOwn(CATEGORY_PLACE_TYPE,key)) return {status:"KNOWN",category:key,placeType:CATEGORY_PLACE_TYPE[key],contractVersion:SEMANTIC_CONTRACT_VERSION};
  return {status:"UNKNOWN",category:key||null,placeType:null,contractVersion:SEMANTIC_CONTRACT_VERSION};
}

export function canonicalizeProductMood(value) {
  const key=fold(value);
  if(!key||INVALID_SEMANTIC_INPUTS.includes(key))return{status:"INVALID",moodId:null,concept:null,direction:0,contractVersion:SEMANTIC_CONTRACT_VERSION};
  const mood=PRODUCT_MOODS.find((row)=>row.aliases.some((alias)=>fold(alias)===key));
  if(!mood)return{status:"UNMAPPED",moodId:null,concept:null,direction:0,contractVersion:SEMANTIC_CONTRACT_VERSION};
  return{status:mood.status,moodId:mood.id,canonicalLabel:mood.labels.de,concept:mood.concept,direction:mood.direction,contractVersion:SEMANTIC_CONTRACT_VERSION};
}

export function reviewOriginPair({reviewOrigin,productEvidenceOrigin}) {
  const smart=reviewOrigin==="SMART_REVIEW"||productEvidenceOrigin==="smart_review_v1";
  const standard=reviewOrigin==="STANDARD_REVIEW";
  if(smart&&standard)throw new Error("review_origin_conflict");
  return smart?REVIEW_ORIGINS.SMART_REVIEW:standard?REVIEW_ORIGINS.STANDARD_REVIEW:null;
}

export function assertRegistryIntegrity(){
  if(FROZEN_TASTE_CONCEPTS.length!==45||new Set(FROZEN_TASTE_CONCEPTS).size!==45)throw new Error("frozen_taste_registry_changed");
  if(FROZEN_N4_DIMENSIONS.length!==60||new Set(FROZEN_N4_DIMENSIONS).size!==60)throw new Error("frozen_n4_registry_changed");
  if(Object.keys(CATEGORY_PLACE_TYPE).length!==14)throw new Error("category_adapter_incomplete");
  return true;
}
