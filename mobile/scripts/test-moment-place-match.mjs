import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/moment-place-match.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {suggestMomentPlaces}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const position={lat:47.56,lon:7.59,accuracy:10};
const place=(id,metres)=>({id,name:id,lat:position.lat+metres/111195,lng:position.lon});
test('a precise isolated nearby place can be proposed automatically',()=>{
 const p=place('near',12);const result=suggestMomentPlaces([place('far',400),p],position);
 assert.deepEqual(result.nearby,[p]);assert.equal(result.automatic,p);
});
test('adjacent venues require a choice rather than a false automatic match',()=>{
 const result=suggestMomentPlaces([place('bar',14),place('cafe',10)],position);
 assert.deepEqual(result.nearby.map(p=>p.id),['cafe','bar']);assert.equal(result.automatic,null);
});
test('unknown or inaccurate GPS never establishes an automatic venue',()=>{
 for(const accuracy of [null,100,NaN,-1]) assert.equal(suggestMomentPlaces([place('near',1)],{...position,accuracy}).automatic,null);
});
test('distant or invalid coordinates do not become a claimed place',()=>{
 assert.equal(suggestMomentPlaces([place('near',90)],position).automatic,null);
 assert.deepEqual(suggestMomentPlaces([{...place('bad',1),lat:NaN}],position).nearby,[]);
 assert.deepEqual(suggestMomentPlaces([place('near',1)],{...position,lat:NaN}).nearby,[]);
});
test('a capped candidate set cannot establish an automatic match',()=>{
 assert.equal(suggestMomentPlaces([place('near',2)],{...position,complete:false}).automatic,null);
});
