// Full teaching chains over the existing canonical HTTP composition. Fixtures
// are authored fictional worlds, not live Spot claims or user research.
import assert from 'node:assert/strict';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {validateNuknukUnderstanding,NUKNUK_UNDERSTANDING_VERSION} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {executeAdviceChain} from './advice-execution.mjs';
export {executeAdviceChain} from './advice-execution.mjs';
import {profile,offer,area,prop,price,worldFact} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
import {bindAssessmentCandidate} from './assessment-identity.mjs';
import {parseExperienceProfile} from '@backyrd/world-knowledge-core';
import {materialize,reference} from './authoring.mjs';
import {adviceAstra} from './advice-astra.mjs';
import {adviceTobi} from './advice-tobi.mjs';

export const adviceSpecs=Object.freeze([...adviceAstra,...adviceTobi]);
const week=Array.from({length:7},(_,index)=>({weekday:index+1,start:'08:00',end:'23:00'}));
const dayNames=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
const regular=dayNames.map(day=>({day,intervals:[{start:'08:00',end:'23:00'}]}));
const properties=rows=>(rows??[]).map(([key,value,extra])=>prop(key,value,extra));

export function adviceCatalog(spec){
 return spec.venues.map(venue=>{
  const areas=(venue.areas??[{key:'visit',kind:venue.areaKind??'INDOOR',properties:venue.areaProperties??[]}])
   .map(a=>({...area(a.key,properties(a.properties)),kind:a.kind}));
  const offers=(venue.offers??[{key:'visit',kind:venue.kind,areaKey:areas[0].id,properties:venue.offerProperties??[],price:venue.price??35}])
   .map(o=>({...offer(o.key,o.kind,[o.areaKey??areas[0].id],properties(o.properties),[price(o.price??venue.price??35)]),
    name:o.name??o.key,prices:[price(o.price??venue.price??35,{includes:o.priceIncludes??venue.priceIncludes??(/DRINK|CAFE/.test(o.kind)?'Getränke':/DINNER|LUNCH|MEAL|BREAKFAST|FOOD/.test(o.kind)?'Essen':'Eintritt und Aktivität')})],
    schedule:o.schedule??(venue.closed?[]:week),validFrom:o.validFrom??null,validUntil:o.validUntil??null}));
  const p={...profile(offers,areas,venue.category),properties:properties(venue.spotProperties)};
  parseExperienceProfile(p);
  const candidate=bindAssessmentCandidate('advice-'+spec.family,venue.key,p);
  candidate.resolvedAt=(spec.reference??reference).now;
  const f=candidate.decisionProjection.facts;
  f.find(x=>x.key==='identity.name').value=venue.name;
  f.find(x=>x.key==='hours.regular').value=venue.closed?dayNames.map(day=>({day,intervals:[]})):regular;
  f.find(x=>x.key==='classification.place_types').value=venue.placeTypes??[venue.category==='SPORT'?'SPORTS_CENTRE':venue.category==='OUTDOOR_NATURE'?'PARK':venue.category==='STAY'?'HOTEL':venue.category==='WELLNESS_RELAXATION'?'SPA':venue.category];
  for(const extra of venue.worldFacts??[])f.push(worldFact(extra.key,extra.value,extra.extra??{}));
  return candidate;
 });
}

export function advicePlan(spec,understanding){
 const subjectId=understanding.meaning.entities.find(e=>e.kind==='ACTIVITY')?.id??'suggestedActivity';
 return{directions:spec.directions.map(d=>({...d,preferences:d.preferences.map(p=>({...p,subjectId:p.subjectId??subjectId})),
  activityIdea:d.activityIdea?{...d.activityIdea,subjectId:d.activityIdea.subjectId??subjectId}:null})),
  clarification:spec.planQuestion??null};
}


function targetProposal(spec,request,catalog){
 const authored=spec.response.suggestions??(spec.response.venueKeys??(spec.response.venueKey?[spec.response.venueKey]:[])).map(venueKey=>({venueKey,text:spec.response.text,caveat:spec.response.caveat}));
 const suggestions=authored.map(item=>{
  const venue=spec.venues.find(v=>v.key===item.venueKey);
  assert(venue,`${spec.id}: authored venue reference missing`);
  let candidate=null,directionId=null;
  const spotId=catalog[spec.venues.indexOf(venue)].decisionProjection.spotId;
  for(const run of request.runs){if(item.directionId&&run.directionId!==item.directionId)continue;const c=run.candidates.find(c=>c.candidateId===spotId);if(c){candidate=c;directionId=run.directionId;break;}}
  assert(candidate,`${spec.id}: authored recommendation is not confirmed by canonical retrieval`);
  return{directionId,candidateId:candidate.candidateId,proposal:item.text,evidence:candidate.evidence.slice(0,8),caveat:item.caveat??null};
 });
 return{mode:spec.response.mode,message:spec.response.text,
  suggestions,
  question:spec.response.question,
  limitations:[...new Set([...(spec.response.caveat?[spec.response.caveat]:[]),
   ...(request.runs.some(r=>r.state==='TOOL_ERROR')?['Die Bibliothekarabfrage ist technisch fehlgeschlagen; dies belegt keine Abwesenheit passender Angebote.']:[]),
   ...(request.runs.some(r=>r.state==='NEEDS_CLARIFICATION')?['Ohne konkrete Suchrichtung wurde kein Bibliothekaraufruf ausgeführt.']:[]),
   ...(spec.directions.some(d=>d.evidenceQuestions.length)?['Die zusätzlichen Belegfragen sind Recherchebedarf; diese lokale Suche hat sie nicht beantwortet.']:[])])].slice(0,6)};
}

export async function adviceCases(specs=adviceSpecs){
 const results=[];
 for(const spec of specs){
  assert(spec.wrong?.text&&spec.wrong?.why&&spec.why,`${spec.id}: pedagogical contrast required`);
  const scenarioGroup='advice-'+spec.family;
  const row=materialize({...spec,scenarioGroup,reference:spec.reference??reference});
  const catalog=adviceCatalog(spec),plan=advicePlan(spec,row.content.target);
  const chain=await executeAdviceChain({query:spec.query,reference:row.content.reference,catalog,
   interpret:async()=>row.content.target,planSearch:async()=>plan,
   propose:async request=>targetProposal(spec,request,catalog),toolState:spec.toolState??null});
  const make=(task,target,context)=>{
   const content={version:NUKNUK_UNDERSTANDING_VERSION,task,query:spec.query,reference:row.content.reference,target,context,
    provenance:{kind:'SYNTHETIC',reference:spec.id},trainingPermission:'PENDING'};
   return{id:spec.id+'-'+task.toLowerCase(),scenarioGroup,split:spec.split,content,contentHash:contentHash(content),reviews:[]};
  };
  const rows=[row,make('PLAN_SEARCH',plan,{understanding:chain.understanding}),
   make('PROPOSE_EXPERIENCE',chain.output,{understanding:chain.understanding,plan,runs:chain.runs})];
  results.push({spec,rows,note:{id:spec.id,scenarioGroup,split:spec.split,domain:spec.domain,tags:spec.tags,
   query:spec.query,goal:spec.goal,why:spec.why,wrong:spec.wrong,response:chain.output,
   declaredIssue:spec.expectedIssue,provenance:'SYNTHETIC_AUTHORED_NOT_OBSERVED_USERS',catalogHash:contentHash(catalog),
   profiles:spec.venues,proofs:chain.proofs,visibleProposalInput:JSON.parse(chain.proposalRequest.input),
   modelRun:false,executionMode:'AUTHORED_GOLD_PHASE_REPLAY_THROUGH_CANONICAL_HTTP',
   interpretationCapabilityGaps:validateNuknukUnderstanding(row.content.target,row.content).capabilityGaps}});
 }
 return results;
}
