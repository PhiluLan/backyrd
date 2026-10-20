import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compile = file => ts.transpileModule(fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const geo={exports:{}};
new Function("exports","require","module",compile("lib/utils/haversine.ts"))(geo.exports,()=>assert.fail("unexpected geo dependency"),geo);
let rows=[], hidden=new Set(), queries=[], deny=false, endless=false;
const source=compile("lib/nearby-discovery.ts");
const mod={exports:{}};
const point={latitude:47.5596,longitude:7.5886};
new Function("exports","require","module",source)(mod.exports,name=>{
 if(name==="./utils/haversine")return geo.exports;
 if(name==="./supabase")return{ supabase:{ from(table){assert.equal(table,"spots");const q={filters:[],range:[0,499]};queries.push(q);const builder={select(value){q.select=value;return this;},eq(k,v){q.filters.push([k,v]);return this;},gte(k,v){q.filters.push([k,">=",v]);return this;},lte(k,v){q.filters.push([k,"<=",v]);return this;},order(k){q.order=k;return this;},range(a,b){q.range=[a,b];return this;},abortSignal(){return this;},then(resolve){resolve({data:endless?Array.from({length:500},()=>rows[0]):rows.slice(q.range[0],q.range[1]+1),error:null});}};return builder;}}};
 if(name==="./distributionTrust")return{filterDistributedSpots:async(items,surface)=>{assert.equal(surface,"discovery");assert.ok(items.length<=500,"visibility RPC responses must stay below the PostgREST row cap");if(deny)throw Error("visibility unavailable");return items.filter(item=>!hidden.has(item.id)).reverse();}};
 if(name==="./spot-images")return{loadCanonicalSpotHeaders:async(ids)=>{assert.ok(ids.length<=14);return new Map(ids.map(id=>[id,`https://fixture.invalid/${id}`]));}};
 if(name==="./requestDeadline")return{withRequestDeadline:async task=>task(new AbortController().signal)};
 throw Error(`Unexpected nearby dependency ${name}`);
},mod);
const {nearestDiscoverySpots,nearbyDiscoveryBounds,loadNearbyDiscoverySpots,validDiscoveryLocation}=mod.exports;
const fixture=(id,lat,lng)=>({id,name:id,status:"approved",lat,lng,created_at:"2026-01-01",city:"Across city border",categories:[{name:"Restaurant"}],spot_hours:[]});
assert.equal(validDiscoveryLocation({latitude:NaN,longitude:1}),false);
assert.equal(validDiscoveryLocation({latitude:91,longitude:1}),false);
assert.equal(validDiscoveryLocation(null),false);
const near=fixture("old-near",47.5597,7.5886),far=fixture("new-far",47.57,7.5886);
assert.deepEqual(nearestDiscoverySpots([far,fixture("null",null,null),near,fixture("outside",48,7.5)],point).map(s=>s.id),["old-near","new-far"]);
assert.equal(nearbyDiscoveryBounds({latitude:0,longitude:179.99}).longitudeRanges.length,2);
assert.deepEqual(nearbyDiscoveryBounds({latitude:89.99,longitude:0}).longitudeRanges,[[-180,180]]);
assert.throws(()=>nearbyDiscoveryBounds({latitude:NaN,longitude:0}),/invalid/);
rows=[...Array.from({length:500},(_,i)=>fixture(`a-new-${i}`,47.57,7.59)),near];
let result=await loadNearbyDiscoverySpots(point,6);
assert.equal(queries.length,2,"pagination must find an older near place beyond the first 500 records");
assert.equal(result[0].id,"old-near");
assert.ok(queries.every(q=>q.order==="id"&&!q.filters.some(f=>f[0]==="city")),"current position, not profile city, owns retrieval");
assert.ok(queries.every(q=>q.filters.some(f=>f[0]==="status"&&f[1]==="approved")));
assert.equal(result[0].city,"Across city border");
assert.match(result[0].header_photo_url,/old-near$/);
hidden.add("old-near");result=await loadNearbyDiscoverySpots(point,1);assert.notEqual(result[0].id,"old-near","hidden nearest places must not be exposed");
deny=true;await assert.rejects(loadNearbyDiscoverySpots(point),/visibility unavailable/);deny=false;
rows=[fixture("bad",null,null),fixture("empty","",""),fixture("boolean",false,false)];assert.deepEqual(await loadNearbyDiscoverySpots(point),[]);
rows=[near];endless=true;await assert.rejects(loadNearbyDiscoverySpots(point),/nearby_catalog_incomplete/);
console.log("Nearby discovery: true distance, city borders, pagination, visibility, coordinate validation and incomplete-catalog failure passed.");

// Execute the actual Home load callback with deterministic location and data ports.
const homeSource=fs.readFileSync(new URL("../app/(tabs)/index.tsx",import.meta.url),"utf8");
const syntax=ts.createSourceFile("home.tsx",homeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let loadArrow;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(syntax)==="load"&&node.initializer&&ts.isCallExpression(node.initializer))loadArrow=node.initializer.arguments[0];ts.forEachChild(node,visit);}
visit(syntax);assert.ok(loadArrow);
const callback=ts.transpileModule(`exports.load = ${loadArrow.getText(syntax)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const loadRequest={current:0},moodRequest={current:0},view={},nearCalls=[];
let location={ok:true,source:"current",location:{coords:{latitude:47.5596,longitude:7.5886}}},pendingNear=null;
const cityRows=[{...far,city:"Bern"}];
const ports={ user:{id:"actor"},loadRequest,moodRequest,cleanName:v=>typeof v==="string"&&v.trim()?v.trim():null,
 withRequestDeadline:task=>task(new AbortController().signal),
 supabase:{from:()=>({select(){return this;},eq(){return this;},abortSignal(){return this;},maybeSingle:async()=>({data:{city:"Bern",first_name:"Alex"}})})},
 getPrivacySafeLocation:async options=>{assert.equal(options.requestPermission,false);assert.equal(options.allowLastKnown,false);assert.equal(options.forceConsentRefresh,true);return location;},
 validDiscoveryLocation,loadNearbyDiscoverySpots:async p=>{nearCalls.push(p);return pendingNear?pendingNear:[near];},loadDiscoverySpots:async city=>{assert.equal(city,"Bern");return cityRows;},loadMoodContext:async rows=>{view.moods=rows;},
};
for(const name of ["CurrentLocation","Spots","NewSpots","SpotMoods","PopularMoods","Loading","Refreshing","Error","City","FirstName"])ports[`set${name}`]=value=>{view[name]=value;};
const homeModule={exports:{}};
new Function(...Object.keys(ports),"exports",callback)(...Object.values(ports),homeModule.exports);
await homeModule.exports.load();
assert.deepEqual(view.Spots,[near]);assert.deepEqual(view.CurrentLocation,point);assert.deepEqual(view.NewSpots,cityRows);assert.equal(view.City,"Bern");
location={ok:false};await homeModule.exports.load();assert.equal(view.CurrentLocation,null);assert.deepEqual(view.Spots,cityRows);
location={ok:true,source:"last_known",location:{coords:point}};await homeModule.exports.load();assert.equal(view.CurrentLocation,null);assert.deepEqual(view.Spots,cityRows);
location={ok:true,source:"current",location:{coords:{latitude:48,longitude:8}}};await homeModule.exports.load(true);assert.deepEqual(nearCalls.at(-1),{latitude:48,longitude:8});
let release;
pendingNear=new Promise(resolve=>{release=resolve;});
const older=homeModule.exports.load();await new Promise(resolve=>setImmediate(resolve));
pendingNear=null;location={ok:false};await homeModule.exports.load();release([near]);await older;
assert.equal(view.CurrentLocation,null);assert.deepEqual(view.Spots,cityRows,"a late GPS search cannot overwrite a subsequent consent/location failure");
console.log("Home nearby orchestration: current position overrides profile city, denied/stale location stays city-labelled, refresh and late-response isolation passed.");
