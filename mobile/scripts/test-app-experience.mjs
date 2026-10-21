import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=(file,dependencies={})=>{
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('exports','require','module',source)(module.exports,name=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];},module);
 return module.exports;
};
const {spotOpeningStatusNow:status}=load('lib/spot-opening-status.ts');
const row=(day,open,close)=>({day_of_week:day,open_time:open,close_time:close});
const at=(day,hour,minute=0)=>new Date(2026,9,day,hour,minute);
const night=[row('Montag','22:00','02:00'),row('Dienstag',null,null)];
assert.equal(status(night,at(19,1),true),'closed','Monday evening must not imply Monday early morning');
assert.equal(status(night,at(20,1),true),'open','Monday night carries into Tuesday');
assert.equal(status(night,at(20,1,45),true),'closingSoon');
assert.equal(status(night,at(20,2),true),'closed','closing endpoint is exclusive');
assert.equal(status([row('Sonntag','23:00','02:00')],at(19,1),true),'open','Sunday carry-over');
assert.equal(status([row('Montag','00:00','24:00')],at(19,23),true),'open');
assert.equal(status([row('Montag','00:00','00:00')],at(19,23),true),'open','equal midnight endpoints denote a full day');
assert.equal(status([row('Montag','10:00','12:00'),row('Montag','11:45','16:00')],at(19,11,50),true),'open','overlap must not announce an imminent closure');
assert.equal(status([row('Montag','25:00','30:00')],at(19,11),true),'unknown');
assert.equal(status([row('Dienstag','10:00','18:00')],at(19,11),true),'unknown');
assert.equal(status([row('Montag','10:00','12:00'),row('Montag','14:00','18:00')],at(19,13),true),'closed');
let opened=[],shared=[],alerts=[],fail=false;
const native={Platform:{OS:'ios'},Alert:{alert:(...args)=>alerts.push(args)},Linking:{openURL:async url=>{if(fail)throw Error('offline');opened.push(url);}},Share:{share:async value=>{shared.push(value);}}};
const links=load('lib/links.ts',{'react-native':native});
assert.equal(links.websiteUrl(' example.ch/menu '),'https://example.ch/menu');
for(const value of ['javascript:alert(1)','file:///private/a','tel:123','data:text/plain,test','https://'])assert.equal(links.websiteUrl(value),null);
await links.openInAppleMaps(0,0,'Equator');assert.match(opened.at(-1),/ll=0,0/);
await links.openInAppleMaps(null,null,'Café','Basel 1');assert.match(opened.at(-1),/q=Basel%201/);
const before=opened.length;await links.openInAppleMaps(999,7);assert.equal(opened.length,before);assert.ok(alerts.length);
await links.sharePlace('test/id','Café');assert.equal(shared[0].url,'https://www.backyrd.ch/spots/test%2Fid');
fail=true;assert.equal(await links.openExternalUrl('https://example.ch'),false);assert.equal(alerts.at(-1)[0],'Öffnen nicht möglich');
let prevented,dispatches=[],effectCleanup;const navigation={dispatch:action=>dispatches.push(action)};
const hooks=load('hooks/useUnsavedMoment.ts',{'@react-navigation/native':{useNavigation:()=>navigation,usePreventRemove:(dirty,callback)=>{if(dirty)prevented=callback;}},react:{useEffect:callback=>{effectCleanup=callback();}},'react-native':native});
hooks.useUnsavedMoment(true,false);prevented({data:{action:'BACK'}});const choices=alerts.at(-1)[2];assert.equal(choices[0].style,'cancel');assert.deepEqual(dispatches,[]);choices[1].onPress();assert.deepEqual(dispatches,['BACK']);
hooks.useUnsavedMoment(true,true);prevented({data:{action:'BACK'}});assert.equal(dispatches.length,1,'a pending upload must not be discarded');assert.equal(alerts.at(-1)[0],'Moment wird geteilt');
native.Platform.OS='web';let accepted=false;const events=new Map();globalThis.window={confirm:()=>accepted,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
hooks.useUnsavedMoment(true,false);prevented({data:{action:'BACK'}});assert.equal(dispatches.length,1);accepted=true;prevented({data:{action:'BACK'}});assert.equal(dispatches.length,2);assert.ok(events.has('beforeunload'));effectCleanup();assert.equal(events.size,0);delete globalThis.window;
console.log('Experience regressions passed: overnight/overlapping/missing hours, safe contact/routes/sharing and discard/upload/reload protection.');

let store;
const storeRows=[{id:'one',name:'One',lat:null,lng:null,categories:{name:'Café'},spot_photos:[]},{id:'two',name:'Two',lat:0,lng:0,categories:[{name:'Bar'}],spot_photos:[]}];
const query=Object.assign(Promise.resolve({data:storeRows,error:null}),{select(){return this;},eq(){return this;},limit(){return this;},abortSignal(){return this;}});
load('lib/useSpotsStore.ts',{'zustand':{create:factory=>{store=factory(update=>Object.assign(store,update));return store;}},'./supabase':{supabase:{from:()=>query,channel:()=>({on(){return this;},subscribe(){return this;}})}},'./distributionTrust':{filterDistributedSpots:async rows=>rows},'./spot-images':{selectSpotImageUrl:()=>null},'./requestDeadline':{withRequestDeadline:operation=>operation(new AbortController().signal)}});
await store.refresh();assert.equal(store.error,false);assert.equal(store.spots[0].categories.name,'Café');assert.equal(store.spots[1].categories.name,'Bar');assert.ok(Number.isNaN(store.spots[0].lat));assert.equal(store.spots[1].lat,0);
console.log('Catalog boundary: object/array category joins, missing coordinates and real zero coordinates passed.');

// Real hook transitions: simultaneous taps, failed requests and edits during a send.
const hookSlots=[];let hookCursor=0;
const hookReact={
 useState:initial=>{const slot=hookCursor++;if(!(slot in hookSlots))hookSlots[slot]=initial;return [hookSlots[slot],value=>{hookSlots[slot]=value;}];},
 useRef:initial=>{const slot=hookCursor++;if(!(slot in hookSlots))hookSlots[slot]={current:initial};return hookSlots[slot];},
 useCallback:callback=>callback,
};
const {useMessageComposer}=load('hooks/useMessageComposer.ts',{react:hookReact});
const renderComposer=()=>{hookCursor=0;return useMessageComposer();};
let composer=renderComposer();
assert.equal(composer.beginSend('text'),null,'blank messages do not lock the composer');
composer.updateText('First message');composer=renderComposer();
const first=composer.beginSend('text');
assert.equal(composer.beginSend('text'),null,'same-frame double tap cannot start a second send');
assert.equal(composer.beginSend('image'),null,'text and image sends cannot overlap');
composer.updateText('My next message');composer.finishSend(first,false);composer=renderComposer();
assert.equal(composer.text,'My next message','a failed send cannot overwrite new typing');
assert.equal(composer.sendingKind,null);
const second=composer.beginSend('text');composer.finishSend(second,false);composer=renderComposer();
assert.equal(composer.text,'My next message','failed unchanged draft stays available for retry');
const third=composer.beginSend('text');composer.finishSend(third,true);composer=renderComposer();
assert.equal(composer.text,'','confirmed unchanged message is cleared');
composer.updateText('Caption');const image=composer.beginSend('image');
composer.updateText('Next caption');composer.finishSend(image,true);composer=renderComposer();
assert.equal(composer.text,'Next caption','successful image send preserves new typing');
const revised=composer.beginSend('text');composer.updateText('Other');composer.updateText('Next caption');
composer.finishSend(revised,true);composer=renderComposer();
assert.equal(composer.text,'Next caption','editing back to identical text is still a new draft');
const latest=composer.beginSend('image');composer.finishSend(revised,true);composer=renderComposer();
assert.equal(composer.sendingKind,'image','a late completion cannot unlock another request');
composer.finishSend(latest,true);composer=renderComposer();assert.equal(composer.text,'');
assert.ok(composer.beginSend('image'),'an image without caption remains supported');
console.log('Chat composer: failure/new typing, image captions, double taps and stale completion passed.');
