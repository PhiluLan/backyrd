#!/usr/bin/env node
/** Local preparation only. Never trains, invokes a model, or marks automated
 * checks as semantic approval. Historical datasets and holdouts stay intact. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {auditUnderstandingDataset,understandingSplitHash} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import {inspectNuknukTrainingVocabulary,NUKNUK_TRAINING_VOCABULARY,NUKNUK_TRAINING_VOCABULARY_HASH} from '../../packages/decision-vnext-core/dist/nuknuk-training-vocabulary.js';
import {librarianConcept} from '../../packages/world-knowledge-core/dist/index.js';

export function prepareVocabularyReview(source){
 // Verify lineage before reading any target for corrections.
 auditUnderstandingDataset(source,understandingSplitHash(source.splitPlan));
 const corrections=[],excluded=[],inventory=new Map(),rows=[];
 const cases=source.cases.flatMap(original=>{
  if(original.split!=='TRAIN'){excluded.push({id:original.id,split:original.split,reason:'HISTORICAL_EVALUATION_NOT_TRAINING'});return [];}
  const row=structuredClone(original),target=row.content.target;
  const reasons=[],changes=[];
  if(row.content.task==='INTERPRET_REQUEST'){
   for(const f of target.meaning.facts){
    // A finite spelling correction, never invent missing user intent.
    if(f.key==='food.diet'&&f.value.text==='glutenfree'){
     f.value.text='gluten_free'; changes.push({factId:f.id,reason:'CANONICAL_DIET_SPELLING',before:'glutenfree',after:'gluten_free'});
    }
    if(/^r4-train-budget-2-\d+$/.test(row.id)&&f.key==='food.dish'){
     if(f.modality!=='REQUIRED'||!row.content.query.includes(f.value.text+' wäre gut, möglichst unter '))throw Error('preferred_dish_parent_mismatch:'+row.id);
     f.modality='PREFERRED'; changes.push({factId:f.id,reason:'EXPLICIT_WOULD_BE_GOOD_IS_PREFERENCE',before:'REQUIRED',after:'PREFERRED'});
    }
    if(row.id==='r5-train-dog-1'&&f.key==='experience.activity'&&f.value.text==='animals'){
     if(f.modality!=='EXCLUDED'||!row.content.query.includes('keine Tieraktivität gesucht'))throw Error('dog_parent_mismatch');
     f.modality='NOT_REQUIRED'; changes.push({factId:f.id,reason:'NOT_SOUGHT_DOES_NOT_BAN_VENUE_OFFER',before:'EXCLUDED',after:'NOT_REQUIRED'});
    }
   }
   for(const f of target.meaning.facts){
    if(typeof f.value.text!=='string')continue;
    const k=f.key+'='+f.value.text,entry=inventory.get(k)??{key:f.key,value:f.value.text,concept:librarianConcept(f.value.text),caseIds:[]};
    entry.caseIds.push(row.id);inventory.set(k,entry);
   }
   // Review queues describe training limitations, never user eligibility gates.
   if(/woanders|anderen (?:Ort|Betrieb|Lokal)/iu.test(row.content.query))reasons.push('DIFFERENT_VENUE_RELATION_NOT_EXECUTABLE');
   if(target.meaning.facts.some(f=>f.key==='participation.permission'&&/Hunde (?:drinnen|auf der Terrasse) erlaubt/u.test(f.value.text??'')))reasons.push('DOG_PERMISSION_AREA_SCOPE_NEEDS_MATCHING_PROOF');
   if(target.meaning.facts.some(f=>f.key==='food.diet'&&f.modality==='EXCLUDED'))reasons.push('DIET_EXCLUSION_CONSUMPTION_VS_WHOLE_VENUE_REVIEW');
   const issues=inspectNuknukTrainingVocabulary(target);
   reasons.push(...issues.map(i=>i.code+':'+i.factId));
  }else reasons.push('CANDIDATE_ASSESSMENT_REQUIRES_EVIDENCE_REVIEW');
  // Prior generic ACCEPT notes do not prove review against this vocabulary.
  // Preserve original reviews in the source, not as approvals of this child.
  row.content.trainingPermission='PENDING';
  row.contentHash=contentHash(row.content);
  // Any content edit invalidates all content-bound reviews, including privacy.
  row.reviews=[];
  corrections.push(...changes.map(change=>({id:row.id,parentContentHash:original.contentHash,...change})));
  rows.push({id:row.id,scenarioGroup:row.scenarioGroup,query:row.content.query,parentContentHash:original.contentHash,
   contentHash:row.contentHash,status:'PENDING_SEMANTIC_REVIEW',reasons,changes,
   target:row.content.target});
  return [row];
 });
 const groups=new Set(cases.map(r=>r.scenarioGroup));
 const dataset={...source,cases,splitPlan:source.splitPlan.filter(g=>groups.has(g.scenarioGroup))};
 const audit=auditUnderstandingDataset(dataset,understandingSplitHash(dataset.splitPlan));
 return {dataset,report:{version:'backyrd.nuknuk-corpus-vocabulary-review@1',parentHash:contentHash(source),
  vocabularyHash:NUKNUK_TRAINING_VOCABULARY_HASH,counts:{examined:source.cases.length,training:cases.length,
   correctedCases:new Set(corrections.map(c=>c.id)).size,corrections:corrections.length,
   focusedReviewCases:rows.filter(r=>r.reasons.length).length,pendingSemanticReview:rows.length,excludedEvaluation:excluded.length},
  exportReady:audit.exportReady,productionEnabled:false,trainingStarted:false,
  limitations:['FINITE_ROLE_CHECKS_ARE_NOT_A_COMPLETE_LANGUAGE_OR_SEMANTIC_REVIEW','UNKNOWN_CONCEPT_IS_NOT_AN_ERROR','NO_NEW_GOLD_APPROVALS_CREATED'],
  corrections,excluded,inventory:[...inventory.values()],cases:rows}};
}
async function main(){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('usage: input-dataset.json new-output-directory');
 const source=JSON.parse(await readFile(resolve(input),'utf8')),result=prepareVocabularyReview(source);
 // Refuse an existing directory to keep old evidence immutable.
 await mkdir(resolve(output));
 for(const [name,value]of [['review-draft.json',result.dataset],['vocabulary.json',NUKNUK_TRAINING_VOCABULARY],['review-report.json',result.report]])
  await writeFile(resolve(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output:resolve(output),...result.report.counts,exportReady:result.report.exportReady}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
