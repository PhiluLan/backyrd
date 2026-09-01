const INTERNAL_INSTRUCTION = /(?:respect the user's concrete current intent|old taste patterns|if category or audience is clear|prefer matching categories strongly|find places that match the selected direction|category and current intent are more important|use previous taste only as a soft tie-breaker|find places that match the current intent first|personal taste is only a soft signal)/i;

const clean = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export function containsInternalDecisionText(value) {
  return typeof value === "string" && INTERNAL_INSTRUCTION.test(value);
}

export function sanitizeLiveProductQuery(body = {}) {
  const rawFreeText = clean(body.rawFreeText);
  if (rawFreeText) return rawFreeText;
  return String(body.query ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !containsInternalDecisionText(line))
    .join("\n");
}

export function sanitizeLiveProductRequestBody(body = {}) {
  return { ...body, query: sanitizeLiveProductQuery(body) };
}

export function sanitizeLiveProductCandidate(candidate, authorizedReason) {
  const {_internal_product_evidence:_internalProductEvidence,...publicCandidate}=candidate??{};
  const safeReason = containsInternalDecisionText(authorizedReason) ? null : clean(authorizedReason) || null;
  return {
    ...publicCandidate,
    human_reason: safeReason,
    technical_why_this: null,
    document_preview: null,
    explanation: undefined,
    matched_tokens: (Array.isArray(candidate?.matched_tokens) ? candidate.matched_tokens : []).filter((value) => !containsInternalDecisionText(value)),
    matched_terms: (Array.isArray(candidate?.matched_terms) ? candidate.matched_terms : []).filter((value) => !containsInternalDecisionText(value)),
  };
}

export function selectLiveCandidateUniverse(candidates, limit = 10) {
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const id = String(candidate?.spot_id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);
}

export const LIVE_RETRIEVAL_SOURCE_LIMIT=20;
// Production traces showed that a relevant Gold candidate could sit just
// outside a ten-row fusion window and therefore never reach factual matching.
// Keep the window bounded, but let the orchestrator evaluate the complete
// measured internal retrieval window before it freezes the visible result.
export const LIVE_ELIGIBLE_HANDOFF_LIMIT=20;

const lower=(value)=>String(value??"").trim().toLocaleLowerCase("de-CH");
const candidatePlaceType=(candidate)=>lower(candidate?.place_type||candidate?.canonical_place_type);
const radians=(value)=>Number(value)*Math.PI/180;
const distanceKm=(left,right)=>{
  if(!Number.isFinite(Number(left?.latitude))||!Number.isFinite(Number(left?.longitude))||!Number.isFinite(Number(right?.latitude))||!Number.isFinite(Number(right?.longitude)))return null;
  const dLat=radians(Number(right.latitude)-Number(left.latitude)),dLon=radians(Number(right.longitude)-Number(left.longitude));
  const a=Math.sin(dLat/2)**2+Math.cos(radians(left.latitude))*Math.cos(radians(right.latitude))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
const WEEKDAYS=Object.freeze({MONDAY:["monday","montag"],TUESDAY:["tuesday","dienstag"],WEDNESDAY:["wednesday","mittwoch"],THURSDAY:["thursday","donnerstag"],FRIDAY:["friday","freitag"],SATURDAY:["saturday","samstag"],SUNDAY:["sunday","sonntag"]});
const resolvedWeekday=(value)=>{
  if(value!=="TODAY")return value;
  return new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:"Europe/Zurich"}).format(new Date()).toUpperCase();
};
const minutes=(value)=>{const match=String(value??"").match(/^(\d{1,2}):(\d{2})/);return match?Number(match[1])*60+Number(match[2]):null;};
const segments=(start,end)=>start===null||end===null?[]:end>start?[[start,end]]:[[start,1440],[0,end]];
const overlaps=(left,right)=>left.some(([a,b])=>right.some(([c,d])=>Math.max(a,c)<Math.min(b,d)));
const supportsTemporalWindow=(hours,constraint)=>{
  if(!Array.isArray(hours)||hours.length===0)return null;
  const weekday=resolvedWeekday(constraint?.weekday);
  const aliases=WEEKDAYS[weekday]??[];
  const requested=segments(minutes(constraint?.start),minutes(constraint?.end));
  const rows=hours.filter((row)=>aliases.includes(lower(row?.day_of_week)));
  if(rows.length===0)return false;
  return rows.some((row)=>overlaps(segments(minutes(row?.open_time),minutes(row?.close_time)),requested));
};

const FRIENDS_CURRENT_INTENT=/\b(freund(?:e|en|eskreis)?|friends?|friend group)\b/;

// The frozen Current Intent interpreter remains untouched. This Product-boundary
// adapter closes a natural-language coverage gap before the canonical package is
// handed to N5/N4. It only projects an explicit value when no social context has
// already been established.
export function alignLiveProductCurrentIntent(canonicalIntent,rawText){
  const intent=canonicalIntent&&typeof canonicalIntent==="object"?canonicalIntent:{};
  const currentRequestFacts=intent.currentRequestFacts&&typeof intent.currentRequestFacts==="object"
    ? intent.currentRequestFacts:{};
  const existing=currentRequestFacts.socialContext;
  if(!FRIENDS_CURRENT_INTENT.test(lower(rawText))||(existing?.value&&existing.value!=="UNKNOWN"))return intent;
  const conceptDirections=Array.isArray(intent.conceptDirections)?[...intent.conceptDirections]:[];
  if(!conceptDirections.some((row)=>row?.concept==="vibe.social")){
    conceptDirections.push({concept:"vibe.social",direction:1,authority:"EXPLICIT_CURRENT_INTENT"});
  }
  return{
    ...intent,
    socialContext:"friends",
    conceptDirections,
    currentRequestFacts:{
      ...currentRequestFacts,
      socialContext:{value:"friends",authority:"EXPLICIT",provenance:"request:social_context"},
    },
  };
}

export function buildLiveCandidateFunnel(candidates,{city=null,canonicalIntent=null,limit=LIVE_ELIGIBLE_HANDOFF_LIMIT}={}){
  const hard=canonicalIntent?.hardConstraints??{};
  const excluded=new Set((hard.excludedPlaceTypes??canonicalIntent?.excludedPlaceTypes??[]).map(lower));
  const required=new Set((hard.requiredPlaceTypes??[]).map(lower));
  const seen=new Set(),rows=[],eligible=[];
  for(const [index,candidate] of (Array.isArray(candidates)?candidates:[]).entries()){
    const spotId=String(candidate?.spot_id??"");
    const reasons=[];
    if(!spotId)reasons.push("CANDIDATE_ID_MISSING");
    else if(seen.has(spotId))reasons.push("DUPLICATE_CANDIDATE");
    if(spotId)seen.add(spotId);
    const placeType=candidatePlaceType(candidate);
    const internalEvidence=candidate?._internal_product_evidence??{};
    if(hard.unsatisfiable===true)reasons.push("CONTRADICTORY_INTENT");
    if(excluded.has(placeType))reasons.push("EXCLUDED_PLACE_TYPE");
    if(required.size&&!required.has(placeType))reasons.push("REQUIRED_PLACE_TYPE_MISMATCH");
    if(city&&candidate?.city&&lower(candidate.city)!==lower(city))reasons.push("CITY_MISMATCH");
    if(hard.openNow===true&&candidate?.is_open_now!==true)reasons.push(candidate?.is_open_now===false?"CLOSED_NOW":"OPENING_STATUS_UNKNOWN");
    if(hard.location){
      const measured=distanceKm(internalEvidence.coordinates,hard.location);
      if(measured===null)reasons.push("LOCATION_EVIDENCE_UNKNOWN");
      else if(measured>Number(hard.location.maxDistanceKm))reasons.push("LOCATION_MISMATCH");
    }
    if(hard.temporalEligibility){
      const supported=supportsTemporalWindow(internalEvidence.openingHours,hard.temporalEligibility);
      if(supported===null)reasons.push("OPENING_HOURS_UNKNOWN");
      else if(!supported)reasons.push("TIME_WINDOW_MISMATCH");
    }
    const row={
      spotId:spotId||null,name:clean(candidate?.name)||null,canonicalPlaceType:placeType||null,
      retrievalSources:Array.isArray(candidate?.sources)?candidate.sources:[],
      v12Rank:candidate?.v12_rank??null,v12Score:candidate?.v12_score??null,
      semanticRank:candidate?.semantic_rank??null,semanticSimilarity:candidate?.semantic_similarity??null,
      fusionRank:index+1,fusionScore:candidate?.combined_score??null,
      hardEligible:reasons.length===0,exclusionReasons:reasons,
      handoffStatus:"NOT_SELECTED",
    };
    if(reasons.length===0&&eligible.length<limit){eligible.push(candidate);row.handoffStatus="SELECTED";}
    else if(reasons.length===0)row.handoffStatus="POST_ELIGIBILITY_LIMIT";
    rows.push(row);
  }
  return{version:"backyrd-live-candidate-funnel-v1",sourceCount:rows.length,eligibleBeforeLimit:rows.filter((row)=>row.hardEligible).length,limit,selected:eligible,rows};
}
