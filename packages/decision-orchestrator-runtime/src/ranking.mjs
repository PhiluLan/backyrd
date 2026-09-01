import { contentHash } from "../../decision-input-runtime/src/package.mjs";
import { FACT_KEYS,SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const DETERMINISTIC_RANKING_VERSION = "backyrd-deterministic-ranking-v5-verified-exactness";
export const REASON_AUTHORIZATION_VERSION = "backyrd-reason-authorization-v6-evidence-honesty";

const CONCEPT_LABELS = Object.freeze({
  "vibe.quiet":"ruhige Orte", "energy.calm":"eine ruhige Atmosphäre",
  "vibe.lively":"lebendige Orte", "energy.energetic":"viel Energie",
  "vibe.cozy":"gemütliche Orte", "vibe.romantic":"eine romantische Atmosphäre",
  "social_style.family_friendly":"einen familienfreundlichen Ort",
  "vibe.social":"einen geselligen Ort",
  "social_style.conversation_friendly":"Orte, an denen man sich gut unterhalten kann",
  "discovery.hidden_gem":"besondere, weniger offensichtliche Orte",
  "character.authentic_character":"authentische Orte", "vibe.authentic":"authentische Orte",
});
const PRESENT = (candidate) => new Map(candidate.n4.concepts.map((row)=>[row.concept,row]));
const rounded = (value) => Number(value.toFixed(6));
const evidenceStrength = (row) => (row?.presence ?? 0)*(row?.confidence ?? 0);

function momentConcepts(moment) {
  const fields=moment?.fields??{};
  const vibes=fields.vibe?.value??[];
  const activities=fields.activity_intent?.value??[];
  const social=fields.social_context?.value;
  const map={quiet:["vibe.quiet","energy.calm"],cozy:["vibe.cozy"],lively:["vibe.lively","energy.energetic"],romantic:["vibe.romantic"],authentic:["vibe.authentic","character.authentic_character"],exploratory:["discovery.hidden_gem"],drink:["place_type.bar"],food:["place_type.restaurant"],friends:["vibe.social"],date:["social_style.romantic_friendly"],family:["social_style.family_friendly"],solo:["social_style.solo_friendly"]};
  return [...new Set([...vibes,...activities,social].flatMap((key)=>map[key]??[]))];
}

const known=(row)=>row&&row.status!=="UNKNOWN"&&row.value!=="UNKNOWN";
const valueOf=(candidate,key)=>candidate.n4.suitabilityFacts?.[key];
const factual=(code,key,outcome,row,momentRef,requirement=null)=>({code,key,outcome,matched:outcome==="MATCH",sourceIdentity:row?.sourceIdentity??null,momentRef,requirement});

export function evaluateFactualCurrentIntent(candidate,currentMoment){
  const request=currentMoment?.currentRequestFacts??{},rows=[];
  const rain=valueOf(candidate,FACT_KEYS.RAIN),environment=valueOf(candidate,FACT_KEYS.ENVIRONMENT),family=valueOf(candidate,FACT_KEYS.FAMILY_KIDS),age=valueOf(candidate,FACT_KEYS.AGE),activities=valueOf(candidate,FACT_KEYS.ACTIVITY),accessibility=valueOf(candidate,FACT_KEYS.ACCESSIBILITY),duration=valueOf(candidate,FACT_KEYS.DURATION_APPROXIMATE),noise=valueOf(candidate,FACT_KEYS.NOISE),social=valueOf(candidate,FACT_KEYS.SOCIAL),conversation=valueOf(candidate,FACT_KEYS.CONVERSATION),reservation=valueOf(candidate,FACT_KEYS.RESERVATION),dayparts=valueOf(candidate,FACT_KEYS.DAYPART),price=valueOf(candidate,FACT_KEYS.PRICE);
  if(request.rain?.value&&request.rain.value!=="UNKNOWN"){
    if(known(rain))rows.push(factual("RAIN_SUITABLE",FACT_KEYS.RAIN,rain.value==="SUITABLE"?"MATCH":rain.value==="LIMITED"?"PARTIAL":"MISMATCH",rain,"currentRequestFacts.rain"));
    // Rain and indoor/outdoor are distinct facts. Indoor is useful positive
    // evidence for a rainy request, but outdoor alone is not a contradiction:
    // a covered outdoor experience may still be explicitly rain-suitable.
    if(known(environment)&&environment.value==="INDOOR")rows.push(factual("INDOOR_MATCH",FACT_KEYS.ENVIRONMENT,"MATCH",environment,"currentRequestFacts.rain"));
    if(known(environment)&&environment.value==="MIXED")rows.push(factual("INDOOR_MATCH",FACT_KEYS.ENVIRONMENT,"PARTIAL",environment,"currentRequestFacts.rain"));
  }
  if(request.familyContext?.value==="FAMILY_WITH_CHILD"&&known(family))rows.push(factual("FAMILY_SUITABLE",FACT_KEYS.FAMILY_KIDS,family.value==="SUITABLE"?"MATCH":"MISMATCH",family,"currentRequestFacts.familyContext"));
  if(Number.isInteger(request.childAge?.value)&&known(age)){
    const minimum=Number.isInteger(age.value?.min_age)?age.value.min_age:-Infinity,maximum=Number.isInteger(age.value?.max_age)?age.value.max_age:Infinity;
    rows.push(factual("CHILD_AGE_MATCH",FACT_KEYS.AGE,request.childAge.value>=minimum&&request.childAge.value<=maximum?"MATCH":"MISMATCH",age,"currentRequestFacts.childAge"));
  }
  if(request.activityTypes?.value?.length&&known(activities)){const offered=new Set(Array.isArray(activities.value)?activities.value:[]);rows.push(factual("ACTIVITY_MATCH",FACT_KEYS.ACTIVITY,request.activityTypes.value.some((item)=>offered.has(item))?"MATCH":"MISMATCH",activities,"currentRequestFacts.activityTypes"));}
  if(request.accessibility?.value&&known(accessibility))rows.push(factual("ACCESSIBILITY_MATCH",FACT_KEYS.ACCESSIBILITY,accessibility.value?.[request.accessibility.value]==="SUITABLE"?"MATCH":"MISMATCH",accessibility,"currentRequestFacts.accessibility"));
  if(request.environment?.value&&request.environment.value!=="UNKNOWN"&&known(environment)){
    const requested=request.environment.value,actual=environment.value;
    rows.push(factual(requested==="OUTDOOR"?"OUTDOOR_MATCH":"INDOOR_MATCH",FACT_KEYS.ENVIRONMENT,actual===requested?"MATCH":actual==="MIXED"?"PARTIAL":"MISMATCH",environment,"currentRequestFacts.environment"));
  }
  if(Number.isInteger(request.durationMinutes?.value)&&known(duration)){
    const maximum=Number.isInteger(duration.value?.max)?duration.value.max:null;
    const minimum=Number.isInteger(duration.value?.min)?duration.value.min:null;
    const requested=request.durationMinutes.value;
    rows.push(factual("DURATION_MATCH",FACT_KEYS.DURATION_APPROXIMATE,maximum!==null&&maximum<=requested?"MATCH":minimum!==null&&minimum>requested?"MISMATCH":"PARTIAL",duration,"currentRequestFacts.durationMinutes"));
  }
  if((currentMoment?.fields?.vibe?.value??[]).includes("quiet")&&known(noise))rows.push(factual("QUIET_MATCH",FACT_KEYS.NOISE,noise.value==="QUIET"?"MATCH":noise.value==="LOUD"?"MISMATCH":"PARTIAL",noise,"fields.vibe"));
  if(request.socialContext?.value&&known(social)){
    const key=request.socialContext.value==="family_with_kids"?"family":request.socialContext.value;
    const value=social.value?.[key];if(value&&value!=="UNKNOWN")rows.push(factual("SOCIAL_CONTEXT_MATCH",FACT_KEYS.SOCIAL,value==="SUITABLE"?"MATCH":"MISMATCH",social,"currentRequestFacts.socialContext"));
  }
  if(request.conversation?.value==="HIGH"&&known(conversation))rows.push(factual("CONVERSATION_MATCH",FACT_KEYS.CONVERSATION,conversation.value==="HIGH"?"MATCH":conversation.value==="MEDIUM"?"PARTIAL":"MISMATCH",conversation,"currentRequestFacts.conversation"));
  if(request.planning?.value==="WALK_IN"&&known(reservation))rows.push(factual("PLANNING_MATCH",FACT_KEYS.RESERVATION,reservation.value==="WALK_IN"?"MATCH":reservation.value==="RECOMMENDED"?"PARTIAL":"MISMATCH",reservation,"currentRequestFacts.planning"));
  if(request.dayparts?.value?.length&&known(dayparts)){const supported=new Set(Array.isArray(dayparts.value)?dayparts.value:[]);rows.push(factual("DAYPART_MATCH",FACT_KEYS.DAYPART,request.dayparts.value.every((value)=>supported.has(value))?"MATCH":"MISMATCH",dayparts,"currentRequestFacts.dayparts"));}
  if((Number.isInteger(request.priceMinimum?.value)||Number.isInteger(request.priceMaximum?.value))&&known(price)){
    const actual=Number(price.value),minimum=Number.isInteger(request.priceMinimum?.value)?request.priceMinimum.value:-Infinity,maximum=Number.isInteger(request.priceMaximum?.value)?request.priceMaximum.value:Infinity;
    rows.push(factual("PRICE_MATCH",FACT_KEYS.PRICE,actual>=minimum&&actual<=maximum?"MATCH":"MISMATCH",price,"currentRequestFacts.priceRange"));
  }
  const requestedOfferings=Array.isArray(request.offerings?.value)?request.offerings.value:[];
  const offering=candidate.offering??{},available=new Set(offering.availableWithAncestors??[]),offeringStates=offering.offerings??{};
  for(const requirement of requestedOfferings){
    const state=offeringStates[requirement];
    const outcome=available.has(requirement)?"MATCH":state==="NOT_AVAILABLE"?"MISMATCH":"UNKNOWN";
    rows.push(factual("OFFERING_MATCH",FACT_KEYS.OFFERING,outcome,{sourceIdentity:offering.sourceIdentity},"currentRequestFacts.offerings",requirement));
  }
  const requestedPurposes=Array.isArray(request.purposes?.value)?request.purposes.value:[],purposeStates=offering.purposes??{};
  for(const requirement of requestedPurposes){
    const state=purposeStates[requirement],outcome=state==="SUITABLE"?"MATCH":state==="NOT_SUITABLE"?"MISMATCH":"UNKNOWN";
    rows.push(factual("PURPOSE_MATCH",FACT_KEYS.PURPOSE,outcome,{sourceIdentity:offering.sourceIdentity},"currentRequestFacts.purposes",requirement));
  }
  const matches=rows.filter((row)=>row.outcome==="MATCH").length,partials=rows.filter((row)=>row.outcome==="PARTIAL").length,mismatches=rows.filter((row)=>row.outcome==="MISMATCH").length;
  const disposition=mismatches>0?"CONTRADICTED":matches>0?"MATCHED":partials>0?"PARTIAL":"UNKNOWN";
  const tier={CONTRADICTED:0,UNKNOWN:1,PARTIAL:2,MATCHED:3}[disposition];
  return{version:SEMANTIC_CONTRACT_VERSION,observations:rows,matches,partials,mismatches,disposition,tier};
}

function exactRequirements(currentMoment){
  const request=currentMoment?.currentRequestFacts??{},requirements=[];
  if(request.rain?.value&&request.rain.value!=="UNKNOWN")requirements.push(["RAIN_SUITABLE",null]);
  if(request.familyContext?.value==="FAMILY_WITH_CHILD")requirements.push(["FAMILY_SUITABLE",null]);
  if(Number.isInteger(request.childAge?.value))requirements.push(["CHILD_AGE_MATCH",null]);
  if(request.activityTypes?.value?.length)requirements.push(["ACTIVITY_MATCH",null]);
  if(request.accessibility?.value)requirements.push(["ACCESSIBILITY_MATCH",null]);
  if(request.environment?.value&&request.environment.value!=="UNKNOWN")requirements.push([request.environment.value==="OUTDOOR"?"OUTDOOR_MATCH":"INDOOR_MATCH",null]);
  if(Number.isInteger(request.durationMinutes?.value))requirements.push(["DURATION_MATCH",null]);
  if(request.conversation?.value==="HIGH")requirements.push(["CONVERSATION_MATCH",null]);
  if(request.planning?.value==="WALK_IN")requirements.push(["PLANNING_MATCH",null]);
  if(request.dayparts?.value?.length)requirements.push(["DAYPART_MATCH",null]);
  if(Number.isInteger(request.priceMinimum?.value)||Number.isInteger(request.priceMaximum?.value))requirements.push(["PRICE_MATCH",null]);
  // Monetary budgets are understood but cannot be promoted to a match from
  // the existing ordinal price-level fact. Until a canonical CHF fact exists,
  // this deliberately unmatched requirement produces an honest empty result.
  if(request.priceBudgetChf?.value)requirements.push(["PRICE_BUDGET_MATCH",null]);
  for(const offering of request.offerings?.value??[])requirements.push(["OFFERING_MATCH",offering]);
  for(const purpose of request.purposes?.value??[])requirements.push(["PURPOSE_MATCH",purpose]);
  return requirements;
}

function satisfiesVerifiedExactness(candidate,currentMoment){
  const requirements=exactRequirements(currentMoment);
  if(requirements.length===0)return true;
  const observations=evaluateFactualCurrentIntent(candidate,currentMoment).observations;
  return requirements.every(([code,requirement])=>observations.some((row)=>row.code===code&&row.requirement===requirement&&row.outcome==="MATCH"));
}

function rankCandidate(candidate,decisionPackage) {
  const concepts=PRESENT(candidate);
  const directions=decisionPackage.n5.currentIntent?.conceptDirections??[];
  let positive=0,conflict=0;
  for(const direction of directions){const strength=evidenceStrength(concepts.get(direction.concept));if(direction.direction>0)positive+=strength;else conflict+=strength;}
  const intentTier=directions.length===0?1:positive>conflict?2:conflict>positive?0:1;
  const factualFit=evaluateFactualCurrentIntent(candidate,decisionPackage.n3.currentMoment);
  const preferredPlaceTypes=decisionPackage.n5.currentIntent?.preferredPlaceTypes??[];
  const placeType=candidate.n4.productFacts.placeType??candidate.n4.placeType;
  const preferredPlaceTypeMatch=preferredPlaceTypes.includes(placeType)?1:0;
  const relevant=momentConcepts(decisionPackage.n3.currentMoment);
  const momentStrength=relevant.length?relevant.reduce((sum,concept)=>sum+evidenceStrength(concepts.get(concept)),0)/relevant.length:0;
  const modeFactor={SUFFICIENT:1,PARTIAL:.5,LOW_OR_UNKNOWN:0}[decisionPackage.n5.knowledgeMode]??0;
  const personal=decisionPackage.n5.taste.reduce((sum,node)=>{const matched=concepts.get(node.concept);if(!matched)return sum;return sum+(node.polarity==="NEGATIVE"?-1:1)*Math.abs(node.affinity)*node.confidence*evidenceStrength(matched);},0)*modeFactor;
  return {spotId:candidate.spotId,tuple:[factualFit.tier,factualFit.matches,factualFit.partials,-factualFit.mismatches,intentTier,rounded(positive-conflict),preferredPlaceTypeMatch,rounded(momentStrength),rounded(personal),-candidate.retrievalPosition],inputs:{intentTier,intentStrength:rounded(positive-conflict),factualFit,preferredPlaceTypeMatch,preferredPlaceType:preferredPlaceTypeMatch?placeType:null,momentFit:rounded(momentStrength),boundedPersonalFit:rounded(personal),originalRetrievalPosition:candidate.retrievalPosition,n4Availability:candidate.n4.availability}};
}

function reason(id,type,concept,copy,evidence) { return {id,type,concept:concept??null,copy,evidence,reasonHash:contentHash({id,type,concept:concept??null,copy,evidence})}; }

function authorizeReasons(candidate,decisionPackage) {
  const concepts=PRESENT(candidate),reasons=[];
  const factualFit=evaluateFactualCurrentIntent(candidate,decisionPackage.n3.currentMoment);
  const childAge=decisionPackage.n3.currentMoment.currentRequestFacts?.childAge?.value;
  const offeringCopy={DRINKS:"Hier kannst du etwas trinken.",BEER:"Hier gibt es Bier.",CRAFT_BEER:"Hier gibt es Craft Beer.",OWN_BREWED_BEER:"Hier gibt es vor Ort gebrautes Bier.",WINE:"Hier gibt es Wein.",COCKTAILS:"Hier gibt es Cocktails.",COFFEE:"Hier gibt es Kaffee.",NON_ALCOHOLIC:"Hier gibt es alkoholfreie Getränke.",FOOD:"Hier kannst du etwas essen.",SNACKS:"Hier gibt es Snacks.",SMALL_PLATES:"Hier gibt es kleine Gerichte.",FULL_MEALS:"Hier gibt es vollständige Mahlzeiten.",BREAKFAST:"Hier gibt es Frühstück.",BRUNCH:"Hier gibt es Brunch.",LUNCH:"Hier gibt es Mittagessen.",DINNER:"Hier gibt es Abendessen."};
  const purposeCopy={DRINK:"Passt, wenn du etwas trinken gehen möchtest.",EAT:"Passt, wenn du etwas essen gehen möchtest.",QUICK_BITE:"Passt für einen schnellen Happen.",AFTERWORK:"Passt für Afterwork.",APERO:"Passt für einen Apéro.",LONG_EVENING:"Passt für einen längeren Abend."};
  const factualCopy={RAIN_SUITABLE:"Für einen Regentag geeignet.",INDOOR_MATCH:"Drinnen – passend zu deiner aktuellen Suche.",OUTDOOR_MATCH:"Draußen – passend zu deiner aktuellen Suche.",CHILD_AGE_MATCH:`Passt zum Alter deines ${childAge}-jährigen Kindes.`,FAMILY_SUITABLE:"Für Familien mit Kindern geeignet.",ACTIVITY_MATCH:"Bietet genau die Aktivität, nach der du gerade suchst.",ACCESSIBILITY_MATCH:"Die benötigte Barrierefreiheit ist belegt.",DURATION_MATCH:"Passt in die Zeit, die du gerade hast.",QUIET_MATCH:"Eher ruhig – gut, wenn du dich unterhalten möchtest.",SOCIAL_CONTEXT_MATCH:"Passt zu der Begleitung, mit der du gerade unterwegs bist.",CONVERSATION_MATCH:"Hier kann man sich nach den belegten Angaben gut unterhalten.",PLANNING_MATCH:"Kann spontan und ohne große Vorausplanung besucht werden.",DAYPART_MATCH:"Passt gut zu der Tageszeit, die du genannt hast.",PRICE_MATCH:"Passt zu deinem genannten Preisrahmen."};
  for(const match of factualFit.observations.filter((row)=>row.matched)){
    const copy=match.code==="OFFERING_MATCH"?offeringCopy[match.requirement]:match.code==="PURPOSE_MATCH"?purposeCopy[match.requirement]:factualCopy[match.code];
    reasons.push(reason(`now:fact:${match.code}:${match.key}${match.requirement?`:${match.requirement}`:""}`,"WHY_NOW",null,copy,{momentHash:decisionPackage.n3.momentHash,n4Hash:candidate.n4.snapshotHash,offeringHash:candidate.offering?.snapshotHash??null,factKey:match.key,factSourceIdentity:match.sourceIdentity,momentRef:match.momentRef,requirement:match.requirement,semanticContractVersion:SEMANTIC_CONTRACT_VERSION}));
  }
  const required=decisionPackage.n5.currentIntent?.requiredPlaceTypes??[];
  const preferred=decisionPackage.n5.currentIntent?.preferredPlaceTypes??[];
  const placeType=candidate.n4.productFacts.placeType;
  const placeTypeCopy={activity:"Eine passende Aktivität für deine aktuelle Suche.",culture:"Ein passender Kulturort für deine aktuelle Suche.",outing:"Ein passendes Ausflugsziel für deine aktuelle Suche.",experience:"Ein passendes Erlebnis für deine aktuelle Suche.",cafe:"Ein passendes Café für deine aktuelle Suche.",bar:"Eine passende Bar für deine aktuelle Suche.",restaurant:"Ein passendes Restaurant für deine aktuelle Suche."};
  if([...required,...preferred].includes(placeType))reasons.push(reason(`now:place_type:${placeType}`,"WHY_NOW",`place_type.${placeType}`,placeTypeCopy[placeType]??"Passt zur gesuchten Art von Ort.",{momentHash:decisionPackage.n3.momentHash,n4Hash:candidate.n4.snapshotHash}));
  for(const direction of decisionPackage.n5.currentIntent?.conceptDirections??[]){const concept=concepts.get(direction.concept);if(direction.direction>0&&evidenceStrength(concept)>0){const label=CONCEPT_LABELS[direction.concept]??"diese ausdrücklich gewünschte Atmosphäre";reasons.push(reason(`now:concept:${direction.concept}`,"WHY_NOW",direction.concept,`Du suchst ${label} – dieser Ort passt dazu.`,{momentHash:decisionPackage.n3.momentHash,n4Hash:candidate.n4.snapshotHash,conceptConfidence:concept.confidence}));}}
  if(decisionPackage.n5.knowledgeMode!=="LOW_OR_UNKNOWN")for(const node of decisionPackage.n5.taste){
    const concept=concepts.get(node.concept);
    if(evidenceStrength(concept)<=0||node.polarity!=="POSITIVE")continue;
    const label=CONCEPT_LABELS[node.concept]??"dieser Art von Ort";
    reasons.push(reason(`you:${node.nodeKey}`,"WHY_FOR_YOU",node.concept,`Dieser Ort passt zu deiner bisherigen Vorliebe für ${label}.`,{projectionHash:decisionPackage.n5.projectionHash,n4Hash:candidate.n4.snapshotHash,nodeKey:node.nodeKey,nodeConfidence:node.confidence,conceptConfidence:concept.confidence}));
  }
  if(candidate.n4.availability!=="FULL")reasons.push(reason(`uncertainty:n4:${candidate.n4.availability}`,"UNCERTAINTY",null,candidate.n4.availability==="UNKNOWN"?"Zu diesem Ort kennt Backyrd bisher nur die sicheren Basisdaten.":"Zu diesem Ort ist die kanonische Beschreibung noch nicht vollständig.",{n4Hash:candidate.n4.snapshotHash,availability:candidate.n4.availability}));
  if(decisionPackage.n5.knowledgeMode==="LOW_OR_UNKNOWN")reasons.push(reason("uncertainty:user:low","UNCERTAINTY",null,"Backyrd nutzt hier nur belegte Angaben zur aktuellen Anfrage und behauptet keine persönliche Passung.",{projectionHash:decisionPackage.n5.projectionHash,knowledgeMode:decisionPackage.n5.knowledgeMode}));
  if(reasons.length===0)reasons.push(reason("uncertainty:no-specific-fit","UNCERTAINTY",null,"Backyrd hat für diesen geeigneten Kandidaten noch keinen spezifischen persönlichen Grund.",{candidateSetHash:decisionPackage.candidateSet.candidateSetHash,n4Hash:candidate.n4.snapshotHash}));
  return reasons;
}

const compareTuple=(left,right)=>{for(let i=0;i<left.length;i++){if(left[i]!==right[i])return right[i]-left[i];}return 0;};

const REASON_TYPE_PRIORITY=Object.freeze({WHY_NOW:3,WHY_FOR_YOU:2,UNCERTAINTY:1});
const FACT_REASON_SPECIFICITY=Object.freeze({
  OFFERING_MATCH:5,PURPOSE_MATCH:4,ACTIVITY_MATCH:4,CHILD_AGE_MATCH:4,
  ACCESSIBILITY_MATCH:4,RAIN_SUITABLE:3,INDOOR_MATCH:3,OUTDOOR_MATCH:3,
  CONVERSATION_MATCH:3,PLANNING_MATCH:3,DURATION_MATCH:3,DAYPART_MATCH:3,
  PRICE_MATCH:3,QUIET_MATCH:3,FAMILY_SUITABLE:2,SOCIAL_CONTEXT_MATCH:2,
});
const reasonCode=(row)=>row.id?.startsWith("now:fact:")?row.id.split(":")[2]:null;
const reasonAuthority=(row)=>row.id?.startsWith("now:fact:")?3:row.id?.startsWith("now:concept:")?2:row.id?.startsWith("now:place_type:")?1:0;
const reasonSpecificity=(row)=>FACT_REASON_SPECIFICITY[reasonCode(row)]??(row.id?.startsWith("now:concept:")?2:row.id?.startsWith("now:place_type:")?1:0);

/**
 * Select the most useful authorized explanation without changing candidate
 * ranking. Current-moment reasons always beat historical personalization; among
 * equally current reasons, a match shared by fewer candidates is more
 * discriminative. Factual authority and semantic specificity break remaining
 * ties. The final id tie-break makes selection independent of serialization
 * order.
 */
export function selectBestAuthorizedReason(candidates,allCandidateReasons=[candidates]) {
  const usable=candidates.filter((row)=>row?.copy);
  if(usable.length===0)return null;
  const supportCount=new Map();
  for(const rows of allCandidateReasons){
    for(const id of new Set(rows.filter((row)=>row?.copy).map((row)=>row.id)))supportCount.set(id,(supportCount.get(id)??0)+1);
  }
  return [...usable].sort((left,right)=>{
    const leftTuple=[REASON_TYPE_PRIORITY[left.type]??0,-(supportCount.get(left.id)??Number.MAX_SAFE_INTEGER),reasonAuthority(left),reasonSpecificity(left)];
    const rightTuple=[REASON_TYPE_PRIORITY[right.type]??0,-(supportCount.get(right.id)??Number.MAX_SAFE_INTEGER),reasonAuthority(right),reasonSpecificity(right)];
    for(let index=0;index<leftTuple.length;index+=1)if(leftTuple[index]!==rightTuple[index])return rightTuple[index]-leftTuple[index];
    return left.id<right.id?-1:left.id>right.id?1:0;
  })[0];
}

export function deterministicDecisionStrategy(decisionPackage) {
  const allEvaluated=decisionPackage.candidates.map((candidate)=>({candidate,ranking:rankCandidate(candidate,decisionPackage),reasons:authorizeReasons(candidate,decisionPackage),verifiedExact:satisfiesVerifiedExactness(candidate,decisionPackage.n3.currentMoment)}));
  const ranked=allEvaluated.filter((row)=>row.verifiedExact).sort((a,b)=>compareTuple(a.ranking.tuple,b.ranking.tuple)||a.candidate.spotId.localeCompare(b.candidate.spotId));
  const allCandidateReasons=ranked.map((row)=>row.reasons);
  const selected=ranked.slice(0,3).map((row,index)=>{
    const chosen=selectBestAuthorizedReason(row.reasons,allCandidateReasons);
    return {...row,rank:index+1,selectedReasonId:chosen?.id??null,explanation:chosen?.copy??"Passt am besten zu den aktuell verfügbaren, sicheren Informationen."};
  });
  return {version:DETERMINISTIC_RANKING_VERSION,reasonVersion:REASON_AUTHORIZATION_VERSION,selected,allRanked:ranked,allEvaluated,rankingHash:contentHash(allEvaluated.map(({ranking,verifiedExact})=>({ranking,verifiedExact}))),reasonSetHashes:Object.fromEntries(allEvaluated.map(({candidate,reasons})=>[candidate.spotId,contentHash(reasons)]))};
}
