import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync(new URL('../../packages/world-knowledge-authoring-ui/src/authoring-rpc-errors.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {authoringRpcErrorMessage:message,experienceSaveErrorMessage:save,isAuthoringRpcMessage}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('server validation rejection never masquerades as unavailable and retains the draft once',()=>{
 const text=message({code:'22023',message:'invalid_attribute_value'});assert.match(text,/abgelehnt/);assert.match(text,/nicht gespeichert/);assert.doesNotMatch(text,/nicht erreichbar|invalid_attribute/);assert.equal(isAuthoringRpcMessage(text),true);
 assert.equal((save(Error(text)).match(/Entwurf bleibt erhalten/g)||[]).length,1);
});
test('session, permission, conflict and connection errors have distinct actions',()=>{
 assert.match(message({code:'PGRST301'}),/erneut an/);assert.match(message({code:'42501'}),/nicht berechtigt/);
 assert.match(message({code:'23505'}),/zwischenzeitlich/);assert.match(message({message:'Failed to fetch'}),/Verbindung/);
 assert.match(message({code:'PGRST202'}),/nicht vollständig/);
});
test('unknown server errors do not claim outage or success or expose payloads',()=>{
 const secret='secret-private-input';const text=message({code:'XX000',message:secret});assert.match(text,/interner Fehler/);assert.doesNotMatch(text,/nicht erreichbar|wurde gespeichert|secret-private/);
 assert.doesNotMatch(save(Error(secret)),/secret-private/);assert.match(save(Error('Die Angabe wurde gespeichert, aber die Datenvorschau konnte nicht bestätigt werden.')),/wurde gespeichert/);
});
test('both surfaces preserve the safe RPC message and experience editor uses one formatter',()=>{
 const index=fs.readFileSync(new URL('../../packages/world-knowledge-authoring-ui/src/index.tsx',import.meta.url),'utf8');const correction=fs.readFileSync(new URL('../../packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx',import.meta.url),'utf8');const experience=fs.readFileSync(new URL('../../packages/world-knowledge-authoring-ui/src/ExperienceInput.tsx',import.meta.url),'utf8');
 assert.match(index,/if \(isAuthoringRpcMessage\(raw\)\) return raw/);assert.match(correction,/const safeRpcMessage = authoringRpcErrorMessage/);assert.match(experience,/setError\(experienceSaveErrorMessage\(cause\)\)/);
});
