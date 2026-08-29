import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicProposalPlan, buildResearchRequest, callResearchProvider, canonicalizeResearchResponse, diagnoseLegacyResearchPayload, normalizePublicHttpsUrl, RESEARCH_OUTPUT_TOKENS_PER_PASS, RESEARCH_POLICY_VERSION, validateResearchEvidence } from "../src/index.mjs";

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
const evidenceRow = { fact_key: "activity.types", typed_value: ["MUSEUM"], evidence_scope: "SPOT", support_status: "SUPPORTED", source_url: "https://museum.example/visit", source_type: "OFFICIAL_WEBSITE", short_evidence: "Official visitor information identifies the museum activity.", observed_at: null };

test("Pass A request is compact, official-domain-only and excludes accepted facts", () => {
  const request = buildResearchRequest({ ...context, acceptedFacts: [{ fieldKey: "secret", value: "never-send" }] }, { passKey: "A" });
  assert.deepEqual(request.body.tools, [{ type: "web_search", filters: { allowed_domains: ["museum.example"] } }]);
  assert.equal(request.body.text.format.strict, true);
  assert.equal(request.body.background, true);
  assert.deepEqual(request.body.reasoning, { effort: "low" });
  assert.equal(request.body.max_output_tokens, RESEARCH_OUTPUT_TOKENS_PER_PASS);
  assert.ok(request.body.max_output_tokens < 2896);
  assert.equal(JSON.parse(request.body.input).policy, RESEARCH_POLICY_VERSION);
  assert.deepEqual(JSON.parse(request.body.input).facts.map((fact) => fact.key), ["activity.types"]);
  assert.ok(request.inputBytes < 2500);
  assert.equal(request.body.input.includes("never-send"), false);
  assert.equal(request.body.input.includes("suitability.conversation"), false);
  assert.equal(JSON.stringify(request.body.text.format.schema).includes("description.owner"), false);
});

test("Pass B is disjoint from Pass A and carries only deep fact keys", () => {
  const a = buildResearchRequest(context, { passKey: "A" });
  const b = buildResearchRequest(context, { passKey: "B" });
  const aKeys = [...new Set(a.body.text.format.schema.properties.evidence.items.anyOf.map((item) => item.properties.fact_key.enum[0]))];
  const bKeys = [...new Set(b.body.text.format.schema.properties.evidence.items.anyOf.map((item) => item.properties.fact_key.enum[0]))];
  assert.deepEqual(aKeys.filter((key) => bKeys.includes(key)), []);
  assert.deepEqual(bKeys, ["suitability.conversation"]);
  const [supported, unsupported] = b.body.text.format.schema.properties.evidence.items.anyOf;
  assert.deepEqual(supported.properties.support_status.enum, ["SUPPORTED"]);
  assert.deepEqual(supported.properties.typed_value, { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] });
  assert.deepEqual(unsupported.properties.support_status.enum, ["UNKNOWN", "UNSUPPORTED"]);
  assert.deepEqual(unsupported.properties.typed_value, { type: "null" });
});

test("strict provider schema binds support status to typed-value presence", () => {
  const variants = buildResearchRequest(context, { passKey: "A" }).body.text.format.schema.properties.evidence.items.anyOf;
  for (let index = 0; index < variants.length; index += 2) {
    assert.deepEqual(variants[index].properties.support_status.enum, ["SUPPORTED"]);
    assert.notEqual(variants[index].properties.typed_value.type, "null");
    assert.deepEqual(variants[index + 1].properties.support_status.enum, ["UNKNOWN", "UNSUPPORTED"]);
    assert.deepEqual(variants[index + 1].properties.typed_value, { type: "null" });
    assert.deepEqual(variants[index].properties.observed_at, { type: "null" });
    assert.deepEqual(variants[index + 1].properties.observed_at, { type: "null" });
  }
});

test("strict provider schema uses explicit types for every enum constraint", () => {
  for (const passKey of ["A", "B"]) {
    const schema = buildResearchRequest(context, { passKey }).body.text.format.schema;
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Object.hasOwn(node, "enum")) assert.ok(Object.hasOwn(node, "type"), `enum without type in Pass ${passKey}`);
      assert.equal(Object.hasOwn(node, "const"), false, `const is not used in Pass ${passKey}`);
      for (const value of Object.values(node)) visit(value);
    };
    visit(schema);
  }
});

test("legacy Pass B diagnostic exposes only the exact typed mismatch", () => {
  const result = diagnoseLegacyResearchPayload({ evidence: [{ fact_key: "suitability.conversation", typed_value_json: 'true' }] }, context, "B");
  assert.deepEqual(result, { found: true, index: 0, factKey: "suitability.conversation", returnedValue: true, expected: { key: "suitability.conversation", type: "ENUM", values: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] }, reason: "research_typed_value_invalid:0", oldSchemaWeakness: "typed_value_json was an arbitrary string and did not encode the field contract" });
});

test("small evidence schema accepts supported official typed evidence", () => {
  const result = validateResearchEvidence({ evidence: [evidenceRow] }, context, "A");
  assert.equal(result.valid, true);
  assert.deepEqual(result.evidence[0].value, ["MUSEUM"]);
});

test("schema fails closed on foreign source, wrong pass, truncated JSON or invented value", () => {
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, source_url: "https://random.example/" }] }, context, "A").valid, false);
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, fact_key: "suitability.conversation", typed_value: "HIGH" }] }, context, "A").valid, false);
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, typed_value: "MUSEUM" }] }, context, "A").valid, false);
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, typed_value: ["BAR"] }] }, context, "A").valid, false);
});

test("official root and www hosts are equivalent but sibling domains remain forbidden", () => {
  const wwwContext = { ...context, spot: { ...spot, website: "https://www.museum.example/" } };
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, source_url: "https://museum.example/visit" }] }, wwwContext, "A").valid, true);
  assert.equal(validateResearchEvidence({ evidence: [{ ...evidenceRow, source_url: "https://other-museum.example/visit" }] }, wwwContext, "A").valid, false);
});

test("UNKNOWN and unsupported evidence cannot carry or create a value", () => {
  const unknown = validateResearchEvidence({ evidence: [{ ...evidenceRow, typed_value: null, support_status: "UNKNOWN", evidence_scope: "UNKNOWN_SCOPE", short_evidence: "" }] }, context, "A");
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

test("age and rain remain auditable but outside the objective proposal allowlist", () => {
  const ageBase = { ...evidenceRow, fact_key: "suitability.age", typed_value: {min_age:4,max_age:12,adult_supervision_required:"UNKNOWN"}, short_evidence: "Families and children are welcome." };
  const vagueAge = validateResearchEvidence({ evidence: [ageBase] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(vagueAge, context).proposals.length, 0);
  const explicitAge = validateResearchEvidence({ evidence: [{ ...ageBase, short_evidence: "Programme for children aged 4 to 12." }] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(explicitAge, context).proposals.length, 0);
  const indoorOnlyRain = validateResearchEvidence({ evidence: [{ ...evidenceRow, fact_key: "suitability.rain", typed_value: "SUITABLE", short_evidence: "All exhibitions are indoors." }] }, context, "A").evidence;
  assert.equal(buildDeterministicProposalPlan(indoorOnlyRain, context).proposals.length, 0);
});

test("only SPOT evidence creates general proposals", () => {
  for (const scope of ["EVENT", "PROGRAM", "TEMPORARY", "UNKNOWN_SCOPE"]) {
    const evidence = validateResearchEvidence({ evidence: [{ ...evidenceRow, evidence_scope: scope }] }, context, "A").evidence;
    const plan = buildDeterministicProposalPlan(evidence, context);
    assert.equal(plan.proposals.length, 0);
    assert.equal(plan.extractions[0].classification, "UNSUPPORTED");
  }
});

test("qualitative evidence stays auditable without creating routine proposals", () => {
  const row = { ...evidenceRow, fact_key: "suitability.conversation", typed_value: "HIGH", evidence_scope: "SPOT", short_evidence: "A calm place for conversation." };
  const result = validateResearchEvidence({ evidence: [row] }, context, "B");
  assert.equal(result.valid, true);
  const plan = buildDeterministicProposalPlan(result.evidence, context);
  assert.equal(plan.extractions.length, 1);
  assert.equal(plan.extractions[0].classification, "UNSUPPORTED");
  assert.equal(plan.proposals.length, 0);
});

test("event-specific family age is excluded from the objective provider pass", () => {
  const row = { ...evidenceRow, fact_key: "suitability.age", typed_value: {min_age:6,max_age:10,adult_supervision_required:true}, evidence_scope: "EVENT", short_evidence: "Night at the Museum for children aged 6 to 10." };
  const result = validateResearchEvidence({ evidence: [row] }, context, "A");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "research_field_not_authorized:0");
});

test("Museum category derives canonical culture place type server-side", () => {
  const categoryContext = { ...context, catalog: [...catalog, { field_key: "category.primary", value_kind: "TEXT", allowed_values: [], engine_role: "RAW_FACT" }] };
  const row = { ...evidenceRow, fact_key: "category.primary", typed_value: "museum", short_evidence: "The institution is the Naturhistorisches Museum Basel." };
  const plan = buildDeterministicProposalPlan(validateResearchEvidence({ evidence: [row] }, categoryContext, "A").evidence, categoryContext);
  assert.deepEqual(plan.proposals.map((item) => [item.fieldKey,item.value]), [["category.primary","museum"],["place_type","culture"]]);
  assert.equal(plan.proposals[1].derivedFromFactKey, "category.primary");
});

test("weekly schedule is distinct from open-now and cannot imply operating OPEN", () => {
  const openingContext = { ...context, catalog: [...catalog, { field_key: "opening.status", value_kind: "ENUM", allowed_values: ["OPEN","TEMPORARILY_CLOSED","CLOSED","UNKNOWN"], engine_role: "RAW_FACT" }] };
  const row = { ...evidenceRow, fact_key: "opening.status", typed_value: "OPEN", short_evidence: "Opening hours Tuesday to Sunday 10:00–17:00." };
  const plan = buildDeterministicProposalPlan(validateResearchEvidence({ evidence: [row] }, openingContext, "A").evidence, openingContext);
  assert.equal(plan.proposals.length, 0);
});

test("qualitative daypart evidence remains extraction-only", () => {
  const daypartContext = { ...context, catalog: [...catalog, { field_key: "time.dayparts", value_kind: "MULTI_SELECT", allowed_values: ["MORNING","AFTERNOON","EVENING","WEEKDAY","WEEKEND"], engine_role: "N4_EVIDENCE" }] };
  const schedule = { ...evidenceRow, fact_key: "time.dayparts", typed_value: ["MORNING","AFTERNOON","WEEKEND"], short_evidence: "Opening hours Tuesday to Sunday 10:00–17:00." };
  assert.equal(buildDeterministicProposalPlan(validateResearchEvidence({ evidence: [schedule] }, daypartContext, "B").evidence, daypartContext).proposals.length,0);
  const explicit = { ...schedule, short_evidence: "The official programme says the museum is especially suited to a weekend afternoon visit." };
  assert.equal(buildDeterministicProposalPlan(validateResearchEvidence({ evidence: [explicit] }, daypartContext, "B").evidence, daypartContext).proposals.length,0);
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
