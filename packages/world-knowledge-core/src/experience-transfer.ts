import { WORLD_VALUE_LABELS } from "./experience-language.js";
import { parseAttributeValue } from "./contracts.js";
import { emptyExperienceConditions, getExperienceQuestions, type ExperienceProperty, type ExperienceProfile, type ExperienceScope } from "./experience-profile.js";
/** Draft-only reuse. The editor must select a real scope and confirm before saving. */
export type ExperienceReuseSuggestion = { readonly id:string; readonly sourceKey:string; readonly label:string; readonly property:ExperienceProperty };
const mappings:Readonly<Record<string,string>>={"offering.cuisines":"food.cuisine","offering.food_specialities":"food.dish","accessibility.step_free_entrance":"amenity.step_free"};
const amenities:Readonly<Record<string,string>>={TOILET:"amenity.toilet",HIGH_CHAIR:"amenity.high_chair",CHANGING_TABLE:"amenity.changing_table",PARKING:"amenity.parking",PLAY_AREA:"amenity.playground",COVERED_OUTDOOR:"condition.weather_protection"};

export function experienceReuseSuggestions(answers:Readonly<Record<string,unknown>>,now:string):readonly ExperienceReuseSuggestion[]{
 const suggestions:ExperienceReuseSuggestion[]=[];
 for(const [sourceKey,raw] of Object.entries(answers)){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;
  const row=raw as Record<string,unknown>;
  if(row.knowledgeState!=="KNOWN_VALUE")continue;
  const day=now.slice(0,10);
  if(typeof row.validFrom==="string"&&row.validFrom.slice(0,10)>day||typeof row.validUntil==="string"&&row.validUntil.slice(0,10)<day)continue;
  if(!mappings[sourceKey]&&sourceKey!=="amenity.features")continue;
  let parsed:unknown;try{parsed=parseAttributeValue(sourceKey,row.value);}catch{continue;}
  const values=Array.isArray(parsed)?parsed:[parsed];
  for(const [i,value] of values.entries()){
   const key=sourceKey==="amenity.features"&&typeof value==="string"?amenities[value]:mappings[sourceKey];if(!key)continue;
   const propertyValue=sourceKey==="amenity.features"?true:typeof value==="string"?WORLD_VALUE_LABELS[value]??value:value;
   if(typeof propertyValue!=="string"&&typeof propertyValue!=="boolean")continue;
   suggestions.push({id:`${sourceKey}:${i}`,sourceKey,label:`${sourceKey=== "amenity.features"?String(value):String(propertyValue)}`,property:{key,label:null,state:"KNOWN",value:propertyValue,conditions:{...emptyExperienceConditions(),validFrom:typeof row.validFrom==="string"?row.validFrom.slice(0,10):null,validUntil:typeof row.validUntil==="string"?row.validUntil.slice(0,10):null}}});
  }
 }
 return suggestions;
}
export function reuseExperienceProperty(profile:ExperienceProfile,suggestion:ExperienceReuseSuggestion,target:{readonly scope:ExperienceScope;readonly id:string|null}):ExperienceProfile{
 const offer=profile.offers.find(o=>o.id===target.id);
 if(target.scope==="OFFER"&&!offer||target.scope==="AREA"&&!profile.areas.some(a=>a.id===target.id))throw new Error("experience_reuse_target_invalid");
 if(!getExperienceQuestions(profile.category,target.scope,offer?.kind).some(q=>q.key===suggestion.property.key))throw new Error("experience_reuse_scope_invalid");
 const append=(values:readonly ExperienceProperty[])=>values.some(v=>JSON.stringify(v)===JSON.stringify(suggestion.property))?values:[...values,suggestion.property];
 return {...profile,reviewed:false,properties:target.scope==="SPOT"?append(profile.properties):profile.properties,areas:profile.areas.map(a=>target.scope==="AREA"&&a.id===target.id?{...a,properties:append(a.properties)}:a),offers:profile.offers.map(o=>target.scope==="OFFER"&&o.id===target.id?{...o,properties:append(o.properties)}:o)};
}
