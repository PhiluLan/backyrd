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
const { parseNuknukDraft } = await import(modulePath);

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
  assert.match(route, /parseNuknukDraft\(input\)/);
  assert.match(route, /status: "READY_FOR_REVIEW"/);
  assert.doesNotMatch(route, /world_research_batch|canonicalWrite: true|importable: true/);
});
