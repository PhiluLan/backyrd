import test from 'node:test';
import assert from 'node:assert/strict';
import {fact,request,profile,offer,area,prop,binding,search,date,worldFact} from './librarian-matching-fixtures.mjs';
import {exercise} from './librarian-active-route-fixtures.mjs';
const bathing=()=>fact('bath','experience.activity','bathing');
const swimming=()=>fact('swim','experience.activity','swimming');
const pool=(kind='SWIMMING')=>profile([{...offer('pool',kind,['water']),name:'Badewelt'}],[{...area('water'),kind:'POOL_AREA'}]);
const steam=(name='Im Hamam und Dampfbad entspannen',areaKind='SAUNA_AREA')=>profile([{...offer('steam','BATHING',['steam'],[prop('experience.activity','Baden')]),name}],[{...area('steam'),kind:areaKind,name:'Wellnessbereich'}]);
const candidate=r=>[...r.ranked,...r.unresolved,...r.excluded][0];

test('a swimming offer supports ordinary bathing, but a thermal bathing offer does not prove sports swimming',()=>{
 assert.equal(search(request([bathing()]),[binding(1700,pool('SWIMMING'))]).ranked.length,1);
 assert.equal(search(request([bathing()]),[binding(1701,pool('BATHING'))]).ranked.length,1);
 assert.equal(search(request([swimming()]),[binding(1701,pool('BATHING'))]).ranked.length,0);
 assert.deepEqual(search(request([bathing()]),[binding(1700,pool())]).ranked[0].areaIds,['water']);
});

test('steam and sauna offers cannot prove immersion bathing through a broad BATHING tag or copied Baden property',()=>{
 for(const [name,kind] of [['Im Hamam und Dampfbad entspannen','SAUNA_AREA'],['Hamam','OTHER'],['Hammam','OTHER'],['Steam bath','OTHER']]){
  const r=search(request([bathing()]),[binding(1702,steam(name,kind))]);
  assert.equal(r.ranked.length,0,name);
  assert.ok(candidate(r).facts.some(f=>f.reason==='STEAM_BATH_NOT_IMMERSION_EVIDENCE'),name);
 }
 const p=steam('Wellness-Anwendung','OTHER');p.offers[0].properties.push(prop('experience.activity','Hamam mit Seifenschaum-Massage'));
 assert.equal(search(request([bathing()]),[binding(1702,p)]).ranked.length,0);
});

test('a venue with a pool and a hamam is recommended through its pool, never by borrowing it for the steam offer',()=>{
 const p=steam();p.areas.push({...area('water'),kind:'POOL_AREA'});p.offers.push({...offer('pool','BATHING',['water']),name:'Badewelt'});
 const c=search(request([bathing()]),[binding(1703,p)]).ranked[0];
 assert.ok(c);assert.deepEqual(c.offerIds,['pool']);assert.deepEqual(c.areaIds,['water']);
 const onlySteam=steam();onlySteam.areas.push({...area('water'),kind:'POOL_AREA'});
 assert.equal(search(request([bathing()]),[binding(1704,onlySteam)]).ranked.length,0,'unlinked pool does not establish a bathing offer');
});

test('a linked pool still establishes bathing when steam facilities are additional or explicitly absent',()=>{
 const p=pool('BATHING');p.offers[0].name='Thermalbecken mit Hamam';
 assert.equal(search(request([bathing()]),[binding(1705,p)]).ranked.length,1);
 const noSteam=pool('BATHING');noSteam.areas[0].kind='OTHER';noSteam.offers[0].name='Baden ohne Hamam';
 assert.equal(search(request([bathing()]),[binding(1705,noSteam)]).ranked.length,1);
});

test('swimming-to-bathing compatibility cannot bypass seasonal closure or missing requested opening times',()=>{
 const q=request([bathing(),date()]);
 const closed=worldFact('state.current',{kind:'CLOSED',scope:'VENUE'},{validityVerified:true,validFrom:null,validUntil:'2027-05-01T00:00:00Z'});
 const r=search(q,[binding(1706,pool(),[closed])]);assert.equal(r.ranked.length,0);assert.ok(r.excluded[0].facts.some(f=>f.reason==='VERIFIED_VENUE_CLOSURE'));
 const seasonal=pool();seasonal.offers[0].validFrom='2027-05-01';
 assert.equal(search(q,[binding(1707,seasonal)]).ranked.length,0);
 const unknown=binding(1708,pool());unknown.decisionProjection.facts=unknown.decisionProjection.facts.filter(f=>!f.key.startsWith('hours.'));
 assert.equal(search(q,[unknown]).ranked.length,0);
});

test('ordinary Product composition returns the water offer, not the steam treatment, without changing the meaning',async()=>{
 const q=request([bathing(),date()]);const before=JSON.stringify(q);
 const p=steam();p.areas.push({...area('water'),kind:'POOL_AREA'});p.offers.push({...offer('pool','BATHING',['water']),name:'Badewelt'});
 const r=await exercise({text:'morgen baden mit meiner Tochter',meaning:q,catalog:[binding(1709,p),binding(1710,steam())]});
 assert.equal(r.status,200);const ranked=r.body.candidates.filter(c=>c.rank!==null);assert.equal(ranked.length,1);
 assert.ok(ranked[0].reasons.some(r=>r.code==='librarian-selected-offers'&&r.statement.includes('Badewelt')));
 assert.ok(!ranked[0].reasons.some(r=>r.code==='librarian-selected-offers'&&r.statement.includes('Hamam')));
 assert.equal(JSON.stringify(q),before);
});
