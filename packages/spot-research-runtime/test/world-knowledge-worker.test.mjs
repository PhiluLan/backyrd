import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildWorldResearchRequest, worldResearchResponseDocument, processOneWorldResearchJob, retrieveWorldResearchResponse } from "../src/world-knowledge-worker.mjs";

const spotId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const exportDocument = {
  contractVersion: "backyrd.world-research-batch@1.1", purpose: "ADMIN_ASSISTED_RESEARCH",
  batch: { batchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-09-29T10:00:00Z",
    spots: [{ spotId, name: "Test Bistro", locality: "Basel", existingValues: {} }] },
  fieldCatalog: [{ attributeKey: "identity.name", valueType: "TEXT", valueSchema: { type: "string" } },
    { attributeKey: "contact.instagram", valueType: "URL", valueSchema: { type: "string" } }],
  research: { instructions: ["Keep export immutable"], spots: [{ spotId, claims: [], unresolved: [] }] }, exportHash: "bound-hash",
};
const response = (payload, sources = ["https://test-bistro.example/kontakt"]) => ({ status: "completed", output: [
  { type: "web_search_call", action: { type: "search", sources: sources.map((url) => ({ url })) } },
  ...sources.map((url) => ({ type: "web_search_call", action: { type: "open_page", url } })),
  { type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] },
] });
const claim = { attributeKey: "identity.name", knowledgeState: "KNOWN_VALUE", valueJson: '"Test Bistro"',
  sourceUrl: "https://test-bistro.example/kontakt", evidence: "Die Kontaktseite bezeichnet den Betrieb als Test Bistro.",
  trust: "OFFICIAL_PRIMARY", corroboratingUrl: null };

test("World request uses bound one-spot catalog, mandatory web search and no canonical write", () => {
  const request = buildWorldResearchRequest(exportDocument);
  assert.equal(request.background, true);
  assert.equal(request.tool_choice, "required");
  assert.equal(request.tools[0].type, "web_search");
  assert.match(request.input, /identity.name/);
  assert.equal(request.text.format.schema.properties.claims.items.properties.attributeKey.enum.length, 2);
});

test("World response keeps the immutable export and admits only consulted source URLs", () => {
  const result = worldResearchResponseDocument(exportDocument, response({ claims: [claim],
    unresolved: [{ attributeKey: "contact.instagram", reason: "Auf der offiziellen Website war kein bestätigter Instagram-Link verfügbar." }] }), "2026-09-29T10:05:00Z");
  assert.equal(result.exportHash, exportDocument.exportHash);
  assert.deepEqual(result.batch, exportDocument.batch);
  assert.deepEqual(result.fieldCatalog, exportDocument.fieldCatalog);
  assert.equal(result.research.spots[0].claims[0].source.observedAt, "2026-09-29T10:05:00Z");
  assert.equal(result.research.spots[0].claims[0].value, "Test Bistro");
  assert.equal(result.research.spots[0].unresolved.length, 1);
});

test("Unconsulted source cannot become a claim", () => {
  const result = worldResearchResponseDocument(exportDocument, response({ claims: [claim], unresolved: [] }, ["https://other.example/"]), "2026-09-29T10:05:00Z");
  assert.equal(result.research.spots[0].claims.length, 0);
  assert.equal(result.research.spots[0].unresolved.length, 2);
});

test("search result snippets alone cannot become claims without an opened page", () => {
  const lookedUp = response({ claims: [claim], unresolved: [] });
  lookedUp.output = lookedUp.output.filter((item) => item.action?.type !== "open_page");
  const result = worldResearchResponseDocument(exportDocument, lookedUp, "2026-09-29T10:05:00Z");
  assert.equal(result.research.spots[0].claims.length, 0);
  assert.equal(result.research.spots[0].unresolved[0].attributeKey, "identity.name");
});

test("Sensitive evidence and uncorroborated secondary source remain unresolved", () => {
  const withEmail = { ...claim, evidence: "Write to someone@example.com" };
  const result = worldResearchResponseDocument(exportDocument, response({ claims: [withEmail], unresolved: [] }), "2026-09-29T10:05:00Z");
  assert.equal(result.research.spots[0].claims.length, 0);
  assert.equal(result.research.spots[0].unresolved[0].attributeKey, "identity.name");
  const secondary = { ...claim, trust: "CORROBORATED_SECONDARY", corroboratingUrl: "https://test-bistro.example/other" };
  const result2 = worldResearchResponseDocument(exportDocument, response({ claims: [secondary], unresolved: [] },
    ["https://test-bistro.example/kontakt", "https://test-bistro.example/other"]), "2026-09-29T10:05:00Z");
  assert.equal(result2.research.spots[0].claims.length, 0);
});

test("background retrieval explicitly requests consulted source list", async () => {
  let retrievedUrl = "";
  await retrieveWorldResearchResponse("resp_safe", { apiKey: "test-only", fetchImpl: async (url) => {
    retrievedUrl = url;
    return { ok: true, json: async () => ({ id: "resp_safe", status: "in_progress" }) };
  } });
  assert.match(retrievedUrl, /include%5B%5D=web_search_call\.action\.sources$/);
});

test("secondary source needs a separate consulted host and records the countercheck", () => {
  const secondary = { ...claim, trust: "CORROBORATED_SECONDARY", corroboratingUrl: "https://independent.example/check" };
  const result = worldResearchResponseDocument(exportDocument, response({ claims: [secondary], unresolved: [] },
    ["https://test-bistro.example/kontakt", "https://independent.example/check"]), "2026-09-29T10:05:00Z");
  assert.equal(result.research.spots[0].claims.length, 1);
  assert.match(result.research.spots[0].claims[0].source.evidence, /independent\.example/);
});

test("Worker records a source-bound proposal document without canonical writes", async () => {
  const writes = [];
  const service = { rpc: async () => ({ data: { jobId: "job-1", leaseToken: "lease-1", exportDocument, providerResponseId: "resp_existing", pollCount: 0 }, error: null }),
    from: (table) => { assert.equal(table, "world_research_automation_jobs_v1"); return { update: (values) => { writes.push(values); return { eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }) }) }) }) }; } }; } };
  const result = await processOneWorldResearchJob({ service, apiKey: "test-only", fetchImpl: async () => ({ ok: true,
    json: async () => ({ id: "resp_existing", ...response({ claims: [claim], unresolved: [] }) }) }) });
  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].status, "READY_FOR_REVIEW");
  assert.equal(writes[0].result_document.research.spots[0].claims.length, 1);
});
