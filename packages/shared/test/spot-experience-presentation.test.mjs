import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {resolve} from "node:path";
const ts=createRequire(resolve(process.cwd(),"package.json"))("typescript");
const source=await readFile(new URL('../src/presentation/spot-experience.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {presentSpotExperience,spotExperienceDetailGroups}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const conditions={event:null,dayparts:[],weekdays:[],validFrom:null,validUntil:null};
const known=(key,value,extra={})=>({key,state:'KNOWN',value,label:null,conditions,...extra});
const price={label:'Brunch',currency:'CHF',min:42,max:null,basis:'PER_PERSON',minimumAge:14,maximumAge:null,includes:'Essen',mandatoryFeesIncluded:true,conditions};
const profile={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',reviewed:true,offers:[{id:'brunch',name:'Brunch',prices:[price],areaIds:['terrace'],properties:[known('participation.minimum_age',18),known('food.drink','Kaffee'),known('food.drink','Tee'),known('experience.activity','essen gehen',{conditions:{...conditions,weekdays:[7],dayparts:['MORNING']}})],schedule:[]}],areas:[{id:'terrace',name:'Terrasse',properties:[known('amenity.step_free',true),known('amenity.playground',false),known('location.waterbody','Rhein')]}],properties:[known('amenity.changing_table',false)]};
test('offers retain their own prices, age scope, places and conditions',()=>{
 const displayed=presentSpotExperience(profile);assert.equal(displayed.offers[0].name,'Brunch');assert.match(displayed.offers[0].prices[0],/ab 42 CHF.*pro Person.*ab 14 Jahren.*für Essen/);assert.deepEqual(displayed.offers[0].places,['Terrasse']);
 assert.deepEqual(displayed.offers[0].facts.find(f=>f.label==='Getränke einschließlich alkoholfreier Auswahl')?.value,'Kaffee · Tee');assert.match(displayed.offers[0].facts.find(f=>f.label==='Was kann man hier machen?')?.condition,/Sonntag.*vormittags/);assert.match(displayed.offers[0].facts.find(f=>f.label==='Mindestalter für dieses Angebot')?.value??'',/18/);
 assert.deepEqual(displayed.areas[0].places,['Brunch']);assert.equal(displayed.areas[0].facts.find(f=>f.label==='Spielplatz vorhanden?')?.value,'Nein');assert.equal(displayed.shared[0].value,'Nein');
 assert.equal(displayed.areas[0].facts.some(f=>f.label.includes('Mindestalter')),false);
});
test('unknown, not-applicable and internal properties never become public facts',()=>{
 const input={...profile,properties:[known('internal.secret','must-not-display'),known('amenity.playground',null,{state:'UNKNOWN'}),known('offer.temperature',null,{state:'NOT_APPLICABLE'})]};assert.deepEqual(presentSpotExperience(input).shared,[]);
 assert.deepEqual(presentSpotExperience({...profile,reviewed:false}),{offers:[],areas:[],shared:[]});assert.deepEqual(presentSpotExperience({}),{offers:[],areas:[],shared:[]});
});
test('invalid prices are omitted and free child tariffs retain inclusive age limits',()=>{
 const input={...profile,offers:[{...profile.offers[0],prices:[{...price,min:0,max:0,minimumAge:0,maximumAge:4},{...price,min:50,max:20},{...price,currency:'<bad>'}]}]};
 const prices=presentSpotExperience(input).offers[0].prices;assert.equal(prices.length,1);assert.match(prices[0],/Kostenlos.*0–4 Jahre/);
});

test('canonical offer schedules and seasonal bounds remain attached to the offer',()=>{
 const result=presentSpotExperience({...profile,offers:[{...profile.offers[0],schedule:[{weekday:7,start:'10:00',end:'14:00'},{weekday:8,start:'10:00',end:'14:00'}],validFrom:'2026-10-01',validUntil:'2026-12-31'}]});
 assert.deepEqual(result.offers[0].times,['Sonntag 10:00–14:00','Ab 2026-10-01 · Bis 2026-12-31']);
});

test('visitor details preserve scope and conditions without form questions or duplicate diet copy',()=>{
 const input={...profile,offers:[{...profile.offers[0],properties:[known('food.cuisine','vegan'),known('food.diet','vegan'),known('food.diet','vegetarisch'),known('participation.booking','Nicht erforderlich'),known('participation.minimum_age',18,{conditions:{...conditions,weekdays:[6]}})]}]};
 const shown=presentSpotExperience(input);
 const groups=spotExperienceDetailGroups(shown.offers[0].facts);
 const copy=groups.flatMap(group=>group.items).join(' ');
 assert.match(copy,/Keine Reservation nötig/);assert.match(copy,/Ab 18 Jahren.*Samstag/);
 assert.match(copy,/Ernährungsangebot: vegetarisch/);assert.equal((copy.match(/vegan/g)??[]).length,1);
 assert.doesNotMatch(copy,/Wer kann|Was kann|erforderlich\?/);
 assert.equal(spotExperienceDetailGroups(shown.areas[0].facts).flatMap(g=>g.items).some(t=>t.includes('18')),false);
 assert.match(spotExperienceDetailGroups(shown.shared).flatMap(g=>g.items).join(' '),/Kein Wickeltisch/);
});

test('meal copy omits only unconditional repeated defaults and retains dishes and conditional activities',()=>{
 const input={...profile,offers:[{...profile.offers[0],kind:'LUNCH',properties:[known('food.cuisine','vegan'),known('food.dish','vegane Gerichte'),known('food.dish','Ramen'),known('experience.activity','essen gehen'),known('food.meal_extent','Essen'),known('experience.activity','essen gehen',{conditions:{...conditions,weekdays:[7]}}),known('participation.consumption_obligation','Bestellpflicht')]}]};
 const card=presentSpotExperience(input).offers[0];const copy=spotExperienceDetailGroups(card.facts,card.kind).flatMap(group=>group.items).join(' ');
 assert.match(copy,/Ramen/);assert.match(copy,/Sonntag/);assert.match(copy,/Eine Bestellung ist erforderlich/);
 assert.equal((copy.match(/essen gehen/g)??[]).length,1);assert.doesNotMatch(copy,/vegane Gerichte|Speisen: Essen/);
 assert.match(spotExperienceDetailGroups(card.facts,'OTHER').flatMap(g=>g.items).join(' '),/Speisen: Essen/);
});
