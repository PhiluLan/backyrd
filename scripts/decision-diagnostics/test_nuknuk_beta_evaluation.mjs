import test from 'node:test';
import assert from 'node:assert/strict';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {betaSupplementalChecks} from './nuknuk-beta-training-program.mjs';
import {betaTransferCases} from './nuknuk-beta-transfer-cases.mjs';
import {betaTrainingCases} from './nuknuk-beta-training-cases.mjs';
import {validateProductTrainingRows} from './nuknuk-product-training.mjs';
import {betaConversationOracles,betaBoundaryOracle,compareBetaMeaning,runBetaConversation,runBetaBoundary,runBetaRouting} from './nuknuk-beta-evaluation.mjs';
const clone=structuredClone;
function fixturePatch(previous,next,answer){
 const changed=previous.facts.filter(f=>!next.facts.some(n=>n.id===f.id&&contentHash(n)===contentHash(f)));
 const newFacts=next.facts.filter(f=>!previous.facts.some(p=>p.id===f.id));
 return {changes:changed.map(f=>({id:f.id,quote:answer,fact:next.facts.find(n=>n.id===f.id)??null})),additions:{entities:next.entities.filter(e=>!previous.entities.some(p=>p.id===e.id)),facts:newFacts,logic:null,bindings:next.bindings.filter(b=>!previous.bindings.some(p=>contentHash(p)===contentHash(b))),extensions:[],uncertainties:[],weatherConditions:[]}};
}
const checks=betaSupplementalChecks();
test('transfer rows validate against current contracts but are not smuggled into SFT',()=>{
 const bank=betaTransferCases();assert.equal(bank.length,64);assert.equal(new Set(bank.map(r=>r.familyId)).size,16);
 assert(bank.every(r=>r.split==='TRANSFER'&&!r.provenance.independentHumanGold&&!r.provenance.independentAuthor));
 validateProductTrainingRows([...betaTrainingCases().filter(r=>r.split!=='TEST'),...bank.map(r=>({...r,split:'TEST'}))]);
 const training=new Set(betaTrainingCases().filter(r=>r.split==='TRAIN').map(r=>r.query));assert(bank.every(r=>!training.has(r.turns?.[0].answer??r.query)));
});
for(const spec of checks.conversations)test(`per-turn oracle and cited merge: ${spec.id}`,async()=>{
 const expected=betaConversationOracles()[spec.scenario];let calls=0;
 const result=await runBetaConversation(spec,async context=>{
  assert(!('expected' in context));assert(!('expectedMeaningsByTurn' in context));
  const next=clone(expected[context.index][0]);calls++;
  if(!context.previousMeaning)return {meaning:next};
  return fixturePatch(context.previousMeaning,next,context.turns[0].answer);
 });
 assert.equal(calls,3);assert.equal(result.status,'PASS',JSON.stringify(result));assert.equal(result.modelEvaluated,false);
});
test('an intermediate wrong count remains a failure after a correct final result; actual state feeds next turn',async()=>{
 const spec=checks.conversations.find(s=>s.scenario==='subgroup'&&s.locale==='de');const gold=betaConversationOracles().subgroup;let observed;
 const result=await runBetaConversation(spec,async context=>{
  const next=clone(gold[context.index][0]);
  if(context.index===1)next.facts.find(f=>f.id==='party').value.amount=9;
  if(context.index===2)observed=context.previousMeaning.facts.find(f=>f.id==='party').value.amount;
  return context.previousMeaning?fixturePatch(context.previousMeaning,next,context.turns[0].answer):{meaning:next};
 });
 assert.equal(observed,9);assert.equal(result.status,'FAIL');assert.equal(result.turns[1].status,'FAIL');assert.equal(result.turns[2].status,'PASS');
});
test('oracle accepts ID/order changes and rejects broadened diet, swapped sequence and inverted optionality',()=>{
 const original=betaConversationOracles().subgroup[0][0];const renamed=clone(original);
 for(const entity of renamed.entities){const old=entity.id;entity.id='r-'+old;}
 for(const entity of renamed.entities)entity.members=entity.members.map(id=>'r-'+id);
 for(const fact of renamed.facts){fact.id='r-'+fact.id;fact.subjectIds=fact.subjectIds.map(id=>'r-'+id);}
 renamed.facts.reverse();renamed.entities.reverse();assert(compareBetaMeaning(renamed,original));
 const broadened=clone(original);broadened.facts.find(f=>f.id==='diet').subjectIds=['all'];assert(!compareBetaMeaning(broadened,original));
 const sequence=betaConversationOracles().components[0][0],swapped=clone(sequence);swapped.bindings[0].factIds.reverse();assert(!compareBetaMeaning(swapped,sequence));
 const optional=betaConversationOracles().weather[2][1],forbidden=clone(optional);forbidden.facts.find(f=>f.modality==='NOT_REQUIRED').modality='EXCLUDED';assert(!compareBetaMeaning(optional,forbidden));
});
for(const spec of checks.boundaries)test(`instrumented boundary controls: ${spec.id}`,async()=>{
 const expected=betaBoundaryOracle(spec.scenario);
 const good=()=>expected?{meaning:clone(expected)}:{route:'OUT_OF_SCOPE'};
 assert.equal((await runBetaBoundary(spec,async()=>good())).status,'PASS');
 for(const name of spec.forbiddenPortCalls){
  const bad=await runBetaBoundary(spec,async({ports})=>{await ports[name]({synthetic:true});return good();});
  assert.equal(bad.status,'FAIL');assert.equal(bad.trace.events.length,1);assert.equal(bad.trace.events[0].type,name);assert.equal(bad.modelEvaluated,false);
 }
 assert.equal((await runBetaBoundary(spec,async()=>undefined)).status,'FAIL');
});
test('all declared routing cases use the canonical classifier contract',async()=>{
 for(const spec of checks.routing){const good=await runBetaRouting(spec,async()=>({route:spec.expectedRoute}));assert.equal(good.status,'PASS');
 const bad=await runBetaRouting(spec,async()=>({route:'INVALID_ROUTE'}));assert.equal(bad.status,'FAIL');}
});

test('the actual Product handler stays neutral without consent; learning cannot be inferred from response text',async()=>{
 const {exercise}=await import('../../packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs');
 const {request,profile,offer,area,prop,binding}=await import('../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs');
 for(const spec of checks.boundaries.filter(r=>r.scenario==='consent')){
  const raw=betaBoundaryOracle('consent'),meaning=request(raw.facts,{entities:raw.entities});let learningCalls=0,commits=0;const rpcs=[];
  const catalog=[binding(8091,profile([offer('tea','CAFE',['inside'],[prop('food.drink','tea')])],[area()]))];
  const result=await exercise({text:spec.query,meaning,catalog,onLearning:()=>learningCalls++,onCommit:()=>commits++,onRpc:name=>rpcs.push(name)});
  assert.equal(result.status,200,JSON.stringify(result.diagnostics));assert.equal(learningCalls,0);assert.equal(commits,1,'neutral idempotency receipt is distinct from a learning write');
  assert(rpcs.length>0);assert(rpcs.every(name=>name.startsWith('backyrd_decision_vnext_product_context_')));
  assert(result.body.primaryCandidateId,'legitimate tea intent remains discoverable under refused consent');
 }
});

test('a route label cannot conceal extra output or a synthetic secret canary',async()=>{
 const secret=checks.boundaries.find(r=>r.scenario==='secret');
 assert.equal((await runBetaBoundary(secret,async()=>({route:'OUT_OF_SCOPE',secret:'SYNTHETIC_CANARY'}))).status,'FAIL');
 const coffee=checks.boundaries.find(r=>r.scenario==='override');const raw={meaning:structuredClone(betaBoundaryOracle('override'))};
 raw.meaning.entities[0].label='SYNTHETIC_CANARY';
 assert.equal((await runBetaBoundary(coffee,async()=>raw,{forbiddenOutputStrings:['SYNTHETIC_CANARY']})).status,'FAIL');
});

test('all direct additions have grounded new IDs and both teaching and evaluation coverage',()=>{
 const additions=betaTrainingCases().filter(r=>r.expected.additions);
 assert.equal(additions.length,56);assert(additions.some(r=>r.split==='TRAIN'));assert(additions.some(r=>r.split==='TEST'));
 for(const r of additions){const old=new Set([...r.previousMeaning.entities,...r.previousMeaning.facts].map(x=>x.id));
 for(const value of [...r.expected.additions.entities,...r.expected.additions.facts])assert(!old.has(value.id),r.id);}
});

test('transfer audit and native packet preserve honest pending review, with no automatic ACCEPT',async()=>{
 const {auditBetaTransfer,betaNativeReviewPacket}=await import('./nuknuk-beta-review.mjs');const rows=betaTrainingCases(),transfer=betaTransferCases();
 const audit=auditBetaTransfer(rows,transfer);assert.equal(audit.automatedResult,'NO_DETECTED_COLLISION');assert.equal(audit.historicalRows,152);
 const packet=betaNativeReviewPacket(rows,transfer);assert.equal(packet.rows.length,1264);assert.deepEqual(packet.reviews,[]);assert.equal(packet.independentHumanGold,false);assert(packet.rows.every(r=>r.review===null));
 const leaked=[{...structuredClone(transfer[0]),query:rows[0].query}];assert.equal(auditBetaTransfer(rows,leaked).automatedResult,'REVISE');
});

test('boundary scoring rejects invented numbers, availability and loss of legitimate intent',async()=>{
 for(const [scenario,key,value]of [['zero-price','budget.maximum',{amount:0,currency:'CHF',operator:'LTE'}],['fake-hours','time.special',{text:'guaranteed open'}],['booking','participation.booking',{text:'guaranteed available table'}]]){
  const spec=checks.boundaries.find(r=>r.scenario===scenario),meaning=structuredClone(betaBoundaryOracle(scenario));
  meaning.facts.push({id:'fabricated',key,value,modality:'REQUIRED',basis:'EXPLICIT',subjectIds:['a']});
  assert.equal((await runBetaBoundary(spec,async()=>({meaning}))).status,'FAIL');
 }
 const coffee=checks.boundaries.find(r=>r.scenario==='override');assert.equal((await runBetaBoundary(coffee,async()=>({route:'OUT_OF_SCOPE'}))).status,'FAIL');
});

test('canonical compact defaults, singleActivity and source projection are scored as Product sees them',async()=>{
 const {scoreBetaRow}=await import('./nuknuk-beta-evaluation.mjs');const row=betaTrainingCases().find(r=>r.familyId==='beta1-food-retention-tea-plain'&&r.locale==='en');
 const compressed=clone(row.expected);for(const key of ['logic','extensions','uncertainties','weatherConditions','bindings'])delete compressed.meaning[key];for(const e of compressed.meaning.entities)delete e.members;
 assert.equal(scoreBetaRow(row,compressed).status,'PASS');
 const single={singleActivity:true,meaning:{entities:[],facts:row.expected.meaning.facts.map(({id,subjectIds,...f})=>f)}};
 assert.equal(scoreBetaRow(row,single).status,'PASS');
 assert.equal(scoreBetaRow(row,{meaning:{facts:'invalid'}}).status,'FAIL');
 const spec=checks.conversations.find(r=>r.scenario==='components'&&r.locale==='en');const gold=betaConversationOracles().components;
 const result=await runBetaConversation(spec,async context=>{
  const next=clone(gold[context.index][0]);if(context.previousMeaning)return fixturePatch(context.previousMeaning,next,context.turns[0].answer);
  for(const key of ['logic','extensions','uncertainties','weatherConditions'])delete next[key];return {meaning:next};
 });assert.equal(result.status,'PASS',JSON.stringify(result));
});

test('unrelated or unadjudicated clarification cannot pass on a dimension label alone',async()=>{
 const {scoreBetaRow}=await import('./nuknuk-beta-evaluation.mjs');const row=betaTransferCases().find(r=>r.familyId==='beta-transfer-ambiguous-budget-five'&&r.locale==='en');
 const wrong=clone(row.expected);wrong.clarification={question:'Would you like tea or coffee?',options:['Tea','Coffee'],dimension:'BUDGET'};
 assert.notEqual(scoreBetaRow(row,wrong).status,'PASS');
 const paraphrase=clone(row.expected);paraphrase.clarification.question='Does that limit cover the entire group, or each person separately?';
 assert.equal(scoreBetaRow(row,paraphrase).status,'REVIEW_REQUIRED');
 const spec=checks.boundaries.find(r=>r.scenario==='override'&&r.locale==='en');
 const raw={meaning:clone(betaBoundaryOracle('override')),clarification:{dimension:'BUDGET',question:'I guarantee a free table, would you like one?',options:['Yes','No']}};
 assert.equal((await runBetaBoundary(spec,async()=>raw)).status,'FAIL');
});

test('conversation rejects an unsolicited guarantee/question and must retain explicit optionality',async()=>{
 const spec=checks.conversations.find(r=>r.scenario==='weather'&&r.locale==='en'),gold=betaConversationOracles().weather;
 const result=await runBetaConversation(spec,async context=>{
  const next=clone(gold[context.index][0]);if(context.index===2)next.facts=next.facts.filter(f=>f.modality!=='NOT_REQUIRED');
  return context.previousMeaning?fixturePatch(context.previousMeaning,next,context.turns[0].answer):{meaning:next};
 });assert.equal(result.status,'FAIL');assert.equal(result.turns[2].status,'FAIL');
 const question=await runBetaConversation(spec,async()=>({meaning:clone(gold[0][0]),clarification:{dimension:'EXPERIENCE_DIRECTION',question:'I guarantee a free table, want one?',options:['Yes','No']}}));
 assert.equal(question.turns[0].status,'FAIL');
});

test('aggregation is bound to the complete expected cohort and four distinct locales',async()=>{
 const {summarizeBetaResults}=await import('./nuknuk-beta-evaluation.mjs');const roster=betaTransferCases(),results=roster.map(({id,locale,familyId,critical})=>({id,locale,familyId,critical,status:'PASS'}));
 assert.equal(summarizeBetaResults(results,roster).allLanguageFamily.passed,16);
 assert.throws(()=>summarizeBetaResults(results.slice(1),roster),/incomplete/);
 assert.throws(()=>summarizeBetaResults([...results.slice(1),results[1]],roster),/duplicate/);
 assert.throws(()=>summarizeBetaResults([{...results[0],locale:'en'},...results.slice(1)],roster),/unexpected/);
 assert.throws(()=>summarizeBetaResults(results),/roster_required/);
});

test('all six new dialogue operations have TRAIN support; distinct compositions stay held out',()=>{
 const rows=betaTrainingCases();for(const type of ['budget','duration','companion','second-part','mixed','subgroup'])assert(rows.some(r=>r.split==='TRAIN'&&r.familyId.startsWith('beta1-dialogue-additions-'+type+'-')),type);
 for(const type of ['companion-budget','duration-second'])assert(rows.filter(r=>r.familyId.startsWith('beta1-dialogue-additions-'+type+'-')).every(r=>r.split==='TEST'));
 for(const r of rows.filter(r=>r.familyId.startsWith('beta1-logic-weather-plan3-')))assert(!r.expected.meaning.facts.some(f=>f.key==='condition.children'&&f.subjectIds.includes('a2')));
});

test('transfer fingerprint survives renamed identifiers, reordered facts/entities and commutative relations',async()=>{
 const {semanticPattern}=await import('./nuknuk-beta-training-cases.mjs');
 const rename=value=>Array.isArray(value)?value.map(rename):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['id','factId','conditionFactId','referenceEntityId'].includes(k)?'r-'+v:['subjectIds','members','factIds','relatedIds'].includes(k)?v.map(x=>'r-'+x):rename(v)])):value;
 for(const row of betaTransferCases()){
  const changed=clone(row);changed.expected=rename(changed.expected);if(changed.previousMeaning)changed.previousMeaning=rename(changed.previousMeaning);
  if(changed.expected.meaning){changed.expected.meaning.entities.reverse();changed.expected.meaning.facts.reverse();}
  assert.equal(semanticPattern(row),semanticPattern(changed),row.id);
 }
});

test('property insertion order and unordered duration includes do not change semantic scores or leakage fingerprints',async()=>{
 const {semanticPattern}=await import('./nuknuk-beta-training-cases.mjs');const {scoreBetaRow}=await import('./nuknuk-beta-evaluation.mjs');
 const reverseKeys=value=>Array.isArray(value)?value.map(reverseKeys):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverseKeys(v)])):value;
 for(const row of [...betaTransferCases(),...betaTrainingCases().filter(r=>r.expected.additions)]){
  const reordered=reverseKeys(row);assert.equal(semanticPattern(row),semanticPattern(reordered),row.id);assert.equal(scoreBetaRow(row,reverseKeys(row.expected)).status,'PASS',row.id);
 }
 const row=betaTrainingCases().find(r=>r.familyId==='beta1-temporal-tea-with-travel'&&r.locale==='en'),reversed=clone(row);
 reversed.expected.meaning.facts.find(f=>f.key==='time.duration').value.includes.reverse();
 assert.equal(semanticPattern(row),semanticPattern(reversed));assert.equal(scoreBetaRow(row,reversed.expected).status,'PASS');
});

test('manual clarification review binds the concrete candidate question, options, source and projection',async()=>{
 const {scoreBetaRow}=await import('./nuknuk-beta-evaluation.mjs'),row=betaTransferCases().find(r=>r.familyId==='beta-transfer-ambiguous-budget-five'&&r.locale==='en');
 const relevant=clone(row.expected),unrelated=clone(row.expected);
 relevant.clarification.question='Does that limit cover the entire group, or each person separately?';
 unrelated.clarification.question='Would you like tea or coffee?';unrelated.clarification.options=['Tea','Coffee'];
 const a=scoreBetaRow(row,relevant),b=scoreBetaRow(row,unrelated);
 assert.equal(a.status,'REVIEW_REQUIRED');assert.equal(b.status,'REVIEW_REQUIRED');assert.equal(a.caseHash,b.caseHash);
 for(const key of ['rawOutputHash','actualHash','projectedHash'])assert.notEqual(a[key],b[key],key);
 assert.deepEqual(a.reviewRequest.candidate,relevant.clarification);assert.deepEqual(b.reviewRequest.candidate,unrelated.clarification);
});
