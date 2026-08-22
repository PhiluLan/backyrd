import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicProposalPlan, buildResearchRequest, callResearchProvider, canonicalizeResearchResponse, normalizePublicHttpsUrl, RESEARCH_OUTPUT_TOKENS_PER_PASS, validateResearchEvidence } from "../src/index.mjs";

const spot = { id: "11111111-1111-4111-8111-111111111111", name: "Museum Test", city: "Basel", website: "https://museum.example/" };
const catalog = [
  { field_key: "suitability.rain", value_kind: "ENUM", allowed_values: ["SUITABLE", "LIMITED", "NOT_SUITABLE", "UNKNOWN"], engine_role: "SUITABILITY_FACT" },
  { field_key: "activity.types", value_kind: "MULTI_SELECT", allowed_values: ["MUSEUM", "CULTURE"], engine_role: "SUITABILITY_FACT" },
  { field_key: "suitability.environment", value_kind: "ENUM", allowed_values: ["INDOOR", "OUTDOOR", "MIXED", "UNKNOWN"], engine_role: "SUITABILITY_FACT" },
  { field_key: "suitability.age", value_kind: "STRUCTURED_OBJECT", allowed_values: [], engine_role: "SUITABILITY_FACT" },
  { field_key: "suitability.conversation", value_kind: "ENUM", allowed_values: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"], engine_role: "N4_EVIDENCE" },
  { field_key: "description.owner", value_kind: "TEXT", allowed_values: [], engine_role: "DISPLAY_ONLY" }
];
const context = { spot, catalog, acceptedFacts: [] };
const evidenceRow = { fact_key: "activity.types", typed_value_json: '["MUSEUM"]', support_status: "SUPPORTED", source_url: "https://museum.example/visit", source_type: "OFFICIAL_WEBSITE", short_evidence: "Official visitor information identifies the museum activity.", observed_at: null };

test("Pass A request is compact, official-domain-only and excludes accepted facts", () => {
  const request = buildResearchRequest({ ...context, acceptedFacts: [{ fieldKey: "secret", value: "never-send" }] }, { passKey: "A" });
  assert.deepEqual(request.body.tools, [{ type: "web_search", filters: { allowed_domains: ["museum.example"] } }]);
  assert.equal(request.body.text.format.strict, true);
  assert.equal(request.body.background, true);
  assert.deepEqual(request.body.reasoning, { effort: "low" });
  assert.equal(request.body.max_output_tokens, RESEARCH_OUTPUT_TOKENS_PER_PASS);
  assert.ok(request.body.max_output_tokens < 2896);
  assert.ok(request.inputBytes < 2500);
  assert.equal(request.body.input.includes("never-send"), false);
  assert.equal(request.body.input.includes("suitability.conversation"), false);
  assert.equal(request.body.text.format.schema.properties.evidence.items.properties.fact_key.enum.includes("description.owner"), false);
});

test("Pass B is disjoint from Pass A and carries only deep fact keys", () => {
  const a = buildResearchRequest(context, { passKey: "A" });
  const b = buildResearchRequest(context, { passKey: "B" });
  const aKeys = a.body.text.format.schema.properties.evidence.items.properties.fact_key.enum;
  const bKeys = b.body.text.format.schema.properties.evidence.items.properties.fact_key.enum;
  assert.deepEqual(aKeys.filter((key) => bKeys.includes(key)), []);
  assert.deepEqual(bKeys, ["suitability.conversation"]);
});

test("small evidence schema accepts supported official typed evidence", () => {
  const result = validateResearchEvidence({ evidence: [evidenceRow] }, context, "A");
  assert.equal(result.valid, true);
  assert.deepEqual(result.evidence[0].value, ["MUSEUM"]);
});

test("schema fails closed on foreign source, wrong pass, truncated JSON or invented value", () => {
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, source_url: "https://random.example/" }] }, context, "A").valid, false);
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, fact_key: "suitability.conversation", typed_value_json: '"HIGH"' }] }, context, "A").valid, false);
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, typed_value_json: '["MUSEUM"' }] }, context, "A").valid, false);
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, typed_value_json: '["BAR"]' }] }, context, "A").valid, false);
});

test("UNKNOWN and unsupported evidence cannot carry or create a value", () => {
  const unknown = validateResearchEvidence({ evidence: [{ ...evidenceRow, typed_value_json: "null", support_status: "UNKNOWN", short_evidence: "" }] }, context, "A");
  assert.equal(unknown.valid, true);
  const plan = buildDeterministicProposalPlan(unknown.evidence, context);
  assert.equal(plan.proposals.length, 0);
  assert.equal(plan.extractions[0].classification, "UNSUPPORTED");
});

test("Backyrd deterministically classifies NEW SAME CONFLICT and STALE", () => {
  const validated = validateResearchEvidence({ evidence: [evidenceRow] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(validated, context).proposals[0].classification, "NEW");
  assert.equal(buildDeterministicProposalPlan(validated, { ...context, acceptedFacts: [{ fieldKey: "activity.types", value: ["MUSEUM"], status: "ACTIVE" }] }).proposals[0].classification, "SAME");
  assert.equal(buildDeterministicProposalPlan(validated, { ...context, acceptedFacts: [{ fieldKey: "activity.types", value: ["CULTURE"], status: "ACTIVE" }] }).proposals[0].classification, "CONFLICT");
  assert.equal(buildDeterministicProposalPlan(validated, { ...context, acceptedFacts: [{ fieldKey: "activity.types", value: ["MUSEUM"], status: "STALE" }] }).proposals[0].classification, "STALE");
});

test("deterministic confidence follows source authority, not model prose", () => {
  const website = validateResearchEvidence({ evidence: [evidenceRow] }, context, "A").evidence;
  const document = validateResearchEvidence({ evidence: [{ ...evidenceRow, source_type: "OFFICIAL_DOCUMENT" }] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(website, context).proposals[0].deterministicConfidence, 0.90);
  assert.equal(buildDeterministicProposalPlan(document, context).proposals[0].deterministicConfidence, 0.95);
});

test("age and rain require explicit bounded source evidence", () => {
  const ageBase = { ...evidenceRow, fact_key: "suitability.age", typed_value_json: '{"min_age":4,"max_age":12}', short_evidence: "Families and children are welcome." };
  const vagueAge = validateResearchEvidence({ evidence: [ageBase] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(vagueAge, context).proposals.length, 0);
  const explicitAge = validateResearchEvidence({ evidence: [{ ...ageBase, short_evidence: "Programme for children aged 4 to 12." }] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(explicitAge, context).proposals.length, 1);
  const indoorOnlyRain = validateResearchEvidence({ evidence: [{ ...evidenceRow, fact_key: "suitability.rain", typed_value_json: '"SUITABLE"', short_evidence: "All exhibitions are indoors." }] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(indoorOnlyRain, context).proposals.length, 0);
});

test("missing official website and private/local sources fail before provider access", () => {
  assert.throws(() => buildResearchRequest({ ...context, spot: { ...spot, website: null } }), /research_source_url_invalid/);
  for (const value of ["http://museum.example", "https://u:p@museum.example", "https://localhost/a", "https://192.168.1.2/a"]) assert.throws(() => normalizePublicHttpsUrl(value));
});

test("provider canonicalization allowlists only audit-safe fields", () => {
  const result = canonicalizeResearchResponse({ id: "resp_1", status: "completed", model: "gpt-5-mini", output: [{ content: [{ type: "output_text", text: JSON.stringify({ evidence: [] }), encrypted_content: "drop" }] }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, opaque: "drop" });
  assert.deepEqual(result.payload, { evidence: [] });
  assert.equal(JSON.stringify(result).includes("encrypted_content"), false);
  assert.equal(JSON.stringify(result).includes("opaque"), false);
});

test("synchronous compatibility boundary also uses deterministic builder", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ id: "resp_2", status: "completed", model: "gpt-5-mini", output: [{ content: [{ type: "output_text", text: JSON.stringify({ evidence: [evidenceRow] }) }] }], usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }) });
  const result = await callResearchProvider(context, { apiKey: "test", fetchImpl, passKey: "A" });
  assert.equal(result.plan.proposals[0].classification, "NEW");
});
