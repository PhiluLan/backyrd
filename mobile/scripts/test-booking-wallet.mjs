import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
function loader() {
 const cache=new Map();
 function load(url){if(cache.has(url.href))return cache.get(url.href);const exports={};cache.set(url.href,exports);const code=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,name=>{assert.ok(name.startsWith('.'),`Unmocked module ${name}`);return load(new URL(`${name}.ts`,url));});return exports;}
 return name=>load(new URL(`../${name}`,import.meta.url));
}
const load=loader();
const {createBookingWallet,parseBookingLink}=load('lib/booking/wallet.ts');
const {createBookingService}=load('lib/booking/service.ts');
const {createGuestClient}=load('../packages/shared/src/contracts/booking-guest-client.ts');
const {resolveBookingOrigin}=load('lib/booking/runtime-config.ts');
const id='00000000-0000-4000-8000-000000000001',spot='00000000-0000-4000-8000-000000000002',key='A'.repeat(43),namespace='1'.repeat(64);
const credential=()=>({reservationId:id,key,cancellation:null});
const link=()=>`https://www.backyrd.ch/booking/manage#id=${id}&key=${key}`;
const receipt=(revision=0,status='confirmed')=>({id,spot_id:spot,name:'Synthetic restaurant',guest_name:'Synthetic guest',party_size:2,starts_at:'2030-10-27T18:00:00Z',ends_at:'2030-10-27T20:00:00Z',cancellation_deadline:'2030-10-27T16:00:00Z',revision,status});
function memory(){const data=new Map();let failed=false;return{data,fail:value=>{failed=value;},storage:{get:async key=>data.get(key)??null,set:async(key,value)=>{if(failed)throw Error('synthetic-storage');data.set(key,value);},remove:async key=>{if(failed)throw Error('synthetic-storage');data.delete(key);}}};}
async function fixture(transport){const mem=memory(),wallet=createBookingWallet(mem.storage,namespace);await wallet.add(credential());const calls=[];const client=createGuestClient('https://www.backyrd.ch/api/booking/guest',async(url,init)=>{const input=JSON.parse(init.body);calls.push({url,init,input});return transport(input,calls);},'https://www.backyrd.ch');return{...mem,wallet,client,calls,service:createBookingService(wallet,client,randomUUID)};}

test('only canonical HTTPS fragment links are imported; hostile origins and duplicate credentials fail',()=>{
 assert.deepEqual(parseBookingLink(link()),credential());assert.deepEqual(parseBookingLink(link().replace('www.backyrd.ch','backyrd.ch')),credential());
 for(const invalid of [link()+'&key='+key,link()+'&extra=1',link().replace('#','?'),link().replace('https:','http:'),link().replace('www.backyrd.ch','www.backyrd.ch.evil.test'),link().replace('www.backyrd.ch','user@www.backyrd.ch'),link().replace('/manage','/manage/'),link().replace(key,'bad')])assert.throws(()=>parseBookingLink(invalid));
});
test('namespaces isolate actors/environments and persist no guest receipts or contacts',async()=>{
 const m=memory(),one=createBookingWallet(m.storage,namespace),two=createBookingWallet(m.storage,'2'.repeat(64));await one.add(credential());assert.deepEqual(await two.list(),[]);await one.prepareCancellation(id,key,0,randomUUID());assert.equal((await one.get(id)).cancellation.revision,0);
 for(const raw of m.data.values()){assert.ok(Buffer.byteLength(raw)<2048);assert.doesNotMatch(raw,/Synthetic|email|party_size/);}
});
test('concurrent repositories preserve entries; a full wallet never evicts an unknown cancellation',async()=>{
 const m=memory(),one=createBookingWallet(m.storage,namespace),two=createBookingWallet(m.storage,namespace);await Promise.all([one.add(credential()),two.add({...credential(),reservationId:spot})]);assert.equal((await one.list()).length,2);await one.prepareCancellation(id,key,0,randomUUID());for(let i=2;i<20;i++)await one.add({...credential(),reservationId:randomUUID()});await assert.rejects(one.add({...credential(),reservationId:randomUUID()}),{code:'full'});assert.ok((await one.get(id)).cancellation);
});
test('corrupt index is never silently overwritten and unreadable records remain visible',async()=>{
 const m=memory(),wallet=createBookingWallet(m.storage,namespace);await wallet.add(credential());const entry=[...m.data.keys()].find(key=>!key.endsWith('.index'));m.data.set(entry,'broken');assert.deepEqual(await wallet.list(),[{reservationId:id,credential:null}]);m.data.set([...m.data.keys()].find(key=>key.endsWith('.index')),'broken');await assert.rejects(wallet.add(credential()));await assert.rejects(wallet.list());assert.equal(m.data.get(entry),'broken');
});
test('partial imports remain visible and can be repaired without orphaning a capability',async()=>{
 const m=memory(),broken={...m.storage,set:async(key,value)=>{if(!key.endsWith('.index'))throw Error('synthetic-partial');await m.storage.set(key,value);}},wallet=createBookingWallet(broken,namespace);await assert.rejects(wallet.add(credential()));assert.deepEqual(await wallet.list(),[{reservationId:id,credential:null}]);await createBookingWallet(m.storage,namespace).add(credential());assert.equal((await wallet.list())[0].credential.key,key);
});
test('same-link import preserves a pending nonce and a replacement cannot discard it',async()=>{
 const m=memory(),wallet=createBookingWallet(m.storage,namespace);await wallet.add(credential());const original=await wallet.prepareCancellation(id,key,0,randomUUID());await wallet.add(credential());assert.deepEqual(await wallet.get(id),original);await assert.rejects(wallet.add({...credential(),key:'B'.repeat(42)+'A'}),{code:'pending'});
});
test('native transport pins origin, omits cookies, rejects redirects and keeps credentials in JSON',async()=>{
 const f=await fixture(async()=>Response.json({data:receipt()}));await f.service.read(id);const{url,init}=f.calls[0];assert.equal(url,'https://www.backyrd.ch/api/booking/guest');assert.ok(!url.includes(key));assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.referrerPolicy,'no-referrer');assert.deepEqual(init.headers,{'Content-Type':'application/json',Origin:'https://www.backyrd.ch'});
});
test('cross-reservation responses never enter the device wallet',async()=>{
 const f=await fixture(async()=>Response.json({data:{...receipt(),id:spot}}));await assert.rejects(f.service.read(id),{code:'temporarily_unavailable'});await assert.rejects(f.service.importLink(link()),{code:'temporarily_unavailable'});
});
test('unknown cancellation survives restart and quota rejection without changing nonce or revision',async()=>{
 let cancelled=false;const f=await fixture(async(input,calls)=>{if(input.operation==='read')return Response.json({data:receipt(cancelled?1:0,cancelled?'cancelled':'confirmed')});const writes=calls.filter(c=>c.input.operation==='cancel').length;if(writes===1)throw Error('synthetic-lost-ack');if(writes===2)return Response.json({error:'rate_limited',outcome:'rejected'},{status:429});cancelled=true;return Response.json({data:receipt(1,'cancelled')});});
 assert.equal((await f.service.cancel(id,key,0)).kind,'unknown');const frozen=(await f.wallet.get(id)).cancellation;const restarted=createBookingService(createBookingWallet(f.storage,namespace),f.client,randomUUID);assert.equal((await restarted.cancel(id,key,0)).kind,'unknown');assert.deepEqual((await f.wallet.get(id)).cancellation,frozen);const result=await restarted.cancel(id,key,0);assert.equal(result.kind,'current');assert.equal(result.booking.receipt.status,'cancelled');const writes=f.calls.filter(c=>c.input.operation==='cancel');assert.equal(writes.length,3);for(const write of writes)assert.deepEqual(write.input,writes[0].input);assert.equal((await f.wallet.get(id)).cancellation,null);
});
test('a current higher revision fences an old unknown cancellation before another write',async()=>{
 const f=await fixture(async input=>{if(input.operation==='cancel')throw Error('synthetic-lost-ack');return Response.json({data:receipt(2)});});await f.service.cancel(id,key,0);const result=await f.service.cancel(id,key,0);assert.equal(result.kind,'current');assert.equal(result.booking.receipt.revision,2);assert.equal(f.calls.filter(c=>c.input.operation==='cancel').length,1);assert.equal((await f.wallet.get(id)).cancellation,null);
});
test('successful cancellation ACK followed by failed current read retains the frozen request',async()=>{
 let offline=true;const f=await fixture(async input=>{if(input.operation==='read'&&offline)throw Error('synthetic-offline');return Response.json({data:receipt(1,'cancelled')});});const result=await f.service.cancel(id,key,0);assert.equal(result.kind,'unknown');assert.equal(result.acknowledged,true);assert.ok((await f.wallet.get(id)).cancellation);offline=false;const current=await f.service.read(id);assert.equal(current.receipt.status,'cancelled');assert.equal(current.credential.cancellation,null);
});
test('fresh definite conflict requires a new decision and never retries automatically',async()=>{
 const f=await fixture(async()=>Response.json({error:'changed',outcome:'rejected'},{status:409}));assert.deepEqual(await f.service.cancel(id,key,0),{kind:'rejected',code:'changed'});assert.equal(f.calls.length,1);assert.equal((await f.wallet.get(id)).cancellation,null);
});
test('failed durable intent storage prevents dispatch and preserves a prior frozen cancellation',async()=>{
 const f=await fixture(async()=>{throw Error('synthetic-lost-ack');});f.fail(true);await assert.rejects(f.service.cancel(id,key,0));assert.equal(f.calls.length,0);f.fail(false);await f.service.cancel(id,key,0);const original=(await f.wallet.get(id)).cancellation;f.fail(true);assert.equal((await f.service.cancel(id,key,0)).kind,'unknown');f.fail(false);assert.deepEqual((await f.wallet.get(id)).cancellation,original);
});
test('late reads cannot recreate a locally removed reservation',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const f=await fixture(async()=>{await gate;return Response.json({data:receipt()});});const pending=f.service.read(id);await new Promise(resolve=>setTimeout(resolve,0));await f.wallet.remove(id);release();await assert.rejects(pending,{code:'changed'});assert.deepEqual(await f.wallet.list(),[]);
});
test('production origin is exact and development never falls back to production',()=>{
 assert.equal(resolveBookingOrigin('prod',undefined),'https://www.backyrd.ch');for(const origin of ['https://backyrd.ch','https://evil.test','https://www.backyrd.ch/'])assert.equal(resolveBookingOrigin('prod',origin),null);for(const origin of [undefined,'https://backyrd.ch','https://www.backyrd.ch','https://test.backyrd.ch','http://evil.test','https://user@isolated.test','https://isolated.test?next=x','https://isolated.test/path'])assert.equal(resolveBookingOrigin('dev',origin),null);assert.equal(resolveBookingOrigin('dev','http://127.0.0.1:4175'),'http://127.0.0.1:4175');assert.equal(resolveBookingOrigin('dev','https://isolated.example.test'),'https://isolated.example.test');assert.equal(resolveBookingOrigin(undefined,undefined),null);
});
test('a deletion between the two final credential reads cannot fall back to a forgotten entry',async()=>{
 const f=await fixture(async()=>Response.json({data:receipt()}));let reads=0;
 const guarded={...f.wallet,get:async id=>{const value=await f.wallet.get(id);if(++reads===2)await f.wallet.remove(id);return value;}};
 const service=createBookingService(guarded,f.client,randomUUID);await assert.rejects(service.read(id),{code:'changed'});assert.deepEqual(await f.wallet.list(),[]);
});
