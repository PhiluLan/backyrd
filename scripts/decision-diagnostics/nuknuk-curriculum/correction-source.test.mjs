import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {correctionTrainingSpecs,correctionFamilies} from './correction-source.mjs';
import {materializeBetaCases,isolateSplits} from './beta-catalog.mjs';
import {betaMixture} from './beta-mixture.mjs';
import {pendingSemanticChecks,validateCompletedJudgements,diagnosticSelection,CORRECTION_SELECTION,reconcilePeerReviews} from './correction-evaluation.mjs';
const specs=correctionTrainingSpecs(),raw=materializeBetaCases(specs),isolated=isolateSplits(raw.rows,correctionFamilies(specs));
test('full correction inventory is grounded, serializable, unique and retains four strata',()=>{
 assert.equal(specs.length,500);assert.equal(raw.rows.length,1000);assert.deepEqual(raw.rejections,[]);assert.equal(new Set(raw.rows.map(r=>r.query+JSON.stringify(r.turns))).size,1000);
 const mix=betaMixture(isolated.rows);assert.equal(mix.trainingRows,1000);assert.equal(Object.keys(mix.stratumMass).length,4);assert.deepEqual(isolated.adjustments,[]);
 assert(!raw.rows.some(r=>/ich bin selbst nicht dabei|ich bi selber nöd debii/.test(r.query.toLowerCase())));
});
test('atomic dialogue targets preserve core activity and distinguish preference from obligation',()=>{
 for(const r of raw.rows.filter(r=>r.task==='DIALOGAKTUALISIERUNG_V3')){
  assert.deepEqual(r.finalMeaning.facts.find(f=>f.id==='f1'),r.previousMeaning.facts.find(f=>f.id==='f1'));
  if(r.family.includes('dialogue-area'))assert.equal(r.finalMeaning.facts.find(f=>f.key==='offer.area').modality,'PREFERRED');
 }
});
test('no default semantic PASS, including Mikes missing-date/activity/jazz/access/shade probes',()=>{
 for(const requirement of ['Besuchstag erhalten','Hauptaktivität erhalten','Verlangter Jazz nicht ausgeschlossen','Stufenloser Zugang verpflichtend','Schatten verpflichtend']){
  const checks=pendingSemanticChecks({mustUnderstand:[requirement],mustNotInfer:['Gegenteil oder Auslassung']});assert(checks.every(c=>c.status==='UNREVIEWED'));
 }
 assert.throws(()=>pendingSemanticChecks({mustUnderstand:[]}),/criteria_missing/);
});
test('incomplete or fabricated review coverage cannot produce accepted understanding judgments',()=>{
 const packet={cases:[{id:'one',parentRawSha256:'p',candidateRawSha256:'n',checks:pendingSemanticChecks({mustUnderstand:['Datum','Aktivität'],mustNotInfer:['Andere Aktivität']})}]};
 assert.throws(()=>validateCompletedJudgements(packet,{packetSha256:'wrong',cases:[]}),/roster_not_bound/);
});
test('diagnostic selection cannot pretend semantic approval and requires actual paired DEV identity',()=>{
 const p={split:'DEV',datasetHash:'d'.repeat(64),modelEvaluated:true,adapterSha256:'a'.repeat(64),total:1,cases:[{id:'one'}]},n={...p,adapterSha256:'b'.repeat(64)};
 const x=diagnosticSelection({datasetHash:'d'.repeat(64),bundleHash:'e'.repeat(64),parent:p,candidate:n,parentBytes:'old',candidateBytes:'new'});
 assert.equal(x.status,CORRECTION_SELECTION);assert.equal(x.semanticQualityApproved,false);assert.equal(x.activationAuthorized,false);assert.equal(x.testUsedForSelection,false);
 assert.throws(()=>diagnosticSelection({datasetHash:'d'.repeat(64),bundleHash:'e'.repeat(64),parent:p,candidate:{...n,split:'TEST'},parentBytes:'old',candidateBytes:'new'}),/complete_dev_required/);
});

test('complete answers cannot be labelled incomplete, and unclear cannot conceal met or violated checks',()=>{
 const checks=pendingSemanticChecks({mustUnderstand:['Tee'],mustNotInfer:['Kaffee']}),raw={meaning:{facts:[{key:'food.drink',value:{text:'tea'},modality:'REQUIRED'}]}};
 const packet={cases:[{id:'one',parentRawSha256:'p',candidateRawSha256:'n',parentRaw:raw,candidateRaw:raw,checks}]};
 const reviewed={verdict:'UNDERSTOOD',additionalFactsAudit:{status:'NONE_FOUND',evidence:'Keine weitere relevante erfundene Behauptung im Original.'},checks:checks.map(c=>({id:c.id,status:'MET',evidence:'Die vollständige Originalantwort nennt Tee und keinen Kaffee.'}))};
 const j={packetSha256:createHash('sha256').update(JSON.stringify(packet,null,2)+'\n').digest('hex'),cases:[{id:'one',parentRawSha256:'p',candidateRawSha256:'n',parent:structuredClone(reviewed),candidate:structuredClone(reviewed)}]};
 assert.equal(validateCompletedJudgements(packet,j).checkedCases,1);
 j.cases[0].candidate.verdict='NO_COMPLETE_OUTPUT';assert.throws(()=>validateCompletedJudgements(packet,j),/inconsistent_incomplete/);
 j.cases[0].candidate.verdict='UNCLEAR';assert.throws(()=>validateCompletedJudgements(packet,j),/inconsistent_unclear/);
 j.cases[0].candidate.verdict='UNDERSTOOD';j.cases[0].candidate.checks[0].status='UNSCORABLE';assert.throws(()=>validateCompletedJudgements(packet,j),/false_pass/);
});

test('two bound peer reviews preserve disagreement and never count it as understanding',()=>{
 const checks=pendingSemanticChecks({mustUnderstand:['Tee']}), raw={facts:[]};
 const packet={cases:[{id:'one',scenarioGroup:'g',parentRawSha256:'p',candidateRawSha256:'n',parentRaw:raw,candidateRaw:raw,checks}]};
 const pass={verdict:'UNDERSTOOD',additionalFactsAudit:{status:'NONE_FOUND',evidence:'Keine weitere relevante erfundene Behauptung im Original.'},checks:[{id:'mustUnderstand-0',status:'MET',evidence:'Tee explizit im Original.'}]};
 const a={reviewerId:'root',packetSha256:createHash('sha256').update(JSON.stringify(packet,null,2)+'\n').digest('hex'),cases:[{id:'one',parentRawSha256:'p',candidateRawSha256:'n',parent:pass,candidate:pass}]};
 const b=structuredClone(a);b.reviewerId='Mike';
 assert.equal(reconcilePeerReviews(packet,a,b).conclusiveGroups,1);
 b.cases[0].candidate={verdict:'MISUNDERSTOOD',additionalFactsAudit:{status:'NONE_FOUND',evidence:'Alle weiteren Aussagen geprüft.'},checks:[{id:'mustUnderstand-0',status:'VIOLATED',evidence:'Tee fehlt in der Antwort.'}]};
 const result=reconcilePeerReviews(packet,a,b);assert.equal(result.conclusiveGroups,0);assert.equal(result.cases[0].candidate,'UNCLEAR');assert.equal(result.activationAuthorized,false);
 b.reviewerId='root';assert.throws(()=>reconcilePeerReviews(packet,a,b),/distinct_reviewers/);
});

test('confirmed locale error does not hide missing locale from shared group coverage',()=>{
 const checks=pendingSemanticChecks({mustUnderstand:['Tee']});
 const packet={cases:['de','de-CH'].map((locale,i)=>({id:locale,scenarioGroup:'g',parentRawSha256:'p',candidateRawSha256:'n',parentRaw:i?null:{facts:[]},candidateRaw:i?null:{facts:[]},checks}))};
 const bad={verdict:'MISUNDERSTOOD',additionalFactsAudit:{status:'NONE_FOUND',evidence:'Keine weiteren Erfindungen.'},checks:[{id:'mustUnderstand-0',status:'VIOLATED',evidence:'Tee fehlt.'}]};
 const missing={verdict:'NO_COMPLETE_OUTPUT',additionalFactsAudit:{status:'UNSCORABLE',evidence:'Keine vollständige Ausgabe.'},checks:[{id:'mustUnderstand-0',status:'UNSCORABLE',evidence:'Keine vollständige Ausgabe.'}]};
 const a={reviewerId:'root',packetSha256:createHash('sha256').update(JSON.stringify(packet,null,2)+'\n').digest('hex'),cases:packet.cases.map((c,i)=>({id:c.id,parentRawSha256:'p',candidateRawSha256:'n',parent:i?missing:bad,candidate:i?missing:bad}))};
 const b=structuredClone(a);b.reviewerId='Mike';const result=reconcilePeerReviews(packet,a,b);
 assert.equal(result.groups[0].candidate,'MISUNDERSTOOD');assert.equal(result.sharedConclusiveCoverage,0);assert.equal(result.conclusiveGroups,0);
});
