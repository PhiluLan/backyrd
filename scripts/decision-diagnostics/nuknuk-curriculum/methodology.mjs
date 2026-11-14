// Offline audit and derived evaluation challenges. Never append these to SFT.
import assert from 'node:assert/strict';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {buildNuknukAssessmentRequest,validateNuknukAssessment} from '../../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js';
import {opaqueIdentity} from './assessment-identity.mjs';

export function auditAssessmentIdentity(dataset){
 const splits={};
 for(const row of dataset.cases.filter(r=>r.content.task==='ASSESS_CANDIDATES')){
  const split=splits[row.split]??={cases:0,fitParity:{}};split.cases++;
  for(const a of row.content.target.assessments){
   const parity=parseInt(a.candidateId.slice(-1),16)%2;
   assert(Number.isInteger(parity));
   const fit=split.fitParity[a.fit]??={even:0,odd:0};fit[parity?'odd':'even']++;
  }
 }
 const weak=Object.values(splits).reduce((a,s)=>({even:a.even+(s.fitParity.WEAK?.even??0),odd:a.odd+(s.fitParity.WEAK?.odd??0)}),{even:0,odd:0});
 return{version:'backyrd.nuknuk-identity-audit@1',splits,weak,
  perfectGlobalWeakParityShortcut:weak.even+weak.odd>0&&(!weak.even||!weak.odd),
  interpretation:'Descriptive nuisance audit only. Small splits can correlate by chance; counts do not prove model invariance.',
  identityPolicy:'SHA256(namespace,identityKey), independent of evidence and fit; counterfactual assignment separately permuted'};
}

const sources=[
 ['dev-negative','solid-evidence-contrast-walk-denied-unknown'],
 ['dev-priority','solid-evidence-user-dev-minigolf-cover-music-priority'],
 ['test-negative','solid-evidence-contrast-animals-denied-unknown'],
 ['test-history','solid-evidence-user-test-bath-personal-familiarity-priority-reversed'],
];
const paraphrase=s=>s.startsWith('Bestätigt: ')?s.replace('Bestätigt: ','Belegt ist: ')
 :s.startsWith('Nicht passend: ')?s.replace('Nicht passend: ','Die Belege widersprechen diesem Wunsch: ')
 :s.startsWith('Noch nicht bestätigt: ')?s.replace('Noch nicht bestätigt: ','Dafür fehlt bisher eine Bestätigung: ')
 :s.startsWith('Passende Angebote: ')?s.replace('Passende Angebote: ','Als passend geprüftes Angebot: ')
 :s==='Das Angebot passt. Ob die Atmosphäre deinem Wunsch entspricht, ist noch nicht bestätigt.'?'Das Grundangebot ist belegt; die gewünschte Atmosphäre bleibt unbestätigt.':s;

export function buildMetamorphicControls(dataset){
 const controls=[];
 for(const [name,baseCaseId] of sources){
  const row=dataset.cases.find(r=>r.id===baseCaseId);assert(row&&row.split!=='TRAIN',baseCaseId);
  const original=buildNuknukAssessmentRequest(row.content.context);
  assert.equal(original.candidates.length,2);assert.equal(row.content.target.assessments.length,2);
  for(const variant of ['id-rebind','evidence-swap','order-reverse','paraphrase-codes']){
   const id=`metamorphic-${name}-${variant}`,payload=JSON.parse(original.input);
   const target=structuredClone(row.content.target),base=structuredClone(payload.candidates);
   const proof={variant,baseCaseId,baseInputHash:contentHash(original.input),modelExecuted:false};
   if(variant==='id-rebind'){
    const map=new Map(base.map(c=>[c.candidateId,opaqueIdentity(id,c.candidateId)]));
    payload.candidates.forEach(c=>{c.candidateId=map.get(c.candidateId);});
    target.assessments.forEach(a=>{a.candidateId=map.get(a.candidateId);});
    proof.identityMapping=Object.fromEntries(map);
   }else if(variant==='evidence-swap'){
    // Hold identities/names and the request fixed; move only the evidence.
    payload.candidates=base.map((c,i)=>({...c,evidence:base[1-i].evidence,limitations:base[1-i].limitations}));
    const byId=new Map(target.assessments.map(a=>[a.candidateId,a]));
    target.assessments=base.map((c,i)=>({...byId.get(base[1-i].candidateId),candidateId:c.candidateId}));
    proof.evidenceDonors=Object.fromEntries(base.map((c,i)=>[c.candidateId,base[1-i].candidateId]));
   }else if(variant==='order-reverse'){
    payload.candidates.reverse();target.assessments.reverse();proof.identityPreserved=true;
   }else{
    const codeMap=new Map();let changed=0;
    payload.candidates.forEach(c=>{
     c.evidence=c.evidence.map(e=>{const code='proof-'+contentHash({id,candidateId:c.candidateId,code:e.reasonCode});codeMap.set(c.candidateId+'|'+e.reasonCode,code);const statement=paraphrase(e.statement);if(statement!==e.statement)changed++;return{reasonCode:code,statement};});
     c.limitations=c.limitations.map(s=>{const p=paraphrase(s);if(s!==p)changed++;return p;});
    });
    target.assessments.forEach(a=>{a.reasonCodes=a.reasonCodes.map(code=>codeMap.get(a.candidateId+'|'+code));});
    assert(changed>0);proof.changedStatements=changed;proof.reasonCodesReplaced=true;
   }
   const input=JSON.stringify(payload),request={...original,candidates:payload.candidates,input};
   validateNuknukAssessment(target,request);
   assert.notEqual(contentHash(input),contentHash(original.input));
   controls.push({id,task:'ASSESS_CANDIDATES',split:row.split,scenarioGroup:row.scenarioGroup,baseCaseId,variant,
    messages:[{role:'system',content:original.instructions},{role:'user',content:input}],
    promptHash:contentHash(original.instructions),inputHash:contentHash(input),schemaHash:contentHash(original.outputSchema),outputSchema:original.outputSchema,
    expected:target,proof});
  }
 }
 return{version:'backyrd.nuknuk-metamorphic-controls@1',datasetHash:contentHash(dataset),
  purpose:'DERIVED_EVALUATION_NOT_TRAINING_OR_INDEPENDENT_HOLDOUT',
  selectionPolicy:'DEV variants are reviewed with DEV; TEST variants only after frozen selection. Never learn from these controls.',
  modelEvaluation:'Review actual meaning and candidate assignments; changed fit under identity/order-only changes is a material failure. Structural checks do not prove model invariance.',
  counts:{VALIDATION:controls.filter(c=>c.split==='VALIDATION').length,TEST:controls.filter(c=>c.split==='TEST').length},cases:controls};
}

export function summarizeTaskMixture(dataset,tokenCases=[]){
 const tokens=new Map(tokenCases.map(r=>[r.id,r]));const totals={};
 for(const row of dataset.cases){
  const key=row.split+':'+row.content.task,summary=totals[key]??={examples:0,scenarioGroups:new Set(),answerTokens:tokens.size?0:null};
  summary.examples++;summary.scenarioGroups.add(row.scenarioGroup);
  if(tokens.size){assert(tokens.has(row.id));summary.answerTokens+=tokens.get(row.id).answerTokens;}
 }
 return Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,{...v,scenarioGroups:v.scenarioGroups.size}]));
}
