import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import ts from "typescript";
const dir=await mkdtemp(join(tmpdir(),"research-feedback-"));
const source=await readFile(new URL('../lib/researchSaveFeedback.ts',import.meta.url),'utf8');
const path=join(dir,'feedback.mjs');await writeFile(path,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {researchFailureFeedback,ResearchSaveError,isResearchSaveConfirmation}=await import(path);
test('success requires a public reread claim with the expected state and value',()=>{
 const answer={claimId:'confirmed',knowledgeState:'KNOWN_VALUE',value:{a:1,b:2},visibility:'PUBLIC'};
 assert.equal(isResearchSaveConfirmation({answer},'KNOWN_VALUE',{b:2,a:1}),true);
 for(const invalid of [undefined,{}, {error:'invalid_server_response'}, {answer:{...answer,visibility:'PRIVATE'}}, {answer:{...answer,claimId:''}}, {answer:{...answer,value:{a:2}}}, {answer:{...answer,knowledgeState:'UNKNOWN'}}])assert.equal(isResearchSaveConfirmation(invalid,'KNOWN_VALUE',{a:1,b:2}),false);
});
test('network failures do not falsely assert that no data was written',()=>{
 const feedback=researchFailureFeedback(new Error('Failed to fetch'));
 assert.equal(feedback.kind,'error');assert.match(feedback.title,/nicht bestätigt/);assert.match(feedback.message,/Eingabe bleibt/);
 assert.doesNotMatch(feedback.message,/Failed to fetch|nichts gespeichert/i);
});
test('a stored claim with a pending projection is a warning, not a failed-write claim',()=>{
 const feedback=researchFailureFeedback(new ResearchSaveError('Die Angabe ist gespeichert; die Ansicht fehlt.','SAVED_UNVERIFIED'));
 assert.equal(feedback.kind,'warning');assert.match(feedback.title,/Gespeichert/);assert.match(feedback.message,/ist gespeichert/);
});
test('expired sessions and technical error codes have actionable German messages',()=>{
 assert.match(researchFailureFeedback(new Error('invalid_session')).message,/Anmeldung ist abgelaufen/);
 assert.doesNotMatch(researchFailureFeedback(new Error('world_reader_unavailable')).message,/world_reader_unavailable/);
 assert.match(researchFailureFeedback(new Error('Diese Angabe wurde inzwischen geändert.')).message,/inzwischen geändert/);
});
