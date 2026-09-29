import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWorldResearchBatch, normalizeAutomatedWorldResearchBatch, parseWorldResearchBatch } from "../dist/index.js";
import { worldResearchResponseDocument } from "../../spot-research-runtime/src/world-knowledge-worker.mjs";

test("automated result passes the unchanged World import contract", () => {
  const spotId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const exported = createWorldResearchBatch({ batchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: "2026-09-29T10:00:00Z", spots: [{ spotId, name: "Test Bistro", locality: "Basel",
      manifestHash: "a".repeat(64), existingValues: {} }] });
  const provider = { status: "completed", output: [
    { type: "web_search_call", action: { type: "search", sources: [{ url: "https://test-bistro.example/kontakt" }] } },
    { type: "web_search_call", action: { type: "open_page", url: "https://test-bistro.example/kontakt" } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({
      claims: [{ attributeKey: "identity.name", knowledgeState: "KNOWN_VALUE", valueJson: '"Test Bistro"',
        sourceUrl: "https://test-bistro.example/kontakt", evidence: "Die Kontaktseite bezeichnet den Betrieb als Test Bistro.",
        trust: "OFFICIAL_PRIMARY", corroboratingUrl: null }], unresolved: [],
    }) }] },
  ] };
  const result = worldResearchResponseDocument(exported, provider, "2026-09-29T10:05:00Z");
  assert.deepEqual(result.batch, exported.batch);
  assert.deepEqual(result.fieldCatalog, exported.fieldCatalog);
  assert.equal(result.exportHash, exported.exportHash);
  assert.deepEqual(result.research.instructions, exported.research.instructions);
  const parsed = parseWorldResearchBatch(result);
  assert.equal(parsed.validatedClaims.get(spotId)?.length, 1);
  assert.equal(result.research.spots[0].claims.length + result.research.spots[0].unresolved.length, exported.fieldCatalog.length);
});

test("an unsupported automated value becomes an explicit unresolved field without breaking the export", () => {
  const spotId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const exported = createWorldResearchBatch({ batchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: "2026-09-29T10:00:00Z", spots: [{ spotId, name: "Test Bistro", locality: "Basel",
      manifestHash: "a".repeat(64), existingValues: {} }] });
  const source = { url: "https://test-bistro.example/", evidence: "Die offizielle Seite nennt das Angebot.",
    observedAt: "2026-09-29T10:05:00Z", trust: "OFFICIAL_PRIMARY" };
  const document = { ...exported, research: { ...exported.research, spots: [{ spotId, unresolved: [], claims: [
    { attributeKey: "identity.name", knowledgeState: "KNOWN_VALUE", value: "Test Bistro", source },
    { attributeKey: "contact.instagram", knowledgeState: "KNOWN_VALUE", value: "not-a-url", source },
    { attributeKey: "state.current", knowledgeState: "KNOWN_VALUE", value: "OPEN", source },
  ] }] } };
  const normalized = normalizeAutomatedWorldResearchBatch(document);
  assert.equal(normalized.exportHash, exported.exportHash);
  assert.equal(normalized.research.spots[0].claims.length, 1);
  assert.deepEqual(normalized.research.spots[0].unresolved.map((item) => item.attributeKey), ["contact.instagram", "state.current"]);
  assert.equal(parseWorldResearchBatch(normalized).validatedClaims.get(spotId)?.length, 1);
});
