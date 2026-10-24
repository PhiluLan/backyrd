import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/nuknukResearchDraft.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const directory = await mkdtemp(join(tmpdir(), "backyrd-nuknuk-draft-test-"));
const modulePath = join(directory, "module.mjs");
await writeFile(modulePath, output, { mode: 0o600 });
const { parseNuknukDraft, recoverDraftObservations } = await import(modulePath);

const valid = {
  version: "nuknuk-research-v3.70", spotId: "174cfd79-d10d-434d-be8f-1a7e39047e82",
  name: "Restaurant Fischerstube", canonicalWrite: false, importable: false,
  modelAudit: { rawPrompt: "must never be persisted" },
  results: [{ attributeKey: "experience.profile", status: "REQUIRES_REVIEW", partialProfile: true,
    value: { offers: [{ name: "Käseplättli", kind: "GASTRONOMY" }] },
    citations: [{ url: "https://restaurantfischerstube.ch/menu.pdf", evidence: "Käseplättli 27.00" }] }],
};

test("a saved research draft keeps review evidence but strips raw model traces", () => {
  const parsed = parseNuknukDraft(valid);
  assert.equal(parsed?.results[0].citations?.[0].evidence, "Käseplättli 27.00");
  assert.equal(parsed?.results[0].partialProfile, true);
  assert.equal("modelAudit" in parsed, false);
  assert.equal(parsed?.canonicalWrite, false);
  assert.equal(parsed?.importable, false);
});

test("a review draft cannot become an import or contain credential-bearing links", () => {
  assert.equal(parseNuknukDraft({ ...valid, importable: true }), null);
  assert.equal(parseNuknukDraft({ ...valid, canonicalWrite: true }), null);
  assert.equal(parseNuknukDraft({ ...valid, results: [{ ...valid.results[0], citations: [{ url: "https://user:password@example.com", evidence: "x" }] }] }), null);
  assert.equal(parseNuknukDraft({ ...valid, sourceFailures: [{ url: "http://example.com", reason: "failed" }] }), null);
});

test("the shared-draft API requires Admin auth and never offers a canonical import action", async () => {
  const route = await readFile(new URL("../app/api/world-knowledge/research-drafts/route.ts", import.meta.url), "utf8");
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.match(route, /parseNuknukDraft\(recovery \? recovery.original : input\)/);
  assert.match(route, /status: "READY_FOR_REVIEW"/);
  assert.doesNotMatch(route, /world_research_batch|canonicalWrite: true|importable: true/);
});


test("old reports recover actual timestamps only for identical facts and citations",()=>{
 const stored=parseNuknukDraft(valid);
 const original=parseNuknukDraft({...valid,results:[{...valid.results[0],partialHours:true,citations:[{...valid.results[0].citations[0],observedAt:"2026-10-23T10:00:00Z"}]}]});
 const recovered=recoverDraftObservations(stored,original);
 assert.equal(recovered.results[0].citations[0].observedAt,"2026-10-23T10:00:00Z");
 assert.equal(stored.results[0].citations[0].observedAt,undefined);
 assert.deepEqual(recovered.results[0].value,stored.results[0].value);
 for(const change of [draft=>{draft.spotId="274cfd79-d10d-434d-be8f-1a7e39047e82";},draft=>{draft.results[0].value={changed:true};},draft=>{draft.results[0].citations[0].url="https://other.org";},draft=>{draft.results[0].citations[0].evidence="Other quote";}]) {
  const changed=structuredClone(original);change(changed);assert.throws(()=>recoverDraftObservations(stored,changed),/passt nicht/);
 }
 const changedTime=structuredClone(original);changedTime.results[0].citations[0].observedAt="2026-10-24T10:00:00Z";
 assert.throws(()=>recoverDraftObservations(recovered,changedTime),/nicht ersetzt/);
 const missing= recoverDraftObservations(stored,stored);assert.equal(missing.results[0].citations[0].observedAt,undefined);
});
