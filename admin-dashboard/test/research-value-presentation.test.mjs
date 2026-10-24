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
 source=source.replace(/import styles from "\.\/WorldResearchBatchPanel.module.css";/,'const styles = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string,string>;');
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 output=output.replace('"@backyrd/world-knowledge-core/browser"',JSON.stringify(new URL('../../packages/world-knowledge-core/dist/browser-runtime.js',import.meta.url).href))
  .replace('"./ResearchValue"',JSON.stringify(pathToFileURL(join(dir,'ResearchValue.mjs')).href));
 for(const specifier of ['react/jsx-runtime','react'])output=output.replaceAll(`"${specifier}"`,JSON.stringify(pathToFileURL(require.resolve(specifier)).href));
 const path=join(dir,name+'.mjs');await writeFile(path,output);return import(pathToFileURL(path).href);
}
const {ResearchValue}=await compile('ResearchValue');
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
 for(const text of ['Empfohlen','Freitag','18:00','23:00','8'])assert.ok(html.includes(text));
 assert.ok(!html.includes('minimumPartySize'));
 assert.ok(html.indexOf('Montag') < html.indexOf('Dienstag'));
 assert.ok(html.indexOf('Dienstag') < html.indexOf('Freitag'));
});
test('draft header distinguishes saved report from profile import and shows optional gaps in plain language',()=>{
 const draft={version:'nuknuk-research-v4.16',spotId:'fixture',name:'Testort',canonicalWrite:false,importable:false,results:[{attributeKey:'experience.profile',status:'REQUIRES_REVIEW',value:profile,partialProfile:true,citations:[]},{attributeKey:'contact.phone',status:'UNRESOLVED',reason:'PHONE_COUNTRY_REQUIRED'}]};
 const html=renderToStaticMarkup(createElement(NuknukDraftPreview,{draft,onClose(){},onSave(){},onPrepare(){},saved:true,saving:false,error:''}));
 for(const text of ['Wissen durchsuchen','Angaben filtern','Recherchevorschlag','Noch offen','Länderzuordnung','Bestehende Angaben bleiben erhalten','Auswahl mit Spotprofil abgleichen','Profilangaben'])assert.ok(html.includes(text),text);
 for(const text of ['PHONE_COUNTRY_REQUIRED','experience · profile','DINING_AREA'])assert.ok(!html.includes(text),text);
 assert.ok(html.includes('disabled=""')); // no preselected human approval
});
