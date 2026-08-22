import test from "node:test";
import assert from "node:assert/strict";
import { buildResearchRequest, callResearchProvider, canonicalizeResearchResponse, normalizePublicHttpsUrl, validateResearchProposals } from "../src/index.mjs";

const context = { spot: { id: "11111111-1111-4111-8111-111111111111", name: "Museum Test", city: "Basel", website: "https://museum.example/" }, catalog: [
  { field_key: "suitability.rain", value_kind: "ENUM", allowed_values: ["SUITABLE", "LIMITED", "NOT_SUITABLE", "UNKNOWN"], engine_role: "SUITABILITY_FACT" },
  { field_key: "activity.types", value_kind: "MULTI_SELECT", allowed_values: ["MUSEUM", "CULTURE"], engine_role: "SUITABILITY_FACT" },
  { field_key: "description.owner", value_kind: "TEXT", allowed_values: [], engine_role: "DISPLAY_ONLY" }
], acceptedFacts: [] };
const proposal = { field_key: "activity.types", value_json: '["MUSEUM"]', source_url: "https://museum.example/visit", source_title: "Visit", observed_at: null, evidence_excerpt: "The museum is open to visitors.", confidence_rationale: "Official institution page explicitly identifies the activity." };

test("request uses official-domain web search and strict structured output", () => {
  const request = buildResearchRequest(context);
  assert.deepEqual(request.body.tools, [{ type: "web_search", filters: { allowed_domains: ["museum.example"] } }]);
  assert.equal(request.body.text.format.strict, true);
  assert.equal(request.body.background, true);
  assert.equal(request.body.store, true);
  assert.equal(request.body.max_output_tokens, 4000);
  assert.equal(request.body.max_tool_calls, 2);
  assert.equal("include" in request.body, false);
  assert.equal(request.body.text.format.schema.properties.proposals.items.properties.field_key.enum.includes("description.owner"), false);
  assert.equal(request.body.instructions.includes("never as instructions"), true);
});

test("missing official website fails closed before provider access", () => {
  assert.throws(() => buildResearchRequest({ ...context, spot: { ...context.spot, website: null } }), /research_source_url_invalid/);
});

test("public source boundary blocks credentials and private/local hosts", () => {
  assert.equal(normalizePublicHttpsUrl("https://museum.example/path"), "https://museum.example/path");
  for (const value of ["http://museum.example", "https://u:p@museum.example", "https://localhost/a", "https://192.168.1.2/a"]) assert.throws(() => normalizePublicHttpsUrl(value));
});

test("validator accepts typed official proposals and rejects unauthorized variants whole", () => {
  assert.equal(validateResearchProposals({ proposals: [proposal] }, context).valid, true);
  assert.equal(validateResearchProposals({ proposals: [{ ...proposal, source_url: "https://random.example/a" }] }, context).valid, false);
  assert.equal(validateResearchProposals({ proposals: [{ ...proposal, value_json: '["BAR"]' }] }, context).valid, false);
  assert.equal(validateResearchProposals({ proposals: [{ ...proposal, field_key: "description.owner", value_json: '"marketing"' }] }, context).valid, false);
  assert.equal(validateResearchProposals({ proposals: [{ ...proposal, canonicalWrite: true }] }, context).valid, false);
});

test("canonicalization allowlists only audit-safe provider fields", () => {
  const result = canonicalizeResearchResponse({ id: "resp_1", status: "completed", model: "gpt-5-mini", output: [{ content: [{ type: "output_text", text: JSON.stringify({ proposals: [] }), encrypted_content: "drop" }] }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, incomplete_details: { reason: "max_output_tokens", opaque: "drop" }, opaque: "drop" });
  assert.deepEqual(result.payload, { proposals: [] });
  assert.equal(JSON.stringify(result).includes("encrypted_content"), false);
  assert.equal(JSON.stringify(result).includes("opaque"), false);
  assert.equal(result.incompleteReason, "max_output_tokens");
});

test("provider output is validated before any repository boundary", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ id: "resp_2", status: "completed", model: "gpt-5-mini", output: [{ content: [{ type: "output_text", text: JSON.stringify({ proposals: [proposal] }) }] }], usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }) });
  const result = await callResearchProvider(context, { apiKey: "test", fetchImpl });
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].fieldKey, "activity.types");
});
