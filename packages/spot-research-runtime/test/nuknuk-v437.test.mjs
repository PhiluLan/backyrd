import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseFlatFieldFacts} from '../dist/nuknuk-spot-plan.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
const field=key=>({attributeKey:key,...researchValueContract(key),profileCategory:'EAT'});
const source=(text,headings=[])=>({id:'s1',url:'https://example.org/',text,headings,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-25T19:00:00Z'});
test('an unquoted absence marker normalizes to an empty condition with an audit marker',()=>{
 const s=source('Example Restaurant');
 const raw={facts:[{field:'classification.primary_category',value:'EAT',blockId:'b0',belongsTo:'TARGET',condition:'none'}]};
 const row=parseFlatFieldFacts(raw,s,[field('classification.primary_category')],[{id:'b0',text:s.text}],0)[0];
 assert.equal(row.condition,'');assert.equal(row.applicability,'CURRENT');assert.equal(row.reason,'SEMANTIC_CHECK_PENDING');assert.equal(row.conditionNormalization.original,'none');assert.equal(raw.facts[0].condition,'none');
});
test('literal restrictions and uncertainty placeholders are not erased',()=>{
 for(const condition of ['ab sechs Personen','unknown','none']){
 const s=source('Example Restaurant\nReservierung ab sechs Personen.\nnone');
 const row=parseFlatFieldFacts({facts:[{field:'identity.name',value:'Example Restaurant',blockId:'b0',belongsTo:'TARGET',condition}]},s,[field('identity.name')],[{id:'b0',text:'Example Restaurant'}],0)[0];
 assert.equal(row.condition,condition);assert.equal(row.applicability,'CONDITIONAL');assert.equal(row.conditionNormalization,undefined);
 }
});
test('a kitchen interval row inherits only its immediate original weekday context in the same section',()=>{
 const day='Dienstag – Samstag: 11.30 – 23.00 Uhr',kitchen='Küchen Öffnungszeit 11.30 – 17.00 & 18.00 – 21.30 Uhr';const text='Baiz\n\n'+day+'\n\n'+kitchen+'\n\nAnderer Bereich';
 const s=source(text,[{level:3,text:'Baiz',offset:0},{level:3,text:'Anderer Bereich',offset:text.indexOf('Anderer')}]);
 const values=['TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].map(day=>({day,intervals:[{start:'11:30',end:'17:00'},{start:'18:00',end:'21:30'}]}));
 const row=parseFlatFieldFacts({facts:[{field:'hours.kitchen',value:values,blockId:'k',belongsTo:'TARGET',condition:'none'}]},s,[field('hours.kitchen')],[{id:'k',text:kitchen}],0)[0];
 assert.equal(row.quote,day+'\n\n'+kitchen);assert.equal(s.text.slice(row.sourceOffset,row.sourceOffset+row.quote.length),row.quote);assert.equal(row.reason,'SEMANTIC_CHECK_PENDING');assert.deepEqual(JSON.parse(row.valueJson),values);
 const siblingText='Baiz\n'+day+'\nAnderer Bereich\n'+kitchen;const sibling=source(siblingText,[{level:3,text:'Baiz',offset:0},{level:3,text:'Anderer Bereich',offset:siblingText.indexOf('Anderer')}]);
 const held=parseFlatFieldFacts({facts:[{field:'hours.kitchen',value:values,blockId:'k',belongsTo:'TARGET',condition:''}]},sibling,[field('hours.kitchen')],[{id:'k',text:kitchen}],0)[0];assert.equal(held.reason,'KITCHEN_WEEKDAYS_NOT_LITERAL');
});
