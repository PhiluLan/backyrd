import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../packages/shared/src/auth-errors.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {compromisedPasswordMessage}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('known breached passwords explain the next action without provider details',()=>{
 const result=compromisedPasswordMessage({code:'weak_password',reasons:['pwned'],message:'SYNTHETIC_SECRET_PROVIDER_DETAIL'});
 assert.match(result,/Datenleck/);assert.match(result,/anderes Passwort/);assert.ok(!result.includes('SYNTHETIC_SECRET'));
});
test('missing reasons or unrelated password failures do not invent a breach',()=>{
 for(const value of [null,undefined,'weak_password',{code:'weak_password',reasons:['length']},{code:'invalid_credentials',reasons:['pwned']},{code:'weak_password',reasons:'pwned'}])assert.equal(compromisedPasswordMessage(value),null);
});
