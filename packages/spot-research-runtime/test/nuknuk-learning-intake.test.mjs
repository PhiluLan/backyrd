import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditLearningIntake,learningContentHash,learningSplitPlanHash,NUKNUK_LEARNING_INTAKE_VERSION} from '../dist/nuknuk-learning-intake.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
function candidate(group='venue-one',split='TRAIN',suffix=''){
 const text='Das Beispielhaus bietet Mittagessen an.'+suffix;
 const content={taskVersion:'backyrd.extraction@1.0',methodVersion:'backyrd.research-method@1.0',catalogHash:hash('catalog'),venueGroupId:group,split,sources:[{id:'s1',url:'https://example.org/ort',retrievedAt:'2026-10-21T10:00:00Z',text,hash:hash(text)}],prompt:'Welche Besuchsleistung ist belegt?'+suffix,correctedTarget:JSON.stringify({offer:'Mittagessen'}),claims:[{id:'c1',expectedStatement:'Mittagessen wird angeboten.',scope:'OFFER',subject:'Mittagessen',conditions:'',evidence:[{sourceId:'s1',quote:'Mittagessen',offset:text.indexOf('Mittagessen')}]}],abstentions:[]};
 return {id:group,content,contentHash:learningContentHash(content),reviews:[]};
}
function collection(cases=[candidate()]){return {version:NUKNUK_LEARNING_INTAKE_VERSION,splitPlan:cases.map(c=>({venueGroupId:c.content.venueGroupId,split:c.content.split})),candidates:cases};}
const audit=x=>auditLearningIntake(x,learningSplitPlanHash(x.splitPlan));
const refresh=c=>{c.contentHash=learningContentHash(c.content);return c;};
const review=(c,kind='FACTUAL',verdict='ACCEPT')=>({kind,contentHash:c.contentHash,reviewerId:'reviewer-one',reviewedAt:'2026-10-21T11:00:00Z',verdict,note:'Synthetic test metadata, not a real approval.'});
test('structurally consistent synthetic candidate remains quarantined, no training export',()=>{
 const r=audit(collection());assert.equal(r.structuralIntegrityValid,true);assert.equal(r.readyForTraining,false);assert.equal(r.trainingExportEnabled,false);assert.ok(r.cases[0].blockers.includes('FACTUAL_REVIEW_MISSING'));
});
test('file metadata cannot impersonate authenticated human approval or task-target validation',()=>{
 const c=candidate();c.reviews=[review(c),review(c,'PRIVACY_AND_SOURCE_USE')];const r=audit(collection([c]));assert.equal(r.readyForTraining,false);assert.deepEqual(r.cases[0].blockers,['TASK_TARGET_VALIDATION_NOT_CONNECTED','AUTHENTICATED_REVIEW_NOT_CONNECTED']);
});
test('changing a corrected target invalidates its content binding',()=>{const c=candidate();c.content.correctedTarget='Andere Antwort';assert.throws(()=>audit(collection([c])),/CONTENT_CHANGED/);});
test('fresh content hash cannot reuse a prior review',()=>{const c=candidate();c.reviews=[review(c)];c.content.claims[0].conditions='nur montags';refresh(c);assert.throws(()=>audit(collection([c])),/STALE_REVIEW/);});
test('source text changes require a new snapshot hash',()=>{const c=candidate();c.content.sources[0].text+='Neu';refresh(c);assert.throws(()=>audit(collection([c])),/SOURCE_CHANGED/);});
test('literal evidence must match the exact source offset',()=>{for(const mutate of [c=>c.content.claims[0].evidence[0].quote='Abendessen',c=>c.content.claims[0].evidence[0].offset=0,c=>c.content.claims[0].evidence[0].sourceId='missing']){const c=candidate();mutate(c);refresh(c);assert.throws(()=>audit(collection([c])),/EVIDENCE_INVALID/);}});
test('positive claims cannot omit evidence',()=>{const c=candidate();c.content.claims[0].evidence=[];refresh(c);assert.throws(()=>audit(collection([c])),/ARRAY_INVALID/);});
test('empty answers do not count as a reference',()=>{const c=candidate();c.content.claims=[];refresh(c);assert.throws(()=>audit(collection([c])),/EMPTY_REFERENCE/);});
test('abstention identifies which sources were actually checked',()=>{const c=candidate();c.content.claims=[];c.content.abstentions=[{question:'Terrasse?',checkedSourceIds:['s1'],reason:'Kein Beleg in dieser begrenzten Quelle; kein Nein.'}];refresh(c);assert.equal(audit(collection([c])).readyForTraining,false);c.content.abstentions[0].checkedSourceIds=['other'];refresh(c);assert.throws(()=>audit(collection([c])),/ABSTENTION_SCOPE_INVALID/);});
test('venue grouping must match an independently frozen split plan',()=>{const x=collection();const frozen=learningSplitPlanHash(x.splitPlan);x.candidates[0].content.split='TEST';refresh(x.candidates[0]);assert.throws(()=>auditLearningIntake(x,frozen),/GROUP_SPLIT_MISMATCH/);x.splitPlan[0].split='TEST';assert.throws(()=>auditLearningIntake(x,frozen),/SPLIT_PLAN_CHANGED/);});
test('a venue cannot appear twice in a split plan, even under different splits',()=>{const x=collection();x.splitPlan.push({venueGroupId:'venue-one',split:'TEST'});assert.throws(()=>audit(x),/DUPLICATE_GROUP/);});
test('same source content cannot cross training and test groups',()=>{const a=candidate('a'),b=candidate('b','TEST');b.content.prompt+='separate question';refresh(b);assert.throws(()=>audit(collection([a,b])),/SOURCE_LEAKAGE/);});
test('identical task input cannot cross splits even with changed source text',()=>{const a=candidate('a'),b=candidate('b','VALIDATION',' Neuer Text');b.content.prompt=a.content.prompt;refresh(b);assert.throws(()=>audit(collection([a,b])),/PROMPT_LEAKAGE/);});
test('validation and test records are explicitly ineligible for training',()=>{for(const split of ['VALIDATION','TEST']){const r=audit(collection([candidate('a',split)]));assert.ok(r.cases[0].blockers.includes('NON_TRAINING_SPLIT'));}});
test('rejected reviews remain a blocking finding',()=>{const c=candidate();c.reviews=[review(c,'FACTUAL','REJECT')];assert.ok(audit(collection([c])).cases[0].blockers.includes('REVIEW_REJECTED'));});
test('reviews before source retrieval are invalid',()=>{const c=candidate();c.reviews=[{...review(c),reviewedAt:'2026-10-20T11:00:00Z'}];assert.throws(()=>audit(collection([c])),/REVIEW_PRECEDES_SOURCE/);});
test('duplicate candidate IDs and unknown metadata are rejected',()=>{const a=candidate(),b=candidate('b','TRAIN','extra');b.id=a.id;assert.throws(()=>audit(collection([a,b])),/DUPLICATE_ID/);const x=collection();x.candidates[0].autoApprove=true;assert.throws(()=>audit(x),/SHAPE_INVALID/);});
test('source credentials or URL parameters never enter an accepted intake shape',()=>{for(const url of ['https://user:secret@example.org/','https://example.org/?token=private','http://example.org/']){const c=candidate();c.content.sources[0].url=url;refresh(c);assert.throws(()=>audit(collection([c])),/SOURCE_URL_INVALID/);}});
test('syntactically valid evidence does not certify a false semantic statement',()=>{const c=candidate();c.content.claims[0].expectedStatement='Der Betrieb ist vollständig rollstuhlgängig.';refresh(c);const r=audit(collection([c]));assert.equal(r.readyForTraining,false);assert.ok(r.limitations.includes('LITERAL_EVIDENCE_IS_NOT_SEMANTIC_TRUTH'));});
test('an empty collection is allowed for intake preparation and still cannot train',()=>{const x=collection();x.candidates=[];const r=audit(x);assert.equal(r.counts.candidates,0);assert.equal(r.readyForTraining,false);});
