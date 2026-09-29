import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWorldResearchBatch, parseWorldResearchBatch } from "../dist/index.js";
import { worldResearchResponseDocument } from "../../spot-research-runtime/src/world-knowledge-worker.mjs";

test("automated result passes the unchanged World import contract", () => {
  const spotId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const exported = createWorldResearchBatch({ batchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: "2026-09-29T10:00:00Z", spots: [{ spotId, name: "Test Bistro", locality: "Basel",
      manifestHash: "a".repeat(64), existingValues: {} }] });
  const provider = { status: "completed", output: [
    { type: "web_search_call", action: { type: "open_page", sources: [{ url: "https://test-bistro.example/kontakt" }] } },
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
