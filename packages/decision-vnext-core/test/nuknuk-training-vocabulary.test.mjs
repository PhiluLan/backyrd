import test from 'node:test';
import assert from 'node:assert/strict';
import {librarianConcept,sameLibrarianText} from '@backyrd/world-knowledge-core';
import {inspectNuknukTrainingVocabulary,NUKNUK_TRAINING_VOCABULARY_HASH} from '../dist/nuknuk-training-vocabulary.js';
import {buildNuknukUnderstandingRequest} from '../dist/nuknuk-understanding.js';
import {contentHash} from '../dist/canonical.js';
import {auditUnderstandingDataset,understandingSplitHash,exportUnderstandingDataset} from '../dist/nuknuk-understanding-learning.js';
import {draftUnderstandingDataset} from '../../../scripts/decision-diagnostics/nuknuk-understanding-cases.mjs';
import {prepareVocabularyReview} from '../../../scripts/decision-diagnostics/nuknuk-corpus-vocabulary-audit.mjs';
const target=(key,text,modality='REQUIRED')=>({meaning:{facts:[{id:'f1',key,value:{text},modality}]}});

test('finite Spot concepts constrain roles, without weakening explicit atmosphere duties',()=>{
 for(const key of ['offer.kind','experience.activity','offer.area','atmosphere.noise'])
  assert.equal(inspectNuknukTrainingVocabulary(target(key,'gemütlich')).length,1,key);
 for(const modality of ['REQUIRED','PREFERRED','EXCLUDED','NOT_REQUIRED'])
  assert.deepEqual(inspectNuknukTrainingVocabulary(target('atmosphere.character','cozy',modality)),[]);
 for(const [key,value]of [['offer.area','Terrasse'],['food.diet','vegan'],['participation.permission','own_food'],['atmosphere.noise','quiet'],['atmosphere.character','ruhig']])
  assert.deepEqual(inspectNuknukTrainingVocabulary(target(key,value)),[]);
 assert.equal(inspectNuknukTrainingVocabulary(target('food.delivery','own_food')).length,1);
 assert.equal(inspectNuknukTrainingVocabulary(target('atmosphere.noise','conversation_possible')).length,1);
});
test('polysemy and unknown vocabulary do not become false automatic rejections',()=>{
 for(const key of ['offer.kind','experience.activity','food.drink'])assert.deepEqual(inspectNuknukTrainingVocabulary(target(key,'Café')),[]);
 assert.deepEqual(inspectNuknukTrainingVocabulary(target('experience.activity','unbekanntes neues Spiel')),[]);
 assert.deepEqual(inspectNuknukTrainingVocabulary(target('experience.occasion','gemütlich')),[],'Only explicit finite role conflicts are checked, no full semantic certification');
});
test('training conversation token and stored profile label share the canonical concept',()=>{
 assert.equal(librarianConcept('conversation_possible'),'conversation');
 assert(sameLibrarianText('conversation_possible','Unterhaltung gut möglich'));
 assert(!sameLibrarianText('conversation_possible','quiet'));
});
test('new profile takes actual Spot registries; existing profile is selected explicitly',()=>{
 const input={query:'Unbedingt gemütlich einen Kaffee trinken',reference:{now:'2026-11-10T12:00:00Z',timezone:'Europe/Zurich'}};
 const current=buildNuknukUnderstandingRequest({...input,instructionProfile:'COMPACT_ADAPTER_V4'});
 const grounded=buildNuknukUnderstandingRequest({...input,instructionProfile:'SPOT_GROUNDED_V5'});
 assert(!current.instructions.includes('SPOT_VOCABULARY'));
 assert(grounded.instructions.includes(NUKNUK_TRAINING_VOCABULARY_HASH));
 assert(grounded.instructions.includes('atmosphere.character'));
 assert(!grounded.instructions.includes('besonders/einzigartig experience.character sind CONTEXT'));
 assert(grounded.instructions.includes('experience.character ist PREFERRED'));
 assert(grounded.instructions.includes('food.meal_extent'));
 assert.notEqual(current.identity.promptHash,grounded.identity.promptHash);
 assert.equal(current.identity.schemaHash,grounded.identity.schemaHash);
});
test('a reviewed but wrongly categorised cozy target cannot be exported',()=>{
 const d=structuredClone(draftUnderstandingDataset());
 const r=d.cases.find(r=>r.content.target.meaning?.facts.some(f=>f.key==='food.meal'));
 const f=r.content.target.meaning.facts.find(f=>f.key==='food.meal'); f.key='offer.feature'; f.value={text:'cozy'};
 r.contentHash=contentHash(r.content);r.reviews=[];
 assert.throws(()=>exportUnderstandingDataset(d,understandingSplitHash(d.splitPlan)),/meaning_contract_failed|not_reviewed/);
});
test('corpus preparation preserves parent and evaluation partition, never fabricates semantic approvals',()=>{
 const source=draftUnderstandingDataset(),before=structuredClone(source);
 const result=prepareVocabularyReview(source);
 assert.deepEqual(source,before);
 assert(result.dataset.cases.every(r=>r.split==='TRAIN'&&r.reviews.length===0&&r.content.trainingPermission==='PENDING'));
 assert.equal(result.report.excluded.length,source.cases.filter(r=>r.split!=='TRAIN').length);
 assert.equal(result.report.counts.examined,source.cases.length);
 assert.equal(result.report.exportReady,false);
});

test('V5 export requires semantic review bound to the current Spot vocabulary',()=>{
 const d=draftUnderstandingDataset();
 d.cases[1].split=d.splitPlan[1].split='VALIDATION';d.cases[2].split=d.splitPlan[2].split='TEST';
 for(const row of d.cases){
  row.content.trainingPermission='APPROVED';row.contentHash=contentHash(row.content);
  row.reviews=['SEMANTICS','PRIVACY_AND_SOURCE_USE'].map(kind=>({kind,verdict:'ACCEPT',contentHash:row.contentHash,reviewer:'test-only',reviewedAt:'2026-11-10T12:00:00Z',note:'Synthetic test fixture, no actual review.'}));
 }
 assert.throws(()=>exportUnderstandingDataset(d,understandingSplitHash(d.splitPlan),'SPOT_GROUNDED_V5'),/vocabulary_review_required/);
 for(const row of d.cases)row.reviews.find(r=>r.kind==='SEMANTICS').vocabularyHash=NUKNUK_TRAINING_VOCABULARY_HASH;
 assert.equal(exportUnderstandingDataset(d,understandingSplitHash(d.splitPlan),'SPOT_GROUNDED_V5').manifest.trainingVocabularyHash,NUKNUK_TRAINING_VOCABULARY_HASH);
});

test('known child-corpus corrections retain modality and parent evidence honestly',async()=>{
 const {round4Specs}=await import('../../../scripts/decision-diagnostics/nuknuk-round4-cases.mjs');
 const {makeInterpretation}=await import('../../../scripts/decision-diagnostics/nuknuk-pilot-authoring.mjs');
 const specs=round4Specs().filter(r=>r.split==='TRAIN'&&r.scenarioGroup==='r4-train-budget-2');
 const cases=specs.map(s=>makeInterpretation(s,s));
 const source={version:'backyrd.nuknuk-understanding-dataset@1',cases,splitPlan:[{scenarioGroup:'r4-train-budget-2',split:'TRAIN'}]};
 const result=prepareVocabularyReview(source);
 assert.equal(result.report.counts.correctedCases,40);
 for(const r of result.dataset.cases){
  assert.equal(r.content.target.meaning.facts.find(f=>f.key==='food.dish').modality,'PREFERRED');
  assert.equal(r.content.target.meaning.facts.find(f=>f.key==='budget.maximum').modality,'PREFERRED');
  assert.equal(r.content.target.meaning.facts.find(f=>f.key==='budget.scope').value.scope,'PER_PERSON');
  assert.equal(r.reviews.length,0);
 }
 assert(source.cases.every(r=>r.content.target.meaning.facts.find(f=>f.key==='food.dish').modality==='REQUIRED'));
});

test('dated semantic acceptance cannot approve another corpus or silently follow vocabulary drift',async()=>{
 const {acceptFrozenSemanticCorpus,REVIEW_VOCABULARY_HASH}=await import('../../../scripts/decision-diagnostics/nuknuk-semantic-acceptance.mjs');
 assert.equal(REVIEW_VOCABULARY_HASH,NUKNUK_TRAINING_VOCABULARY_HASH,'Vocabulary changes require a fresh content review');
 assert.throws(()=>acceptFrozenSemanticCorpus(draftUnderstandingDataset(),'2026-11-10T18:00:00Z'),/semantic_review_snapshot_changed/);
});
