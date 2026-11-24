// Controlled synthetic catalog for Product diagnostics. Never production seed data.
import {binding,profile,offer,area,prop,price,worldFact} from '../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
import {GERMAN_REFERENCE} from './nuknuk-german-diagnostic-cases.mjs';
import {parseExperienceProfile} from '@backyrd/world-knowledge-core';
const days=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
const schedule=Array.from({length:7},(_,weekday)=>({weekday:weekday+1,start:'08:00',end:'23:00'}));
const adultAges=[prop('participation.age_suitability','all ages')];
const o=(id,kind,cost,properties=[],areaIds=['inside'],includes='Eintritt')=>({...offer(id,kind,areaIds,properties,[price(cost,{label:includes,includes})]),schedule});
export function germanTestWorld(){
 const rows=[];
 function add(key,name,p,placeType,extra=[]){
  parseExperienceProfile(p);
  const b=binding(9000+rows.length,p,extra);b.resolvedAt=GERMAN_REFERENCE.now;
  b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='identity.name'?worldFact(f.key,'TESTORT: '+name):f.key==='classification.place_types'?worldFact(f.key,[placeType]):f.key==='hours.regular'?worldFact(f.key,days.map(day=>({day,intervals:[{start:'08:00',end:'23:00'}]}))):f);
  rows.push({key,name:'TESTORT: '+name,binding:b});
 }
 const coffee=(noise,outside=false)=>profile([o('coffee','CAFE',5,[prop('food.drink','coffee')],outside?['terrace']:['inside'],'Kaffee')],[area(outside?'terrace':'inside',[prop('atmosphere.character',noise)])],'COFFEE_DAYTIME');
 add('quiet-coffee','Ruhiges Café',coffee('ruhig'),'CAFE');add('loud-coffee','Lautes Café',coffee('laut'),'CAFE');add('terrace-coffee','Terrassencafé',coffee('ruhig',true),'CAFE');
 const exhibit=o('exhibition','PERMANENT_EXHIBITION',20,[...adultAges,prop('experience.activity','exhibition')]);
 add('museum-access','Stufenloses Museum',profile([exhibit],[area()],'MUSEUM'),'MUSEUM',[worldFact('accessibility.step_free_entrance',true,{resolution:'KNOWN_TRUE'})]);
 add('museum-stairs','Museum nur über Treppen',profile([exhibit],[area()],'MUSEUM'),'MUSEUM',[worldFact('accessibility.step_free_entrance',false,{resolution:'KNOWN_FALSE'})]);
 add('museum-coffee','Museum mit Café',profile([exhibit,o('coffee','CAFE',5,[prop('food.drink','coffee')],['inside'],'Kaffee')],[area()],'MUSEUM'),'MUSEUM');
 add('child-play','Indoor-Spielangebot ab einem Jahr',profile([o('play','MOVEMENT_PLAY',10,[prop('participation.minimum_age',1),...adultAges])],[area()],'SPORT'),'CLIMBING_GYM');
 add('older-play','Indoor-Angebot erst ab acht Jahren',profile([o('play','CHILDREN_COURSE',10,[prop('participation.minimum_age',8)])],[area()],'SPORT'),'CLIMBING_GYM');
 add('outside-play','Spielangebot ausschliesslich draussen',profile([o('play','MOVEMENT_PLAY',10,adultAges,['terrace'])],[area('terrace')],'SPORT'),'PARK');
 const meal=(cost,diets,inside=true)=>profile([o('dinner','DINNER',cost,diets.map(x=>prop('food.diet',x)),inside?['inside']:['terrace'],'Essen')],[area(inside?'inside':'terrace')]);
 add('meal-diets','Restaurant mit veganen und laktosefreien Optionen',meal(25,['vegan','vegetarian','lactose_free']),'RESTAURANT');
 add('meal-plain','Restaurant ohne bestätigte Ernährungsoptionen',meal(25,[]),'RESTAURANT');
 add('meal-expensive','Teures Restaurant mit Ernährungsoptionen',meal(45,['vegan','vegetarian','lactose_free']),'RESTAURANT');
 add('meal-outside','Restaurant nur draussen',meal(25,['vegan','vegetarian','lactose_free'],false),'RESTAURANT');
 add('pizza','Pizzeria für 20 Franken',profile([o('dinner','DINNER',20,[prop('food.dish','Pizza')],['inside'],'Essen')]),'RESTAURANT');
 const pool=extra=>profile([o('pool','SWIMMING',18,adultAges),...extra],[area(),...(extra.length?[area('sauna')]:[])],'SPORT_MOVEMENT');
 add('pool-plain','Schwimmbad ohne weiteres Angebot',pool([]),'SWIMMING_POOL');
 add('pool-sauna','Schwimmbad mit zusätzlicher Sauna',pool([o('sauna','SAUNA',10,[],['sauna'])]),'SWIMMING_POOL');
 add('pottery','Töpferatelier mit Keramikkurs',profile([o('pottery','WORKSHOP',75,[prop('experience.activity','ceramics_course')])],[area()],'ACTIVITIES_PLAY'),'WORKSHOP_STUDIO');
 add('cinema','Kino mit Filmvorführung',profile([o('film','CINEMA_SCREENING',18,adultAges)],[area()],'ENTERTAINMENT'),'CINEMA');
 add('walk','Spazierweg draussen',profile([o('walk','WALK',0,adultAges,['terrace'])],[area('terrace')],'OUTDOOR_NATURE'),'WALKING_PATH');
 return rows;
}
