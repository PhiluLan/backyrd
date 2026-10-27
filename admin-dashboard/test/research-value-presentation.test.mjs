import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {emptyExperienceProfile,emptyExperienceConditions} from '../../packages/world-knowledge-core/dist/index.js';
const require=createRequire(import.meta.url);
const dir=await mkdtemp(join(tmpdir(),'research-values-'));
async function compile(name){
 let source=await readFile(new URL(`../app/world-knowledge/${name}.tsx`,import.meta.url),'utf8');
 source=source.replace(/import styles from "\.\/(?:WorldResearchBatchPanel|ResearchInbox).module.css";/,'const styles = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string,string>;');
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 output=output.replace('"@backyrd/world-knowledge-core/browser"',JSON.stringify(new URL('../../packages/world-knowledge-core/dist/browser-runtime.js',import.meta.url).href))
  .replace('"@/lib/nuknukDraftImport"',JSON.stringify(pathToFileURL(join(dir,'supplement.mjs')).href))
  .replace('"@/lib/researchSaveFeedback"',JSON.stringify(pathToFileURL(join(dir,'feedback.mjs')).href))
  .replace('"./ResearchActionFeedback"',JSON.stringify(pathToFileURL(join(dir,'ResearchActionFeedback.mjs')).href))
  .replace('"./ResearchFieldEditor"',JSON.stringify(pathToFileURL(join(dir,'ResearchFieldEditor.mjs')).href))
  .replace('"@backyrd/world-knowledge-authoring-ui"','"'+pathToFileURL(join(dir,'field-input.mjs')).href+'"')
  .replace('"./ResearchValue"',JSON.stringify(pathToFileURL(join(dir,'ResearchValue.mjs')).href));
 for(const specifier of ['react/jsx-runtime','react'])output=output.replaceAll(`"${specifier}"`,JSON.stringify(pathToFileURL(require.resolve(specifier)).href));
 const path=join(dir,name+'.mjs');await writeFile(path,output);return import(pathToFileURL(path).href);
}
await writeFile(join(dir,'supplement.mjs'),'export const supplementResearchValue=(_key,_current,incoming)=>incoming;');
await writeFile(join(dir,'field-input.mjs'),'export const FieldInput=()=>null;');
const feedbackSource=await readFile(new URL('../lib/researchSaveFeedback.ts',import.meta.url),'utf8');
await writeFile(join(dir,'feedback.mjs'),ts.transpileModule(feedbackSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {ResearchActionFeedback}=await compile('ResearchActionFeedback');
const {ResearchValue,researchGapReason}=await compile('ResearchValue');
const {researchFieldHasPendingEdits}=await compile('ResearchFieldEditor');
const {NuknukDraftPreview}=await compile('NuknukDraftPreview');
const render=(key,value)=>renderToStaticMarkup(createElement(ResearchValue,{attributeKey:key,value}));
const profile={...emptyExperienceProfile('EAT'),areas:[{id:'room',name:'Restaurant',kind:'DINING_AREA',properties:[{key:'offer.capacity',state:'KNOWN',value:50,label:null,conditions:emptyExperienceConditions()}]}],offers:[{id:'drinks',kind:'DRINKS',name:'Getränke',areaIds:[],prices:[],schedule:[],properties:[],validFrom:null,validUntil:null}]};
test('profile preview shows named offers, areas and capacity without raw JSON or IDs',()=>{
 const html=render('experience.profile',profile);
 for(const text of ['Getränke','Restaurant','50','Räume &amp; Bereiche'])assert.ok(html.includes(text));
 for(const text of ['"contractVersion"','DINING_AREA','offer.capacity','drinks'])assert.ok(!html.includes(text));
});
test('a weekly schedule names every day and distinguishes unknown from explicitly closed',()=>{
 const html=render('hours.regular',[{day:'MONDAY',intervals:[{start:'12:00',end:'14:00'},{start:'18:00',end:'23:00'}]},{day:'TUESDAY',intervals:[]}]);
 for(const text of ['Montag','Sonntag','12:00–14:00','18:00–23:00','Geschlossen','Nicht belegt'])assert.ok(html.includes(text));
 assert.ok(!html.includes('MONDAY'));
});
test('reservation details use plain labels and retain scope instead of serializing an object',()=>{
 const html=render('rule.reservation',{mode:'RECOMMENDED',minimumPartySize:8,days:['FRIDAY','MONDAY','TUESDAY'],fromTime:'18:00',toTime:'23:00'});
 for(const text of ['Eine Reservation wird empfohlen.','Freitag','18:00','23:00','8'])assert.ok(html.includes(text));
 assert.ok(!html.includes('minimumPartySize'));
 assert.ok(html.indexOf('Montag') < html.indexOf('Dienstag'));
 assert.ok(html.indexOf('Dienstag') < html.indexOf('Freitag'));
});
test('draft header distinguishes saved report from profile import and shows optional gaps in plain language',()=>{
 const draft={version:'nuknuk-research-v4.16',spotId:'fixture',name:'Testort',canonicalWrite:false,importable:false,results:[{attributeKey:'experience.profile',status:'REQUIRES_REVIEW',value:profile,partialProfile:true,citations:[]},{attributeKey:'contact.phone',status:'UNRESOLVED',reason:'PHONE_COUNTRY_REQUIRED'}]};
 const html=renderToStaticMarkup(createElement(NuknukDraftPreview,{draft,onClose(){},onSave(){},onPrepare(){},saved:true,saving:false,error:''}));
 for(const text of ['Wissen durchsuchen','Angaben filtern','Recherchevorschlag','Noch offen','Landesvorwahl','Bestehende Angaben bleiben erhalten','Auswahl mit Spotprofil abgleichen','Profilangaben'])assert.ok(html.includes(text),text);
 for(const text of ['PHONE_COUNTRY_REQUIRED','experience · profile','DINING_AREA'])assert.ok(!html.includes(text),text);
 assert.ok(html.includes('disabled=""')); // no preselected human approval
});


test('staged dropdown choices remain confirmable after their value effect runs',()=>{
 const visible={value:'EAT',validUntil:''};
 assert.equal(researchFieldHasPendingEdits('SINGLE_SELECT','classification.primary_category',{knowledgeState:'KNOWN_VALUE',value:'EAT',visibleFingerprint:''},visible,true),false);
});
test('typing another value or clearing the input blocks an older staged confirmation',()=>{
 const staged={knowledgeState:'KNOWN_VALUE',value:'+41612725415',visibleFingerprint:''};
 assert.equal(researchFieldHasPendingEdits('PHONE','contact.phone',staged,{value:'+41612725415',validUntil:''},false),false);
 assert.equal(researchFieldHasPendingEdits('PHONE','contact.phone',staged,{value:'+41612725416',validUntil:''},true),true);
 assert.equal(researchFieldHasPendingEdits('PHONE','contact.phone',staged,{value:'',validUntil:''},false),true);
});
test('an unknown confirmation must be reviewed again after editing the visible value',()=>{
 const visible={value:'',validUntil:''};
 const staged={knowledgeState:'UNKNOWN',value:null,visibleFingerprint:JSON.stringify(visible)};
 assert.equal(researchFieldHasPendingEdits('PHONE','contact.phone',staged,visible,false),false);
 assert.equal(researchFieldHasPendingEdits('PHONE','contact.phone',staged,{value:'+41612725415',validUntil:''},true),true);
});
test('the structured experience editor retains its own dirty tracking',()=>{
 const staged={knowledgeState:'KNOWN_VALUE',value:profile,visibleFingerprint:''};
 assert.equal(researchFieldHasPendingEdits('EXPERIENCE_PROFILE','experience.profile',staged,{value:profile,validUntil:''},false),false);
 assert.equal(researchFieldHasPendingEdits('EXPERIENCE_PROFILE','experience.profile',staged,{value:profile,validUntil:''},true),true);
});


test('save feedback exposes distinct accessible success, warning and error states',()=>{
 for(const kind of ['success','warning','error','pending']){
  const html=renderToStaticMarkup(createElement(ResearchActionFeedback,{feedback:{kind,title:'Visible title',message:'Visible explanation'}}));
  assert.ok(html.includes(`role="${['warning','error'].includes(kind)?'alert':'status'}"`));
  assert.ok(html.includes('aria-atomic="true"'));assert.ok(html.includes('tabindex="-1"'));
  assert.ok(html.includes('Visible title'));assert.ok(html.includes('Visible explanation'));
 }
});

test('consecutive special closures become one sentence across New Year without raw property names',()=>{
 const days=['2026-12-24','2026-12-25','2026-12-26','2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02'].map(date=>({date,status:'CLOSED',intervals:[]}));
 const html=render('hours.special',days);
 assert.match(html,/Vom 24\. Dezember 2026 bis 2\. Januar 2027 geschlossen/);
 for(const raw of ['CLOSED','intervals','status','2026-12-24'])assert.ok(!html.includes(raw),raw);
 assert.equal((html.match(/geschlossen/g)??[]).length,1);
});
test('date gaps and different opening times are never folded into one claimed closure',()=>{
 const html=render('hours.special',[{date:'2026-12-24',status:'CLOSED',intervals:[]},{date:'2026-12-26',status:'CLOSED',intervals:[]},{date:'2026-12-27',status:'OPEN',intervals:[{start:'11:00',end:'16:00'}]}]);
 assert.match(html,/Am 24\. Dezember/);assert.match(html,/Am 26\. Dezember/);assert.match(html,/Am 27\. Dezember 2026 geöffnet: 11:00–16:00 Uhr/);assert.ok(!html.includes('Vom'));
});
test('unknown days remain unknown and overnight hours explain the next day',()=>{
 const html=render('hours.regular',[{day:'FRIDAY',intervals:[{start:'20:00',end:'02:00'}]}]);assert.match(html,/bis zum nächsten Tag/);assert.match(html,/noch keine Zeiten/);
});
test('structured rules retain age, pet, fee and scope meaning in plain language',()=>{
 const pet=render('rule.pet_access',{indoor:'ALLOWED',outdoor:'UNKNOWN',assistanceAnimals:'ALLOWED',notes:'Nur angeleint'});
 assert.match(pet,/Drinnen: Erlaubt/);assert.match(pet,/Draussen: Noch unbekannt/);assert.ok(!pet.includes('assistanceAnimals'));
 const age=render('rule.age_access_conditions',{rules:[{mode:'UNACCOMPANIED_MINIMUM',minimumAge:12,accompaniment:'ADULT',appliesFromTime:'18:00',days:['FRIDAY'],area:'Bar',event:null}],notes:null});
 for(const term of ['Ohne Begleitung ab 12 Jahren','erwachsenen','Freitag','18:00'])assert.ok(age.includes(term));
 for(const term of ['UNACCOMPANIED_MINIMUM','minimumAge','appliesFromTime'])assert.ok(!age.includes(term));
 const price=render('operation.price_options',[{currency:'CHF',min:15,max:25,basis:'PER_PERSON',purposes:['MEAL'],minimumAge:null,maximumAge:null,mandatoryFeesIncluded:false,allOfferingsCovered:false,conditions:{}}]);
 for(const term of ['15–25 CHF pro Person','Mahlzeit','Zusatzkosten','nur für'])assert.ok(price.includes(term));
 assert.ok(!price.includes('mandatoryFeesIncluded'));
});
test('unsupported structures are visibly unready rather than displayed as database fields',()=>{
 const html=render('contact.phone',{secret_internal_flag:'UNKNOWN_PROVIDER_STATUS'});assert.match(html,/zuverlässige Vorschau/);assert.ok(!html.includes('secret_internal_flag'));assert.ok(!html.includes('UNKNOWN_PROVIDER_STATUS'));
});

const {ResearchTaskReview}=await compile('ResearchTaskReview');
test('the complete review explains the task, proposed value, existing value, source and consequences',()=>{
 const task={attributeKey:'hours.special',kind:'REVIEW',fingerprint:'fixture',claimId:null,jobIds:['fixture'],status:'REQUIRES_REVIEW',reason:'Die Website nennt Betriebsferien.',value:[{date:'2026-12-24',status:'CLOSED',intervals:[]},{date:'2026-12-25',status:'CLOSED',intervals:[]}],citations:[{url:'https://example.org/ferien',evidence:'Am 24. und 25. Dezember geschlossen.'}]};
 const html=renderToStaticMarkup(createElement(ResearchTaskReview,{spotId:'fixture',task,request(){throw Error('must not write on render');},post(){},onDecision(){},onEditingChange(){}}));
 for(const phrase of ['Das ist deine Aufgabe','Warum sollst du das prüfen?','Das wird vorgeschlagen','So steht es bisher im Profil','Hier kannst du es nachprüfen','example.org öffnen','Ich habe den Vorschlag geprüft','So übernehmen &amp; speichern','Ändern','Vorschlag ablehnen','24. Dezember 2026 bis 25. Dezember 2026 geschlossen'])assert.ok(html.includes(phrase),phrase);
 for(const code of ['CLOSED','intervals','fingerprint','jobIds'])assert.ok(!html.includes(code),code);
 assert.ok(html.includes('disabled=""'));
});
test('a missing fact is an invitation to add or leave unknown, never a fictitious proposed answer',()=>{
 const task={attributeKey:'accessibility.accessible_toilet',kind:'MISSING',fingerprint:'missing',claimId:null,jobIds:[],status:'UNKNOWN',reason:'Die offizielle Website nennt dazu keine Angabe.'};
 const html=renderToStaticMarkup(createElement(ResearchTaskReview,{spotId:'fixture',task,request(){},post(){},onDecision(){},onEditingChange(){}}));
 for(const phrase of ['Angabe hinzufügen','Ohne Angabe abschliessen','Du musst nichts erraten','kein vollständiger Quellenbeleg'])assert.ok(html.includes(phrase),phrase);
 assert.ok(!html.includes('Das wird vorgeschlagen'));assert.ok(!html.includes('So übernehmen'));
});

test('temporary conditions require editing the expiry before a direct save is offered',()=>{
 const task={attributeKey:'state.current',kind:'REVIEW',fingerprint:'fixture',claimId:null,jobIds:[],status:'REQUIRES_REVIEW',value:{kind:'TEMPORARILY_CLOSED',scope:null},citations:[]};
 const html=renderToStaticMarkup(createElement(ResearchTaskReview,{spotId:'fixture',task,request(){},post(){},onDecision(){},onEditingChange(){}}));
 assert.match(html,/Enddatum/);assert.ok(!html.includes('So übernehmen &amp; speichern'));
});
test('discovery descriptions preserve scoped absences, source quotes, prices and conditions',()=>{
 const value={contractVersion:'backyrd.world-knowledge.discovery-profile@1.0',description:'Pizza jeden Abend. Keine Lieferung.',reviewed:false,offerings:[{id:'pizza',name:'Pizza',description:'Im Restaurant',price:{min:17,max:23,currency:'CHF',basis:'PER_PERSON',mandatoryFeesIncluded:false}}],assertions:[{id:'delivery',kind:'FEATURE',concepts:['Lieferung'],offeringId:'pizza',state:'ABSENT',evidence:'Keine Lieferung.',conditions:'Nur vor Ort',validFrom:'2026-10-27T00:00:00.000Z',validUntil:'2026-12-31T00:00:00.000Z'}]};
 const html=render('discovery.profile',value);
 for(const term of ['Pizza: Im Restaurant','17–23 CHF pro Person','nicht vollständig','Nicht vorhanden: Lieferung','Gilt für Pizza','Keine Lieferung.','Nur vor Ort','31. Dezember 2026'])assert.ok(html.includes(term),term);
 assert.ok(!html.includes('offeringId'));
});

test('repeated identical citations are shown once and absent reasons explain the actual comparison',()=>{
 const citation={url:'https://example.org',evidence:'Name des Ortes',observedAt:'2026-10-27T00:00:00.000Z'};
 const task={attributeKey:'identity.name',kind:'REVIEW',fingerprint:'fixture',claimId:'old',currentValue:'Alter Name',jobIds:[],status:'REQUIRES_REVIEW',value:'Neuer Name',citations:[citation,citation]};
 const html=renderToStaticMarkup(createElement(ResearchTaskReview,{spotId:'fixture',task,request(){},post(){},onDecision(){},onEditingChange(){}}));
 assert.equal((html.match(/example.org öffnen/g)??[]).length,1);assert.match(html,/weicht von der bisher gespeicherten Angabe ab/);
});

test('catalogue codes inside an otherwise readable explanation use ordinary words',()=>{
 assert.equal(researchGapReason('Ergänzt wird nur WINE; alle stabilen IDs bleiben erhalten.'),'Ergänzt wird nur Wein; alle bisherigen Zuordnungen bleiben erhalten.');
});
