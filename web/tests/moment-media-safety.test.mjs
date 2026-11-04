import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../supabase/functions/_shared/safety/moment-media.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {momentSafetyMediaReference,resolveMomentSafetyImages,canAutomaticallyEvaluateCase}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const actorId='73000000-0000-0000-0000-000000000001',reviewId='76000000-0000-0000-0000-000000000001',storageOrigin='https://storage.example.invalid',input={actorId,reviewId,storageOrigin};
test('canonical actor and review media resolve to their correct private bucket',()=>{
 assert.deepEqual(momentSafetyMediaReference(`${actorId}/photo.jpg`,input),{bucket:'social-post-media',path:`${actorId}/photo.jpg`});
 assert.deepEqual(momentSafetyMediaReference(`${reviewId}/hash.jpg`,input),{bucket:'review-photos',path:`${reviewId}/hash.jpg`});
 assert.deepEqual(momentSafetyMediaReference(`${storageOrigin}/storage/v1/object/public/review-photos/${reviewId}/hash.jpg`,input),{bucket:'review-photos',path:`${reviewId}/hash.jpg`});
});
test('foreign media, tracking origins, path traversal and bucket confusion are rejected',()=>{
 for(const value of [`other/photo.jpg`,`${actorId}/../photo.jpg`,`https://tracker.invalid/a.png`,`${storageOrigin}/storage/v1/object/public/profile-photos/avatar.jpg`,`${storageOrigin}/storage/v1/object/sign/review-photos/${actorId}/photo.jpg`])assert.throws(()=>momentSafetyMediaReference(value,input),value);
});
test('moderation receives fresh bounded-lifetime URLs, never raw paths or expired stored tokens',async()=>{
 const calls=[];
 const urls=await resolveMomentSafetyImages([`${actorId}/one.jpg`,`${actorId}/two.jpg`],input,async(bucket,path,expires)=>{calls.push({bucket,path,expires});return `${storageOrigin}/storage/v1/object/sign/${bucket}/${path}?token=fresh`;});
 assert.equal(urls.length,2);assert.equal(calls.every(c=>c.expires===300),true);assert.equal(urls.every(u=>u.startsWith('https://')),true);
 await assert.rejects(resolveMomentSafetyImages([`${actorId}/one.jpg`],input,async()=>{throw Error('unavailable');}));
 await assert.rejects(resolveMomentSafetyImages([`${actorId}/one.jpg`],input,async()=>`https://tracker.invalid/a.png`));
});

test('automatic evaluation cannot reopen final decisions or appeals',()=>{
 for(const status of ['decided','appealed','closed','unknown',''])assert.equal(canAutomaticallyEvaluateCase(status),false,status);
 for(const status of ['queued','evaluating','needs_review','failed'])assert.equal(canAutomaticallyEvaluateCase(status),true,status);
});
