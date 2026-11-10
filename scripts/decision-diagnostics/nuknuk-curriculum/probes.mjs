// Synthetic positive and negative searches using the existing Bibliothekar.
import assert from 'node:assert/strict';
import {materialize} from './authoring.mjs';
import {trainingSpecs} from './train.mjs';
import {validateNuknukUnderstanding} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {profile,offer,area,prop,binding,worldFact,search} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
export function matchingProbes(){
 const results=[];let n=8800;
 const get=id=>{const spec=trainingSpecs.find(s=>s.id===id);assert(spec);return materialize(spec);};
 function probe(name,id,p,expected,extras=[]){const row=get(id),plan=validateNuknukUnderstanding(row.content.target,row.content).plan;
  const b=binding(n++,p,extras);if(p.category==='SPORT')b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['SPORTS_CENTRE'];
  const found=search(plan,[b]);const actual=found.ranked.length;assert.equal(actual,expected,name);
  results.push({name,caseId:id,expectedRanked:expected,actualRanked:actual,excluded:found.excluded.map(c=>({status:c.status,failedFactIds:c.failedFactIds,unknownFactIds:c.unknownFactIds}))});}
 probe('Recommended reservation is compatible with no mandatory reservation','solid-booking-access-1',profile([offer('meal','DINNER',['inside'],[prop('participation.booking','Reservation empfohlen')])]),1);
 probe('Mandatory reservation violates the explicit requirement','solid-booking-access-1',profile([offer('meal','DINNER',['inside'],[prop('participation.booking','Reservation erforderlich')])]),0);
 probe('Conversation can be confirmed without silence','solid-reconnection-5',profile([offer()],[area('inside',[prop('atmosphere.conversation','Unterhaltung gut möglich')])]),1);
 probe('Silence alone is not proof of conversation conditions','solid-reconnection-5',profile([offer()],[area('inside',[prop('atmosphere.noise','ruhig')])]),0);
 const combined=profile([offer('bowling','BOWLING',['play']),offer('meal','DINNER',['eat'])],[area('play'),area('eat')],'SPORT');
 probe('Bowling and dinner may occupy separate rooms','solid-same-place-food-3',combined,1);
 probe('Bowling alone does not satisfy dinner','solid-same-place-food-3',profile([offer('bowling','BOWLING',['play'])],[area('play')],'SPORT'),0);
 const mini=profile([offer('golf','MINI_GOLF',['play'])],[area('play')],'SPORT');
 probe('Own food permission needs no catering offer','solid-bring-or-buy-1',mini,1,[worldFact('rule.external_food',{policy:'ALLOWED',exceptions:[]})]);
 probe('Disallowed own food cannot be replaced by catering','solid-bring-or-buy-1',mini,0,[worldFact('rule.external_food',{policy:'NOT_ALLOWED',exceptions:[]})]);
 return results;
}
