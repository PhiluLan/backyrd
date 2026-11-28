import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import vm from "node:vm";
const ts=createRequire(resolve(process.cwd(),"package.json"))("typescript");
const source=await readFile(new URL('../src/presentation/spot-experience.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {presentSpotExperience,spotExperienceDetailGroups}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const conditions={event:null,dayparts:[],weekdays:[],validFrom:null,validUntil:null};
const known=(key,value,extra={})=>({key,state:'KNOWN',value,label:null,conditions,...extra});
test('new participation facts appear in public details with their conditions',()=>{
 const p={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',reviewed:true,offers:[{id:'course',kind:'WORKSHOP',name:'Töpferkurs',areaIds:[],prices:[],schedule:[],properties:[known('participation.group_access','Einzelanmeldung möglich'),known('participation.subscription','Ohne Mitgliedschaft oder Abo',{conditions:{...conditions,weekdays:[6]}})]}],areas:[],properties:[]};
 const presented=presentSpotExperience(p);assert.equal(presented.offers[0].facts.length,2);
 assert.equal(presented.offers[0].facts[0].label,'Anmeldung');assert.match(presented.offers[0].facts[1].condition,/Samstag/);
 const serialized=JSON.stringify(spotExperienceDetailGroups(presented.offers[0].facts));
 assert.match(serialized,/Einzelanmeldung möglich/);assert.match(serialized,/Ohne Mitgliedschaft oder Abo/);
});
const price={label:'Brunch',currency:'CHF',min:42,max:null,basis:'PER_PERSON',minimumAge:14,maximumAge:null,includes:'Essen',mandatoryFeesIncluded:true,conditions};
const profile={contractVersion:'backyrd.world-knowledge.experience-profile@1.0',reviewed:true,offers:[{id:'brunch',name:'Brunch',prices:[price],areaIds:['terrace'],properties:[known('participation.minimum_age',18),known('food.drink','Kaffee'),known('food.drink','Tee'),known('experience.activity','essen gehen',{conditions:{...conditions,weekdays:[7],dayparts:['MORNING']}})],schedule:[]}],areas:[{id:'terrace',name:'Terrasse',properties:[known('amenity.step_free',true),known('amenity.playground',false),known('location.waterbody','Rhein')]}],properties:[known('amenity.changing_table',false)]};
test('consumer copy works without Intl.ListFormat as on installed iOS Hermes',()=>{
 const exports={};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{exports,Intl:{NumberFormat:Intl.NumberFormat}});
 for(const [value,expected] of [['Craft-Bier','Hier gibt es Craft-Bier.'],['Kaffee · Tee','Hier gibt es Kaffee und Tee.'],['Bier · Kaffee · Tee','Hier gibt es Bier, Kaffee und Tee.']]) {
  const groups=exports.spotExperienceDetailGroups([{key:'food.drink',label:'Getränke',value,condition:null}]);
  assert.equal(groups[0].items[0],expected);
 }
 assert.equal(exports.spotExperienceDetailGroups([]).length,0);
});
test('schedule groups only consecutive days with identical complete time slots',()=>{
 const schedule=[1,2,4,5,6].flatMap(weekday=>[{weekday,start:'17:00',end:'00:30'}]);
 schedule.push({weekday:5,start:'12:00',end:'14:00'});
 schedule.push({weekday:1,start:'17:00',end:'00:30'});
 const shown=presentSpotExperience({...profile,offers:[{...profile.offers[0],schedule}]});
 assert.deepEqual(shown.offers[0].times,['Montag–Dienstag 17:00–00:30','Donnerstag 17:00–00:30','Freitag 12:00–14:00, 17:00–00:30','Samstag 17:00–00:30']);
});
test('technical default offer name is visitor-facing in offers and area references',()=>{
 const shown=presentSpotExperience({...profile,offers:[{...profile.offers[0],name:'Essen (ohne Trennung nach Mahlzeit)'}]});
 assert.equal(shown.offers[0].name,'Essen');
 assert.deepEqual(shown.areas[0].places,['Essen']);
});
test('price omits only inclusion copy identical to the tariff label',()=>{
 const shown=presentSpotExperience({...profile,offers:[{...profile.offers[0],prices:[{...price,label:'Essen',includes:'Essen'},{...price,label:'Essen',includes:'Essen und Getränke'}]}]});
 assert.doesNotMatch(shown.offers[0].prices[0],/für Essen/);
 assert.match(shown.offers[0].prices[1],/für Essen und Getränke/);
});
test('structured visit facts remove only repeated activities and preserve restrictions and conditions',()=>{
 const shown=presentSpotExperience({...profile,offers:[{...profile.offers[0],name:'Degustation',properties:[known('experience.activity','Degustation'),known('participation.booking','Erforderlich',{conditions:{...conditions,weekdays:[6]}}),known('food.drink','Craft-Bier'),known('participation.minimum_age',18)]}]});
 const copy=spotExperienceDetailGroups(shown.offers[0].facts,'','Degustation').flatMap(group=>group.items).join(' ');
 assert.doesNotMatch(copy,/Erlebnis: Degustation/);
 assert.match(copy,/Eine Reservation ist erforderlich \(Samstag\)/);
 assert.match(copy,/Hier gibt es Craft-Bier/);
 assert.match(copy,/Ab 18 Jahren/);
});
test('structured tariffs retain mandatory fees and age restrictions separately from amount',()=>{
 const shown=presentSpotExperience({...profile,offers:[{...profile.offers[0],prices:[{...price,mandatoryFeesIncluded:false}]}]});
 assert.equal(shown.offers[0].priceDetails[0].amount,'ab 42 CHF');
 assert.ok(shown.offers[0].priceDetails[0].details.includes('ab 14 Jahren'));
 assert.ok(shown.offers[0].priceDetails[0].details.includes('zusätzliche Pflichtkosten'));
});
test('scannable food entries keep categories and qualifiers attached to tags',()=>{
 const shown=presentSpotExperience({...profile,offers:[{...profile.offers[0],properties:[known('food.dish','Burger'),known('food.dish','Pizza'),known('food.option','Glutenfreie Option',{conditions:{...conditions,weekdays:[6]}}),known('food.option','Anpassung auf Anfrage',{conditions:{...conditions,weekdays:[6]}}),known('participation.booking','Erforderlich')]}]});
 const groups=spotExperienceDetailGroups(shown.offers[0].facts);
 const food=groups.find(group=>group.title==='Essen & Trinken').entries;
 assert.deepEqual(food.find(entry=>entry.label==='Auf der Karte').tags,['Burger','Pizza']);
 assert.deepEqual(food.find(entry=>entry.label==='Ernährung & Allergene').tags,['Glutenfreie Option','Anpassung auf Anfrage']);
 assert.equal(food.find(entry=>entry.label==='Ernährung & Allergene').condition,'Samstag');
 assert.equal(groups.find(group=>group.title==='Dein Besuch').entries[0].text,'Eine Reservation ist erforderlich.');
 assert.deepEqual(groups.find(group=>group.title==='Dein Besuch').entries[0].tags,[]);
});
test('Volta visitor copy reads as visit advice, not a form export',()=>{
 const shown=presentSpotExperience({...profile,offers:[{...profile.offers[0],name:'Degustation',properties:[known('experience.activity','Degustation'),known('participation.booking','Empfohlen'),known('offer.service','Selbstbedienung'),known('food.drink','Craft-Bier'),known('participation.consumption_obligation','Bestellpflicht')]}],properties:[known('travel.mode','ÖV'),known('travel.mode','Zu Fuss'),known('travel.mode','Velo'),known('custom.detail','Ganzjährig geöffnet, für Anlässe auf Anfrage',{label:'Biergarten'})]});
 const copy=spotExperienceDetailGroups(shown.offers[0].facts,'','Degustation').flatMap(group=>group.items).join(' ');
 assert.match(copy,/Reserviere am besten im Voraus/);
 assert.match(copy,/Hier bedienst du dich selbst/);
 assert.match(copy,/Hier gibt es Craft-Bier/);
 assert.match(copy,/musst du etwas bestellen/);
 assert.doesNotMatch(copy,/Erlebnis:|Konsumation:|Service:|Getränke:/);
 const shared=spotExperienceDetailGroups(shown.shared);
 assert.match(shared.flatMap(group=>group.items).join(' '),/mit dem ÖV, zu Fuss und mit dem Velo/);
 assert.deepEqual(shared.find(group=>group.title==='Biergarten').items,['Ganzjährig geöffnet, für Anlässe auf Anfrage.']);
});
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
 assert.match(copy,/Du brauchst nicht zu reservieren/);assert.match(copy,/Ab 18 Jahren.*Samstag/);
 assert.match(copy,/vegetarische Optionen/);assert.equal((copy.match(/vegan/g)??[]).length,1);
 assert.doesNotMatch(copy,/Wer kann|Was kann|erforderlich\?/);
 assert.equal(spotExperienceDetailGroups(shown.areas[0].facts).flatMap(g=>g.items).some(t=>t.includes('18')),false);
 assert.match(spotExperienceDetailGroups(shown.shared).flatMap(g=>g.items).join(' '),/Kein Wickeltisch/);
});

test('meal copy omits only unconditional repeated defaults and retains dishes and conditional activities',()=>{
 const input={...profile,offers:[{...profile.offers[0],kind:'LUNCH',properties:[known('food.cuisine','vegan'),known('food.dish','vegane Gerichte'),known('food.dish','Ramen'),known('experience.activity','essen gehen'),known('food.meal_extent','Essen'),known('experience.activity','essen gehen',{conditions:{...conditions,weekdays:[7]}}),known('participation.consumption_obligation','Bestellpflicht')]}]};
 const card=presentSpotExperience(input).offers[0];const copy=spotExperienceDetailGroups(card.facts,card.kind).flatMap(group=>group.items).join(' ');
 assert.match(copy,/Ramen/);assert.match(copy,/Sonntag/);assert.match(copy,/musst du etwas bestellen/);
 assert.equal((copy.match(/essen gehen/g)??[]).length,1);assert.doesNotMatch(copy,/vegane Gerichte|Speisen: Essen/);
 assert.match(spotExperienceDetailGroups(card.facts,'OTHER').flatMap(g=>g.items).join(' '),/Speisen: Essen/);
});
