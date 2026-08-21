import { contentHash } from "../../decision-input-runtime/src/package.mjs";
import { FACT_KEYS,SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const DETERMINISTIC_RANKING_VERSION = "backyrd-deterministic-ranking-v2";
export const REASON_AUTHORIZATION_VERSION = "backyrd-reason-authorization-v2";

const CONCEPT_LABELS = Object.freeze({
  "vibe.quiet":"ruhige Orte", "energy.calm":"eine ruhige Atmosphäre",
  "vibe.lively":"lebendige Orte", "energy.energetic":"viel Energie",
  "vibe.cozy":"gemütliche Orte", "vibe.romantic":"eine romantische Atmosphäre",
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
const factual=(code,key,matched,row,momentRef)=>({code,key,matched,sourceIdentity:row?.sourceIdentity??null,momentRef});

export function evaluateFactualCurrentIntent(candidate,currentMoment){
  const request=currentMoment?.currentRequestFacts??{},rows=[];
  const rain=valueOf(candidate,FACT_KEYS.RAIN),environment=valueOf(candidate,FACT_KEYS.ENVIRONMENT),family=valueOf(candidate,FACT_KEYS.FAMILY_KIDS),age=valueOf(candidate,FACT_KEYS.AGE),activities=valueOf(candidate,FACT_KEYS.ACTIVITY),accessibility=valueOf(candidate,FACT_KEYS.ACCESSIBILITY);
  if(request.rain?.value&&request.rain.value!=="UNKNOWN"){
    if(known(rain))rows.push(factual("RAIN_SUITABLE",FACT_KEYS.RAIN,rain.value==="SUITABLE",rain,"currentRequestFacts.rain"));
    if(known(environment))rows.push(factual("INDOOR_MATCH",FACT_KEYS.ENVIRONMENT,["INDOOR","MIXED"].includes(environment.value),environment,"currentRequestFacts.rain"));
  }
  if(request.familyContext?.value==="FAMILY_WITH_CHILD"&&known(family))rows.push(factual("FAMILY_SUITABLE",FACT_KEYS.FAMILY_KIDS,family.value==="SUITABLE",family,"currentRequestFacts.familyContext"));
  if(Number.isInteger(request.childAge?.value)&&known(age)){
    const minimum=Number.isInteger(age.value?.min_age)?age.value.min_age:-Infinity,maximum=Number.isInteger(age.value?.max_age)?age.value.max_age:Infinity;
    rows.push(factual("CHILD_AGE_MATCH",FACT_KEYS.AGE,request.childAge.value>=minimum&&request.childAge.value<=maximum,age,"currentRequestFacts.childAge"));
  }
  if(request.activityTypes?.value?.length&&known(activities)){const offered=new Set(Array.isArray(activities.value)?activities.value:[]);rows.push(factual("ACTIVITY_MATCH",FACT_KEYS.ACTIVITY,request.activityTypes.value.some((item)=>offered.has(item)),activities,"currentRequestFacts.activityTypes"));}
  if(request.accessibility?.value&&known(accessibility))rows.push(factual("ACCESSIBILITY_MATCH",FACT_KEYS.ACCESSIBILITY,accessibility.value?.[request.accessibility.value]==="SUITABLE",accessibility,"currentRequestFacts.accessibility"));
  const matches=rows.filter((row)=>row.matched).length,mismatches=rows.length-matches;
  return{version:SEMANTIC_CONTRACT_VERSION,observations:rows,matches,mismatches,tier:rows.length===0?1:matches>mismatches?2:mismatches>matches?0:1};
}

function rankCandidate(candidate,decisionPackage) {
  const concepts=PRESENT(candidate);
  const directions=decisionPackage.n5.currentIntent?.conceptDirections??[];
  let positive=0,conflict=0;
  for(const direction of directions){const strength=evidenceStrength(concepts.get(direction.concept));if(direction.direction>0)positive+=strength;else conflict+=strength;}
  const intentTier=directions.length===0?1:positive>conflict?2:conflict>positive?0:1;
  const factualFit=evaluateFactualCurrentIntent(candidate,decisionPackage.n3.currentMoment);
  const relevant=momentConcepts(decisionPackage.n3.currentMoment);
  const momentStrength=relevant.length?relevant.reduce((sum,concept)=>sum+evidenceStrength(concepts.get(concept)),0)/relevant.length:0;
  const modeFactor={SUFFICIENT:1,PARTIAL:.5,LOW_OR_UNKNOWN:0}[decisionPackage.n5.knowledgeMode]??0;
  const personal=decisionPackage.n5.taste.reduce((sum,node)=>{const matched=concepts.get(node.concept);if(!matched)return sum;return sum+(node.polarity==="NEGATIVE"?-1:1)*Math.abs(node.affinity)*node.confidence*evidenceStrength(matched);},0)*modeFactor;
  return {spotId:candidate.spotId,tuple:[intentTier,rounded(positive-conflict),factualFit.tier,factualFit.matches,-factualFit.mismatches,rounded(momentStrength),rounded(personal),-candidate.retrievalPosition],inputs:{intentTier,intentStrength:rounded(positive-conflict),factualFit,momentFit:rounded(momentStrength),boundedPersonalFit:rounded(personal),originalRetrievalPosition:candidate.retrievalPosition,n4Availability:candidate.n4.availability}};
}

function reason(id,type,concept,copy,evidence) { return {id,type,concept:concept??null,copy,evidence,reasonHash:contentHash({id,type,concept:concept??null,copy,evidence})}; }

function authorizeReasons(candidate,decisionPackage) {
  const concepts=PRESENT(candidate),reasons=[];
  const factualFit=evaluateFactualCurrentIntent(candidate,decisionPackage.n3.currentMoment);
  const childAge=decisionPackage.n3.currentMoment.currentRequestFacts?.childAge?.value;
  const factualCopy={RAIN_SUITABLE:"Für einen Regentag als geeignet belegt.",INDOOR_MATCH:"Bietet einen belegten Innenbereich für diesen Regentag.",CHILD_AGE_MATCH:`Die belegte Alterseignung passt zu einem ${childAge}-jährigen Kind.`,FAMILY_SUITABLE:"Als familien- und kindergeeignet belegt.",ACTIVITY_MATCH:"Die belegte Aktivität passt zu deiner aktuellen Suche.",ACCESSIBILITY_MATCH:"Die benötigte Barrierefreiheits-Eigenschaft ist belegt."};
  for(const match of factualFit.observations.filter((row)=>row.matched))reasons.push(reason(`now:fact:${match.code}:${match.key}`,"WHY_NOW",null,factualCopy[match.code],{momentHash:decisionPackage.n3.momentHash,n4Hash:candidate.n4.snapshotHash,factKey:match.key,factSourceIdentity:match.sourceIdentity,momentRef:match.momentRef,semanticContractVersion:SEMANTIC_CONTRACT_VERSION}));
  const required=decisionPackage.n5.currentIntent?.requiredPlaceTypes??[];
  const preferred=decisionPackage.n5.currentIntent?.preferredPlaceTypes??[];
  const placeType=candidate.n4.productFacts.placeType;
  if([...required,...preferred].includes(placeType))reasons.push(reason(`now:place_type:${placeType}`,"WHY_NOW",`place_type.${placeType}`,`Passt zu deiner aktuellen Suche nach ${placeType==="bar"?"einer Bar":`einem passenden ${placeType}`}.`,{momentHash:decisionPackage.n3.momentHash,n4Hash:candidate.n4.snapshotHash}));
  for(const direction of decisionPackage.n5.currentIntent?.conceptDirections??[]){const concept=concepts.get(direction.concept);if(direction.direction>0&&evidenceStrength(concept)>0){const label=CONCEPT_LABELS[direction.concept]??"dieser ausdrücklich gewünschten Atmosphäre";reasons.push(reason(`now:concept:${direction.concept}`,"WHY_NOW",direction.concept,`Passt zu deinem aktuellen Wunsch nach ${label}.`,{momentHash:decisionPackage.n3.momentHash,n4Hash:candidate.n4.snapshotHash,conceptConfidence:concept.confidence}));}}
  if(decisionPackage.n5.knowledgeMode!=="LOW_OR_UNKNOWN")for(const node of decisionPackage.n5.taste){
    const concept=concepts.get(node.concept);
    if(evidenceStrength(concept)<=0||node.polarity!=="POSITIVE")continue;
    const label=CONCEPT_LABELS[node.concept]??"dieser Art von Ort";
    reasons.push(reason(`you:${node.nodeKey}`,"WHY_FOR_YOU",node.concept,`Dieser Ort passt zu deiner bisherigen Vorliebe für ${label}.`,{projectionHash:decisionPackage.n5.projectionHash,n4Hash:candidate.n4.snapshotHash,nodeKey:node.nodeKey,nodeConfidence:node.confidence,conceptConfidence:concept.confidence}));
  }
  if(candidate.n4.availability!=="FULL")reasons.push(reason(`uncertainty:n4:${candidate.n4.availability}`,"UNCERTAINTY",null,candidate.n4.availability==="UNKNOWN"?"Zu diesem Ort kennt Backyrd bisher nur die sicheren Basisdaten.":"Zu diesem Ort ist die kanonische Beschreibung noch nicht vollständig.",{n4Hash:candidate.n4.snapshotHash,availability:candidate.n4.availability}));
  if(decisionPackage.n5.knowledgeMode==="LOW_OR_UNKNOWN")reasons.push(reason("uncertainty:user:low","UNCERTAINTY",null,"Die Auswahl stützt sich auf deine aktuelle Anfrage, nicht auf behauptete persönliche Vorlieben.",{projectionHash:decisionPackage.n5.projectionHash,knowledgeMode:decisionPackage.n5.knowledgeMode}));
  if(reasons.length===0)reasons.push(reason("uncertainty:no-specific-fit","UNCERTAINTY",null,"Backyrd hat für diesen geeigneten Kandidaten noch keinen spezifischen persönlichen Grund.",{candidateSetHash:decisionPackage.candidateSet.candidateSetHash,n4Hash:candidate.n4.snapshotHash}));
  return reasons;
}

const compareTuple=(left,right)=>{for(let i=0;i<left.length;i++){if(left[i]!==right[i])return right[i]-left[i];}return 0;};

export function deterministicDecisionStrategy(decisionPackage) {
  const ranked=decisionPackage.candidates.map((candidate)=>({candidate,ranking:rankCandidate(candidate,decisionPackage),reasons:authorizeReasons(candidate,decisionPackage)})).sort((a,b)=>compareTuple(a.ranking.tuple,b.ranking.tuple)||a.candidate.spotId.localeCompare(b.candidate.spotId));
  const selected=ranked.slice(0,3).map((row,index)=>{
    const chosen=row.reasons.find((x)=>x.type==="WHY_NOW")||row.reasons.find((x)=>x.type==="WHY_FOR_YOU")||row.reasons.find((x)=>x.type==="UNCERTAINTY");
    return {...row,rank:index+1,selectedReasonId:chosen?.id??null,explanation:chosen?.copy??"Passt am besten zu den aktuell verfügbaren, sicheren Informationen."};
  });
  return {version:DETERMINISTIC_RANKING_VERSION,reasonVersion:REASON_AUTHORIZATION_VERSION,selected,allRanked:ranked,rankingHash:contentHash(ranked.map(({ranking})=>ranking)),reasonSetHashes:Object.fromEntries(ranked.map(({candidate,reasons})=>[candidate.spotId,contentHash(reasons)]))};
}
