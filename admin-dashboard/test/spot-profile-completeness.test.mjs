import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {AUTHORING_FIELDS, emptyExperienceProfile, emptyExperienceConditions, getExperienceQuestions} from '../../packages/world-knowledge-core/dist/browser-runtime.js';
const require=createRequire(import.meta.url);
const dir=await mkdtemp(join(tmpdir(),'profile-completeness-'));
const runtime=new URL('../../packages/world-knowledge-core/dist/browser-runtime.js',import.meta.url).href;
const statusPath=join(dir,'status.mjs');
let source=await readFile(new URL('../lib/spotProfileStatus.ts',import.meta.url),'utf8');
await writeFile(statusPath,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('"@backyrd/world-knowledge-core/browser"',JSON.stringify(runtime)));
const {spotProfileStatus}=await import(pathToFileURL(statusPath).href);
const id='fixture';
const answer=(value,knowledgeState='KNOWN_VALUE',extra={})=>({value,knowledgeState,...extra});
const detail=(answers={},keys=AUTHORING_FIELDS.map(f=>f.attributeKey),conflicts=[])=>({contractVersion:'backyrd.world-knowledge.product-authoring-detail@1.0',spotId:id,actor:{allowedAttributeKeys:keys},answers,manifest:{worldSnapshot:{conflicts}}});
const score=(data)=>spotProfileStatus(data,id).completeness;
const check=(result,id)=>result.sections.flatMap(s=>s.checks).find(c=>c.id===id);
const foodProfile=()=>({...emptyExperienceProfile('EAT'),reviewed:true,offers:[{id:'lunch',kind:'LUNCH',name:'Mittagessen',areaIds:[],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null}]});

test('no data, failed reads and mismatched identity cannot fabricate coverage',()=>{
 assert.equal(score(detail()).percent,0);
 assert.throws(()=>spotProfileStatus(null,id));
 assert.throws(()=>spotProfileStatus({...detail(),spotId:'other'},id));
 assert.equal(spotProfileStatus(detail({},[]),id).state,'unavailable');
 assert.equal(spotProfileStatus(detail({},[]),id).completeness,undefined);
});
test('unknown, malformed, empty, expired, held and internal answers stay open; false and zero count',()=>{
 const keys=['identity.name','accessibility.step_free_entrance','capacity.seats_indoor'];
 for(const bad of [answer(null,'UNKNOWN'),answer(''),answer('  '),answer('Name','KNOWN_VALUE',{visibility:'SHADOW_HELD'}),answer('Name','KNOWN_VALUE',{visibility:'INTERNAL'}),answer('Name','KNOWN_VALUE',{visibility:'PRIVATE'}),answer('Name','KNOWN_VALUE',{validUntil:'2000-01-01T00:00:00Z'}),answer('Name','UNRECOGNIZED')])assert.equal(check(score(detail({'identity.name':bad},keys)),'identity.name').complete,false);
 const data=score(detail({'accessibility.step_free_entrance':answer(false,'KNOWN_FALSE'),'capacity.seats_indoor':answer(0)},keys));
 assert.equal(check(data,'accessibility.step_free_entrance').complete,true);
 assert.equal(check(data,'capacity.seats_indoor').complete,true);
});
test('score is exact, never rounded up; complete small scope is 100%',()=>{
 const two=['identity.name','contact.phone'];
 assert.equal(score(detail({'identity.name':answer('Test')},two)).percent,50);
 assert.equal(score(detail({'identity.name':answer('Test'),'contact.phone':answer('+41612345678')},two)).percent,100);
});
test('weekly hours require all seven days; explicitly closed days are answered',()=>{
 const days=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
 const rows=days.map(day=>({day,intervals:[]}));
 assert.equal(score(detail({'hours.regular':answer(rows.slice(0,5))},['hours.regular'])).percent,0);
 assert.equal(score(detail({'hours.regular':answer(rows)},['hours.regular'])).percent,100);
});
test('relevance follows the editor: a park does not need restaurant kitchen or service',()=>{
 const park=score(detail({'classification.primary_category':answer('OUTDOOR_NATURE'),'classification.place_types':answer(['PARK'])}));
 const restaurant=score(detail({'classification.primary_category':answer('EAT'),'classification.place_types':answer(['RESTAURANT'])}));
 assert.equal(check(park,'hours.kitchen'),undefined);
 assert.equal(check(park,'offering.cuisines'),undefined);
 assert.ok(check(restaurant,'hours.kitchen'));
});
test('extra social channels, Moods and metrics cannot inflate the score',()=>{
 const data=detail({'identity.name':answer('Test')});
 const baseline=score(data);
 const changed=score({...data,answers:{...data.answers,'contact.instagram':answer('https://instagram.com/example'),'context.atmosphere':answer([{atmosphere:'COZY'}])},reviews:9000,views:9000});
 assert.deepEqual(changed,baseline);
});
test('current conflicts are visible and the disputed fields do not count',()=>{
 const data=detail({'identity.name':answer('Test')},['identity.name'],[{severity:'BLOCKING',attributeKeys:['identity.name']}]);
 const result=spotProfileStatus(data,id);
 assert.equal(result.completeness.percent,0);
 assert.equal(result.state,'attention');
 assert.match(result.label,/Widerspruch/);
});
test('empty/unreviewed profiles stay open; scoped details and explicit non-applicability are measured',()=>{
 for(const profile of [emptyExperienceProfile('EAT'),{...emptyExperienceProfile('EAT'),reviewed:true}])assert.equal(check(score(detail({'experience.profile':answer(profile)})),'experience.profile').complete,false);
 const profile=foodProfile();
 const initial=score(detail({'experience.profile':answer(profile)}));
 assert.equal(check(initial,'experience.profile').complete,true);
 assert.equal(check(initial,'offer:lunch:food.cuisine').complete,false);
 assert.equal(check(initial,'offer:lunch:stay.check_in'),undefined);
 profile.offers[0].properties=getExperienceQuestions(profile.category,'OFFER','LUNCH').map(q=>({key:q.key,label:null,state:'NOT_APPLICABLE',value:null,conditions:emptyExperienceConditions()}));
 const filled=score(detail({'experience.profile':answer(profile)}));
 assert.ok(filled.completed>initial.completed);
 assert.equal(check(filled,'offer:lunch:food.cuisine').complete,true);
 assert.equal(check(filled,'offering.cuisines'),undefined,'scoped food details replace the redundant flat field');
 profile.offers[0].properties[0]={...profile.offers[0].properties[0],state:'UNKNOWN',value:null};
 assert.equal(score(detail({'experience.profile':answer(profile)})).completed,filled.completed-1);
});

// Render the real component: percentage, accessible progress, missing work and
// correction destination must remain visible without exposing catalogue codes.
source=await readFile(new URL('../app/spots/ProfileCompleteness.tsx',import.meta.url),'utf8');
let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const linkPath=join(dir,'link.mjs');
await writeFile(linkPath,`import {createElement} from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};export default function Link(props){return createElement('a',props,props.children);}`);
output=output.replace('"next/link"',JSON.stringify(pathToFileURL(linkPath).href)).replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
await writeFile(join(dir,'component.mjs'),output);
const {ProfileCompleteness}=await import(pathToFileURL(join(dir,'component.mjs')).href);
const {createElement}=await import('react');
const {renderToStaticMarkup}=await import('react-dom/server');
test('rendered cards explain progress, pending state, errors and the next action',()=>{
 const profile=spotProfileStatus(detail({'identity.name':answer('Test')},['identity.name','contact.phone']),id);
 const html=renderToStaticMarkup(createElement(ProfileCompleteness,{profile,spotId:id,name:'Test'}));
 for(const text of ['50','role="progressbar"','aria-valuenow="50"','Was fehlt noch?','Telefon','/spots/fixture/edit','1 von 2','nicht auf Richtigkeit geprüft'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('contact.phone'));
 const loading=renderToStaticMarkup(createElement(ProfileCompleteness,{spotId:id,name:'Test'}));
 assert.ok(!loading.includes('progressbar'));
 assert.ok(loading.includes('wird geladen'));
 const failure=renderToStaticMarkup(createElement(ProfileCompleteness,{spotId:id,name:'Test',profile:{state:'unavailable',label:'Status nicht verfügbar',detail:'Erneut versuchen'}}));
 assert.ok(!failure.includes('progressbar'));
 assert.ok(failure.includes('Profil öffnen'));
});
