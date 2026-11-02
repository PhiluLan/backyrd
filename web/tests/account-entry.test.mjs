import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../packages/shared/src/account-entry.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const entry=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('age input cannot silently accept a different age',()=>{
 for(const input of ['12','121','13years','13.5','1e2','-18','', '999999']) assert.equal(entry.parseAccountAge(input),null,input);
 for(const input of ['13','120',' 42 ']) assert.equal(entry.parseAccountAge(input),Number(input));
});
test('pasted confirmation codes support spaces without silently discarding letters',()=>{
 assert.equal(entry.normalizeConfirmationCode('123 456'),'123456');
 assert.equal(entry.isConfirmationCode('123-456'),true);
 for(const input of ['12345','1234567','a123456','１２３４５６','']) assert.equal(entry.isConfirmationCode(input),false);
});
test('return paths stay on this site after browser URL normalization',()=>{
 for(const input of ['https://evil.example','//evil.example','/\\evil.example','/%5cevil.example','/%2fevil.example','/%0aevil.example','/\nevil.example','javascript:alert(1)','/bad%',''])assert.equal(entry.safeAccountReturnPath(input),'/');
 for(const input of ['/owner','/settings/profile','/places?q=Basel#nearby'])assert.equal(entry.safeAccountReturnPath(input),input);
});
test('names are suggested without truncating subsequent input; user choices are validated',()=>{
 assert.equal(entry.suggestAccountUsername('Jörg Müller'),'joergmueller');
 assert.equal(entry.suggestAccountUsername('Philipp'),'philipp');
 for(const input of ['ph','ab!', 'a'.repeat(25)])assert.equal(entry.isAccountUsername(input),false);
 assert.equal(entry.isAccountUsername('lea.basel_1'),true);
});
test('profile photo keys obey the deployed ownership policy',()=>{
 const id='36de2761-d166-4a05-bc2f-ed1b5c2f5774';
 assert.equal(entry.profilePhotoObjectKey(id,'unique-1'),`avatar_${id}_unique-1`);
 for(const [user,nonce] of [['other','1'],[id,'../x'],[id,''],[id,'x/y']])assert.throws(()=>entry.profilePhotoObjectKey(user,nonce));
});
test('email entry rejects repeated separators without changing a valid address',()=>{
 assert.equal(entry.normalizeAccountEmail(' LEA@Example.CH '),'lea@example.ch');
 assert.equal(entry.isAccountEmail(' LEA@Example.CH '),true);
 for(const value of ['lea@@example.ch','lea example@example.ch','lea@','@example.ch'])assert.equal(entry.isAccountEmail(value),false);
});
