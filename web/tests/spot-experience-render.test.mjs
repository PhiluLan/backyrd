import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
import ts from "typescript";
const require=createRequire(import.meta.url);
const compile=(path,dependencies={})=>{
 const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,Intl,require:name=>dependencies[name]??require(name)});return exports;
};
const adapter=compile('../../packages/shared/src/presentation/spot-experience.ts');
const {SpotExperience}=compile('../components/consumer/spot-experience.tsx',{'../../../packages/shared/src/presentation/spot-experience':adapter});
const {renderToStaticMarkup}=require('react-dom/server');
const {createElement}=require('react');
test('actual Web cards render scoped facts, prices and schedules as escaped public content',()=>{
 const profile={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',reviewed:true,offers:[{id:'dinner',name:'Abendessen <script>',areaIds:['terrace'],prices:[],schedule:[{weekday:6,start:'18:00',end:'23:00'}],properties:[{key:'food.dish',state:'KNOWN',value:'Pasta',conditions:{}}]}],areas:[{id:'terrace',name:'Terrasse',properties:[]}],properties:[]};
 const html=renderToStaticMarkup(createElement(SpotExperience,{profile}));
 assert.match(html,/Das kannst du hier erleben/);assert.match(html,/Abendessen &lt;script&gt;/);assert.match(html,/Samstag 18:00–23:00/);assert.match(html,/Pasta/);assert.match(html,/>Wo\?<\/h4><p>Terrasse/);assert.match(html,/Räume &amp; Bereiche/);assert.doesNotMatch(html,/<script>|food\.dish|contractVersion/);
});
test('unreviewed or missing profiles produce no public cards',()=>{
 assert.equal(renderToStaticMarkup(createElement(SpotExperience,{profile:null})), '');
 assert.equal(renderToStaticMarkup(createElement(SpotExperience,{profile:{reviewed:false,offers:[{name:'Private'}]}})), '');
});

test('all offers and areas start collapsed with accessible native disclosure controls',()=>{
 const card={name:'Angebot',prices:[],schedule:[],properties:[{key:'participation.booking',state:'KNOWN',value:'Empfohlen',conditions:{}}],areaIds:['room']};
 const profile={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',reviewed:true,offers:[{...card,id:'a'},{...card,id:'b',name:'Ein anderes Angebot'}],areas:[{id:'room',name:'Garten',properties:[]}],properties:[]};
 const html=renderToStaticMarkup(createElement(SpotExperience,{profile}));
 assert.equal((html.match(/<details/g)??[]).length,3);
 assert.doesNotMatch(html,/<details[^>]*\sopen(?:[=>\s])/);
 assert.match(html,/aria-label="Angebot: mehr Informationen"/);
 assert.doesNotMatch(html,/<dl|Was kann man hier machen|Wer kann dieses Angebot/);
});

test('a name-only offer remains a simple row without an empty disclosure',()=>{
 const profile={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',reviewed:true,offers:[{id:'a',name:'Degustation',prices:[],schedule:[],properties:[],areaIds:[]}],areas:[],properties:[]};
 const html=renderToStaticMarkup(createElement(SpotExperience,{profile}));
 assert.match(html,/Degustation/);assert.doesNotMatch(html,/<details|Mehr erfahren/);
});
