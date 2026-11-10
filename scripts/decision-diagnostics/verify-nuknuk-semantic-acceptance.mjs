#!/usr/bin/env node
/** Local evidence probes on reviewed targets through the real Bibliothekar.
 * No model, production data or network. The fixtures are intentionally tiny. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {acceptFrozenSemanticCorpus,REVIEW_PARENT_HASH} from './nuknuk-semantic-acceptance.mjs';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {validateNuknukUnderstanding} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {auditUnderstandingDataset,understandingSplitHash} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import {profile,offer,area,prop,binding as originalBinding,worldFact,search} from '../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
const [parentFile,outputDirectory]=process.argv.slice(2);if(!parentFile||!outputDirectory)throw Error('parent-and-output-required');
const parent=JSON.parse(await readFile(resolve(parentFile),'utf8'));
const approved=JSON.parse(await readFile(resolve(outputDirectory,'approved-train.json'),'utf8'));
const quarantine=JSON.parse(await readFile(resolve(outputDirectory,'quarantined.json'),'utf8'));
const report=JSON.parse(await readFile(resolve(outputDirectory,'semantic-acceptance.json'),'utf8'));
assert.equal(contentHash(parent),REVIEW_PARENT_HASH);
// All 2,000 lexical/numeric expansions must equal the actual authored families
// reviewed here. A matching family name alone is never sufficient approval.
const {round4Specs}=await import('./nuknuk-round4-cases.mjs');
const {makeInterpretation}=await import('./nuknuk-pilot-authoring.mjs');
const {cleanRound5Training}=await import('./nuknuk-round5-cases.mjs');
const {prepareVocabularyReview}=await import('./nuknuk-corpus-vocabulary-audit.mjs');
const expanded=round4Specs().filter(r=>r.split==='TRAIN').map(r=>makeInterpretation(r,r));
const source={version:parent.version,cases:expanded,splitPlan:[...new Set(expanded.map(r=>r.scenarioGroup))].map(scenarioGroup=>({scenarioGroup,split:'TRAIN'}))};
const regenerated=prepareVocabularyReview(cleanRound5Training(source).dataset).dataset;
assert.equal(regenerated.cases.length,2000);
for(const r of regenerated.cases)assert.equal(contentHash(r.content),parent.cases.find(c=>c.id===r.id)?.contentHash,'reviewed expansion '+r.id);

assert.equal(approved.cases.length+quarantine.cases.length,parent.cases.length);
assert.equal(new Set([...approved.cases,...quarantine.cases].map(r=>r.id)).size,parent.cases.length);
assert.equal(report.counts.pending,0);
assert(approved.cases.every(c=>c.content.trainingPermission==='APPROVED'&&c.reviews.every(r=>r.verdict==='ACCEPT')));
assert(quarantine.cases.every(c=>c.content.trainingPermission==='PENDING'));
assert(auditUnderstandingDataset(approved,understandingSplitHash(approved.splitPlan)).cases.every(c=>!c.blockers.length));
const altered=structuredClone(parent);altered.cases[0].content.query+=' andere Bedeutung';
assert.throws(()=>acceptFrozenSemanticCorpus(altered,report.reviewedAt),/snapshot_changed/);
const row=id=>{const r=approved.cases.find(c=>c.id===id);assert(r,'approved '+id);return r;};
const plan=r=>validateNuknukUnderstanding(r.content.target,r.content).plan;
const b=(id,p,extra=[])=>{const raw=originalBinding(id,p,extra);return {...raw,decisionProjection:{...raw.decisionProjection,
 facts:raw.decisionProjection.facts.map(f=>f.key==='classification.place_types'?worldFact(f.key,[p.category==='SPORT'?'SPORTS_CENTRE':p.category]):f)}};};
const probes=[];
function probe(name,r,catalog,expected){const actual=search(plan(r),catalog).ranked.length;assert.equal(actual,expected,name);probes.push({name,caseId:r.id,ranked:actual,expected});}
const combination=row('r5-train-composition-2');
const separate=profile([offer('boulder','BOULDERING',['play']),offer('food','GASTRONOMY',['eat'],[prop('food.dish','Pizza')])],[area('play'),area('eat')],'SPORT');
probe('Pizza and bouldering may be in separate rooms of same venue',combination,[b(7711,separate)],1);
probe('Bouldering without requested pizza is insufficient',combination,[b(7712,profile([offer('boulder','BOULDERING',['play'])],[area('play')],'SPORT'))],0);
const old=parent.cases.find(c=>c.id===combination.id);
probe('Old target wrongly demanded common offer/room witness',old,[b(7713,separate)],0);
const talk=row('r5-train-area-5');
probe('Conversation possible without silence',talk,[b(7714,profile([offer()],[area('inside',[prop('atmosphere.conversation','Unterhaltung gut möglich')])]))],1);
probe('Quiet alone does not prove conversation',talk,[b(7715,profile([offer()],[area('inside',[prop('atmosphere.noise','ruhig')])]))],0);
const booking=row('r5-train-booking-1');
probe('Recommended reservation satisfies no mandatory reservation',booking,[b(7716,profile([offer('dinner','DINNER',['inside'],[prop('participation.booking','Reservation empfohlen')])]))],1);
probe('Required reservation violates spontaneous duty',booking,[b(7717,profile([offer('dinner','DINNER',['inside'],[prop('participation.booking','Reservation erforderlich')])]))],0);
const own=row('r5-train-food_permission-1');const play=profile([offer('boulder','BOULDERING',['play'])],[area('play')],'SPORT');
probe('Own food permission without catering is enough',own,[b(7718,play,[worldFact('rule.external_food',{policy:'ALLOWED',exceptions:[]})])],1);
probe('Catering cannot substitute for own food permission',own,[b(7719,play,[worldFact('rule.external_food',{policy:'NOT_ALLOWED',exceptions:[]})])],0);
const special=row('r5-train-occasion-4');
probe('Special wish does not demand luxury evidence',special,[b(7720,profile())],1);
for(const id of ['expanded-recipient-context-08','expanded-family-precision-10']){
 const m=row(id).content.target.meaning;assert(m.facts.some(f=>f.key==='people.count'&&f.value.amount===3&&f.subjectIds.length===0));
 assert(m.facts.some(f=>f.key==='people.participation'&&f.subjectIds.includes('pSelf')));
}
assert.equal(row('r2-scope-3').content.target.meaning.facts.find(f=>f.key==='food.meal').modality,'NOT_REQUIRED');
assert(row('r2-scope-3').content.target.moment.clarification);
assert.equal(row('r2-binding-8').content.target.meaning.facts.find(f=>f.value.text==='Brot').modality,'NOT_REQUIRED');
assert.equal(row('expanded-logical-binding-09').content.target.meaning.facts.find(f=>f.key==='offer.kind').modality,'PREFERRED');
const results={version:'backyrd.nuknuk-semantic-acceptance-probes@1',parentHash:contentHash(parent),approvedHash:contentHash(approved),
 quarantinedHash:contentHash(quarantine),probes,limitations:['SYNTHETIC_MATCHING_PROBES_NOT_A_NEW_MODEL_EVALUATION','NO_PRODUCTION_DATA_READ_OR_CHANGED']};
await writeFile(resolve(outputDirectory,'matching-probes.json'),JSON.stringify(results,null,2)+'\n',{flag:'wx'}).catch(async error=>{
 if(error.code!=='EEXIST')throw error;
 assert.deepEqual(JSON.parse(await readFile(resolve(outputDirectory,'matching-probes.json'),'utf8')),results,'existing evidence must match; never overwrite');
});
console.log(JSON.stringify({coverage:report.counts,matchingProbes:probes.length,allPassed:true}));
