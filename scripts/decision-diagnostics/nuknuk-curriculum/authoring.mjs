// Offline, explicitly authored examples. No user parser, model or network.
import {F,makeInterpretation} from '../nuknuk-pilot-authoring.mjs';
import {validateNuknukUnderstanding} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
export const reference={now:'2026-11-12T09:00:00Z',timezone:'Europe/Zurich'};
export const R=(k,v,s=['a1'])=>F(k,v,'REQUIRED',s);
export const P=(k,v,s=['a1'])=>F(k,v,'PREFERRED',s);
export const C=(k,v,s=[])=>F(k,v,'CONTEXT',s);
export const O=(k,v,s=['a1'])=>F(k,v,'NOT_REQUIRED',s);
export const X=(k,v,s=['a1'])=>F(k,v,'EXCLUDED',s);
export const A=(v,s=['a1'])=>R('experience.activity',v,s);
export const M=(v='meal',s=['a1'])=>R('food.meal',v,s);
export const D=(v,s=['a1'])=>R('food.drink',v,s);
export const dish=(v,s=['a1'])=>R('food.dish',v,s);
export const person=(v,id='p1')=>C('people.relationship',v,[id]);
export const accompanied=()=>F('people.relationship','adult_accompanied','CONTEXT',[],'INFERRED');
export const age=(n,id='p1')=>C('people.age',{amount:n,operator:'EQ',unit:'YEARS'},[id]);
export const count=n=>C('people.count',{amount:n,operator:'EQ',unit:'PEOPLE'});
export const cash=(n,op='LTE',mod='REQUIRED',s=['a1'])=>F('budget.maximum',{amount:n,operator:op,currency:'CHF'},mod,s);
export const scope=v=>C('budget.scope',{scope:v});
export const date=v=>R('time.date',{date:v,operator:'EQ',timezone:'Europe/Zurich'},[]);
export const phase=v=>R('time.day_phase',{phase:v,timezone:'Europe/Zurich'},[]);
export const clock=(v,op='EQ')=>R('time.clock_start',{time:v,operator:op,timezone:'Europe/Zurich'},[]);
export const duration=(n,measurementScope='VISIT',op='LTE')=>R('time.duration',{amount:n,operator:op,unit:'MINUTES',measurementScope,includes:[measurementScope==='TRAVEL'?'TRAVEL':'ACTIVITY']});
export const fact=n=>({kind:'FACT',factId:'f'+n});
export const all=(...items)=>({kind:'ALL',children:items.map(x=>typeof x==='number'?fact(x):x)});
export const any=(...ns)=>({kind:'ANY',strength:'REQUIRED',children:ns.map(fact)});
export const same=(a,b)=>({kind:'SAME_PLACE',factIds:['f'+a,'f'+b]});
export const W=(query,goal,facts,extra={})=>({query,goal,facts,...extra});
export function family(name,domain,phenomena,rows,split='TRAIN'){
 if(rows.length!==8)throw Error('eight_distinct_authored_examples_required:'+name);
 return rows.map((spec,i)=>({...spec,id:`solid-${name}-${i+1}`,scenarioGroup:`solid-${name}`,domain,phenomena,split,reference}));
}
export function materialize(spec){
 const entityKinds={...spec.entityKinds};
 for(const f of spec.facts)if(f.key==='people.relationship'&&['Eltern','Kinder','Freunde','Freundinnen','Kollegen','Team'].includes(f.value.text))for(const id of f.subjectIds)entityKinds[id]='GROUP';
 const row=makeInterpretation({...spec,entityKinds},spec);
 if(spec.extensions)row.content.target.meaning.extensions=spec.extensions.map((description,i)=>({id:'extra'+i,description:typeof description==='string'?description:description.description,modality:typeof description==='string'?'REQUIRED':description.modality,basis:'EXPLICIT',subjectIds:['a1']}));
 if(spec.labels)for(const e of row.content.target.meaning.entities)e.label=spec.labels[e.id]??e.label;
 validateNuknukUnderstanding(row.content.target,row.content);
 row.contentHash=contentHash(row.content);return row;
}
export const clarification=(dimension,question,options,why)=>({
 missing:[{dimension,whyItMatters:why}],question:{dimension,question,options},
});
