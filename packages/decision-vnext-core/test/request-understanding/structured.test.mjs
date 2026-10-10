import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION } from '@backyrd/world-knowledge-core';
import {
  bindProductUnderstanding, parseModelRequirements, encodeRequirementCache, decodeRequirementCache, validateProductUnderstanding,
  createDecisionProductAiIntentInterpreter, createDecisionProductHttpHandler, createDecisionProductRpcEvaluationProvider, contentHash, resolveDecisionProductContext,
} from '../../dist/index.js';
import { evaluateProductWorldViews } from '../../dist/product-v1-evaluator.js';
import { parseProductWorldResolverBinding } from '../../dist/product-world-resolver-binding.js';
const at = '2026-10-10T12:00:00.000Z';
const actor = { userId: '11111111-1111-4111-8111-111111111111', subjectBindingHash: 'd'.repeat(64), authenticationContextHash: 'e'.repeat(64), sessionBindingHash: 'f'.repeat(64), sessionId: '22222222-2222-4222-8222-222222222222' };
const identity = { releaseHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), sourceSetHash: 'c'.repeat(64), controlGeneration: 4 };
const request = (naturalLanguage, explicit = {}) => ({ contractVersion: 'backyrd.decision-vnext.product-request@1.0', requestId: 'structured-request', idempotencyKey: 'structured-key', naturalLanguage, explicit, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] });
const req = (dimension, value, evidence, rest = {}) => ({ dimension, importance: 'ESSENTIAL', operator: 'REQUIRE', origin: 'EXPLICIT', interpretationState: 'UNDERSTOOD', value, alternatives: [], group: null, evidence, ...rest });
const time = (rest = {}) => ({ kind: 'TIME', openNow: false, localDate: null, relativeDays: null, weekday: null, dayPhase: null, clockTime: null, ...rest });
const money = (rest = {}) => ({ kind: 'BUDGET', amountMinor: 3000, currency: 'CHF', comparison: 'LTE', basis: 'PER_PERSON', ...rest });
const semantics = requirements => ({ primaryIntent: 'COFFEE', secondaryIntent: null, facets: [], indoorRequired: false, indoorEvidence: null, unresolvedNeedCodes: [], requirements });
function harness(requirements) {
  const records = new Map(); const calls = []; let fetches = 0;
  const run = createDecisionProductAiIntentInterpreter({ identity, apiKey: 'synthetic', model: 'gpt-6-luna', allowedUserIds: '*',
    rpc: { async rpc(_name, args) {
      calls.push(args);
      const key = JSON.stringify([args.p_auth_user_id, args.p_request_hash, args.p_model_version]);
      if (args.p_write) records.set(key, args.p_semantics);
      return { data: records.has(key) ? { status: 'HIT', semantics: records.get(key) } : { status: 'MISS' }, error: null };
    } },
    fetchImpl: async (_url, options) => {
      fetches++;
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.ok(body.text.format.schema.required.includes('requirements'));
      assert.equal(body.text.format.schema.properties.requirements.maxItems, 12);
      return { ok: true, async json() { return { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(semantics(requirements)) }] }] }; } };
    },
  });
  return { run: input => run(input, actor, new AbortController().signal), records, calls, fetches: () => fetches };
}
const context = (input, understanding) => resolveDecisionProductContext(input, { authorizedCity: 'Basel', serverTime: at }, understanding);
const interpretedContext = async (text, requirements, explicit = {}) => {
  const result = await harness(requirements).run(request(text, explicit));
  return { ...result, context: context(result.request, result.understanding) };
};

test('model ages and group count reach the context on cold and warm cache without persisting lists or evidence', async () => {
  const text = 'Coffee for five people, children aged three and seven, with two adults';
  const h = harness([
    req('AGE', { kind: 'AGE', ages: [7, 3] }, 'children aged three and seven'),
    req('COMPANY', { kind: 'COMPANY', size: 5, adultPresent: true, companionType: 'FAMILY' }, 'five people, children aged three and seven, with two adults'),
  ]);
  const input = request(text); const cold = await h.run(input); const warm = await h.run(input);
  assert.deepEqual(warm, cold); assert.equal(h.fetches(), 1);
  assert.deepEqual(context(cold.request, cold.understanding).group, { size: 5, minimumAge: 3, adultPresent: true, companionType: 'FAMILY' });
  assert.deepEqual(cold.request.explicit.group, undefined, 'the model cannot mutate the public explicit group');
  const cache = JSON.stringify([...h.records.values()]);
  assert.equal(cache.includes('evidence'), false); assert.equal(cache.includes('aged three'), false);
  assert.equal(cache.includes('ages'), false); assert.ok(cache.includes('minimumAge'));
  const repeat = await h.run({ ...input, requestId: 'new-id', idempotencyKey: 'new-key' });
  assert.notEqual(repeat.understanding.requestHash, cold.understanding.requestHash);
  assert.equal(h.fetches(), 1, 'normalized cache is rebound to each complete request');
});

test('decimal strict total budget remains exact internally and explicitly unsupported in public v1', async () => {
  const text = 'Coffee under CHF 29.50 in total';
  const result = await interpretedContext(text, [req('BUDGET', money({ amountMinor: 2950, comparison: 'LT', basis: 'TOTAL' }), 'under CHF 29.50 in total', { importance: 'HARD' })]);
  assert.equal(result.understanding.requirements[0].value.amountMinor, 2950);
  assert.equal(result.understanding.requirements[0].value.comparison, 'LT');
  assert.equal(result.context.budget.amount, null);
  assert.ok(result.context.unresolvedTerms.includes('BUDGET_SEMANTICS_UNVERIFIED'));
  assert.ok(result.context.hardConstraints.includes('BUDGET_MAXIMUM'));
});

test('model date reference resolves against Swiss server time and preserves morning independently', async () => {
  const result = await interpretedContext('Coffee tomorrow morning', [req('TIME', time({ relativeDays: 1, dayPhase: 'MORNING' }), 'tomorrow morning')]);
  assert.equal(result.context.dateTime.localDate, '2026-10-11');
  assert.equal(result.context.dateTime.dayPhase, 'MORNING');
  assert.ok(result.context.hardConstraints.includes('OPEN_ON_REQUESTED_DAY'));
});

test('unsupported mobility and conflicting location stay visible without overriding authorized retrieval', async () => {
  const result = await interpretedContext('Coffee in Zürich within a ten minute walk', [
    req('LOCATION', { kind: 'LOCATION', city: 'Zurich' }, 'in Zürich', { importance: 'HARD' }),
    req('MOBILITY', { kind: 'MOBILITY', maximumMeters: null, maximumMinutes: 10, mode: 'WALK' }, 'within a ten minute walk', { importance: 'HARD' }),
  ], { targetCity: 'Basel' });
  assert.equal(result.request.explicit.targetCity, 'Basel');
  assert.equal(result.context.targetCity, 'Basel');
  assert.ok(result.context.unresolvedTerms.includes('LOCATION_REQUEST_UNVERIFIED'));
  assert.ok(result.context.unresolvedTerms.includes('MOBILITY_REQUEST_UNRESOLVED'));
});

test('structured UI values remain authoritative but conflicts with the sentence are disclosed', async () => {
  const explicit = { group: { size: 2, minimumAge: 9, adultPresent: false, companionType: 'FAMILY' } };
  const result = await interpretedContext('Coffee with a child aged four', [req('AGE', { kind: 'AGE', ages: [4] }, 'child aged four')], explicit);
  assert.deepEqual(result.context.group, explicit.group);
  assert.ok(result.context.unresolvedTerms.includes('GROUP_CONTEXT_CONFLICT'));
});

test('ambiguous budget alternatives survive cache and cannot become a guessed amount', async () => {
  const text = 'Budget either CHF 20 or CHF 30 per person';
  const result = await interpretedContext(text, [req('BUDGET', null, text, { interpretationState: 'AMBIGUOUS', alternatives: [money({ amountMinor: 2000 }), money()] })]);
  assert.equal(result.context.budget.amount, null);
  assert.equal(result.understanding.requirements[0].alternatives.length, 2);
  assert.ok(result.context.unresolvedTerms.includes('BUDGET_REQUEST_UNRESOLVED'));
});

test('untrusted requirement boundaries reject invented provenance, fields, numeric inference and invalid dates', () => {
  const base = req('AGE', { kind: 'AGE', ages: [4] }, 'four');
  for (const invalid of [
    { ...base, evidence: 'not present' }, { ...base, spotId: 'forged' }, { ...base, origin: 'INFERRED', importance: 'PREFERRED' },
    { ...base, value: { kind: 'AGE', ages: [200] } }, { ...base, dimension: 'BUDGET' },
    req('TIME', time({ localDate: '2026-02-30' }), 'four'), req('TIME', time({ localDate: '2026-02-28', relativeDays: 2 }), 'four'),
    req('ATMOSPHERE', { kind: 'FACET', key: 'identity.name', value: 'FOUR' }, 'four'),
    { ...base, interpretationState: 'AMBIGUOUS' }, { ...base, evidence: '' },
  ]) assert.throws(() => parseModelRequirements([invalid], 'four'));
  assert.throws(() => parseModelRequirements(Array(13).fill(base), 'four'));
});

test('understanding hashes bind request and policy and cached payloads cannot inject source text', () => {
  const input = request('four'); const normalized = parseModelRequirements([req('AGE', { kind: 'AGE', ages: [4] }, 'four')], 'four');
  const bound = bindProductUnderstanding(input, normalized);
  assert.deepEqual(validateProductUnderstanding(bound, input), bound);
  assert.throws(() => validateProductUnderstanding(bound, { ...input, naturalLanguage: 'forty' }), /binding_invalid/);
  assert.throws(() => validateProductUnderstanding({ ...bound, policyVersion: 'old-policy' }, input), /binding_invalid/);
  assert.throws(() => validateProductUnderstanding({ ...bound, rawText: 'four' }, input), /binding_invalid/);
  const encoded = encodeRequirementCache(normalized);
  assert.deepEqual(decodeRequirementCache(encoded), normalized);
  assert.throws(() => decodeRequirementCache([[...encoded[0], 'four']]));
  const forged = structuredClone(encoded); forged[0][5].evidence = 'four';
  assert.throws(() => decodeRequirementCache(forged));
});

const conditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null };
const fact = (key, value) => ({ key, value, scope: 'SPOT', resolution: 'KNOWN_VALUE', freshness: 'CURRENT', trust: 'VERIFIED', basisClaimHashes: [contentHash(key)] });
const worldBinding = (extra = []) => ({
  contractVersion: 'backyrd.world-knowledge.product-resolver-binding@1.0', manifestHash: contentHash(extra), registryHash: REGISTRY_HASH, resolvedAt: at,
  decisionProjection: { contractVersion: 'backyrd.world-knowledge.product-decision-projection@1.0', registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
    spotId: '33333333-3333-4333-8333-333333333333', facts: [fact('identity.name', 'Synthetic café'), fact('location.locality', 'Basel'), fact('purpose.primary_visit', 'EAT_DRINK'), fact('classification.primary_category', 'COFFEE_DAYTIME'), fact('classification.place_types', ['CAFE']), ...extra], explicitUnknowns: [], conflicts: [] },
});
const world = (extra = []) => parseProductWorldResolverBinding(worldBinding(extra), 'Basel');
const assess = (result, extra = []) => {
  const spot = world(extra);
  return evaluateProductWorldViews(result.request, { authorizedCity: 'Basel', serverTime: at }, { status: 'NEUTRAL', projectionHash: contentHash('neutral') }, [spot], contentHash([spot.spot.spotId]), result.understanding).evaluation;
};

test('essential atmosphere is independently checked against scoped World evidence after model normalization', async () => {
  const result = await interpretedContext('Quiet coffee', [req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'Quiet')]);
  assert.equal(assess(result).candidates[0].tier, 'UNCONFIRMED_FALLBACK');
  assert.ok(assess(result).candidates[0].limitations.includes('ESSENTIAL_REQUIREMENT_UNVERIFIED'));
  assert.equal(assess(result, [fact('context.atmosphere', [{ atmosphere: 'QUIET', conditions }])]).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
  assert.notEqual(assess(result, [fact('context.atmosphere', [{ atmosphere: 'QUIET', conditions: { ...conditions, area: 'Private room' } }])]).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
});

test('AND between independent essential requirements and OR within a group are preserved', async () => {
  const text = 'Quiet or cozy coffee with desserts';
  const r = await interpretedContext(text, [
    req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'Quiet', { group: 'R1' }),
    req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'COZY' }, 'cozy', { group: 'R1' }),
    req('OFFERING', { kind: 'FACET', key: 'offering.groups', value: 'DESSERTS' }, 'desserts'),
  ]);
  const cozy = fact('context.atmosphere', [{ atmosphere: 'COZY', conditions }]);
  assert.notEqual(assess(r, [cozy]).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
  assert.equal(assess(r, [cozy, fact('offering.groups', ['DESSERTS'])]).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
});

test('a structured request for another city cannot rank a candidate from the profile city', async () => {
  const result = await interpretedContext('Coffee in Zürich', [req('LOCATION', { kind: 'LOCATION', city: 'Zurich' }, 'Zürich', { importance: 'HARD' })], { targetCity: 'Basel' });
  const evaluated = assess(result);
  assert.ok(evaluated.candidates[0].unknownHardConstraints.includes('TARGET_LOCATION'));
  assert.ok(evaluated.limitations.includes('LOCATION_REQUEST_UNVERIFIED'));
});

test('HTTP transports validated understanding only internally and rejects client injection and wrong-request bindings', async () => {
  const original = request('Quiet coffee');
  const h = harness([req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'Quiet')]);
  const result = await h.run(original); let evaluated = 0;
  const failures = [];
  const ports = {
    auth: { async authenticate() { return actor; } }, rateLimit: { async consume() { return true; } },
    control: { timeoutMilliseconds: 2000, maxRequestBytes: 16384, async assertBoundary() {} },
    async interpret() { return result; },
    async evaluate(_request, _actor, _signal, understanding) { evaluated++; assert.deepEqual(understanding, result.understanding); throw new Error('product_evaluation_probe'); },
    idempotency: { async commit() { throw new Error('must_not_commit'); } }, interaction: { async resolve() { throw new Error('must_not_resolve'); } },
    learning: { contractVersion: 'backyrd.user-intelligence.product-decision-learning-port@1.0', async record() { throw new Error('must_not_learn'); } },
    diagnostics: { reportFailure(stage, code) { failures.push({ stage, code }); } },
  };
  const invoke = (body, overrides = {}) => createDecisionProductHttpHandler({ ...ports, ...overrides })(new Request('https://example.invalid/decision-v13', { method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: JSON.stringify(body) }));
  await invoke(original); assert.equal(evaluated, 1); assert.equal(failures.at(-1).stage, 'EVALUATION');
  await invoke({ ...original, understanding: result.understanding }); assert.equal(evaluated, 1);
  await invoke(original, { async interpret() { return { ...result, understanding: { ...result.understanding, requestHash: '0'.repeat(64) } }; } });
  assert.equal(evaluated, 1); assert.deepEqual(failures.at(-1), { stage: 'INTERPRETATION', code: 'product_understanding_binding_invalid' });
});

test('a preferred budget is not silently promoted to hard eligibility by the lexical fallback', async () => {
  const result = await interpretedContext('Coffee ideally under CHF 30', [req('BUDGET', money({ comparison: 'LT', basis: 'UNSPECIFIED' }), 'ideally under CHF 30', { importance: 'PREFERRED' })]);
  assert.equal(result.context.hardConstraints.includes('BUDGET_MAXIMUM'), false);
  assert.equal(result.context.unresolvedTerms.includes('BUDGET_SEMANTICS_UNVERIFIED'), false);
  assert.equal(assess(result).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
});

test('unsupported hard mobility remains an eligibility constraint, not just explanatory copy', async () => {
  const result = await interpretedContext('Coffee within five minutes walking', [req('MOBILITY', { kind: 'MOBILITY', maximumMeters: null, maximumMinutes: 5, mode: 'WALK' }, 'within five minutes walking', { importance: 'HARD' })]);
  assert.ok(assess(result).candidates[0].unknownHardConstraints.some(c => c.startsWith('UNDERSTANDING_UNRESOLVED_')));
});

test('over-budget cache payloads fail before persistence without truncating requirements', async () => {
  const evidence = 'Coffee on a date';
  const h = harness(Array.from({ length: 12 }, () => req('TIME', null, evidence, { interpretationState: 'AMBIGUOUS', alternatives: [time({ localDate: '2026-10-11' }), time({ localDate: '2026-10-12' }), time({ localDate: '2026-10-13' })] })));
  await assert.rejects(h.run(request(evidence)), /cache_budget_exceeded/);
  assert.equal(h.calls.some(call => call.p_write), false);
  assert.equal(h.fetches(), 1);
});

test('a provider failure cannot silently become a lexical success with invented completeness', async () => {
  let calls = 0;
  const run = createDecisionProductAiIntentInterpreter({ identity, apiKey: 'synthetic', model: 'gpt-6-luna', allowedUserIds: '*',
    rpc: { async rpc() { return { data: { status: 'MISS' }, error: null }; } }, fetchImpl: async () => { calls++; return { ok: false }; },
  });
  await assert.rejects(run(request('Coffee'), actor, new AbortController().signal), /provider_unavailable/);
  assert.equal(calls, 1);
});

test('free-text location values cannot smuggle source text into the private normalized cache', () => {
  assert.throws(() => parseModelRequirements([req('LOCATION', { kind: 'LOCATION', city: 'Coffee with my daughter in Basel' }, 'Basel')], 'Basel'));
});


test('a parsed future visit does not inherit OPEN_NOW from a negated now token', async () => {
  const result = await interpretedContext('Kaffee nicht jetzt, sondern morgen', [req('TIME', time({ relativeDays: 1 }), 'nicht jetzt, sondern morgen')]);
  assert.equal(result.context.dateTime.localDate, '2026-10-11');
  assert.equal(result.context.hardConstraints.includes('OPEN_NOW'), false);
  const now = await interpretedContext('Kaffee jetzt', [req('TIME', time({ openNow: true }), 'jetzt')]);
  assert.ok(now.context.hardConstraints.includes('OPEN_NOW'));
});

test('an explicitly excluded and verified atmosphere is rejected rather than ranked as an unconfirmed fallback', async () => {
  const result = await interpretedContext('Coffee but not quiet', [req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'not quiet', { operator: 'EXCLUDE' })]);
  const evaluated = assess(result, [fact('context.atmosphere', [{ atmosphere: 'QUIET', conditions }])]);
  assert.equal(evaluated.candidates[0].tier, 'INELIGIBLE');
  assert.ok(evaluated.candidates[0].failedHardConstraints.some(code => code.startsWith('UNDERSTANDING_REQUIREMENT_')));
  assert.ok(evaluated.limitations.includes('ESSENTIAL_REQUIREMENT_UNVERIFIED'));
});


test('canonical production RPC evaluation consumes the validated internal requirements without sending them to context RPCs', async () => {
  const text = 'Coffee with a child aged three';
  const result = await interpretedContext(text, [req('AGE', { kind: 'AGE', ages: [3] }, 'child aged three')], { targetCity: 'Basel' });
  const provider = createDecisionProductRpcEvaluationProvider({ async rpc(name, parameters) {
    assert.equal(name, 'backyrd_decision_vnext_product_context_v5');
    assert.equal(Object.hasOwn(parameters, 'understanding'), false);
    assert.equal(Object.hasOwn(parameters, 'naturalLanguage'), false);
    return { data: { contractVersion: 'backyrd.decision-vnext.product-runtime-context@1.0', authorizedCity: 'Basel', serverTime: at, worldSnapshots: [worldBinding()], status: 'NO_CONSENT', consent: null, snapshot: null }, error: null };
  } });
  const evaluated = await provider.evaluate({ request: result.request, understanding: result.understanding, actor, identity, signal: new AbortController().signal });
  assert.equal(evaluated.evaluation.interpretation.group.minimumAge, 3);
  assert.equal(evaluated.projection.status, 'NEUTRAL');
  assert.equal(evaluated.evaluation.requestHash, contentHash(result.request));
});


test('preferred canonical requirements still reach ranking without becoming eligibility constraints', async () => {
  const result = await interpretedContext('Prefer quiet coffee', [req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'Prefer quiet', { importance: 'PREFERRED' })]);
  assert.ok(result.request.explicit.softPreferences.includes('WK:context.atmosphere:QUIET'));
  assert.equal(assess(result).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
});


test('unsupported access is disclosed and remains a hard eligibility boundary', async () => {
  const result = await interpretedContext('Coffee with an accessible toilet', [req('ACCESS', null, 'accessible toilet', { importance: 'HARD', interpretationState: 'UNSUPPORTED' })]);
  assert.ok(result.context.unresolvedTerms.includes('ACCESS_REQUEST_UNRESOLVED'));
  assert.ok(assess(result).candidates[0].unknownHardConstraints.length > 0);
  assert.throws(() => parseModelRequirements([req('ACCESS', { kind: 'FACET', key: 'accessibility.step_free_entrance', value: 'TRUE' }, 'Coffee')], 'Coffee'));
});

test('hard precise time, age and group requirements cannot pass on interpretation alone', async () => {
  const cases = [
    ['Coffee at most CHF 20 per person', req('BUDGET', money({ amountMinor: 2000 }), 'at most CHF 20 per person', { importance: 'HARD' }), { budget: { state: 'KNOWN', amount: 30, currency: 'CHF', perPerson: true, calibrationLabel: null } }],
    ['Coffee at 15:00', req('TIME', time({ clockTime: '15:00' }), 'at 15:00', { importance: 'HARD' })],
    ['Coffee suitable for a three-year-old', req('AGE', { kind: 'AGE', ages: [3] }, 'three-year-old', { importance: 'HARD' })],
    ['Coffee for five people', req('COMPANY', { kind: 'COMPANY', size: 5, adultPresent: null, companionType: null }, 'five people', { importance: 'HARD' })],
  ];
  for (const [text, requirement, explicit] of cases) {
    const result = await interpretedContext(text, [requirement], explicit);
    assert.ok(assess(result).candidates[0].unknownHardConstraints.some(code => code.startsWith('UNDERSTANDING_')), text);
  }
  const group = await interpretedContext('Coffee for five people', [req('COMPANY', { kind: 'COMPANY', size: 5, adultPresent: null, companionType: null }, 'five people')]);
  assert.ok(group.context.unresolvedTerms.includes('GROUP_CAPACITY_UNVERIFIED'));
  assert.notEqual(assess(group).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
});

test('explicit null intent fields retain their public boundary meaning', async () => {
  const result = await harness([]).run(request('Coffee', { primaryIntent: null, secondaryIntent: null }));
  assert.equal(result.request.explicit.primaryIntent, null);
  assert.equal(result.request.explicit.secondaryIntent, null);
});
