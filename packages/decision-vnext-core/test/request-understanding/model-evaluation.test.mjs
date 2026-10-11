import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runModelEvaluation, scoreRequirements, validateRequirementOracle } from './model-evaluation.mjs';
const corpus = JSON.parse(readFileSync(new URL('./model-corpus.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(readFileSync(new URL('./requirement-oracle.json', import.meta.url), 'utf8'));
const one = count => ({ ...corpus, families: [{ id: 'coffee', dimension: 'INTENT', queries: Array.from({ length: count }, (_, i) => `Coffee ${i}`), expected: [{ path: 'primaryIntent', op: 'equals', value: 'COFFEE' }] }] });
const semantics = { primaryIntentGroup: null, secondaryIntentGroup: null, requestMeaning: 'Synthetic request meaning, discarded before persistence.', primaryIntent: 'COFFEE', secondaryIntent: null, requirements: [] };
const payload = (text = JSON.stringify(semantics)) => ({ model: 'gpt-6-luna', status: 'completed', usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 }, output_tokens: 100 }, output: [{ content: [{ type: 'output_text', text }] }] });
const response = value => ({ ok: true, async json() { return value; } });
const config = { corpus: one(1), model: 'gpt-6-luna', apiKey: 'synthetic-test', maxCalls: 8, fetchImpl: async () => response(payload()) };

test('live evaluation corpus is explicitly developmental and its requirement oracle validates', () => {
  validateRequirementOracle(corpus, oracle);
  assert.equal(corpus.families.length, 12);
  assert.equal(corpus.families.flatMap(f => f.queries).length, 24);
  assert.throws(() => validateRequirementOracle(corpus, { ...oracle, scope: 'HOLDOUT' }));
  const bad = structuredClone(oracle); bad.families['exact-decimal-total'][0].variants[0].value.amountMinor = '2950';
  assert.throws(() => validateRequirementOracle(corpus, bad));
});

test('requirement scorer detects omissions, additions, negation, strength and exact numeric meaning', () => {
  const expected = oracle.families['exact-decimal-total']; const actual = structuredClone(expected[0].variants[0]);
  assert.equal(scoreRequirements(expected, [actual]).outcome, 'PASS');
  assert.equal(scoreRequirements(expected, []).missing, 1);
  assert.equal(scoreRequirements([], [actual]).unexpected, 1);
  for (const modified of [{ ...actual, operator: 'EXCLUDE' }, { ...actual, importance: 'PREFERRED' }, { ...actual, value: { ...actual.value, basis: 'PER_PERSON' } }]) {
    const report = scoreRequirements(expected, [modified]); assert.equal(report.missing, 1); assert.equal(report.unexpected, 1);
  }
  assert.equal(scoreRequirements(expected, [actual, actual]).unexpected, 1);
});

test('OR identifiers and array order are irrelevant, but losing alternative grouping fails', () => {
  const expected = oracle.families['or-atmosphere'];
  const actual = expected.map(e => ({ ...e.variants[0], group: 'R7' })).reverse();
  assert.equal(scoreRequirements(expected, actual).outcome, 'PASS');
  assert.equal(scoreRequirements(expected, actual.map(r => ({ ...r, group: null }))).outcome, 'FAIL');
});

test('runner calls canonical interpreter, enforces network destination and records measured usage without raw text', async () => {
  const report = await runModelEvaluation({ ...config, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.text.format.name, 'backyrd_decision_query_v8');
    return response(payload());
  } });
  assert.equal(report.transport, 'FIXTURE'); assert.equal(report.providerCalls, 1); assert.equal(report.passed, 1);
  assert.equal(report.usage.inputTokens, 1000); assert.equal(report.usage.cachedInputTokens, 200);
  assert.equal(report.costUsd, .000132); assert.equal(report.launchVerdict, 'NOT_EVALUATED');
  assert.doesNotMatch(JSON.stringify(report), /Coffee 0|synthetic-test|naturalLanguage|Bearer/);
});

test('call cap includes retries and never manufactures failures or passes for unrun cases', async () => {
  const report = await runModelEvaluation({ ...config, corpus: one(3), maxCalls: 1 });
  assert.equal(report.passed, 1); assert.equal(report.notRun, 2); assert.equal(report.providerCalls, 1);
  const malformed = await runModelEvaluation({ ...config, corpus: one(2), maxCalls: 1, fetchImpl: async () => response(payload('{malformed')) });
  assert.equal(malformed.errors, 1); assert.equal(malformed.notRun, 1); assert.equal(malformed.providerCalls, 1);
});

test('invalid configuration is rejected before any network call', async () => {
  for (const change of [{ apiKey: '' }, { maxCalls: 0 }, { maxCalls: 401 }, { timeoutMs: 0 }, { timeoutMs: 60001 }]) await assert.rejects(runModelEvaluation({ ...config, ...change }));
});

test('credentials, rate limits and incompatible schema stop the run without returning provider details', async () => {
  for (const status of [400, 401, 403, 404, 429]) {
    const report = await runModelEvaluation({ ...config, corpus: one(3), fetchImpl: async () => ({ ok: false, status }) });
    assert.equal(report.errors, 1); assert.equal(report.notRun, 2); assert.equal(report.providerCalls, 1);
    assert.equal(report.stopReason, `HTTP_${status}`); assert.equal(report.costUsd, null);
  }
});

test('deadline is an error and provider failures never become lexical success', async () => {
  const timeout = await runModelEvaluation({ ...config, timeoutMs: 5, fetchImpl: async (_url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('private timeout payload')), { once: true })) });
  assert.equal(timeout.errors, 1); assert.equal(timeout.cases[0].reason, 'TIMEOUT');
  const error = await runModelEvaluation({ ...config, fetchImpl: async () => { throw new Error('private payload'); } });
  assert.equal(error.errors, 1); assert.equal(error.passed, 0); assert.doesNotMatch(JSON.stringify(error), /private payload/);
});

test('missing usage stops measurements honestly rather than reporting zero cost', async () => {
  const report = await runModelEvaluation({ ...config, corpus: one(2), fetchImpl: async () => response({ ...payload(), usage: null }) });
  assert.equal(report.errors, 1); assert.equal(report.stopReason, 'USAGE_UNAVAILABLE'); assert.equal(report.costUsd, null); assert.equal(report.notRun, 1);
});


test('15:30 may be accompanied by its valid derived afternoon without changing the requested clock time', () => {
  const expected = oracle.families['precise-clock'];
  const actual = structuredClone(expected[0].variants[0]);
  actual.value.dayPhase = 'AFTERNOON';
  assert.equal(scoreRequirements(expected, [actual]).outcome, 'PASS');
  actual.value.dayPhase = 'MORNING';
  assert.equal(scoreRequirements(expected, [actual]).outcome, 'FAIL');
  actual.value.clockTime = '16:00';
  assert.equal(scoreRequirements(expected, [actual]).outcome, 'FAIL');
});


test('cost reservation and output bounds stop further billed requests', async () => {
  let calls = 0;
  const budget = await runModelEvaluation({ ...config, corpus: one(2), maxEstimatedCostUsd: .001, fetchImpl: async () => { calls++; return response(payload()); } });
  assert.equal(calls, 0); assert.equal(budget.notRun, 2); assert.equal(budget.errors, 0); assert.equal(budget.stopReason, 'ESTIMATED_COST_LIMIT');
  const oversized = await runModelEvaluation({ ...config, corpus: one(2), fetchImpl: async () => response({ ...payload(), usage: { ...payload().usage, output_tokens: 4000 } }) });
  assert.equal(oversized.providerCalls, 1); assert.equal(oversized.stopReason, 'TOKEN_BOUND_EXCEEDED');
  assert.equal(oversized.notRun, 1);
});


test('a bounded explicit primary coffee requirement is redundant, while invented context and duplicate constraints fail', () => {
  const optional = oracle.optionalPrimaryRequirements;
  assert.equal(scoreRequirements([], [optional[0]], optional).outcome, 'PASS');
  assert.equal(scoreRequirements([], [optional[0], optional[0]], optional).unexpected, 1);
  assert.equal(scoreRequirements([], [{ ...optional[0], importance: 'HARD' }], optional).outcome, 'FAIL');
  assert.equal(scoreRequirements([], oracle.families['exact-decimal-total'][0].variants, optional).outcome, 'FAIL');
});


test('unknown billing after a transport failure stops later cases as well as nulling the cost', async () => {
  let calls = 0;
  const report = await runModelEvaluation({ ...config, corpus: one(2), fetchImpl: async () => { calls++; throw new Error('transport failed'); } });
  assert.equal(calls, 1); assert.equal(report.errors, 1); assert.equal(report.notRun, 1);
  assert.equal(report.stopReason, 'USAGE_UNAVAILABLE'); assert.equal(report.costUsd, null);
});


test('rejected responses retain a bounded validation reason and safe shape metadata, never provider text', async () => {
  const bad = { ...semantics, privateField: 'DO_NOT_RETAIN_PROVIDER_TEXT' };
  const report = await runModelEvaluation({ ...config, fetchImpl: async () => response(payload(JSON.stringify(bad))) });
  assert.equal(report.cases[0].diagnosticCode, 'product_ai_intent_result_invalid_shape');
  assert.equal(report.cases[0].attempts.length, 2);
  assert.equal(report.cases[0].attempts[0].jsonObject, true);
  assert.equal(report.cases[0].attempts[0].requirements, 0);
  assert.doesNotMatch(JSON.stringify(report), /DO_NOT_RETAIN_PROVIDER_TEXT|privateField/);
  const incomplete = await runModelEvaluation({ ...config, fetchImpl: async () => response({ ...payload(), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) });
  assert.equal(incomplete.cases[0].diagnosticCode, 'product_ai_intent_response_incomplete');
  assert.equal(incomplete.cases[0].attempts[0].incompleteReason, 'max_output_tokens');
});

test('a failed context check can retain validated synthetic context and requirements for diagnosis', async () => {
  const observed = [];
  const report = await runModelEvaluation({ ...config, corpus: { ...one(1), families: [{ ...one(1).families[0], expected: [{ path: 'primaryIntent', op: 'equals', value: 'DINING' }] }] }, onObservation: (...args) => observed.push(args) });
  assert.equal(report.failed, 1); assert.equal(observed.length, 1);
  assert.deepEqual(observed[0][1], []);
  assert.equal(observed[0][2].primaryIntent, 'COFFEE');
  assert.equal(Object.hasOwn(observed[0][2], 'naturalLanguage'), false);
});


test('Responses text fragments are assembled once and validated as a whole', async () => {
  const json = JSON.stringify(semantics); const split = json.indexOf('COFFEE') + 3;
  const fragmented = { ...payload(), output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text: json.slice(0, split) }] },
    { type: 'message', content: [{ type: 'output_text', text: json.slice(split) }] },
  ] };
  const report = await runModelEvaluation({ ...config, fetchImpl: async () => response(fragmented) });
  assert.equal(report.passed, 1); assert.equal(report.providerCalls, 1);
  assert.equal(report.cases[0].attempts[0].outputTextCount, 2);
  assert.equal(report.cases[0].attempts[0].jsonObject, false);
  assert.equal(report.cases[0].attempts[0].combinedJsonObject, true);
  for (const [parts, code] of [
    [[{ type: 'output_text', text: json }, { type: 'output_text', text: json }], 'product_ai_intent_response_invalid_json'],
    [[{ type: 'output_text', text: json }, { type: 'refusal', refusal: 'PRIVATE_REFUSAL' }], 'product_ai_intent_response_refused'],
    [[{ type: 'output_text', text: json }, { type: 'output_text', text: ' '.repeat(16384) }], 'product_ai_intent_response_too_large'],
  ]) {
    const rejected = await runModelEvaluation({ ...config, fetchImpl: async () => response({ ...payload(), output: [{ content: parts }] }) });
    assert.equal(rejected.errors, 1); assert.equal(rejected.providerCalls, 2);
    assert.equal(rejected.cases[0].diagnosticCode, code);
    assert.doesNotMatch(JSON.stringify(rejected), /PRIVATE_REFUSAL/);
  }
});


test('an external evaluator can observe all normalized interpretations without changing built-in scoring', async () => {
  const values = [];
  const report = await runModelEvaluation({ ...config, onInterpretation: (...args) => values.push(args) });
  assert.equal(report.passed, 1); assert.equal(values.length, 1);
  assert.equal(values[0][0], 'coffee-1'); assert.deepEqual(values[0][1], []);
  assert.equal(values[0][2].primaryIntent, 'COFFEE');
  assert.doesNotMatch(JSON.stringify(values), /Coffee 0|synthetic-test|naturalLanguage|Bearer/);
});

test('context-role evaluation freezes explicit semantic expectations, including conditions and timing relations', () => {
  const roles = JSON.parse(readFileSync(new URL('./context-roles-corpus.json', import.meta.url), 'utf8'));
  const expectations = JSON.parse(readFileSync(new URL('./context-roles-oracle.json', import.meta.url), 'utf8'));
  validateRequirementOracle(roles, expectations);
  assert.equal(roles.families.flatMap(f => f.queries).length, 24);
  const permitted = expectations.families['conditional-permission'][0].variants[0];
  assert.equal(scoreRequirements(expectations.families['conditional-permission'], [{ ...permitted, condition: 'DRY' }]).outcome, 'FAIL');
  assert.equal(scoreRequirements(expectations.families['conditional-permission'], [{ ...permitted, operator: 'REQUIRE' }]).outcome, 'FAIL');
  const deadline = expectations.families['finish-deadline'][0].variants[0];
  assert.equal(scoreRequirements(expectations.families['finish-deadline'], [{ ...deadline, value: { ...deadline.value, clockRelation: 'AT' } }]).outcome, 'FAIL');
});

test('profile fallback is not an explicit UI selection and cannot overrule a requested destination', async () => {
  const c = { ...one(1), families: [{ id: 'destination', dimension: 'LOCATION', queries: ['Coffee in St. Gallen'], expected: [{ path: 'targetCity', op: 'equals', value: 'St. Gallen' }] }] };
  const row = { dimension: 'LOCATION', importance: 'ESSENTIAL', operator: 'REQUIRE', origin: 'EXPLICIT', interpretationState: 'UNDERSTOOD', value: { kind: 'LOCATION', city: 'St. Gallen' }, alternatives: [], group: null, evidence: 'St. Gallen' };
  const report = await runModelEvaluation({ ...config, corpus: c, fetchImpl: async () => response(payload(JSON.stringify({ ...semantics, requirements: [row] }))) });
  assert.equal(report.passed, 1); assert.equal(report.errors, 0);
});

test('semantic boundary corpus and frozen oracle include multilingual setting/access counterexamples', () => {
  const boundaryCorpus = JSON.parse(readFileSync(new URL('./semantic-boundaries-corpus.json', import.meta.url), 'utf8'));
  const boundaryOracle = JSON.parse(readFileSync(new URL('./semantic-boundaries-oracle.json', import.meta.url), 'utf8'));
  validateRequirementOracle(boundaryCorpus, boundaryOracle);
  assert.equal(boundaryCorpus.families.reduce((n, f) => n + f.queries.length, 0), 15);
  const rows = boundaryOracle.families['dry-outdoor'].flatMap(r => r.variants);
  assert.ok(rows.some(r => r.dimension === 'SETTING' && r.value.environment === 'OUTDOOR' && r.condition === 'DRY'));
  assert.equal(scoreRequirements(boundaryOracle.families['dry-outdoor'], rows.map(r => r.value?.environment === 'OUTDOOR'
    ? { ...r, dimension: 'OTHER', value: { kind: 'NEED', code: 'STEP_FREE_ENTRANCE', scope: 'UNSPECIFIED' } } : r)).outcome, 'FAIL');
});

test('family-specific redundant representations do not permit invented lunch or time in unrelated requests', () => {
  const c = JSON.parse(readFileSync(new URL('./semantic-boundaries-corpus.json', import.meta.url), 'utf8'));
  const o = JSON.parse(readFileSync(new URL('./semantic-boundaries-oracle.json', import.meta.url), 'utf8'));
  validateRequirementOracle(c, o);
  const midday = o.optionalRequirementsByFamily['dry-outdoor'].find(r => r.dimension === 'TIME');
  const weather = o.families['dry-outdoor'].map(r => r.variants[0]);
  assert.equal(scoreRequirements(o.families['dry-outdoor'], [...weather, midday], o.optionalRequirementsByFamily['dry-outdoor']).outcome, 'PASS');
  const coffee = o.families['real-access-only'].map(r => r.variants[0]);
  for (const extra of o.optionalRequirementsByFamily['dry-outdoor']) {
    assert.equal(scoreRequirements(o.families['real-access-only'], [...coffee, extra], o.optionalRequirementsByFamily['real-access-only'] ?? []).outcome, 'FAIL');
  }
  assert.throws(() => validateRequirementOracle(c, { ...o, contractVersion: 'backyrd.requirement-oracle@1.0' }), /oracle_invalid/);
  assert.throws(() => validateRequirementOracle(c, { ...o, optionalRequirementsByFamily: { unknown: [midday] } }), /oracle_invalid/);
});


test('completeness CLI distinguishes transport success from independent semantic review', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { createHash } = await import('node:crypto');
  const report = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./run-model-evaluation.mjs', import.meta.url)), '--suite', 'completeness'], { encoding: 'utf8' }));
  assert.equal(report.providerCalled, false);
  assert.equal(report.caseCount, 18);
  assert.equal(report.semanticScoring, false);
  assert.equal(report.metric, 'TRANSPORT_ONLY_REQUIRES_FROZEN_RUBRIC_REVIEW');
  for (const [name, hash] of [['cases', 'd251de0f480348558539fbed105f3a37a5f3dc2bb52153b23535a606234bae53'], ['rubric', 'b595e99c4ff00b97eb277ee9136399c162e0d4a3dc42549218b6e79f9ec256c1']]) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`./completeness-${name}.json`, import.meta.url))).digest('hex'), hash, 'pre-observation cases and semantic rubric stay frozen');
  }
});


test('canonical repair prompts remain measurable and bounded, with each prompt variant recorded', async () => {
  const requests = [];
  const report = await runModelEvaluation({ ...config, corpus: one(2), fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    return response(payload(requests.length === 1 ? '{' : JSON.stringify(semantics)));
  } });
  assert.equal(report.errors, 0); assert.equal(report.passed, 2);
  assert.equal(report.providerCalls, 3);
  assert.equal(report.repairPromptHashes.length, 1);
  assert.notEqual(report.repairPromptHashes[0], report.promptHash);
  assert.equal(requests[0].instructions, requests[2].instructions);
  assert.ok(requests[1].instructions.startsWith(requests[0].instructions));
  assert.equal(report.usage.measuredCalls, 3);
});


test('live runner can verify every successful cold result against a no-provider warm replay', async () => {
  const report = await runModelEvaluation({ ...config, corpus: one(2), verifyWarmCache: true });
  assert.equal(report.passed, 2);
  assert.equal(report.providerCalls, 2);
  assert.deepEqual(report.warmCache, { requested: true, verifiedCases: 2 });
});
