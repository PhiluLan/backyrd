import test from 'node:test';
import assert from 'node:assert/strict';
import {translationLogicSignature as signature} from './translation-stability-analysis.mjs';
const f=id=>({kind:'FACT',factId:id});
const meaning=logic=>({facts:[{id:'a',key:'food.meal',modality:'REQUIRED',value:{kind:'TEXT',text:'meal'}},{id:'b',key:'food.meal',modality:'REQUIRED',value:{kind:'TEXT',text:'snacks'}},{id:'c',key:'experience.activity',modality:'REQUIRED',value:{kind:'TEXT',text:'meal'}}],logic,extensions:[],bindings:[],weatherConditions:[]});
const options={conceptFor:v=>v,rules:{meal:['experience.activity'],snacks:['experience.activity']}};
test('stability comparison distinguishes OR from AND despite identical words',()=>{
 assert.notDeepEqual(signature(meaning({kind:'ALL',children:[f('a'),f('b')]}),options),signature(meaning({kind:'ANY',strength:'REQUIRED',children:[f('a'),f('b')]}),options));
});
test('ids, redundant equivalent duties, ordering and nested conjunctions do not create false instability',()=>{
 const left=meaning({kind:'ALL',children:[f('a'),{kind:'ALL',children:[f('b'),f('c')]}]});
 const right=meaning({kind:'ALL',children:[f('b'),f('a')]});
 assert.deepEqual(signature(left,options),signature(right,options));
});
test('sequence order remains significant',()=>{
 const left=meaning(f('a')),right=meaning(f('a'));
 left.bindings=[{kind:'SEQUENCE',factIds:['a','b']}];right.bindings=[{kind:'SEQUENCE',factIds:['b','a']}];
 assert.notDeepEqual(signature(left,options),signature(right,options));
});
test('non-duties do not produce false differences between unconstrained alternatives',()=>{
 const left=meaning({kind:'ALL',children:[f('a'),f('b')]}),right=meaning(f('a'));
 left.facts[1].modality='NOT_REQUIRED';
 assert.deepEqual(signature(left,options),signature(right,options));
});
