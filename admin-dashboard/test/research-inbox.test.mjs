import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";import {join} from "node:path";import {test} from "node:test";import ts from "typescript";
const source=await readFile(new URL("../lib/researchInbox.ts",import.meta.url),"utf8");
const dir=await mkdtemp(join(tmpdir(),"backyrd-inbox-"));const path=join(dir,"inbox.mjs");
await writeFile(path,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {buildInboxSpot,taskFingerprint}=await import(path);
const gap={attributeKey:"contact.phone",status:"UNKNOWN",reason:"Keine veröffentlichte Telefonnummer gefunden."};
const proposal={attributeKey:"contact.email",status:"REQUIRES_REVIEW",value:"hello@example.org",citations:[{url:"https://example.org",evidence:"hello@example.org"}]};
const row=(id,results,extra={})=>({id,actor_id:"admin",spot_id:"spot",spot_name:"Ein Ort",status:"READY_FOR_REVIEW",created_at:"2026-10-27T18:00:00Z",updated_at:"2026-10-27T18:00:00Z",reviewed_at:null,export_document:{kind:"ADMIN_RESEARCH_FOLLOWUP"},result_document:{results},...extra});
test("duplicate runs form one spot and one question while distinct older work survives",()=>{
 const item=buildInboxSpot([row("1",[proposal,gap]),row("2",[proposal])],{},()=>false);
 assert.equal(item.tasks.length,2);assert.deepEqual(item.tasks[0].jobIds,["1","2"]);assert.equal(item.reports,2);
 assert.deepEqual(item.tasks[0].citations,proposal.citations);
});
test("current public known facts and verified proposals leave the to-do list",()=>{
 const answers={"contact.phone":{knowledgeState:"KNOWN_VALUE",visibility:"PUBLIC",claimId:"phone",value:"123"}};
 assert.equal(buildInboxSpot([row("1",[proposal,gap])],answers,()=>true).tasks.length,0);
 assert.equal(buildInboxSpot([row("1",[gap])],{"contact.phone":{knowledgeState:"KNOWN_VALUE",visibility:"PRIVATE",value:"secret"}},()=>false).tasks.length,1);
});
test("a questionable existing opening schedule still requires review",()=>{
 const item={attributeKey:"hours.regular",reason:"Der bisherige Hotelplan bildet keinen plausiblen Tagesbetrieb ab.",status:"UNKNOWN"};
 const result=buildInboxSpot([row("1",[item])],{"hours.regular":{knowledgeState:"KNOWN_VALUE",visibility:"PUBLIC",value:[],claimId:"hours"}},()=>false);
 assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].kind,"REVIEW");
});
test("Admin keep decisions are bound to the precise proposal and current profile claim",()=>{
 const receipt={fingerprint:taskFingerprint(proposal),claimId:"current",actorId:"admin",at:"2026-10-27T19:00:00Z",outcome:"KEPT_PROFILE"};
 const stored=row("1",[proposal],{export_document:{kind:"ADMIN_RESEARCH_FOLLOWUP",taskDecisions:[receipt]}});
 const answers={"contact.email":{visibility:"PUBLIC",knowledgeState:"KNOWN_VALUE",claimId:"current",value:"other@example.org"}};
 assert.equal(buildInboxSpot([stored],answers,()=>false).tasks.length,0);
 assert.equal(buildInboxSpot([stored],{"contact.email":{...answers["contact.email"],claimId:"new"}},()=>false).tasks.length,1);
 assert.equal(buildInboxSpot([stored,row("2",[{...proposal,value:"new@example.org"}])],answers,()=>false).tasks.length,1);
});
test("an explicitly unanswered question is completed without inventing a profile value",()=>{
 const stored=row("1",[gap],{export_document:{kind:"ADMIN_RESEARCH_FOLLOWUP",taskDecisions:[{fingerprint:taskFingerprint(gap),claimId:null,actorId:"admin",at:"2026-10-27T19:00:00Z",outcome:"LEFT_UNKNOWN"}]}});
 assert.equal(buildInboxSpot([stored],{},()=>false).tasks.length,0);
 assert.equal(stored.result_document.results[0].value,undefined);
});
test("pipeline jobs contribute only pending proposals and unresolved questions",()=>{
 const stored=row("1",[],{export_document:{pipeline:{phase:"FINISHED",report:{review:[{attributeKey:"contact.email",explanation:"Zwei verschiedene Adressen gefunden."}],unresolved:[{attributeKey:"contact.phone",reason:"Keine Angabe"}],errors:[]}}},result_document:{research:{spots:[{spotId:"spot",claims:[{...proposal,source:proposal.citations[0]},{attributeKey:"identity.name",value:"Name"}]}]}}});
 const result=buildInboxSpot([stored],{},()=>false);assert.equal(result.tasks.length,2);assert.equal(result.tasks[0].reason,"Zwei verschiedene Adressen gefunden.");
});
test("task endpoint requires Admin authorization before accessing server-only storage",async()=>{
 const route=await readFile(new URL("../app/api/world-knowledge/research-tasks/route.ts",import.meta.url),"utf8");
 for(const method of ["GET","POST"]){const body=route.split(`export async function ${method}`)[1];assert.ok(body.indexOf("authorizeAdminRequest")<body.indexOf("clients(request)"));assert.match(body,/if\(!auth.ok\)/);}
 assert.match(route,/eq\("actor_id",auth.userId\)/);assert.match(route,/eq\("updated_at",row.updated_at\)/);assert.match(route,/claimId!==body.claimId/);
 assert.doesNotMatch(route,/world_product_admin_submit_claim|world_product_admin_import_research/);
});

test("old failed runs do not poison a later completed run, without discarding old distinct questions",()=>{
 const failed=row("old",[gap],{status:"FAILED",export_document:{},created_at:"2026-10-26T18:00:00Z"});
 const success=row("new",[],{export_document:{pipeline:{phase:"FINISHED",report:{review:[],unresolved:[],errors:[]}}},result_document:{research:{spots:[]}}});
 const result=buildInboxSpot([failed,success],{},()=>false);assert.equal(result.failed,false);
});

test("software-generated unresearched catalog placeholders remain in the report, not Admin tasks",()=>{
 const stored=row("1",[],{export_document:{pipeline:{phase:"FINISHED",report:{review:[],unresolved:[{attributeKey:"contact.tiktok",reason:"Dieses Grundfeld wurde nicht recherchiert oder nicht mit einem Ergebnis geliefert."},{attributeKey:"contact.phone",reason:"Die offizielle Seite nennt keine Telefonnummer."}],errors:[]}}}});
 const result=buildInboxSpot([stored],{},()=>false);assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].attributeKey,"contact.phone");assert.equal(stored.export_document.pipeline.report.unresolved.length,2);
});

test("manual imports persist unresolved questions once and preserve an Admin receipt on retry",async()=>{
 const raw=await readFile(new URL("../lib/server/researchFollowups.ts",import.meta.url),"utf8");
 const compiled=ts.transpileModule(raw.replace('import "server-only";','').replace('import { FOLLOWUP_KIND } from "../researchInbox";','const FOLLOWUP_KIND="ADMIN_RESEARCH_FOLLOWUP";'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const modulePath=join(dir,"followups.mjs");await writeFile(modulePath,compiled);const {persistResearchFollowups}=await import(modulePath);
 const records=new Map();let fail=false;
 const service={from:()=>({select(){return this;},eq(_key,value){if(_key==="id")this.id=value;return this;},async maybeSingle(){return {data:records.get(this.id)??null,error:null};},async insert(value){if(fail)return {error:{code:"503"}};records.set(value.id,value);return {error:null};}})};
 const document={batch:{batchId:"batch",spots:[{spotId:"spot",name:"Ort"}]},research:{spots:[{spotId:"spot",claims:[{attributeKey:"contact.email",value:"hello@example.org",source:proposal.citations[0]}],unresolved:[{attributeKey:"contact.phone",reason:"Keine Angabe"}]}]}};
 await persistResearchFollowups(service,"admin",document,[{spotId:"spot",unresolvedDetails:document.research.spots[0].unresolved,imported:["contact.email"],skipped:[],declined:[]}]);
 assert.equal(records.size,1);const saved=[...records.values()][0];assert.equal(saved.status,"READY_FOR_REVIEW");assert.equal(saved.result_document.results.length,1);assert.equal(saved.result_document.results[0].attributeKey,"contact.phone");
 saved.export_document.taskDecisions=[{outcome:"LEFT_UNKNOWN"}];await persistResearchFollowups(service,"admin",document);assert.equal(records.size,1);assert.equal(saved.export_document.taskDecisions.length,1);
 fail=true;await assert.rejects(persistResearchFollowups(service,"another-admin",document),/Aufgaben konnten nicht gespeichert/);
});

test("an archived exact proposal settles earlier duplicates while preserving unrelated older work and later proposals",()=>{
 const archived=row("archived",[proposal],{reviewed_at:"2026-10-27T19:00:00Z",created_at:"2026-10-27T18:00:00Z"});
 const older=row("older",[proposal,gap],{created_at:"2026-10-27T17:00:00Z"});
 assert.deepEqual(buildInboxSpot([archived,older],{},()=>false).tasks.map(item=>item.attributeKey),["contact.phone"]);
 assert.equal(buildInboxSpot([archived,older,row("new",[proposal],{created_at:"2026-10-27T20:00:00Z"})],{},()=>false).tasks.length,2);
});

test("a report note about an already stored offering profile is not an invented Admin decision",()=>{
 const note={attributeKey:"discovery.profile",status:"UNKNOWN",reason:"Die belegten Angebote, Bereiche und konkreten Preise sind im strukturierten Angebotsprofil erfasst; kein zweiter abweichender Datensatz wird erzeugt."};
 const source=row("note",[note]);
 assert.equal(buildInboxSpot([source],{"experience.profile":{visibility:"PUBLIC",knowledgeState:"KNOWN_VALUE",value:{offers:[{name:"Mittagessen"}]}}},()=>false).tasks.length,0);
 assert.equal(buildInboxSpot([source],{},()=>false).tasks.length,1);
 assert.equal(source.result_document.results.length,1);
});
