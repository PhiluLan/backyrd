// Synthetic positive and negative searches using the existing Bibliothekar.
import assert from 'node:assert/strict';
import {materialize} from './authoring.mjs';
import {trainingSpecs} from './train.mjs';
import {contrastSpecs} from './contrasts.mjs';
import {validateNuknukUnderstanding} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {profile,offer,area,prop,binding,worldFact,search} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
export function matchingProbes(){
 const results=[];let n=8800;
 const get=id=>{const spec=[...trainingSpecs,...contrastSpecs].find(s=>s.id===id);assert(spec);return materialize(spec);};
 function probe(name,id,p,expected,extras=[]){const row=get(id),plan=validateNuknukUnderstanding(row.content.target,row.content).plan;
  const b=binding(n++,p,extras);if(['SPORT','STAY'].includes(p.category))b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=[p.category==='SPORT'?'SPORTS_CENTRE':'HOTEL'];
  const found=search(plan,[b]);const actual=found.ranked.length;assert.equal(actual,expected,name);
  results.push({name,caseId:id,expectedRanked:expected,actualRanked:actual,excluded:found.excluded.map(c=>({status:c.status,failedFactIds:c.failedFactIds,unknownFactIds:c.unknownFactIds}))});}
 probe('Recommended reservation is compatible with no mandatory reservation','solid-booking-access-1',profile([offer('meal','DINNER',['inside'],[prop('participation.booking','Reservation empfohlen')])]),1);
 probe('Mandatory reservation violates the explicit requirement','solid-booking-access-1',profile([offer('meal','DINNER',['inside'],[prop('participation.booking','Reservation erforderlich')])]),0);
 probe('Conversation can be confirmed without silence','solid-reconnection-5',profile([offer('dinner','DINNER',['inside'],[prop('offer.capacity',2)])],[area('inside',[prop('atmosphere.conversation','Unterhaltung gut möglich')])]),1);
 probe('Silence alone is not proof of conversation conditions','solid-reconnection-5',profile([offer('dinner','DINNER',['inside'],[prop('offer.capacity',2)])],[area('inside',[prop('atmosphere.noise','ruhig')])]),0);
 const combined=profile([offer('bowling','BOWLING',['play']),offer('meal','DINNER',['eat'])],[area('play'),area('eat')],'SPORT');
 probe('Bowling and dinner may occupy separate rooms','solid-same-place-food-3',combined,1);
 probe('Bowling alone does not satisfy dinner','solid-same-place-food-3',profile([offer('bowling','BOWLING',['play'])],[area('play')],'SPORT'),0);
 const mini=profile([offer('golf','MINI_GOLF',['play'])],[area('play')],'SPORT');
 probe('Own food permission needs no catering offer','solid-bring-or-buy-1',mini,1,[worldFact('rule.external_food',{policy:'ALLOWED',exceptions:[]})]);
 probe('Disallowed own food cannot be replaced by catering','solid-bring-or-buy-1',mini,0,[worldFact('rule.external_food',{policy:'NOT_ALLOWED',exceptions:[]})]);
 const breakfast=category=>profile([offer('breakfast','BREAKFAST',['inside'],[prop('participation.permission','Öffentlicher Tageszugang')])],[area()],category);
 probe('Hotel breakfast rejects ordinary restaurant','solid-booking-access-6',breakfast('RESTAURANT'),0);
 probe('Hotel breakfast retains true hotel','solid-booking-access-6',breakfast('STAY'),1);
 probe('Complete group needs confirmed capacity','solid-self-correction-3',profile([offer('brunch','BRUNCH',['inside'],[prop('offer.capacity',4)])]),1);
 probe('Missing capacity is not a confirmed group fit','solid-self-correction-3',profile([offer('brunch','BRUNCH')]),0);
 probe('Known capacity two fails group four','solid-self-correction-3',profile([offer('brunch','BRUNCH',['inside'],[prop('offer.capacity',2)])]),0);
 probe('Four bowlers plus watcher do not require five player slots','solid-group-taste-4',profile([offer('bowling','BOWLING',['inside'],[prop('offer.capacity',4)])],[area()],'SPORT'),1);
 const animal=profile([offer('animals','ANIMAL_OBSERVATION')],[area()],'ZOO');
 const rule=worldFact('rule.age_access_conditions',{notes:null,rules:[{mode:'UNACCOMPANIED_MINIMUM',minimumAge:13,accompaniment:'ADULT',area:null,days:[],event:null,appliesFromTime:null}]});
 probe('Child as recipient is no proof of adult accompaniment','solid-pets-7',animal,0,[rule]);
 probe('Explicit shared family visit preserves adult accompaniment','solid-young-family-2',animal,1,[rule]);
 return results;
}
