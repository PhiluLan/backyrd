import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const dir=await mkdtemp(join(tmpdir(),'authoring-focus-contract-'));
const base=new URL('../../packages/world-knowledge-authoring-ui/src/',import.meta.url);
const runtime=new URL('../../packages/world-knowledge-core/dist/browser-runtime.js',import.meta.url).href;
for(const file of ['experience-authoring.ts','experience-answer-guidance.ts','ExperienceProperties.tsx']) {
 let output=ts.transpileModule(await readFile(new URL(file,base),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 output=output.replaceAll('"@backyrd/world-knowledge-core/browser"',JSON.stringify(runtime)).replaceAll('"./experience-authoring"','"./experience-authoring.mjs"').replaceAll('"./experience-answer-guidance"','"./experience-answer-guidance.mjs"').replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
 await writeFile(join(dir,file.replace(/\.tsx?$/,'.mjs')),output);
}
const {Properties}=await import(pathToFileURL(join(dir,'ExperienceProperties.mjs')).href);
const conditions={weekdays:[],dayparts:[],event:null,validFrom:null,validUntil:null};
const property=(key,value)=>({key,label:null,state:'KNOWN',value,conditions});
function rows(values,group='Typische Dauer',offerKind='OTHER') {
 const root=Properties({category:'RESTAURANT',scope:'OFFER',offerKind,group,values,onChange(){}});
 const result=[];
 function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}if(node.props?.className==='wk-experience-property')result.push(node);visit(node.props?.children);}
 visit(root);return result;
}
test('blank numeric and named answers keep their React identity through first and later edits',()=>{
 for(const [group,kind,key,first,later] of [['Typische Dauer','OTHER','time.duration',3,30],['Gerichte und Spezialitäten','LUNCH','food.dish','P','Pad Thai']]) {
  const blank=rows([],group,kind);assert.equal(blank.length,1);
  assert.equal(rows([property(key,first)],group,kind)[0].key,blank[0].key);
  assert.equal(rows([property(key,later)],group,kind)[0].key,blank[0].key);
  assert.equal(rows([property(key,null)],group,kind)[0].key,blank[0].key);
 }
});
test('adding or removing another question does not replace existing inputs',()=>{
 const duration=property('time.duration',60),other=property('participation.minimum_age',4);
 assert.equal(rows([other,duration])[0].key,rows([duration])[0].key);
 assert.equal(rows([other])[0].key,rows([other,duration])[0].key);
});
test('multiple answers have distinct identities independent of unrelated global positions',()=>{
 const first=property('food.dish','Pad Thai'),second=property('food.dish','Pizza'),other=property('food.drink','Bier');
 const keys=rows([first,second],'Gerichte und Spezialitäten','LUNCH').map(row=>row.key);
 assert.equal(new Set(keys).size,2);
 assert.deepEqual(rows([other,first,second],'Gerichte und Spezialitäten','LUNCH').map(row=>row.key),keys);
});
