import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../packages/shared/src/presentation/social.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseMentionPeople,parseMomentMentions,chatImageObjectPath,parseMomentEditor}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const id='73000000-0000-0000-0000-000000000001';
test('person identities do not carry private fields into a composer or block list',()=>{
 assert.deepEqual(parseMentionPeople([{user_id:id,display_name:' Lea ',username:'lea',email:'not-for-ui@example.invalid',bio:'private'}]),[{user_id:id,display_name:'Lea',username:'lea'}]);
 assert.deepEqual(parseMentionPeople([{user_id:id,display_name:null,username:null}]),[{user_id:id,display_name:'Backyrd Mitglied',username:null}]);
});
test('malformed identities are errors, never a misleading empty search or block list',()=>{
 for(const v of [null,{},'[]',[null],[{}],[{user_id:'------------------------------------'}],[{user_id:'https://example.invalid'}]])assert.throws(()=>parseMentionPeople(v));
 assert.deepEqual(parseMentionPeople([]),[]);
});
test('mentions require both real post and person identifiers',()=>{
 const row={post_id:id,user_id:id,display_name:'Lea',username:'lea'};
 assert.deepEqual(parseMomentMentions([row]),[row]);
 for(const v of [null,{},[{}],[{...row,post_id:'undefined'}],[{...row,user_id:'undefined'}]])assert.throws(()=>parseMomentMentions(v));
});

test('private chat images cannot escape their conversation or redirect to external tracking',()=>{
 const path=`chat/${id}/photo.png`,origin='https://storage.example.invalid';
 assert.equal(chatImageObjectPath(path,id,origin),path);
 assert.equal(chatImageObjectPath(`${origin}/storage/v1/object/sign/chat-uploads/${path}?token=private`,id,origin),path);
 for(const value of [`chat/other/photo.png`,`chat/${id}/../photo.png`,`chat/${id}/a\\b.png`,`${origin}/storage/v1/object/public/profile-photos/avatar.png`,`https://tracker.example.invalid/storage/v1/object/sign/chat-uploads/${path}`])assert.equal(chatImageObjectPath(value,id,origin),null,value);
});
test('editor snapshots preserve nullable source linkage and reject malformed or foreign records',()=>{
 assert.deepEqual(parseMomentEditor([{post_id:id,caption:null,mood_tags:[],review_id:null}],id),{postId:id,caption:null,moods:[],reviewId:null});
 for(const value of [[],null,[{post_id:'other',caption:'x',mood_tags:[],review_id:null}],[{post_id:id,caption:'x',mood_tags:[{}],review_id:null}]])assert.throws(()=>parseMomentEditor(value,id));
});
