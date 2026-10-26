import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readResearchDecision,applyScopedVerdicts} from '../dist/nuknuk-spot-plan.js';
import {researchSpotV2,researchDecisionAudit} from '../dist/nuknuk-agent.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
import {decisionAuditHtml} from '../../../scripts/world-knowledge/nuknuk-research.mjs';
import {NUKNUK_MODEL_REVISION} from '../src/nuknuk-research.mjs';
const email='kontakt@synthetic.example';
const body=`<main><h1>Synthetic Restaurant</h1><h2>Kontakt</h2><p>Synthetic Restaurant, Teststrasse 1, Basel</p><p>${email}</p></main>`;
const makeSource=text=>({id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-23T12:00:00Z'});
const stated=(verdict,evidenceQuote,extra={})=>({verdict,reasonCode:verdict==='SUPPORTED'?'DIRECT_SUPPORT':verdict==='UNSUPPORTED'?'NOT_ENTAILED':'INSUFFICIENT_CONTEXT',explanation:'This exact source assertion is the factual basis for the stated verdict.',evidenceQuote,...extra});
for(const verdict of ['SUPPORTED','UNSUPPORTED','AMBIGUOUS']){
 test(`${verdict} requires a reason and literal evidence`,()=>{
  assert.equal(readResearchDecision({verdict},verdict,email).validationError,'DECISION_JUSTIFICATION_MISSING');
  assert.equal(readResearchDecision(stated(verdict,email),verdict,email).validationError,undefined);
  assert.equal(readResearchDecision(stated(verdict,'invented@other.example'),verdict,email).validationError,'DECISION_EVIDENCE_NOT_LITERAL');
 });
}
test('opposite verdict reasons and oversized justifications fail closed',()=>{
 assert.equal(readResearchDecision(stated('UNSUPPORTED',email,{reasonCode:'DIRECT_SUPPORT'}),'UNSUPPORTED',email).validationError,'DECISION_REASON_VERDICT_MISMATCH');
 assert.equal(readResearchDecision(stated('SUPPORTED',email,{explanation:'x'.repeat(601)}),'SUPPORTED',email).validationError,'DECISION_JUSTIFICATION_TOO_LONG');
});
for(const verdict of ['SUPPORTED','UNSUPPORTED','AMBIGUOUS'])test(`scoped ${verdict} preserves stated reason, source and final software decision`,()=>{
 const source=makeSource('Unsere Terrasse ist geöffnet.');
 const candidate={id:'sc1',sourceId:'s1',field:'experience.profile',quote:source.text,scope:'AREA',entityKind:'TERRACE',entityName:'Terrasse',propertyKey:'',valueJson:'null',blockId:'b1',belongsTo:'TARGET',applicability:'CURRENT',condition:'',state:'HELD',reason:'SEMANTIC_CHECK_PENDING'};
 applyScopedVerdicts({verdicts:[{id:'sc1',...stated(verdict,source.text)}]},[candidate],source);
 assert.equal(candidate.state,verdict==='SUPPORTED'?'ACCEPTED':verdict==='UNSUPPORTED'?'REJECTED':'HELD');
 const [audit]=researchDecisionAudit([candidate],[source]);
 assert.equal(audit.model.explanation,candidate.modelDecision.explanation);
 assert.equal(audit.evidence.sourceHash,source.hash);assert.equal(audit.evidence.decisionQuoteOffset,0);assert.equal(audit.evidence.sourceHashVerified,true);
 assert.equal(audit.software.rule,'CRITIC_'+verdict);
});
test('scoped unsupported without justification remains held and does not poison another candidate',()=>{
 const source=makeSource('Unsere Terrasse ist geöffnet.');
 const node=id=>({id,sourceId:'s1',quote:source.text,state:'HELD',reason:'SEMANTIC_CHECK_PENDING'});
 const candidates=[node('sc1'),node('sc2')];
 applyScopedVerdicts({verdicts:[{id:'sc1',verdict:'UNSUPPORTED'},{id:'sc2',...stated('SUPPORTED',source.text)}]},candidates,source);
 assert.equal(candidates[0].state,'HELD');assert.equal(candidates[0].reason,'DECISION_JUSTIFICATION_MISSING');assert.equal(candidates[1].state,'ACCEPTED');
});
test('scoped invented evidence cannot approve or reject; duplicates mutate no candidate',()=>{
 const source=makeSource('Unsere Terrasse ist geöffnet.');
 for(const verdict of ['SUPPORTED','UNSUPPORTED']){
 const candidate={id:'sc1',sourceId:'s1',quote:source.text,state:'HELD',reason:'SEMANTIC_CHECK_PENDING'};
 applyScopedVerdicts({verdicts:[{id:'sc1',...stated(verdict,'Unsere Terrasse ist geschlossen.')} ]},[candidate],source);
 assert.equal(candidate.reason,'DECISION_EVIDENCE_NOT_LITERAL');assert.equal(candidate.state,'HELD');
 }
 const candidate={id:'sc1',state:'HELD',reason:'SEMANTIC_CHECK_PENDING'};
 assert.throws(()=>applyScopedVerdicts({verdicts:[{id:'sc1',...stated('SUPPORTED',source.text)},{id:'sc1',...stated('UNSUPPORTED',source.text)}]},[candidate],source));
 assert.equal(candidate.state,'HELD');
});
async function emailRun(verdictFor){
 return researchSpotV2({spot:{spotId:'11111111-1111-4111-8111-222222222222',name:'Synthetic Restaurant',locality:'Basel',existingValues:{'contact.website':{value:'https://example.org/'}}},fields:[{attributeKey:'contact.public_email',...researchValueContract('contact.public_email')}],modelPath:'/tmp/'+NUKNUK_MODEL_REVISION,maxRequests:1,maxModelCalls:4},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,body,contentType:'text/html',observedAt:'2026-10-23T12:00:00Z'}),modelFetch:async(_url,init)=>{
  const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  const raw=input.claims?{verdicts:input.claims.map(f=>({factId:f.id,subject:'TARGET',belongsTo:'TARGET',applicability:'CURRENT',restrictionQuote:'',...verdictFor(f,input)}))}:{facts:[],nextLinks:[]};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]}));
 }});
}
for(const verdict of ['SUPPORTED','UNSUPPORTED','AMBIGUOUS'])test(`native email ${verdict} records its stated justification and original source`,async()=>{
 const report=await emailRun(f=>stated(verdict,f.quote));const fact=report.facts.find(f=>f.field==='contact.public_email');
 assert.ok(fact);assert.equal(fact.state,verdict==='SUPPORTED'?'ACCEPTED':verdict==='UNSUPPORTED'?'REJECTED':'HELD');
 const audit=report.decisionAudit.find(a=>a.factId===fact.id);
 assert.equal(audit.model.verdict,verdict);assert.equal(audit.evidence.decisionQuote,email);assert.equal(audit.evidence.decisionQuoteVerified,true);assert.equal(audit.software.state,fact.state);
 assert.equal(report.canonicalWrite,false);
});
for(const [label,response,reason] of [
 ['missing',f=>({verdict:'UNSUPPORTED'}),'DECISION_JUSTIFICATION_MISSING'],
 ['invented',f=>stated('SUPPORTED','invented@synthetic.example'),'DECISION_EVIDENCE_NOT_LITERAL'],
 ['contradictory venue classification',f=>stated('UNSUPPORTED',f.quote,{reasonCode:'WRONG_VENUE'}),'DECISION_CLASSIFICATION_CONFLICT'],
 ['contradictory current classification',f=>stated('UNSUPPORTED',f.quote,{reasonCode:'NOT_CURRENT'}),'DECISION_CLASSIFICATION_CONFLICT'],
])test(`native email holds ${label} justification without silent acceptance or rejection`,async()=>{
 const report=await emailRun(response);const fact=report.facts.find(f=>f.field==='contact.public_email');
 assert.ok(fact);assert.equal(fact.state,'HELD');assert.equal(fact.reason,reason);assert.equal(fact.modelDecision.validationError,reason);
 assert.equal(report.results[0].status,'UNRESOLVED');
});
test('deterministic decisions remain distinguishable from model judgments',()=>{
 const source=makeSource(email);const fact={id:'f1',field:'contact.public_email',sourceId:'s1',quote:email,state:'HELD',reason:'SUBJECT_OTHER'};
 const [audit]=researchDecisionAudit([fact],[source]);assert.equal(audit.model,null);assert.equal(audit.justificationOrigin,'DETERMINISTIC_RULE');assert.equal(audit.software.rule,'SUBJECT_OTHER');assert.equal(audit.evidence.sourceQuoteVerified,true);
 const [tampered]=researchDecisionAudit([fact],[{...source,text:'changed'}]);assert.equal(tampered.evidence.sourceHashVerified,false);assert.equal(tampered.evidence.sourceQuoteVerified,false);
});

test('human review exposes the stated reason and verified evidence without executing source markup',()=>{
 const source=makeSource(email);const fact={id:'f1',field:'contact.public_email',sourceId:'s1',quote:email,state:'ACCEPTED',reason:'SEMANTIC_SUPPORTED',modelDecision:stated('SUPPORTED',email,{explanation:'The contact section supports this address. <script>alert(1)</script>'})};
 const html=decisionAuditHtml({decisionAudit:researchDecisionAudit([fact],[source])});
 assert.ok(html.includes('DIRECT_SUPPORT'));assert.ok(html.includes(email));assert.ok(html.includes('SEMANTIC_SUPPORTED'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 assert.equal(decisionAuditHtml({}), '');
});

test('wrong field scope can reject a claim about the same target without a classification conflict',async()=>{
 const report=await emailRun(f=>stated('UNSUPPORTED',f.quote,{reasonCode:'WRONG_SCOPE',explanation:'This target address is published for another contact role, not the requested field.'}));
 const candidate=report.facts.find(f=>f.field==='contact.public_email');
 assert.equal(candidate.state,'REJECTED');assert.equal(candidate.modelDecision.validationError,undefined);assert.equal(candidate.modelDecision.reasonCode,'WRONG_SCOPE');
});
