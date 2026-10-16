import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const directory=await mkdtemp(join(tmpdir(),"discovery-client-test-"));
after(()=>rm(directory,{recursive:true,force:true}));
await writeFile(join(directory,"package.json"),'{"type":"module"}',{mode:0o600});
for(const name of ["canonical","schema","discovery"]){
  const source=await readFile(new URL(`../../packages/world-knowledge-core/src/${name}.ts`,import.meta.url),"utf8");
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  await writeFile(join(directory,`${name}.js`),output,{mode:0o600});
}
async function load(relative) {
  const path = new URL(relative, import.meta.url);
  const core = pathToFileURL(join(directory,"discovery.js")).href;
  const source = (await readFile(path, "utf8")).replace('from "@backyrd/world-knowledge-core"', `from ${JSON.stringify(core)}`);
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}
const { preparePublicDiscovery } = await load("../../packages/world-knowledge-authoring-ui/src/discovery-client.ts");
const { discoveryPreparationErrorMessage: message } = await load("../../packages/world-knowledge-authoring-ui/src/discovery-errors.ts");

test("preparation preserves safe server failure codes after source publication", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const code of ["preparation_unavailable", "preparation_rate_limited", "preparation_timeout", "public_source_scope_or_budget_denied"]) {
      const calls=[];
      const client={async rpc(name,args){calls.push(name);assert.equal(args.p_source_text,"Öffentlicher Testtext");return {data:{sourceHash:"a".repeat(64),visibility:"PUBLIC"},error:null};}};
      globalThis.fetch=async (_url,init)=>{calls.push("prepare");assert.deepEqual(JSON.parse(init.body),{spotId:"spot",sourceHash:"a".repeat(64),consentToOpenAI:true});return Response.json({error:code},{status:503});};
      await assert.rejects(preparePublicDiscovery(client,"synthetic-token","spot","Öffentlicher Testtext",async()=>{calls.push("rebuild");}),{message:code});
      assert.deepEqual(calls,["world_product_discovery_publish_source_v1","rebuild","prepare"]);
      assert.doesNotMatch(message(new Error(code)),/prüfe die Verbindung/i);
    }
  } finally { globalThis.fetch=originalFetch; }
});
test("publication and rebuild failures stop before model egress",async()=>{
  let rebuilt=0;
  await assert.rejects(preparePublicDiscovery({async rpc(){return {error:{message:"private database detail"},data:null};}},"token","spot","public",async()=>{rebuilt++;}),/discovery_publication_failed/);
  assert.equal(rebuilt,0);
  await assert.rejects(preparePublicDiscovery({async rpc(){return {error:null,data:{sourceHash:"a".repeat(64)}};}},"token","spot","public",async()=>{throw Error("private internal detail");}),/discovery_source_rebuild_failed/);
});
test("UI distinguishes unavailable setup from failed publication without showing internals",()=>{
  assert.match(message(new Error("preparation_unavailable")),/Textquelle wurde gespeichert.*serverseitig noch nicht eingerichtet/);
  assert.match(message(new Error("discovery_publication_failed")),/konnte nicht bestätigt gespeichert/);
  assert.doesNotMatch(message(new Error("secret-provider-body")),/secret-provider-body/);
});
