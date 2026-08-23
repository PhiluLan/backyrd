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

// Human-facing authoring metadata. Canonical keys stay server-owned; clients use
// this registry only to render the same questions and labels across Admin/Owner.
export const HUMAN_SPOT_SECTIONS = Object.freeze([
  {key:"ACTIVITY_DETAILS",label:"Was kann man hier machen?",description:"Wähle nur Aktivitäten, die am Ort tatsächlich angeboten werden."},
  {key:"SUITABILITY",label:"Eignung & Besuch",description:"Beschreibe den Ort ehrlich. „Weiß ich nicht“ ist eine gültige Antwort."},
  {key:"AUDIENCE_SOCIAL",label:"Für wen und welche Stimmung?",description:"Hier geht es um die typische Eignung des Ortes, nicht um einzelne Events."},
]);

export const HUMAN_SPOT_FIELDS = Object.freeze({
  "activity.types":{question:"Was kann man hier machen?",help:"Mehrfachauswahl aus dem gemeinsamen Backyrd-Aktivitätskatalog."},
  "suitability.environment":{question:"Wo findet das Erlebnis hauptsächlich statt?",labels:{INDOOR:"Drinnen",OUTDOOR:"Draußen",MIXED:"Drinnen und draußen",UNKNOWN:"Weiß ich nicht"}},
  "suitability.rain":{question:"Wie gut eignet sich der Ort bei Regen?",labels:{SUITABLE:"Gut geeignet",LIMITED:"Teilweise geeignet",NOT_SUITABLE:"Eher nicht geeignet",UNKNOWN:"Weiß ich nicht"}},
  "suitability.family_kids":{question:"Ist der Ort grundsätzlich für Familien mit Kindern geeignet?",labels:{SUITABLE:"Ja",NOT_SUITABLE:"Nein",UNKNOWN:"Weiß ich nicht"}},
  "audience.basic":{question:"Für wen eignet sich der Ort grundsätzlich?",help:"Eine einfache Mehrfachauswahl; detaillierte Einschätzungen sind mit Owner Pro möglich."},
  "reservation.recommended":{question:"Ist eine Reservierung grundsätzlich empfohlen?",labels:{YES:"Ja",NO:"Nein",UNKNOWN:"Weiß ich nicht"}},
  "duration.approximate":{question:"Wie lange dauert ein typischer Besuch ungefähr?",help:"Eine grobe, sachliche Spanne in Minuten."},
  "suitability.age":{question:"Für welches Alter eignet sich der Ort sinnvoll?",help:"Nur angeben, wenn dies zuverlässig bekannt ist. Alter darf unbekannt bleiben."},
  "social.suitability":{question:"Für wen passt der Ort?",help:"Bewerte jede Situation einzeln."},
  "atmosphere.descriptors":{question:"Wie fühlt sich der Ort typischerweise an?",help:"Nur passende, belegbare Beschreibungen wählen."},
  "character.noise":{question:"Wie laut ist es normalerweise?",labels:{QUIET:"Ruhig",MODERATE:"Mittel",LOUD:"Laut",VARIABLE:"Unterschiedlich",UNKNOWN:"Weiß ich nicht"}},
  "suitability.conversation":{question:"Wie gut kann man sich unterhalten?",labels:{HIGH:"Sehr gut",MEDIUM:"Gut",LOW:"Eher schwierig",UNKNOWN:"Weiß ich nicht"}},
  "reservation.character":{question:"Wie spontan kann man den Ort besuchen?",labels:{WALK_IN:"Einfach vorbeikommen",RECOMMENDED:"Reservierung empfohlen",REQUIRED:"Reservierung erforderlich",BOOK_AHEAD:"Vorausplanung nötig",UNKNOWN:"Weiß ich nicht"}},
  "duration.character":{question:"Wie lange bleibt man typischerweise?",labels:{SHORT:"Bis etwa 1 Stunde",MEDIUM:"Etwa 1–2 Stunden",LONG:"Mehr als 2 Stunden",FLEXIBLE:"Sehr unterschiedlich",UNKNOWN:"Weiß ich nicht"}},
  "accessibility.capabilities":{question:"Welche Barrierefreiheits-Eigenschaften sind vorhanden?",help:"Jede Eigenschaft separat mit Ja, Nein oder Unbekannt erfassen."},
  "time.dayparts":{question:"Wann passt der Ort besonders gut?",help:"Nicht aus Öffnungszeiten ableiten; nur qualitative Eignung auswählen."},
  "signature.characteristics":{question:"Was macht den Ort besonders?",help:"Kurze menschliche Highlights. Sie werden nicht automatisch zu Taste-Wahrheit."},
});

export const HUMAN_VALUE_LABELS = Object.freeze({
  UNKNOWN:"Weiß ich nicht",SUITABLE:"Gut geeignet",NOT_SUITABLE:"Eher nicht geeignet",
  SOLO:"Alleine",DATE:"Date",FRIENDS:"Freunde",FAMILY:"Familien",GROUPS:"Gruppen",WORK:"Business / Arbeit",
  MORNING:"Morgens",AFTERNOON:"Nachmittags",EVENING:"Abends",NIGHT:"Nachts",WEEKDAY:"Werktags",WEEKEND:"Am Wochenende",
  MUSEUM:"Museum / Ausstellung",CULTURE:"Kultur",WORKSHOP:"Workshop",SPORTS:"Sport",CLIMBING:"Klettern",BOULDERING:"Bouldern",GAMING:"Gaming",QUIZ:"Quiz",KARAOKE:"Karaoke",ANIMALS:"Tiere",WATERPARK:"Wasserpark",HISTORY:"Geschichte",LIVE_MUSIC:"Live-Musik",CONCERT:"Konzert",WALK:"Spazieren",PLAYGROUND:"Spielplatz",OTHER:"Anderes",
  COZY:"Gemütlich",RELAXED:"Entspannt",ROMANTIC:"Romantisch",LIVELY:"Lebendig",QUIET:"Ruhig",SOCIAL:"Gesellig",INSPIRING:"Inspirierend",PLAYFUL:"Verspielt",ELEGANT:"Elegant",DESIGN_LED:"Designgeprägt",AUTHENTIC:"Authentisch",HIDDEN_GEM:"Besonders / Geheimtipp",
});

export const HUMAN_CONTEXT_LABELS = Object.freeze({solo:"Alleine",date:"Date",friends:"Freunde",family:"Familien",groups:"Gruppen",work:"Business / Arbeit"});
export const HUMAN_ACCESSIBILITY_LABELS = Object.freeze({step_free:"Stufenlos erreichbar",wheelchair_spaces:"Rollstuhlgerecht",accessible_toilet:"Barrierefreies WC",elevator:"Aufzug",hearing_support:"Unterstützung für Hörbeeinträchtigte",assistance_dogs:"Assistenzhunde erlaubt"});
export const HUMAN_OBJECT_FIELD_LABELS = Object.freeze({min_age:"Ab welchem Alter",max_age:"Bis zu welchem Alter",adult_supervision_required:"Begleitung durch Erwachsene erforderlich",min_minutes:"Mindestens",max_minutes:"Höchstens"});
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
