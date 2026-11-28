import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExperienceProfile} from '@backyrd/world-knowledge-core';
import {fact,request,profile,offer,area,prop,binding,search,worldFact} from './librarian-matching-fixtures.mjs';

const check=(key,wanted,storedKey,storedValue,{kind='WORKSHOP',activity='workshop',modality='REQUIRED',areaScoped=false,conditions}={})=>{
 const property=prop(storedKey,storedValue,conditions?{conditions}:{});
 const p=parseExperienceProfile(profile([offer('activity',kind,['inside'],areaScoped?[]:[property],[])],[area('inside',areaScoped?[property]:[])],'RESTAURANT'));
 const q=request([fact('activity','experience.activity',activity),fact('need',key,wanted,modality)]);
 return search(q,[binding(700,p)]);
};
const state=r=>[...r.ranked,...r.unresolved,...r.excluded][0]?.facts.find(f=>f.factId==='need')?.state;

for(const [key,wanted,yes,no] of [
 ['participation.group_access','individual_registration','Einzelanmeldung möglich','Nur Gruppenanmeldung'],
 ['participation.subscription','no_membership_required','Ohne Mitgliedschaft oder Abo','Mitgliedschaft oder Abo erforderlich'],
 ['participation.permission','dogs_allowed','Hunde erlaubt','Hunde nicht erlaubt'],
])test(`${key}: authored positive, negative, unknown and preference remain distinct`,()=>{
 const good=check(key,wanted,key,yes);assert.equal(state(good),'MET');assert.equal(good.ranked.length,1);
 const bad=check(key,wanted,key,no);assert.equal(state(bad),'FAILED');assert.equal(bad.ranked.length,0);
 const unrelated=check(key,wanted,'participation.format','Betreut');assert.equal(state(unrelated),'UNKNOWN');assert.equal(unrelated.ranked.length,0);
 const soft=check(key,wanted,key,no,{modality:'PREFERRED'});assert.equal(soft.ranked.length,1);
});

test('minimum nights proves one night only for an actual overnight offer',()=>{
 const options={kind:'OVERNIGHT_STAY',activity:'overnight_stay'};
 assert.equal(check('participation.requirement','one_night','stay.minimum_nights',1,options).ranked.length,1);
 assert.equal(state(check('participation.requirement','one_night','stay.minimum_nights',2,options)),'FAILED');
 assert.equal(state(check('participation.requirement','one_night','stay.minimum_nights',1)),'UNKNOWN');
 assert.equal(state(check('participation.requirement','one_night','stay.minimum_nights',1,{kind:'DAY_USE',activity:'day_use'})),'UNKNOWN');
 assert.equal(state(check('participation.requirement','unbekannte Voraussetzung','stay.minimum_nights',1,options)),'UNKNOWN');
});

test('bowling beginner suitability uses explicit levels rather than course or venue identity',()=>{
 const options={kind:'BOWLING',activity:'bowling'};
 assert.equal(check('participation.expertise','beginner','sport.level','Anfänger',options).ranked.length,1);
 assert.equal(check('participation.expertise','beginner','sport.level','Alle Erfahrungsstufen',options).ranked.length,1);
 assert.equal(state(check('participation.expertise','beginner','sport.level','Fortgeschrittene',options)),'UNKNOWN');
 assert.equal(state(check('participation.expertise','Fachkundige Begleitung','sport.level','Anfänger',options)),'UNKNOWN');
});

test('warm water is independent of room heating',()=>{
 const options={kind:'SWIMMING',activity:'swimming',areaScoped:true};
 assert.equal(check('offer.temperature','warm_water','offer.temperature','Warmes Wasser',options).ranked.length,1);
 assert.equal(state(check('offer.temperature','warm_water','offer.temperature','Beheizt',options)),'UNKNOWN');
 assert.equal(state(check('offer.temperature','warm_water','offer.temperature','Unbeheiztes Wasser',options)),'UNKNOWN');
 assert.equal(state(check('offer.temperature','warm_water','offer.temperature','Kühles Wasser',options)),'FAILED');
});

test('children birthday needs an explicit authored activity; generic celebrations do not prove it',()=>{
 const options={kind:'PRIVATE_CELEBRATION',activity:'children_birthday'};
 assert.equal(check('experience.activity','children_birthday','experience.activity','Kindergeburtstag feiern',options).ranked.length,1);
 assert.equal(check('experience.activity','children_birthday','experience.activity','private Feier',options).ranked.length,0);
});

test('no music is evidence for an excluded background music, quiet alone is not',()=>{
 const options={modality:'EXCLUDED',areaScoped:true};
 assert.equal(check('atmosphere.music','background_music','atmosphere.music','keine Musik',options).ranked.length,1);
 assert.equal(check('atmosphere.music','background_music','atmosphere.noise','ruhig',options).ranked.length,0);
});

test('new facts preserve their conditions and cannot borrow proof from another offer',()=>{
 const p=profile([offer('requested','WORKSHOP',['inside'],[],[]),offer('other','WORKSHOP',['inside'],[prop('participation.group_access','Einzelanmeldung möglich')],[])],[area()],'RESTAURANT');
 p.offers[0].properties=[prop('experience.activity','Töpferkurs')];
 p.offers[1].properties.push(prop('experience.activity','Kochkurs'));
 const result=search(request([fact('activity','experience.activity','ceramics_course'),fact('need','participation.group_access','individual_registration')]),[binding(701,parseExperienceProfile(p))]);
 assert.equal(result.ranked.length,0);
 const conditioned=check('participation.group_access','individual_registration','participation.group_access','Einzelanmeldung möglich',{conditions:{weekdays:[1],dayparts:[],event:null,validFrom:null,validUntil:null}});
 assert.equal(conditioned.ranked.length,0,'undated condition cannot establish unrestricted participation');
});

test('the existing common pet rule is consumed without another form field or inferred assistance-animal permission',()=>{
 const q=request([fact('activity','experience.activity','essen gehen'),fact('need','participation.permission','dogs_allowed')]);
 const run=rule=>search(q,[binding(703,profile(),[worldFact('rule.pet_access',rule)])]);
 const base={indoor:'ALLOWED',outdoor:'ALLOWED',assistanceAnimals:'UNKNOWN',notes:null};
 assert.equal(run(base).ranked.length,1);
 assert.equal(state(run({...base,indoor:'NOT_ALLOWED',outdoor:'NOT_ALLOWED'})),'FAILED');
 assert.equal(state(run({...base,indoor:'UNKNOWN',outdoor:'UNKNOWN',assistanceAnimals:'ALLOWED'})),'UNKNOWN');
 assert.equal(state(run({...base,outdoor:'NOT_ALLOWED'})),'UNKNOWN');
 assert.equal(state(run({...base,notes:'Nur in bestimmten Bereichen'})),'UNKNOWN');
});
