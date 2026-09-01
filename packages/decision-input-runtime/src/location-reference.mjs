import { BASEL_DECISION_LOCATIONS,SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const LOCATION_REFERENCE_RESOLUTION_VERSION="backyrd-location-reference-resolution-v1";
export const LOCATION_CONFIG_VERSION="backyrd-decision-location-config-v1";
export const MIN_DEFAULT_NEAR_RADIUS_M=100;
export const MAX_DEFAULT_NEAR_RADIUS_M=2000;
const BASEL_CENTER=Object.freeze({latitude:47.5596,longitude:7.5886});
const CITY_REFERENCE_ALIASES=Object.freeze({basel:Object.freeze({bahnhof:"BASEL_SBB",hauptbahnhof:"BASEL_SBB","basel bahnhof":"BASEL_SBB"})});
const clean=(value)=>String(value??"").trim().replace(/\s+/g," ");
const normalized=(value)=>clean(value).toLocaleLowerCase("de-CH").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ß/g,"ss");
const compact=(value)=>normalized(value).replace(/[^a-z0-9]/g,"");
const radians=(value)=>Number(value)*Math.PI/180;
export const distanceKm=(left,right)=>{
  if(!Number.isFinite(Number(left?.latitude))||!Number.isFinite(Number(left?.longitude))||!Number.isFinite(Number(right?.latitude))||!Number.isFinite(Number(right?.longitude)))return null;
  const dLat=radians(Number(right.latitude)-Number(left.latitude)),dLon=radians(Number(right.longitude)-Number(left.longitude));
  const a=Math.sin(dLat/2)**2+Math.cos(radians(left.latitude))*Math.cos(radians(right.latitude))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
export function configuredNearDistanceKm({locationReference,runtimeConfig}={}){
  if(locationReference?.distanceSource==="REQUEST_EXPLICIT"){
    const explicit=Number(locationReference.maxDistanceKm);
    return Number.isFinite(explicit)&&explicit>=.05&&explicit<=15?explicit:null;
  }
  if(locationReference?.distanceSource!=="ADMIN_CONFIG")return null;
  const radiusM=Number(runtimeConfig?.defaultNearRadiusM);
  if(runtimeConfig?.version!==LOCATION_CONFIG_VERSION||runtimeConfig?.cityKey!=="basel"||runtimeConfig?.status!=="ACTIVE"||!Number.isInteger(radiusM)||radiusM<MIN_DEFAULT_NEAR_RADIUS_M||radiusM>MAX_DEFAULT_NEAR_RADIUS_M)return null;
  return radiusM/1000;
}
const registryLocation=(key,maxDistanceKm)=>{
  const row=BASEL_DECISION_LOCATIONS[key];
  return row?{key,kind:row.kind,label:row.label,latitude:row.latitude,longitude:row.longitude,maxDistanceKm:Number(maxDistanceKm??row.defaultRadiusKm),resolutionSource:"CANONICAL_BASEL_REFERENCE",sourceIdentity:`${SEMANTIC_CONTRACT_VERSION}:${key}`}:null;
};
const deterministicResolution=(reference,city,maxDistanceKm)=>{
  const value=normalized(reference),cityKey=normalized(city);
  const aliasKey=CITY_REFERENCE_ALIASES[cityKey]?.[value];
  if(aliasKey)return registryLocation(aliasKey,maxDistanceKm);
  const entry=Object.entries(BASEL_DECISION_LOCATIONS).find(([,row])=>normalized(row.label)===value||row.aliases.some((alias)=>normalized(alias)===value));
  return entry?registryLocation(entry[0],maxDistanceKm):null;
};
const exactNameScore=(reference,name)=>{
  const left=compact(reference),right=compact(name);
  if(!left||!right)return 0;
  if(left===right)return 1;
  if(right.startsWith(left)||left.startsWith(right))return .9;
  return 0;
};

export async function resolveLocationReference({reference,city,maxDistanceKm,googleApiKey,fetchImpl=globalThis.fetch,timeoutMs=1800}={}){
  const referenceText=clean(reference).slice(0,120),cityText=clean(city);
  if(!referenceText||normalized(cityText)!=="basel")return{status:"UNRESOLVED",reason:"REFERENCE_OR_CITY_UNSUPPORTED",version:LOCATION_REFERENCE_RESOLUTION_VERSION};
  const effectiveMaxDistanceKm=Number(maxDistanceKm);
  if(!Number.isFinite(effectiveMaxDistanceKm)||effectiveMaxDistanceKm<.05||effectiveMaxDistanceKm>15)return{status:"UNRESOLVED",reason:"NEAR_RADIUS_INVALID",version:LOCATION_REFERENCE_RESOLUTION_VERSION};
  const deterministic=deterministicResolution(referenceText,cityText,effectiveMaxDistanceKm);
  if(deterministic)return{status:"RESOLVED",location:deterministic,version:LOCATION_REFERENCE_RESOLUTION_VERSION};
  if(!clean(googleApiKey))return{status:"UNRESOLVED",reason:"SERVER_RESOLVER_UNAVAILABLE",version:LOCATION_REFERENCE_RESOLUTION_VERSION};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl("https://places.googleapis.com/v1/places:searchText",{
      method:"POST",signal:controller.signal,
      headers:{"content-type":"application/json","x-goog-api-key":googleApiKey,"x-goog-fieldmask":"places.id,places.displayName,places.formattedAddress,places.location"},
      body:JSON.stringify({textQuery:`${referenceText}, ${cityText}, Switzerland`,pageSize:5,languageCode:"de",regionCode:"CH",locationBias:{circle:{center:BASEL_CENTER,radius:15000}}}),
    });
    if(!response.ok)return{status:"UNRESOLVED",reason:`PROVIDER_HTTP_${response.status}`,version:LOCATION_REFERENCE_RESOLUTION_VERSION};
    const payload=await response.json();
    const candidates=(Array.isArray(payload?.places)?payload.places:[]).map((place)=>({
      id:clean(place?.id),label:clean(place?.displayName?.text),address:clean(place?.formattedAddress),
      latitude:Number(place?.location?.latitude),longitude:Number(place?.location?.longitude),
      score:exactNameScore(referenceText,place?.displayName?.text),
    })).filter((row)=>row.id&&row.label&&Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)&&distanceKm(BASEL_CENTER,row)<=15&&row.score>=.9)
      .sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label));
    const exact=candidates.filter((row)=>row.score===1);
    const selected=exact.length===1?exact[0]:exact.length>1?null:candidates.length===1?candidates[0]:null;
    if(!selected)return{status:"UNRESOLVED",reason:candidates.length>1?"REFERENCE_AMBIGUOUS":"REFERENCE_NOT_FOUND",version:LOCATION_REFERENCE_RESOLUTION_VERSION};
    return{status:"RESOLVED",location:{key:`GOOGLE_PLACE:${selected.id}`,kind:"LANDMARK",label:selected.label,latitude:selected.latitude,longitude:selected.longitude,maxDistanceKm:effectiveMaxDistanceKm,resolutionSource:"GOOGLE_PLACES_TEXT_SEARCH",sourceIdentity:`google-place:${selected.id}`,formattedAddress:selected.address},version:LOCATION_REFERENCE_RESOLUTION_VERSION};
  }catch(error){return{status:"UNRESOLVED",reason:error?.name==="AbortError"?"PROVIDER_TIMEOUT":"PROVIDER_FAILED",version:LOCATION_REFERENCE_RESOLUTION_VERSION};}
  finally{clearTimeout(timer);}
}

export function bindResolvedLocationIntent(intent,resolution){
  if(resolution?.status!=="RESOLVED"||!resolution.location)throw new Error("location_reference_not_resolved");
  const location=resolution.location,currentRequestFacts=intent?.currentRequestFacts??{},hardConstraints=intent?.hardConstraints??{};
  return{
    ...intent,
    currentRequestFacts:{...currentRequestFacts,location:{value:location,provenance:"EXPLICIT",sourceRef:location.sourceIdentity,semanticContractVersion:SEMANTIC_CONTRACT_VERSION}},
    hardConstraints:{...hardConstraints,location,locationReferenceResolution:{status:"RESOLVED",version:resolution.version,sourceIdentity:location.sourceIdentity}},
  };
}

export function verifiedLocationEvidence({location,distanceKm:measured}={}){
  const maxDistanceKm=Number(location?.maxDistanceKm),distance=Number(measured);
  if(!location?.label||!location?.sourceIdentity||!Number.isFinite(distance)||!Number.isFinite(maxDistanceKm)||distance<0||distance>maxDistanceKm)return null;
  return{label:location.label,distanceKm:distance,maxDistanceKm,referencePoint:{latitude:Number(location.latitude),longitude:Number(location.longitude)},sourceIdentity:location.sourceIdentity,resolutionSource:location.resolutionSource};
}

export function locationReason(evidence,existingReason=""){
  const verified=verifiedLocationEvidence({location:{...evidence,latitude:evidence?.referencePoint?.latitude,longitude:evidence?.referencePoint?.longitude},distanceKm:evidence?.distanceKm});
  if(!verified)return null;
  const meters=Math.round(verified.distanceKm*1000),base=`${verified.label} ist ${meters} m entfernt – innerhalb deiner angefragten Nähe.`;
  const suffix=clean(existingReason);
  return suffix?`${base} ${suffix}`:base;
}
