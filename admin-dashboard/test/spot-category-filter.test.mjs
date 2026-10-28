import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const dir=await mkdtemp(join(tmpdir(),'spot-category-filter-'));
const runtime=new URL('../../packages/world-knowledge-core/dist/browser-runtime.js',import.meta.url).href;
const compile=async(file,name)=>{
 const source=await readFile(new URL(file,import.meta.url),'utf8');
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 output=output.replaceAll('"@backyrd/world-knowledge-core/browser"',JSON.stringify(runtime)).replace('"@/lib/spotListFilters"',JSON.stringify(pathToFileURL(join(dir,'filters.mjs')).href)).replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
 const path=join(dir,name+'.mjs');await writeFile(path,output);return import(pathToFileURL(path).href);
};
const {categoryFilter,hasCategoryMetadata,filterSpots,categoryCounts,spotListQuery,loadAllSpotPages}=await compile('../lib/spotListFilters.ts','filters');
const fixtures=Array.from({length:60},(_,i)=>({id:i,name:`Ort ${i}`,city:i%2?'Basel':'Zürich',status:i%3?'approved':'pending',primary_category:i===59?null:i<30?'EAT':'STAY'}));
const all={search:'',status:'all',category:'all'};
test('category is applied to the entire catalogue before the 25-item page',()=>{
 const rows=filterSpots(fixtures,{...all,category:'STAY'});
 assert.equal(rows.length,29);
 assert.equal(rows[0].id,30);
 assert.equal(rows.slice(25,50).length,4);
 assert.equal(filterSpots(fixtures,{...all,category:'unassigned'})[0].id,59);
});
test('search, status and category combine; zero matches are genuine',()=>{
 const rows=filterSpots(fixtures,{search:' BASEL ',status:'approved',category:'STAY'});
 assert.equal(rows.length,9);
 assert.ok(rows.every(s=>s.city==='Basel'&&s.status==='approved'&&s.primary_category==='STAY'));
 assert.deepEqual(filterSpots(fixtures,{...all,category:'SPORT_MOVEMENT'}),[]);
});
test('category option counts honour search/status but span all list pages',()=>{
 const counts=categoryCounts(fixtures,{search:'',status:'all'});
 assert.deepEqual(counts,{all:60,unassigned:1,EAT:30,STAY:29});
 assert.equal(categoryCounts(fixtures,{search:'Basel',status:'approved'}).all,20);
});
test('an unpublished backend and a real unassigned category are different',()=>{
 assert.equal(hasCategoryMetadata({spots:fixtures}),false);
 assert.equal(hasCategoryMetadata({categorySource:'WORLD_AUTHORING_CURRENT_V1',spots:[{name:'old'}]}),false);
 assert.equal(hasCategoryMetadata({categorySource:'WORLD_AUTHORING_CURRENT_V1',spots:[{primary_category:'INVALID'}]}),false);
 assert.equal(hasCategoryMetadata({categorySource:'WORLD_AUTHORING_CURRENT_V1',spots:[{primary_category:null}]}),true);
 assert.equal(hasCategoryMetadata({categorySource:'WORLD_AUTHORING_CURRENT_V1',spots:[]}),true);
 assert.deepEqual(filterSpots([{name:'old',city:null,status:'approved'}],{...all,category:'unassigned'}),[]);
});
test('reload/bookmark parameters keep the category together with search and period; reset clears it',()=>{
 for(const input of [null,'unknown','eat','<script>'])assert.equal(categoryFilter(input),'all');
 assert.equal(categoryFilter('EAT'),'EAT');assert.equal(categoryFilter('unassigned'),'unassigned');
 const query=new URLSearchParams(spotListQuery({search:'Café & Basel',status:'approved',category:'EAT'},'week'));
 assert.equal(query.get('kategorie'),'EAT');assert.equal(query.get('suche'),'Café & Basel');assert.equal(query.get('status'),'approved');assert.equal(query.get('zeitraum'),'week');
 assert.equal(spotListQuery(all,'month'),'');
});
const {CategoryFilter}=await compile('../app/spots/CategoryFilter.tsx','category');
const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
test('the actual select uses understandable catalogue labels, counts and an accessible label',()=>{
 const html=renderToStaticMarkup(createElement(CategoryFilter,{value:'STAY',counts:{all:60,EAT:30,STAY:29,unassigned:1},disabled:false,onChange(){}}));
 for(const text of ['Hauptkategorie filtern','Alle Hauptkategorien (60)','Ohne Hauptkategorie (1)','value="STAY" selected','(29)','Essen'])assert.ok(html.includes(text),text);
 const disabled=renderToStaticMarkup(createElement(CategoryFilter,{value:'all',counts:{},disabled:true,onChange(){}}));
 assert.ok(disabled.includes('disabled=""'));assert.ok(!disabled.includes('(0)'));
});
test('the list keeps global filtering before slicing and resets page on category changes',async()=>{
 const page=await readFile(new URL('../app/spots/page.tsx',import.meta.url),'utf8');
 assert.ok(page.indexOf('filterSpots(data?.spots')<page.indexOf('rows.slice('));
 assert.match(page,/setCategory\(value\); setPage\(0\)/);
 assert.match(page,/setCategory\("all"\); setPage\(0\)/);
 assert.match(page,/\[preset, profileRevision\]/);
 assert.match(page,/Die fehlenden Daten bedeuten nicht/);
});

test('backend pagination is exhausted before any category counts; failed/inconsistent pages never become empty results',async()=>{
 const rows=Array.from({length:31},(_,i)=>({spot_id:String(i)}));
 const offsets=[];
 const response=await loadAllSpotPages(async offset=>{offsets.push(offset);return {summary:{spots:31},spots:rows.slice(offset,offset+25)};});
 assert.equal(response.spots.length,31);assert.deepEqual(offsets,[0,25]);
 await assert.rejects(()=>loadAllSpotPages(async()=>({summary:{spots:31},spots:[]})),/nicht vollständig/);
 await assert.rejects(()=>loadAllSpotPages(async()=>({summary:{spots:31},spots:rows.slice(0,25)})),/nicht vollständig/);
 await assert.rejects(()=>loadAllSpotPages(async offset=>offset?{summary:{spots:30},spots:rows.slice(25)}:{summary:{spots:31},spots:rows.slice(0,25)}),/nicht vollständig/);
 await assert.rejects(()=>loadAllSpotPages(async()=>{throw new Error('network');}),/network/);
});
