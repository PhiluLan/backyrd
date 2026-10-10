import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runModelEvaluation, scoreRequirements, validateRequirementOracle } from './model-evaluation.mjs';
const corpus = JSON.parse(readFileSync(new URL('./model-corpus.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(readFileSync(new URL('./requirement-oracle.json', import.meta.url), 'utf8'));
const one = count => ({ ...corpus, families: [{ id: 'coffee', dimension: 'INTENT', queries: Array.from({ length: count }, (_, i) => `Coffee ${i}`), expected: [{ path: 'primaryIntent', op: 'equals', value: 'COFFEE' }] }] });
const semantics = { primaryIntent: 'COFFEE', secondaryIntent: null, facets: [], indoorRequired: false, indoorEvidence: null, unresolvedNeedCodes: [], requirements: [] };
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
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.text.format.name, 'backyrd_decision_query_v5');
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
