import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION } from '@backyrd/world-knowledge-core';
import {
  PRODUCT_MODEL_REQUIREMENTS_SCHEMA, bindProductUnderstanding, parseModelRequirements, encodeRequirementCache, decodeRequirementCache, validateProductUnderstanding,
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
const semantics = requirements => ({ primaryIntentGroup: null, secondaryIntentGroup: null, requestMeaning: 'Synthetic request meaning, discarded before persistence.', primaryIntent: 'COFFEE', secondaryIntent: null, requirements });
function harness(requirements, overrides = {}) {
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
      return { ok: true, async json() { return { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...semantics(requirements), ...overrides }) }] }] }; } };
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

test('decimal strict total budget remains exact publicly while venue comparison stays unverified', async () => {
  const text = 'Coffee under CHF 29.50 in total';
  const result = await interpretedContext(text, [req('BUDGET', money({ amountMinor: 2950, comparison: 'LT', basis: 'TOTAL' }), 'under CHF 29.50 in total', { importance: 'HARD' })]);
  assert.equal(result.understanding.requirements[0].value.amountMinor, 2950);
  assert.equal(result.understanding.requirements[0].value.comparison, 'LT');
  assert.equal(result.context.budget.amount, 29.5);
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
  const evidence = 'Coffee on a date in 2026';
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


test('invalid model source evidence retains a safe diagnostic code after the bounded retry', async () => {
  const h = harness([req('AGE', { kind: 'AGE', ages: [3] }, 'invented source quote')]);
  await assert.rejects(h.run(request('Coffee')), { message: 'product_understanding_evidence_invalid' });
  assert.equal(h.fetches(), 2);
  assert.equal(h.calls.some(call => call.p_write), false);
});


test('repair call explains the rejected boundary without replaying provider text and caches only validated output', async () => {
  const bodies = []; const writes = [];
  const invalid = semantics([req('TIME', time({ weekday: 5, monthDay: '10-16' }), 'Friday 16 October')]);
  const valid = semantics([req('TIME', time({ monthDay: '10-16' }), 'Friday 16 October')]);
  const run = createDecisionProductAiIntentInterpreter({ identity, apiKey: 'synthetic', model: 'gpt-6-luna', allowedUserIds: '*',
    rpc: { async rpc(_name, args) {
      if (args.p_write) { writes.push(args.p_semantics); return { data: { status: 'HIT', semantics: args.p_semantics }, error: null }; }
      return { data: { status: 'MISS' }, error: null };
    } },
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, async json() { return { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(bodies.length === 1 ? invalid : valid) }] }] }; } };
    },
  });
  const result = await run(request('Friday 16 October'), actor, new AbortController().signal);
  assert.equal(bodies.length, 2);
  assert.ok(bodies[1].instructions.includes('Die vorige Antwort hatte widersprüchliche Zeitfelder'));
  assert.equal(bodies[1].instructions.includes(JSON.stringify(invalid)), false);
  assert.equal(bodies[1].input, bodies[0].input);
  assert.deepEqual(bodies[1].text, bodies[0].text);
  assert.equal(bodies[1].store, false);
  assert.equal(bodies[1].max_output_tokens, 3600);
  assert.deepEqual(bodies[1].reasoning, { effort: 'low' });
  assert.equal(writes.length, 1);
  assert.equal(result.understanding.requirements[0].value.monthDay, '10-16');
  assert.equal(result.understanding.requirements[0].value.weekday, null);
});

test('singleton OR labels normalize away but genuine alternative groups survive', () => {
  const quiet = req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'quiet', { group: 'R1' });
  assert.equal(parseModelRequirements([quiet], 'quiet')[0].group, null);
  const cozy = req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'COZY' }, 'cozy', { group: 'R1' });
  assert.deepEqual(parseModelRequirements([quiet, cozy], 'quiet or cozy').map(r => r.group), ['R1', 'R1']);
});


test('explicit essential exclusions are vetoes while optional exclusions remain optional', async () => {
  const value = { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' };
  const essential = await interpretedContext('Coffee, not quiet', [req('ATMOSPHERE', value, 'not quiet', { operator: 'EXCLUDE' })]);
  assert.equal(essential.understanding.requirements[0].importance, 'HARD');
  assert.ok(assess(essential).candidates[0].unknownHardConstraints.some(code => code.startsWith('UNDERSTANDING_REQUIREMENT_')));
  const optional = await interpretedContext('Coffee, preferably not quiet', [req('ATMOSPHERE', value, 'preferably not quiet', { operator: 'EXCLUDE', importance: 'PREFERRED' })]);
  assert.equal(optional.understanding.requirements[0].importance, 'PREFERRED');
  assert.equal(assess(optional).candidates[0].unknownHardConstraints.length, 0);
});


test('an explicitly absent adult conflicts with a selected adult, but unknown adult presence does not', async () => {
  const explicit = { group: { size: 3, minimumAge: 12, adultPresent: true, companionType: 'FRIENDS_GROUP' } };
  const value = { kind: 'COMPANY', size: 3, adultPresent: false, companionType: 'FRIENDS_GROUP' };
  const absent = await interpretedContext('Coffee for three friends, no adult present', [req('COMPANY', value, 'three friends, no adult present')], explicit);
  assert.ok(absent.context.unresolvedTerms.includes('GROUP_CONTEXT_CONFLICT'));
  assert.equal(absent.context.group.adultPresent, true, 'the explicit UI remains authoritative while the conflict is disclosed');
  const unknown = await interpretedContext('Coffee for three friends', [req('COMPANY', { ...value, adultPresent: null }, 'three friends')], explicit);
  assert.equal(unknown.context.unresolvedTerms.includes('GROUP_CONTEXT_CONFLICT'), false);
});

test('a budget display label does not create a financial conflict when all semantic fields agree', async () => {
  const result = await interpretedContext('Coffee at most CHF 30 per person', [req('BUDGET', money(), 'at most CHF 30 per person')], {
    budget: { state: 'KNOWN', amount: 30, currency: 'CHF', perPerson: true, calibrationLabel: 'budget-up-to-chf-30' },
  });
  assert.equal(result.context.unresolvedTerms.includes('BUDGET_CONTEXT_CONFLICT'), false);
});


test('provider schema excludes contradictory states and cross-dimensional values before runtime validation', () => {
  const variants = PRODUCT_MODEL_REQUIREMENTS_SCHEMA.items.anyOf;
  const city = variants.filter(v => v.properties.dimension.const === 'LOCATION');
  assert.equal(city.length, 3);
  const unsupported = city.find(v => v.properties.interpretationState.const === 'UNSUPPORTED');
  assert.deepEqual(unsupported.properties.value, { type: 'null' });
  assert.equal(unsupported.properties.alternatives.maxItems, 0);
  const understood = city.find(v => v.properties.interpretationState.const === 'UNDERSTOOD');
  assert.equal(understood.properties.value.anyOf.some(v => v.type === 'null'), false);
  assert.ok(understood.properties.value.anyOf.every(v => v.properties.kind.const === 'LOCATION'));
  assert.equal(understood.properties.origin.const, 'EXPLICIT');
  const ambiguous = city.find(v => v.properties.interpretationState.const === 'AMBIGUOUS');
  assert.equal(ambiguous.properties.alternatives.minItems, 2);
});


test('alone implies one person without inventing a family headcount', async () => {
  const solo = await interpretedContext('Coffee on my own', [req('COMPANY', { kind: 'COMPANY', size: null, adultPresent: null, companionType: 'ALONE' }, 'on my own')]);
  assert.equal(solo.context.group.size, 1);
  const family = await interpretedContext('Coffee with family', [req('COMPANY', { kind: 'COMPANY', size: null, adultPresent: null, companionType: 'FAMILY' }, 'with family')]);
  assert.equal(family.context.group.size, null);
});

test('a disclaimed access need does not become a mandatory venue constraint or an exclusion', async () => {
  for (const [text, evidence] of [['Das Café muss nicht barrierefrei sein', 'muss nicht barrierefrei sein'], ['Barrierefreiheit ist nicht nötig, ich suche Kaffee', 'Barrierefreiheit ist nicht nötig'], ['Ich brauche keinen stufenfreien Eingang im Café', 'brauche keinen stufenfreien Eingang'], ['No wheelchair access needed, just coffee', 'No wheelchair access needed']]) {
    const input = request(text, { primaryIntent: 'COFFEE' });
    const lexical = context(input, null);
    assert.equal(lexical.hardConstraints.some(c => c.startsWith('ACCESSIBILITY_')), false, text);
    const result = await interpretedContext(text, [req('ACCESS', null, evidence, { interpretationState: 'UNSUPPORTED', importance: 'HARD' })]);
    assert.equal(result.understanding.requirements.length, 0);
    assert.equal(result.context.unresolvedTerms.includes('ACCESS_REQUEST_UNRESOLVED'), false);
  }
  const explicit = context(request('No wheelchair access needed, just coffee', { primaryIntent: 'COFFEE', hardConstraints: ['ACCESSIBILITY_BASIC'] }), null);
  assert.ok(explicit.hardConstraints.includes('ACCESSIBILITY_BASIC'), 'the text helper cannot erase explicit UI constraints');
  const mixed = context(request('Barrierefreiheit ist nicht nötig, aber ein stufenfreier Eingang muss sein', { primaryIntent: 'COFFEE' }), null);
  assert.ok(mixed.hardConstraints.includes('ACCESSIBILITY_STEP_FREE'));
  assert.ok(context(request('Das Café muss nicht nur barrierefrei sein', { primaryIntent: 'COFFEE' }), null).hardConstraints.includes('ACCESSIBILITY_BASIC'));
});


test('an access disclaimer cannot delete a different or broadly quoted access requirement', async () => {
  const text = 'No wheelchair access needed, but a hearing loop is required for coffee';
  for (const evidence of ['a hearing loop is required', text]) {
    const result = await interpretedContext(text, [req('ACCESS', null, evidence, { interpretationState: 'UNSUPPORTED', importance: 'HARD' })]);
    assert.equal(result.understanding.requirements.length, 1);
    assert.ok(result.context.unresolvedTerms.includes('ACCESS_REQUEST_UNRESOLVED'));
    assert.ok(assess(result).candidates[0].unknownHardConstraints.length > 0);
  }
});


test('a different excluded day preserves the requested date without losing the exclusion', async () => {
  const result = await interpretedContext('Heute Kaffee, nicht morgen', [
    req('TIME', time({ relativeDays: 0 }), 'Heute', { importance: 'HARD' }),
    req('TIME', time({ relativeDays: 1 }), 'nicht morgen', { importance: 'HARD', operator: 'EXCLUDE' }),
  ]);
  assert.equal(result.context.dateTime.localDate, '2026-10-10');
  assert.equal(result.context.unresolvedTerms.includes('TIME_REQUEST_UNRESOLVED'), false);
  assert.equal(result.understanding.requirements.length, 2);
  assert.equal(assess(result).candidates[0].unknownHardConstraints.some(c => c.startsWith('UNDERSTANDING_')), false);
});

test('contradictory or incomplete calendar exclusions remain unresolved and block ranking', async () => {
  for (const rows of [
    [req('TIME', time({ relativeDays: 0 }), 'today', { importance: 'HARD' }), req('TIME', time({ relativeDays: 0 }), 'not today', { operator: 'EXCLUDE', importance: 'HARD' })],
    [req('TIME', time({ relativeDays: 1 }), 'not tomorrow', { operator: 'EXCLUDE', importance: 'HARD' })],
    [req('TIME', time({ relativeDays: 0 }), 'today', { importance: 'HARD' }), req('TIME', time({ relativeDays: 1, clockTime: '15:00' }), 'not tomorrow at 15:00', { operator: 'EXCLUDE', importance: 'HARD' })],
  ]) {
    const result = await interpretedContext('Coffee today, not today, not tomorrow at 15:00', rows);
    assert.ok(result.context.unresolvedTerms.includes('TIME_REQUEST_UNRESOLVED'));
    assert.ok(assess(result).candidates[0].unknownHardConstraints.some(c => c.startsWith('UNDERSTANDING_')));
  }
  const ui = await interpretedContext('Coffee today, not tomorrow', [
    req('TIME', time({ relativeDays: 0 }), 'today', { importance: 'HARD' }),
    req('TIME', time({ relativeDays: 1 }), 'not tomorrow', { importance: 'HARD', operator: 'EXCLUDE' }),
  ], { dateTime: { state: 'KNOWN', localDate: '2026-10-11', dayPhase: null, timeZone: 'Europe/Zurich' } });
  assert.equal(ui.context.dateTime.localDate, '2026-10-11');
  assert.ok(ui.context.unresolvedTerms.includes('TIME_CONTEXT_CONFLICT'));
  assert.ok(assess(ui).candidates[0].unknownHardConstraints.some(c => c.startsWith('UNDERSTANDING_')));
});

test('structured quiet exclusion cannot recreate positive quiet mood through text fallback', async () => {
  const result = await interpretedContext('Kaffee, ruhig passt mir heute gar nicht', [req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'ruhig passt mir heute gar nicht', { operator: 'EXCLUDE' })]);
  assert.equal(result.context.softPreferences.includes('ATMOSPHERE_QUIET'), false);
  assert.equal(result.context.moods.includes('CALM'), false);
  assert.equal(assess(result, [fact('context.atmosphere', [{ atmosphere: 'QUIET', conditions }])]).candidates[0].tier, 'INELIGIBLE');
});

test('waiting time stays distinct from travel, survives cold/warm cache, and cannot rank as verified', async () => {
  const text = 'Coffee, I cannot wait more than ten minutes';
  const rows = [req('WAITING', { kind: 'WAITING', maximumMinutes: 10, comparison: 'LTE' }, 'cannot wait more than ten minutes', { importance: 'HARD' })];
  const h = harness(rows); const cold = await h.run(request(text)); const warm = await h.run(request(text));
  assert.deepEqual(cold, warm); assert.equal(h.fetches(), 1);
  assert.equal(cold.understanding.requirements[0].dimension, 'WAITING');
  assert.deepEqual(decodeRequirementCache(encodeRequirementCache(cold.understanding.requirements)), cold.understanding.requirements);
  const result = { ...cold, context: context(cold.request, cold.understanding) };
  assert.ok(result.context.unresolvedTerms.includes('WAITING_REQUEST_UNRESOLVED'));
  assert.ok(assess(result).candidates[0].unknownHardConstraints.some(v => v.startsWith('UNDERSTANDING_')));
  assert.equal(result.context.unresolvedTerms.includes('MOBILITY_REQUEST_UNRESOLVED'), false);
  assert.throws(() => parseModelRequirements([req('MOBILITY', { kind: 'MOBILITY', maximumMeters: null, maximumMinutes: 10, mode: 'UNSPECIFIED' }, 'cannot wait more than ten minutes')], text), /waiting_not_mobility/);
  assert.doesNotThrow(() => parseModelRequirements([req('MOBILITY', { kind: 'MOBILITY', maximumMeters: null, maximumMinutes: 10, mode: 'WALK' }, 'walk ten minutes')], 'I can walk ten minutes'));
});

test('a birthday is not a group minimum age; actual participant ages remain accepted', () => {
  assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [40] }, '40. Geburtstag')], 'Wir feiern einen 40. Geburtstag'), /birthday_not_group_age/);
  assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [40] }, '40th birthday')], 'A 40th birthday dinner'), /age_not_grounded/);
  const rows = parseModelRequirements([req('AGE', { kind: 'AGE', ages: [15] }, 'I am 15')], 'I am 15, looking for a sauna');
  assert.equal(rows[0].value.minimumAge, 15);
});

test('empty time and mobility values and invented years are rejected before persistence', () => {
  assert.throws(() => parseModelRequirements([req('TIME', time(), 'not now')], 'Coffee tomorrow, not now'), /time_empty/);
  assert.throws(() => parseModelRequirements([req('TIME', time({ localDate: '2025-02-11' }), 'today')], 'Lunch today'), /date_year_not_grounded/);
  assert.throws(() => parseModelRequirements([req('MOBILITY', { kind: 'MOBILITY', maximumMeters: null, maximumMinutes: null, mode: 'UNSPECIFIED' }, 'nearby')], 'Coffee nearby'), /mobility_empty/);
  assert.doesNotThrow(() => parseModelRequirements([req('TIME', time({ localDate: '2026-10-17' }), '17 October 2026')], 'Coffee on 17 October 2026'));
  assert.throws(() => parseModelRequirements([req('TIME', time({ monthDay: '02-30' }), '30 February')], 'Coffee 30 February'), /month_day_invalid/);
});

test('yearless dates resolve against server time, preserving leap days and exact stated month/day', async () => {
  for (const [text, monthDay, expected] of [['Coffee 17 October', '10-17', '2026-10-17'], ['Coffee 3 January', '01-03', '2027-01-03'], ['Coffee 29 February', '02-29', '2028-02-29']]) {
    const result = await interpretedContext(text, [req('TIME', time({ monthDay }), text, { importance: 'HARD' })]);
    assert.equal(result.context.dateTime.localDate, expected);
    assert.equal(result.understanding.requirements[0].value.monthDay, monthDay);
    assert.equal(result.understanding.requirements[0].value.localDate, null);
  }
  const today = await interpretedContext('Lunch today', [req('TIME', time({ relativeDays: 0 }), 'today')]);
  assert.equal(today.context.dateTime.localDate, '2026-10-10');
});

test('clock relations survive persistence without claiming exact-time eligibility', async () => {
  for (const [phrase, relation] of [['after 18:00', 'AFTER'], ['finished by 18:00', 'END_NOT_AFTER'], ['start no earlier than 18:00', 'START_NOT_BEFORE']]) {
    const result = await interpretedContext(`Coffee ${phrase}`, [req('TIME', time({ clockTime: '18:00', clockRelation: relation }), phrase, { importance: 'HARD' })]);
    assert.equal(result.understanding.requirements[0].value.clockRelation, relation);
    assert.deepEqual(decodeRequirementCache(encodeRequirementCache(result.understanding.requirements)), result.understanding.requirements);
    assert.ok(result.context.unresolvedTerms.includes('PRECISE_TIME_UNVERIFIED'));
    assert.ok(assess(result).candidates[0].unknownHardConstraints.some(v => v.startsWith('UNDERSTANDING_')));
  }
});

test('conditional permission is retained without requiring indoors, including on cache hits', async () => {
  const text = 'Eine Terrasse wäre schön. Bei Regen geht auch drinnen.';
  const rows = [req('SETTING', { kind: 'SETTING', environment: 'INDOOR' }, 'Bei Regen geht auch drinnen', { condition: 'RAIN', operator: 'ALLOW', importance: 'PREFERRED' })];
  const h = harness(rows); const cold = await h.run(request(text)); const warm = await h.run(request(text));
  assert.deepEqual(cold, warm); assert.equal(h.fetches(), 1);
  assert.equal(cold.request.explicit.hardConstraints.includes('INDOOR_REQUIRED'), false);
  assert.equal(cold.understanding.requirements[0].condition, 'RAIN');
  assert.equal(cold.understanding.requirements[0].operator, 'ALLOW');
  assert.deepEqual(decodeRequirementCache(encodeRequirementCache(cold.understanding.requirements)), cold.understanding.requirements);
  assert.throws(() => parseModelRequirements([{ ...rows[0], importance: 'HARD' }], text), /allow_strength_invalid/);
  const ui = await interpretedContext(text, rows, { hardConstraints: ['INDOOR_REQUIRED'] });
  assert.ok(ui.request.explicit.hardConstraints.includes('INDOOR_REQUIRED'));
});

test('conditional hard wishes stay unverified and cannot leak as unconditional quiet preferences', async () => {
  const text = 'If it rains, it must be quiet';
  const result = await interpretedContext(text, [req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, text, { condition: 'RAIN', importance: 'HARD' })]);
  assert.equal(result.context.softPreferences.some(v => v.includes('QUIET')), false);
  assert.equal(result.context.moods.includes('CALM'), false);
  assert.ok(assess(result).candidates[0].unknownHardConstraints.some(v => v.startsWith('UNDERSTANDING_')));
});

test('unconditional indoor requirements use verified venue evidence without blocking all known indoor places', async () => {
  const result = await interpretedContext('Coffee, must be indoors', [req('SETTING', { kind: 'SETTING', environment: 'INDOOR' }, 'must be indoors', { importance: 'HARD' })]);
  assert.ok(result.request.explicit.hardConstraints.includes('INDOOR_REQUIRED'));
  assert.equal(result.context.unresolvedTerms.includes('SETTING_REQUEST_UNRESOLVED'), false);
  const candidate = assess(result).candidates[0];
  assert.equal(candidate.unknownHardConstraints.some(v => v.startsWith('UNDERSTANDING_SETTING_') || v.startsWith('UNDERSTANDING_UNRESOLVED_')), false);
});


test('indoor/outdoor alternatives stay grouped without inventing an unconditional indoor restriction', async () => {
  for (const importance of ['HARD', 'ESSENTIAL']) {
    const result = await interpretedContext('Coffee either indoors or outdoors', [
      req('SETTING', { kind: 'SETTING', environment: 'INDOOR' }, 'indoors', { importance, group: 'R1' }),
      req('SETTING', { kind: 'SETTING', environment: 'OUTDOOR' }, 'outdoors', { importance, group: 'R1' }),
    ]);
    assert.equal(result.request.explicit.hardConstraints.includes('INDOOR_REQUIRED'), false);
    assert.ok(result.context.unresolvedTerms.includes('SETTING_REQUEST_UNRESOLVED'));
    assert.deepEqual(result.understanding.requirements.map(r => r.group), ['R1', 'R1']);
    const candidate = assess(result).candidates[0];
    assert.equal(candidate.confirmedHardConstraints.some(v => v.startsWith('UNDERSTANDING_SETTING_')), false);
    assert.equal(candidate.failedHardConstraints.some(v => v.startsWith('UNDERSTANDING_SETTING_')), false);
    if (importance === 'HARD') assert.ok(candidate.unknownHardConstraints.some(v => v.startsWith('UNDERSTANDING_UNRESOLVED_')));
    assert.notEqual(candidate.tier, 'ELIGIBLE_CONFIRMED');
  }
});

test('conditional exclusions cannot suppress an independent unconditional positive preference', async () => {
  const result = await interpretedContext('Usually quiet, but not quiet if it rains', [
    req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'Usually quiet', { importance: 'PREFERRED' }),
    req('ATMOSPHERE', { kind: 'FACET', key: 'context.atmosphere', value: 'QUIET' }, 'not quiet if it rains', { importance: 'HARD', operator: 'EXCLUDE', condition: 'RAIN' }),
  ]);
  assert.ok(result.request.explicit.softPreferences.includes('WK:context.atmosphere:QUIET'));
  assert.ok(assess(result).candidates[0].unknownHardConstraints.some(v => v.startsWith('UNDERSTANDING_UNRESOLVED_')));
});

test('known needs, duration, references and price components survive cold cache, warm cache and public transport', async () => {
  const needs = ['HALAL', 'DAIRY_FREE', 'LACTOSE_FREE', 'DOG_ACCESS', 'STEP_FREE_ROUTE', 'CHANGING_TABLE', 'GUIDED_TOUR', 'BOAT_RIDE', 'POTTERY', 'DANCING', 'SEATING'];
  const { validateDecisionProductRequirements } = await import('../../../../mobile/packages/product-decision-contract/src/index.mjs');
  for (const code of needs) {
    const value = { kind: 'NEED', code, scope: 'ONE_PERSON', ...(code === 'DOG_ACCESS' ? { accessArea: 'OUTDOOR_ONLY_ACCEPTABLE' } : {}) };
    const dimension = ['HALAL', 'DAIRY_FREE', 'LACTOSE_FREE'].includes(code) ? 'OFFERING' : ['GUIDED_TOUR', 'BOAT_RIDE', 'POTTERY', 'DANCING'].includes(code) ? 'EXPERIENCE' : 'ACCESS';
    const rows = [req(dimension, value, code, { importance: 'HARD', operator: ['GUIDED_TOUR', 'BOAT_RIDE'].includes(code) ? 'EXCLUDE' : 'REQUIRE' })];
    const input = request(`Coffee ${code}`); const h = harness(rows); const cold = await h.run(input); const warm = await h.run(input);
    assert.deepEqual(cold, warm); assert.equal(h.fetches(), 1);
    const projected = context(cold.request, cold.understanding);
    assert.deepEqual(projected.requirements[0].value, value);
    validateDecisionProductRequirements(projected.requirements);
    assert.notEqual(assess(cold).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
    assert.ok(assess(cold).candidates[0].unknownHardConstraints.length > 0);
  }
  const rows = [req('DURATION', { kind: 'DURATION', minutes: 90, length: null }, '90 Minuten'), req('BUDGET', money({ amountMinor: 4550, basis: 'TOTAL', includes: ['MATERIALS', 'TIP'] }), '45.50 CHF insgesamt mit Material und Trinkgeld'), req('TIME', time({ clockTime: '18:30', clockRelation: 'END_NOT_AFTER', reference: { name: 'Bahnhof Luzern', city: 'Luzern', relation: 'RETURN_TO' } }), '18:30 zurück am Bahnhof Luzern')];
  const text = '90 Minuten, 45.50 CHF insgesamt mit Material und Trinkgeld, 18:30 zurück am Bahnhof Luzern';
  const h = harness(rows); const cold = await h.run(request(text)); assert.deepEqual(await h.run(request(text)), cold);
  const projected = context(cold.request, cold.understanding);
  assert.equal(projected.budget.amount, 45.5); assert.equal(projected.budget.perPerson, false);
  assert.equal(projected.requirements[0].value.minutes, 90);
  assert.deepEqual(projected.requirements[1].value.includes, ['MATERIALS', 'TIP']);
  assert.equal(projected.requirements[2].value.reference.kind, 'RAIL_STATION');
  assert.equal(projected.requirements[2].value.reference.referenceHash, contentHash({ text, name: 'Bahnhof Luzern' }));
  assert.equal(Object.hasOwn(projected.requirements[2].value.reference, 'name'), false);
  assert.equal(projected.dateTime.localDate, null);
  validateDecisionProductRequirements(projected.requirements);
  assert.notEqual(assess(cold).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
  const cached = JSON.stringify([...h.records.values()]); assert.ok(!cached.includes(text)); assert.ok(!cached.includes('evidence'));
  assert.throws(() => validateDecisionProductRequirements([{ ...projected.requirements[0], evidence: text }]));
});

test('requested destinations support public city names while origins and POIs do not redirect retrieval', async () => {
  const { requestedProductCity } = await import('../../dist/index.js');
  for (const city of ['Aarau', 'Zug', 'Thun', 'Baden', 'Chur', 'Solothurn', 'St. Gallen', 'Genève', 'Albula/Alvra']) {
    const input = request(`Coffee in ${city}`); const u = bindProductUnderstanding(input, parseModelRequirements([req('LOCATION', { kind: 'LOCATION', city }, city)], input.naturalLanguage));
    const destination = requestedProductCity(u, input);
    const projected = resolveDecisionProductContext(input, { authorizedCity: destination, serverTime: at }, u);
    assert.equal(projected.targetCity, destination); assert.equal(projected.locationAuthority.state, 'KNOWN');
    assert.equal(projected.requirements[0].value.city, city);
  }
  const input = request('Von Basel nach Zürich, beim Riffraff');
  const u = bindProductUnderstanding(input, parseModelRequirements([
    req('LOCATION', { kind: 'LOCATION', city: 'Basel', role: 'ORIGIN' }, 'Von Basel'),
    req('LOCATION', { kind: 'LOCATION', city: 'Zürich', reference: { name: 'Riffraff', city: null, relation: 'NEAR' } }, 'Zürich, beim Riffraff'),
  ], input.naturalLanguage));
  assert.equal(requestedProductCity(u, input), 'Zurich');
  const projected = resolveDecisionProductContext(input, { authorizedCity: 'Zurich', serverTime: at }, u);
  assert.ok(projected.unresolvedTerms.includes('LOCATION_REQUEST_UNVERIFIED'));
  const ui = { ...input, explicit: { targetCity: 'Basel' } };
  assert.equal(requestedProductCity(bindProductUnderstanding(ui, u.requirements), ui), 'Basel');
});

test('same-visit time bounds preserve the calendar and event while conflicting now and tomorrow cannot merge', async () => {
  const result = await interpretedContext('Coffee morgen ab 18 Uhr nach Check-in bis 20 Uhr', [
    req('TIME', time({ relativeDays: 1, clockTime: '18:00', clockRelation: 'START_NOT_BEFORE', event: { event: 'CHECK_IN', relation: 'AFTER' } }), 'morgen ab 18 Uhr nach Check-in', { importance: 'HARD' }),
    req('TIME', time({ clockTime: '20:00', clockRelation: 'END_NOT_AFTER' }), 'bis 20 Uhr', { importance: 'HARD' }),
  ]);
  assert.equal(result.context.dateTime.localDate, '2026-10-11');
  assert.equal(result.context.requirements[0].value.event.event, 'CHECK_IN');
  assert.equal(result.context.requirements[1].value.clockRelation, 'END_NOT_AFTER');
  assert.ok(result.context.unresolvedTerms.includes('PRECISE_TIME_UNVERIFIED'));
  const conflict = await interpretedContext('Coffee jetzt und morgen', [req('TIME', time({ openNow: true }), 'jetzt', { importance: 'HARD' }), req('TIME', time({ relativeDays: 1 }), 'morgen', { importance: 'HARD' })]);
  assert.ok(conflict.context.unresolvedTerms.includes('TIME_REQUEST_UNRESOLVED'));
  assert.ok(assess(conflict).candidates[0].unknownHardConstraints.length > 0);
});

test('negative time phases never reappear through literal fallback; unknown adults and dates remain unknown', async () => {
  const result = await interpretedContext('Coffee morgen, aber nicht am Abend', [req('TIME', time({ relativeDays: 1 }), 'morgen'), req('TIME', time({ dayPhase: 'EVENING' }), 'nicht am Abend', { operator: 'EXCLUDE' })]);
  assert.equal(result.context.dateTime.dayPhase, null);
  const unspecified = await interpretedContext('Coffee mit Freunden', [req('COMPANY', { kind: 'COMPANY', size: null, adultPresent: null, companionType: 'FRIENDS_GROUP' }, 'mit Freunden')]);
  assert.equal(unspecified.context.group.adultPresent, null); assert.equal(unspecified.context.dateTime.state, 'UNKNOWN');
  const adults = await interpretedContext('Coffee, alle 30 Jahre alt', [req('AGE', { kind: 'AGE', ages: [30] }, 'alle 30 Jahre alt')]);
  assert.equal(adults.context.group.adultPresent, true);
});

test('strict fractional ceilings and ambiguous basis preserve meaning without false price confirmation', async () => {
  const price = [fact('operation.price_range', { currency: 'CHF', min: 10, max: 29.5 })];
  for (const comparison of ['LT', 'LTE']) {
    const result = await interpretedContext('Coffee 29.50 CHF pro Person', [req('BUDGET', money({ amountMinor: 2950, comparison }), '29.50 CHF pro Person', { importance: 'HARD' })]);
    const candidate = assess(result, price).candidates[0];
    assert.equal(result.context.budget.amount, 29.5);
    assert.ok((comparison === 'LT' ? candidate.failedHardConstraints : candidate.confirmedHardConstraints).includes('BUDGET_MAXIMUM'));
  }
  const ambiguous = await interpretedContext('Coffee höchstens 30 CHF', [req('BUDGET', null, 'höchstens 30 CHF', { interpretationState: 'AMBIGUOUS', alternatives: [money(), money({ basis: 'TOTAL' })] })]);
  assert.equal(ambiguous.context.budget.amount, 30); assert.equal(ambiguous.context.budget.perPerson, null);
  assert.ok(assess(ambiguous, price).candidates[0].unknownHardConstraints.includes('BUDGET_MAXIMUM'));
});

test('production retrieval requests the understood destination and still rejects mismatched scoped World data', async () => {
  const result = await interpretedContext('Coffee in St. Gallen', [req('LOCATION', { kind: 'LOCATION', city: 'St. Gallen' }, 'St. Gallen')]);
  let calls = 0;
  const provider = createDecisionProductRpcEvaluationProvider({ async rpc(_name, parameters) {
    calls++; assert.equal(parameters.p_target_city, 'St. Gallen');
    const binding = structuredClone(worldBinding());
    binding.decisionProjection.facts.find(f => f.key === 'location.locality').value = 'St. Gallen';
    return { data: { contractVersion: 'backyrd.decision-vnext.product-runtime-context@1.0', authorizedCity: 'St. Gallen', serverTime: at, worldSnapshots: [binding], status: 'NO_CONSENT', consent: null, snapshot: null }, error: null };
  } });
  const evaluated = await provider.evaluate({ request: result.request, understanding: result.understanding, actor, identity, signal: new AbortController().signal });
  assert.equal(evaluated.evaluation.interpretation.targetCity, 'St. Gallen');
  assert.equal(evaluated.presentations[0].locality, 'St. Gallen'); assert.equal(calls, 1);
  assert.throws(() => parseProductWorldResolverBinding(worldBinding(), 'St. Gallen'), /locality_invalid/);
});

test('unverified place labels including private addresses never cross cache or public requirements as plaintext', async () => {
  const text = 'Coffee nahe meiner Wohnung an der Musterstrasse 17 in Basel';
  const rows = [req('LOCATION', { kind: 'LOCATION', city: 'Basel', reference: { name: 'Musterstrasse 17', city: 'Basel', relation: 'NEAR' } }, text)];
  const h = harness(rows); const result = await h.run(request(text));
  assert.deepEqual(await h.run(request(text)), result);
  const projected = context(result.request, result.understanding);
  const ref = projected.requirements[0].value.reference;
  assert.equal(ref.kind, 'UNRESOLVED_PLACE'); assert.equal(ref.referenceHash, contentHash({ text, name: 'Musterstrasse 17' }));
  assert.doesNotMatch(JSON.stringify([...h.records.values()]), /Musterstrasse|Wohnung|evidence/);
  assert.doesNotMatch(JSON.stringify(projected), /Musterstrasse|Wohnung|evidence/);
  const { validateDecisionProductRequirements } = await import('../../../../mobile/packages/product-decision-contract/src/index.mjs');
  validateDecisionProductRequirements(projected.requirements);
  const forged = structuredClone(projected.requirements); forged[0].value.reference.name = 'Musterstrasse 17';
  assert.throws(() => validateDecisionProductRequirements(forged));
  assert.throws(() => decodeRequirementCache(encodeRequirementCache(forged)));
  assert.notEqual(assess(result).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
});

test('free city slots cannot bypass place privacy; unsupported municipalities remain explicitly unresolved', async () => {
  const text = 'Coffee bei Musterstrasse 17';
  const result = await interpretedContext(text, [req('LOCATION', { kind: 'LOCATION', city: 'Musterstrasse 17', reference: { name: 'Musterstrasse 17', city: 'Musterstrasse 17', relation: 'NEAR' } }, text)]);
  const value = result.context.requirements[0].value;
  assert.equal(value.city, null); assert.equal(value.reference.city, null);
  assert.equal(value.cityHash, contentHash({ text, name: 'Musterstrasse 17' }));
  assert.doesNotMatch(JSON.stringify(encodeRequirementCache(result.understanding.requirements)), /Musterstrasse/);
  assert.ok(result.context.unresolvedTerms.includes('LOCATION_REQUEST_UNVERIFIED'));
  const forged = structuredClone(result.understanding.requirements); forged[0].value.reference.city = 'Musterstrasse 17';
  assert.throws(() => decodeRequirementCache(encodeRequirementCache(forged)), /city_not_public/);
  const { isPublicMunicipality } = await import('../../dist/product-public-municipalities.js');
  for (const city of ['Basel', 'Zürich', 'Genève', 'Geneva', 'Luzern', 'St. Gallen', 'Biel/Bienne', 'Aarau', 'Thun', 'Baden', 'Solothurn', 'Zug', 'Chur']) assert.equal(isPublicMunicipality(city), true, city);
  for (const privateText of ['Musterstrasse 17', 'Jane Doe', 'Coffee with my daughter in Basel']) assert.equal(isPublicMunicipality(privateText), false);
});

test('concrete needs have one owning dimension in provider output, validation and cache replay', () => {
  const ownership = { ACCESS: ['DOG_ACCESS', 'STEP_FREE_ENTRANCE', 'STEP_FREE_ROUTE', 'CHANGING_TABLE', 'SEATING'], OFFERING: ['HALAL', 'DAIRY_FREE', 'LACTOSE_FREE', 'VEGAN', 'VEGETARIAN', 'ALCOHOL_FREE'], EXPERIENCE: ['GUIDED_TOUR', 'BOAT_RIDE', 'RIVERSIDE_WALK', 'POTTERY', 'DANCING'] };
  const variants = PRODUCT_MODEL_REQUIREMENTS_SCHEMA.items.anyOf;
  assert.deepEqual(variants.filter(v => v.properties.dimension.const === 'OTHER').map(v => v.properties.interpretationState.const), ['UNSUPPORTED']);
  for (const [dimension, codes] of Object.entries(ownership)) {
    const branch = variants.find(v => v.properties.dimension.const === dimension && v.properties.interpretationState.const === 'UNDERSTOOD');
    const need = branch.properties.value.anyOf.find(v => v.properties.kind.const === 'NEED');
    assert.deepEqual([...need.properties.code.enum].sort(), [...codes].sort());
    for (const code of codes) {
      const value = { kind: 'NEED', code, scope: 'UNSPECIFIED' };
      const good = parseModelRequirements([req(dimension, value, 'synthetic requirement')], 'synthetic requirement');
      assert.deepEqual(decodeRequirementCache(encodeRequirementCache(good)), good);
      for (const wrong of ['OTHER', ...Object.keys(ownership).filter(d => d !== dimension)]) {
        assert.throws(() => parseModelRequirements([req(wrong, value, 'synthetic requirement')], 'synthetic requirement'), /need_dimension_invalid/);
        assert.throws(() => decodeRequirementCache([[wrong, 'ESSENTIAL', 'REQUIRE', 'EXPLICIT', 'UNDERSTOOD', value, [], null]]), /need_dimension_invalid/);
      }
    }
  }
});

test('conditional outdoor preference and independent step-free need retain different meaning through cold and warm cache', async () => {
  const text = 'A step-free entrance is essential. Outdoors if dry would be nice; otherwise indoors is fine.';
  const rows = [
    req('ACCESS', { kind: 'NEED', code: 'STEP_FREE_ENTRANCE', scope: 'UNSPECIFIED' }, 'A step-free entrance is essential.', { importance: 'HARD' }),
    req('SETTING', { kind: 'SETTING', environment: 'OUTDOOR' }, 'Outdoors if dry would be nice', { importance: 'PREFERRED', condition: 'DRY' }),
    req('SETTING', { kind: 'SETTING', environment: 'INDOOR' }, 'otherwise indoors is fine', { importance: 'PREFERRED', operator: 'ALLOW', condition: 'RAIN' }),
  ];
  const h = harness(rows); const input = request(text);
  const cold = await h.run(input); const warm = await h.run(input);
  assert.deepEqual(warm, cold); assert.equal(h.fetches(), 1);
  const projected = context(warm.request, warm.understanding);
  assert.deepEqual(projected.requirements, cold.understanding.requirements);
  assert.equal(projected.requirements[0].condition, undefined);
  assert.equal(projected.requirements[1].value.environment, 'OUTDOOR');
  assert.equal(projected.hardConstraints.includes('INDOOR_REQUIRED'), false);
  const invalid = req('OTHER', { kind: 'NEED', code: 'STEP_FREE_ENTRANCE', scope: 'UNSPECIFIED' }, 'Outdoors if dry would be nice', { importance: 'PREFERRED', condition: 'DRY' });
  assert.throws(() => parseModelRequirements([invalid], text), /need_dimension_invalid/);
});

test('not needing a step-free entrance cannot become a hard constraint, while separate positive requests and UI values survive', async () => {
  const disclaimer = 'Ein stufenloser Eingang ist nicht nötig';
  const result = await interpretedContext(`Kaffee in Thun. ${disclaimer}.`, [req('ACCESS', null, disclaimer, { importance: 'PREFERRED', operator: 'EXCLUDE', interpretationState: 'UNSUPPORTED' })]);
  assert.equal(result.understanding.requirements.length, 0);
  assert.equal(result.context.hardConstraints.includes('ACCESSIBILITY_STEP_FREE'), false);
  assert.equal(result.context.hardConstraints.includes('ACCESSIBILITY_BASIC'), false);
  const mixed = context(request(`${disclaimer}, aber ein stufenloser Hintereingang ist Pflicht.`), null);
  assert.ok(mixed.hardConstraints.includes('ACCESSIBILITY_STEP_FREE'));
  const explicit = context(request(disclaimer, { hardConstraints: ['ACCESSIBILITY_STEP_FREE'] }), null);
  assert.ok(explicit.hardConstraints.includes('ACCESSIBILITY_STEP_FREE'));
});

test('a typical-daypart preference cannot manufacture a requested visit time', () => {
  const inferred = context(request('Kaffee in Thun', { softPreferences: ['WK:context.typical_dayparts:MORNING'] }), null);
  assert.equal(inferred.dateTime.dayPhase, null);
  const literal = context(request('Kaffee heute Abend', { softPreferences: ['WK:context.typical_dayparts:MORNING'] }), null);
  assert.equal(literal.dateTime.dayPhase, 'EVENING');
});


test('current age remains valid beside a birthday while bare birthday numbers remain rejected', async () => {
  for (const text of ['Ich bin 17, mein Geburtstag ist nächste Woche.', "I am 17, my birthday is next week.", 'Mein Geburtstag ist nächste Woche, bin jetzt noch 17.']) {
    const h = harness([req('AGE', { kind: 'AGE', ages: [17] }, text, { importance: 'HARD' })]);
    const cold = await h.run(request(text)); const warm = await h.run(request(text));
    assert.deepEqual(warm, cold); assert.equal(h.fetches(), 1);
    assert.equal(context(cold.request, cold.understanding).group.minimumAge, 17);
    assert.equal(JSON.stringify([...h.records.values()]).includes(text), false);
  }
  for (const text of ['Ich werde 17 an meinem Geburtstag.', 'Ich war 17 an meinem Geburtstag.', 'Ich bin nicht 17, mein Geburtstag ist nächste Woche.', 'Ich bin 17 Minuten entfernt, heute ist mein Geburtstag.', 'Ich bin 18, mein 17. Geburtstag war letztes Jahr.']) {
    assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [17] }, text)], text), /birthday_not_group_age/);
  }
});

test('specific meals survive generic intent, cold/warm cache and public validation', async () => {
  const { validateDecisionProductRequirements } = await import('../../../../mobile/packages/product-decision-contract/src/index.mjs');
  const text = 'Déjeuner à Thun';
  const row = req('OFFERING', { kind: 'FACET', key: 'offering.groups', value: 'LUNCH' }, 'Déjeuner');
  const h = harness([row]); const cold = await h.run(request(text)); const warm = await h.run(request(text));
  assert.deepEqual(cold, warm); assert.equal(h.fetches(), 1);
  const projected = context(cold.request, cold.understanding);
  assert.equal(projected.requirements[0].value.value, 'LUNCH');
  validateDecisionProductRequirements(projected.requirements);
});


test('a nightclub name never invents a requested night, while literal night remains supported', async () => {
  for (const text of ['Wir wollen tanzen, ein Nachtclub ist dafür nicht nötig.', 'A nightclub with somewhere to sit.', 'Ein Nachtclub in Thun.']) {
    const result = await interpretedContext(text, []);
    assert.equal(result.context.dateTime.dayPhase, null);
  }
  for (const text of ['Heute Nacht tanzen.', 'Nachts tanzen.', 'Dancing tonight.', 'Dancing at night.', 'Dancing at nighttime.']) {
    const result = await interpretedContext(text, []);
    assert.equal(result.context.dateTime.dayPhase, 'NIGHT');
  }
  const explicit = { dateTime: { state: 'UNKNOWN', localDate: null, dayPhase: 'AFTERNOON', timeZone: 'Europe/Zurich' } };
  assert.equal((await interpretedContext('A nightclub.', [], explicit)).context.dateTime.dayPhase, 'AFTERNOON');
});


test('a mixed typed OR never makes its concert branch mandatory in retrieval or eligibility', async () => {
  const text = 'Am Abend entweder tanzen oder ein Konzert besuchen.';
  const concert = { kind: 'FACET', key: 'classification.place_types', value: 'CONCERT_VENUE' };
  const overrides = { primaryIntent: 'ACTIVITY_EXPERIENCE' };
  for (const importance of ['HARD', 'ESSENTIAL']) {
    const rows = [
      req('EXPERIENCE', { kind: 'NEED', code: 'DANCING', scope: 'UNSPECIFIED' }, 'tanzen', { group: 'R1', importance }),
      req('EXPERIENCE', concert, 'ein Konzert besuchen', { group: 'R1', importance }),
    ];
    const h = harness(rows, overrides); const cold = await h.run(request(text)); const warm = await h.run(request(text));
    assert.deepEqual(cold, warm); assert.equal(h.fetches(), 1);
    assert.deepEqual(cold.request.explicit.hardConstraints, []);
    assert.ok(cold.request.explicit.unresolvedTerms.includes('OTHER_CORE_NEED_UNMAPPED'));
    assert.deepEqual(cold.understanding.requirements.map(r => r.group), ['R1', 'R1']);
    const candidate = assess(cold).candidates[0];
    assert.equal(candidate.failedHardConstraints.some(c => c.startsWith('UNDERSTANDING_REQUIREMENT_')), false);
    assert.notEqual(candidate.tier, 'ELIGIBLE_CONFIRMED');
    const preferred = await harness([...rows, req('EXPERIENCE', concert, 'ein Konzert besuchen', { importance: 'PREFERRED' })], overrides).run(request(text));
    assert.deepEqual(preferred.request.explicit.hardConstraints, [], 'preferring one alternative does not require it');
    const independent = await harness([...rows, req('EXPERIENCE', concert, 'ein Konzert besuchen', { importance: 'HARD' })], overrides).run(request(text));
    assert.ok(independent.request.explicit.hardConstraints.some(c => c.includes('classification.place_types:CONCERT_VENUE')));
    const ui = await h.run(request(text, { hardConstraints: ['WK_REQUIRED:UI:classification.place_types:CONCERT_VENUE'] }));
    assert.ok(ui.request.explicit.hardConstraints.includes('WK_REQUIRED:UI:classification.place_types:CONCERT_VENUE'));
  }
});


test('mixed alternatives do not weaken a known explicit exclusion', async () => {
  const text = 'Neither dancing nor a cafe.';
  const rows = [
    req('EXPERIENCE', { kind: 'NEED', code: 'DANCING', scope: 'UNSPECIFIED' }, 'dancing', { group: 'R1', operator: 'EXCLUDE', importance: 'HARD' }),
    req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'CAFE' }, 'a cafe', { group: 'R1', operator: 'EXCLUDE', importance: 'HARD' }),
  ];
  const result = await interpretedContext(text, rows);
  assert.ok(assess(result).candidates[0].failedHardConstraints.some(c => c.startsWith('UNDERSTANDING_REQUIREMENT_')));
});


test('late dayphase stays qualified through cache and public context without inventing a clock time', async () => {
  const input = request('Coffee late afternoon');
  const h = harness([req('TIME', time({ dayPhase: 'AFTERNOON', phasePosition: 'LATE' }), 'late afternoon')]);
  const cold = await h.run(input); const warm = await h.run(input);
  assert.deepEqual(cold, warm);
  const resolved = context(cold.request, cold.understanding);
  const { validateDecisionProductRequirements } = await import('../../../../mobile/packages/product-decision-contract/src/index.mjs');
  validateDecisionProductRequirements(resolved.requirements);
  assert.equal(resolved.requirements[0].value.phasePosition, 'LATE');
  assert.equal(resolved.requirements[0].value.clockTime, null);
  assert.ok(resolved.unresolvedTerms.includes('PRECISE_TIME_UNVERIFIED'));
  assert.throws(() => parseModelRequirements([req('TIME', time({ relativeDays: 1, phasePosition: 'LATE' }), 'tomorrow')], 'tomorrow'), /phase_position_invalid/);
});


test('seating is independent of an accessibility disclaimer and never proves step-free access', async () => {
  const result = await interpretedContext('Coffee with somewhere to sit, no wheelchair access needed', [
    req('ACCESS', { kind: 'NEED', code: 'SEATING', scope: 'UNSPECIFIED' }, 'somewhere to sit', { importance: 'HARD' }),
  ]);
  const projected = context(result.request, result.understanding);
  assert.equal(projected.requirements[0].value.code, 'SEATING');
  assert.ok(projected.unresolvedTerms.includes('NEED_SEATING_UNVERIFIED'));
  assert.equal(projected.hardConstraints.includes('ACCESSIBILITY_STEP_FREE'), false);
  assert.notEqual(assess(result).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
});


test('declining lunch does not veto a cafe merely for also serving lunch', async () => {
  const result = await interpretedContext('Coffee, no lunch', [req('OFFERING', { kind: 'FACET', key: 'offering.groups', value: 'LUNCH' }, 'no lunch', { operator: 'EXCLUDE', importance: 'HARD' })]);
  const evaluated = assess(result, [fact('offering.groups', ['COFFEE', 'LUNCH'])]);
  assert.notEqual(evaluated.candidates[0].tier, 'INELIGIBLE');
  assert.notEqual(evaluated.candidates[0].tier, 'ELIGIBLE_CONFIRMED');
  assert.ok(evaluated.candidates[0].unknownHardConstraints.some(code => code.startsWith('UNDERSTANDING_REQUIREMENT_')));
  assert.equal(evaluated.candidates[0].failedHardConstraints.length, 0);
  assert.equal(result.understanding.requirements[0].operator, 'EXCLUDE');
});


test('reference city can be grounded in request context while names and invented cities still fail closed', () => {
  const text = 'Coffee in Baden, ten minutes from the station';
  const row = req('MOBILITY', { kind: 'MOBILITY', maximumMeters: null, maximumMinutes: 10, mode: 'WALK', reference: { name: 'station', city: 'Baden', relation: 'NEAR' } }, 'ten minutes from the station');
  assert.equal(parseModelRequirements([row], text)[0].value.reference.city, 'Baden');
  for (const ref of [{ name: 'station', city: 'Zürich', relation: 'NEAR' }, { name: 'invented station', city: 'Baden', relation: 'NEAR' }]) {
    assert.throws(() => parseModelRequirements([{ ...row, value: { ...row.value, reference: ref } }], text), /place_not_grounded/);
  }
});


test('a persons name containing a municipality is not a global reference-city mention', () => {
  const row = req('MOBILITY', { kind: 'MOBILITY', maximumMeters: null, maximumMinutes: 10, mode: 'WALK', reference: { name: 'Bahnhof', city: 'Bern', relation: 'NEAR' } }, 'zehn Gehminuten vom Bahnhof');
  assert.throws(() => parseModelRequirements([row], 'Mit Bernhard einen Kaffee, zehn Gehminuten vom Bahnhof'), /place_not_grounded/);
  assert.equal(parseModelRequirements([row], 'Mit Bernhard in Bern einen Kaffee, zehn Gehminuten vom Bahnhof')[0].value.reference.city, 'Bern');
});


test('time relative to a meal does not invent the meals dayphase as the visit phase', async () => {
  for (const [text, event] of [['Coffee after lunch', 'MEAL_END'], ['Coffee nach dem Abendessen', 'MEAL_END']]) {
    const result = await interpretedContext(text, [req('TIME', time({ event: { event, relation: 'AFTER' } }), text, { importance: 'HARD' })]);
    assert.equal(result.context.dateTime.dayPhase, null);
    assert.ok(result.context.unresolvedTerms.includes('PRECISE_TIME_UNVERIFIED'));
    assert.equal(result.context.requirements[0].value.event.relation, 'AFTER');
  }
});

test('provider source-evidence choices are bounded literal spans with coverage through long input', async () => {
  const { productSourceEvidence } = await import('../../dist/product-ai-interpretation.js');
  for (const text of ['Ich bin 17. Nach einem frühen Abendessen möchte ich tanzen; das Essen ist bereits organisiert.', 'word '.repeat(400).trim()]) {
    for (const maximum of [120, 240]) {
      const spans = productSourceEvidence(text, maximum);
      assert.ok(spans.length > 0);
      assert.ok(spans.every(span => span.length > 0 && span.length <= maximum && text.includes(span)));
      assert.ok(spans.some(span => span.endsWith(text.trim().split(' ').at(-1))));
    }
  }
});


test('an optional activity cannot make its inferred venue type mandatory', async () => {
  const text = 'Coffee, a riverside walk would be nice';
  for (const importance of ['PREFERRED', 'ESSENTIAL']) {
    const h = harness([req('EXPERIENCE', { kind: 'NEED', code: 'RIVERSIDE_WALK', scope: 'UNSPECIFIED' }, 'a riverside walk would be nice', { importance })], { primaryIntent: 'ACTIVITY_EXPERIENCE' });
    const result = await h.run(request(text));
    const required = context(result.request, result.understanding).hardConstraints.some(c => c.includes('WATERFRONT'));
    assert.equal(required, false, 'a specific unverified need does not invent a venue constraint');
    assert.equal(result.understanding.requirements[0].importance, importance);
    const ui = await h.run(request(text, { hardConstraints: ['WK_REQUIRED:UI:classification.place_types:WATERFRONT'] }));
    assert.ok(context(ui.request, ui.understanding).hardConstraints.includes('WK_REQUIRED:UI:classification.place_types:WATERFRONT'));
  }
});

test('factored provider schema is losslessly equivalent, including dimension and value discrimination', async () => {
  const { compactProductModelSchema } = await import('../../dist/product-ai-interpretation.js');
  const root = { type: 'object', additionalProperties: false, required: ['requirements'], properties: { requirements: PRODUCT_MODEL_REQUIREMENTS_SCHEMA } };
  const compact = compactProductModelSchema(root);
  const expand = node => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (node.$ref) {
      assert.match(node.$ref, /^#\/\$defs\/Shared\d+$/);
      assert.ok(compact.$defs[node.$ref.split('/').at(-1)]);
      return expand(compact.$defs[node.$ref.split('/').at(-1)]);
    }
    return Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$defs').map(([key, value]) => [key, expand(value)]));
  };
  assert.deepEqual(expand(compact), root);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(root).length * 0.8);
});

test('source span options preserve separate clauses and Unicode without exposing source text in schema', async () => {
  const { productSourceEvidence, productEvidenceOptions } = await import('../../dist/product-ai-interpretation.js');
  const text = 'Ein Garten wäre schön und bei Regen drinnen';
  assert.ok(productSourceEvidence(text, 120).includes('Ein Garten wäre schön'));
  assert.ok(productSourceEvidence(text, 120).includes('bei Regen drinnen'));
  const unicode = '🥳'.repeat(1000);
  for (const span of productSourceEvidence(unicode, 120)) {
    assert.ok(span.isWellFormed());
    assert.ok(span.length <= 120 && unicode.includes(span));
  }
  assert.ok(Object.entries(productEvidenceOptions(text)).every(([key, span]) => /^E\d+$/.test(key) && text.includes(span)));
});

test('meal-relative timing never suppresses an explicitly selected UI daypart', async () => {
  const result = await interpretedContext('Coffee after lunch', [req('TIME', time({ event: { event: 'MEAL_END', relation: 'AFTER' } }), 'after lunch')], { hardConstraints: ['WK_REQUIRED:UI:context.typical_dayparts:AFTERNOON'] });
  assert.equal(result.context.dateTime.dayPhase, 'AFTERNOON');
});

test('provider evidence IDs resolve only to request-local data and disappear before cache', async () => {
  const cache = [];
  const text = 'I am 17 and want coffee';
  const run = createDecisionProductAiIntentInterpreter({ identity, apiKey: 'synthetic', model: 'gpt-6-luna', allowedUserIds: '*',
    rpc: { async rpc(_name, args) { if (args.p_write) cache.push(args.p_semantics); return { data: args.p_write ? { status: 'HIT', semantics: args.p_semantics } : { status: 'MISS' }, error: null }; } },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      const input = JSON.parse(body.input);
      assert.equal(input.request, text);
      const id = Object.keys(input.evidenceSpans).find(key => input.evidenceSpans[key] === 'I am 17');
      assert.ok(id);
      assert.ok(body.text.format.schema.$defs.requirementEvidence.enum.includes(id));
      assert.ok(!JSON.stringify(body.text.format.schema).includes(text));
      return { ok: true, async json() { return { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(semantics([req('AGE', { kind: 'AGE', ages: [17] }, id)])) }] }] }; } };
    },
  });
  const result = await run(request(text), actor, new AbortController().signal);
  assert.equal(result.understanding.requirements[0].value.minimumAge, 17);
  assert.equal(cache.length, 1);
  assert.ok(!JSON.stringify(cache).includes('evidence'));
  assert.ok(!JSON.stringify(cache).includes('I am 17'));
});

test('optional secondary activity does not weaken an independent primary venue requirement', async () => {
  const text = 'We want to go bowling; a riverside walk afterwards would be nice';
  const h = harness([req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'BOWLING_ALLEY' }, 'go bowling'), req('EXPERIENCE', { kind: 'NEED', code: 'RIVERSIDE_WALK', scope: 'UNSPECIFIED' }, 'a riverside walk afterwards would be nice', { importance: 'PREFERRED' })], {
    primaryIntent: 'ACTIVITY_EXPERIENCE',
  });
  const result = await h.run(request(text));
  assert.ok(context(result.request, result.understanding).hardConstraints.includes('WK_REQUIRED:G1:classification.place_types:BOWLING_ALLEY'));
  assert.deepEqual(await h.run(request(text)), result);
});

test('participant age presented as optional asks for repair instead of silently erasing or upgrading it', () => {
  for (const changes of [{ importance: 'PREFERRED' }, { operator: 'ALLOW', importance: 'PREFERRED' }]) {
    assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [17] }, 'I am 17', changes)], 'I am 17'), /participant_age_optional/);
  }
  const row = parseModelRequirements([req('AGE', { kind: 'AGE', ages: [17] }, 'I am 17')], 'I am 17')[0];
  assert.equal(row.value.minimumAge, 17);
});

test('today and explicit not-now cannot become an open-now constraint', () => {
  for (const text of ['Heute möchte ich tanzen', 'Coffee today', 'Coffee not now, later', 'Pas maintenant, ce soir']) {
    assert.throws(() => parseModelRequirements([req('TIME', time({ openNow: true }), text)], text), /open_now_not_grounded/);
  }
  for (const text of ['Kaffee jetzt', 'Coffee now', 'Un café maintenant']) {
    assert.equal(parseModelRequirements([req('TIME', time({ openNow: true }), text)], text)[0].value.openNow, true);
  }
});

test('one venue predicate can satisfy several independent OR groups', async () => {
  const text = 'Either museum or cafe; also either museum or cinema';
  const rows = [['R1', 'MUSEUM'], ['R1', 'CAFE'], ['R2', 'MUSEUM'], ['R2', 'CINEMA']].map(([group, value]) => req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value }, text, { group }));
  const h = harness(rows, { primaryIntent: 'ACTIVITY_EXPERIENCE' });
  const cold = await h.run(request(text));
  assert.deepEqual(await h.run(request(text)), cold);
  assert.deepEqual(cold.request.explicit.hardConstraints, [
    'WK_REQUIRED:R1:classification.place_types:CAFE', 'WK_REQUIRED:R1:classification.place_types:MUSEUM',
    'WK_REQUIRED:R2:classification.place_types:CINEMA', 'WK_REQUIRED:R2:classification.place_types:MUSEUM',
  ]);
});

test('shared full-sentence evidence cannot erase an independent activity', async () => {
  const text = 'Go bowling; a riverside walk would be nice';
  const rows = [req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'BOWLING_ALLEY' }, text),
    req('EXPERIENCE', { kind: 'NEED', code: 'RIVERSIDE_WALK', scope: 'UNSPECIFIED' }, text, { importance: 'PREFERRED' })];
  const result = await harness(rows, { primaryIntent: 'ACTIVITY_EXPERIENCE' }).run(request(text));
  assert.ok(result.request.explicit.hardConstraints.includes('WK_REQUIRED:G1:classification.place_types:BOWLING_ALLEY'));
});

test('amenity wishes and qualitative prices survive cold/warm/public boundaries without numeric invention', async () => {
  const text = 'A garden would be nice, preferably cheap';
  const rows = [req('AMENITY', { kind: 'FACET', key: 'amenity.features', value: 'GARDEN' }, 'A garden would be nice', { importance: 'PREFERRED' }),
    req('BUDGET', { kind: 'FACET', key: 'operation.price_level', value: 'LOW' }, 'preferably cheap', { importance: 'PREFERRED' })];
  const h = harness(rows); const cold = await h.run(request(text));
  assert.deepEqual(await h.run(request(text)), cold);
  assert.ok(cold.request.explicit.softPreferences.includes('WK:amenity.features:GARDEN'));
  assert.ok(cold.request.explicit.softPreferences.includes('WK:operation.price_level:LOW'));
  const c = context(cold.request, cold.understanding);
  assert.equal(c.budget.amount, null);
  const { validateDecisionProductRequirements } = await import('../../../../mobile/packages/product-decision-contract/src/index.mjs');
  assert.doesNotThrow(() => validateDecisionProductRequirements(c.requirements));
  assert.ok(!JSON.stringify([...h.records.values()]).includes('Synthetic request meaning'));
});

test('reference-event time survives without becoming the visit clock or dayphase', async () => {
  const { validateDecisionProductRequirements } = await import('../../../../mobile/packages/product-decision-contract/src/index.mjs');
  for (const [text, event] of [
    ['Eat before the film starts at 20:15, finished by 19:45', { event: 'FILM_START', relation: 'BEFORE', clockTime: '20:15' }],
    ['Dancing after an early dinner', { event: 'MEAL_END', relation: 'AFTER', dayPhase: 'EVENING', phasePosition: 'EARLY' }],
  ]) {
    const rows = [req('TIME', time({ event }), text)];
    if (event.event === 'FILM_START') rows.push(req('TIME', time({ clockTime: '19:45', clockRelation: 'END_NOT_AFTER' }), 'finished by 19:45', { importance: 'HARD' }));
    const h = harness(rows); const cold = await h.run(request(text));
    assert.deepEqual(await h.run(request(text)), cold);
    const c = context(cold.request, cold.understanding);
    assert.equal(c.dateTime.dayPhase, null);
    assert.equal(c.requirements[0].value.clockTime, null);
    assert.deepEqual(c.requirements[0].value.event, event);
    assert.ok(c.unresolvedTerms.includes('PRECISE_TIME_UNVERIFIED'));
    validateDecisionProductRequirements(c.requirements);
    assert.notEqual(assess(cold).candidates[0].tier, 'ELIGIBLE_CONFIRMED');
  }
  assert.throws(() => parseModelRequirements([req('TIME', time({ event: { event: 'MEAL_END', relation: 'AFTER', phasePosition: 'EARLY' } }), 'dinner')], 'dinner'), /event_phase_position_invalid/);
});


test('provider cannot turn a visit purpose into an exclusive internal venue classification', () => {
  for (const [key, value] of [['classification.primary_category', 'COFFEE_DAYTIME'], ['purpose.primary_visit', 'EAT_DRINK']]) {
    assert.ok(!JSON.stringify(PRODUCT_MODEL_REQUIREMENTS_SCHEMA).includes(`"const":"${key}"`));
    for (const operator of ['REQUIRE', 'EXCLUDE', 'ALLOW']) {
      const text = 'A cafe or a restaurant';
      const row = req('EXPERIENCE', { kind: 'FACET', key, value }, text, { operator, importance: operator === 'ALLOW' ? 'PREFERRED' : 'ESSENTIAL', group: 'R1' });
      assert.throws(() => parseModelRequirements([row], text), /internal_classification/);
      assert.throws(() => parseModelRequirements([{ ...row, interpretationState: 'AMBIGUOUS', value: null, alternatives: [row.value, { kind: 'FACET', key: 'classification.place_types', value: 'CAFE' }] }], text), /internal_classification/);
    }
  }
  const text = 'A cafe or a restaurant';
  const rows = parseModelRequirements(['CAFE', 'RESTAURANT'].map(value => req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value }, text, { group: 'R1' })), text);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.group === 'R1'));
});

test('participant ages need a stated numeric value, not arithmetic on a negation', () => {
  for (const text of ['Ich bin nicht 18', 'I am not eighteen', 'Je n’ai pas dix-huit ans']) {
    assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [17] }, text, { importance: 'HARD' })], text), /age_not_grounded/);
  }
  for (const [age, text] of [[17, 'Ich bin siebzehn'], [17, '17jährige Teilnehmer'], [25, 'fuenfundzwanzig Jahre alt'], [21, 'I am twenty-one'], [71, 'Je suis âgé de soixante et onze ans'], [84, 'quatre-vingt-quatre ans'], [91, 'nonante et un ans'], [120, 'hundertzwanzig Jahre alt'], [105, 'one hundred and five years old']]) {
    assert.equal(parseModelRequirements([req('AGE', { kind: 'AGE', ages: [age] }, text, { importance: 'HARD' })], text)[0].value.minimumAge, age);
  }
  const text = 'Children aged three and seven';
  assert.equal(parseModelRequirements([req('AGE', { kind: 'AGE', ages: [3, 7] }, text, { importance: 'HARD' })], text)[0].value.minimumAge, 3);
  assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [3, 7, 9] }, text, { importance: 'HARD' })], text), /age_not_grounded/);
  // Grounding does not certify semantic number roles or turn an unknown age
  // into a known fact. Unsupported age context remains representable.
  assert.equal(parseModelRequirements([req('AGE', null, 'not eighteen', { interpretationState: 'UNSUPPORTED' })], 'not eighteen')[0].value, null);
});


test('age number grounding preserves whole cardinals and adjectival ages', () => {
  for (const [age, text] of [[8, 'dix-huit ans'], [1, 'vingt et un ans'], [17, 'one hundred and seventeen'], [120, 'one hundred and twenty-one'], [21, 'two hundred and twenty-one'], [17, '17.5 years old']]) {
    assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [age] }, text, { importance: 'HARD' })], text), /age_not_grounded/);
  }
  for (const [age, text] of [[17, 'Meine siebzehnjährige Tochter kommt mit'], [1, 'Meine einjährige Tochter kommt mit'], [100, 'a hundred years old'], [117, 'one hundred and seventeen'], [18, 'dix-huit ans']]) {
    assert.equal(parseModelRequirements([req('AGE', { kind: 'AGE', ages: [age] }, text, { importance: 'HARD' })], text)[0].value.minimumAge, age);
  }
});


test('one model intent cannot veto another explicit experience alternative, while UI authority remains intact', async () => {
  const text = 'Either dancing or a concert';
  const requirements = [
    req('EXPERIENCE', { kind: 'NEED', code: 'DANCING', scope: 'UNSPECIFIED' }, 'dancing', { group: 'R1' }),
    req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'CONCERT_VENUE' }, 'concert', { group: 'R1' }),
  ];
  const h = harness(requirements, { primaryIntent: 'NIGHTLIFE', secondaryIntent: 'CULTURE_ART', primaryIntentGroup: 'R1', secondaryIntentGroup: 'R1' });
  const result = await h.run(request(text)); const warm = await h.run(request(text));
  assert.deepEqual(warm, result); assert.equal(h.fetches(), 1);
  assert.equal(result.request.explicit.primaryIntent, null);
  assert.equal(result.request.explicit.secondaryIntent, null);
  assert.equal(result.understanding.requirements.length, 2);
  const binding = worldBinding();
  binding.decisionProjection.facts = binding.decisionProjection.facts.map(row => row.key === 'purpose.primary_visit' ? fact(row.key, 'CULTURE_ARTS') : row.key === 'classification.primary_category' ? fact(row.key, 'CULTURE_ARTS') : row.key === 'classification.place_types' ? fact(row.key, ['CONCERT_VENUE']) : row);
  const concert = parseProductWorldResolverBinding(binding, 'Basel');
  const evaluate = interpreted => evaluateProductWorldViews(interpreted.request, { authorizedCity: 'Basel', serverTime: at }, { status: 'NEUTRAL', projectionHash: contentHash('neutral') }, [concert], contentHash([concert.spot.spotId]), interpreted.understanding).evaluation.candidates[0];
  assert.equal(evaluate(result).tier, 'UNCONFIRMED_FALLBACK');
  const manual = await h.run(request(text, { primaryIntent: 'NIGHTLIFE' }));
  assert.equal(manual.request.explicit.primaryIntent, 'NIGHTLIFE');
  assert.equal(evaluate(manual).tier, 'INELIGIBLE');
  const simple = await harness(requirements.map(row => ({ ...row, group: null })), { primaryIntent: 'NIGHTLIFE' }).run(request(text));
  assert.equal(simple.request.explicit.primaryIntent, 'NIGHTLIFE');
});


test('an independent meal survives scoped activity alternatives and dangling intent groups fail', async () => {
  const text = 'We want to eat, then either dancing or a concert';
  const rows = [req('EXPERIENCE', { kind: 'NEED', code: 'DANCING', scope: 'UNSPECIFIED' }, 'dancing', { group: 'R1' }), req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'CONCERT_VENUE' }, 'concert', { group: 'R1' })];
  const h = harness(rows, { primaryIntent: 'EAT', primaryIntentGroup: null, secondaryIntent: 'NIGHTLIFE', secondaryIntentGroup: 'R1' });
  const cold = await h.run(request(text)); const warm = await h.run(request(text));
  assert.deepEqual(warm, cold); assert.equal(h.fetches(), 1);
  assert.equal(cold.request.explicit.primaryIntent, 'EAT');
  assert.equal(cold.request.explicit.secondaryIntent, null);
  assert.equal(cold.understanding.requirements.length, 2);
  assert.ok(cold.understanding.requirements.every(row => row.group === 'R1'));
  for (const overrides of [{ primaryIntentGroup: 'R2' }, { primaryIntent: null, primaryIntentGroup: 'R1' }]) {
    await assert.rejects(harness(rows, overrides).run(request(text)), /intent_group/);
  }
  const samePurpose = await harness(rows, { primaryIntent: 'EAT', primaryIntentGroup: null, secondaryIntent: 'EAT', secondaryIntentGroup: 'R1' }).run(request(text));
  assert.equal(samePurpose.request.explicit.primaryIntent, 'EAT');
  assert.equal(samePurpose.request.explicit.secondaryIntent, null);
});


test('intent scope cannot bind to temporal or mixed condition alternatives', async () => {
  const text = 'Eat on Saturday or Sunday, or a concert';
  const temporal = [req('TIME', time({ weekday: 6 }), 'Saturday', { group: 'R1' }), req('TIME', time({ weekday: 0 }), 'Sunday', { group: 'R1' })];
  const experiences = [req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'RESTAURANT' }, 'Eat', { group: 'R1' }), req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'CONCERT_VENUE' }, 'concert', { group: 'R1' })];
  for (const rows of [temporal, [...experiences, temporal[0]]]) {
    await assert.rejects(harness(rows, { primaryIntent: 'EAT', primaryIntentGroup: 'R1' }).run(request(text)), /intent_group/);
  }
  const independent = await harness(temporal, { primaryIntent: 'EAT', primaryIntentGroup: null }).run(request(text));
  assert.equal(independent.request.explicit.primaryIntent, 'EAT');
});

test('source grounding supports separated ages and full public municipality names without inventing values', () => {
  const text = 'My sister is 21. We want a concert together, with a quiet place for conversation beforehand. I am 19.';
  const row = req('AGE', { kind: 'AGE', ages: [21, 19] }, 'I am 19', { importance: 'HARD' });
  assert.equal(parseModelRequirements([row], text)[0].value.minimumAge, 19);
  assert.throws(() => parseModelRequirements([{ ...row, value: { kind: 'AGE', ages: [21, 17] } }], text), /age_not_grounded/);
  const city = req('LOCATION', { kind: 'LOCATION', city: 'St. Gallen' }, 'Gallen');
  assert.equal(parseModelRequirements([city], 'Heute Abend in St. Gallen')[0].value.city, 'St. Gallen');
  assert.throws(() => parseModelRequirements([city], 'Heute Abend in Gallen'), /place_not_grounded/);
  assert.throws(() => parseModelRequirements([req('LOCATION', { kind: 'LOCATION', city: 'Bern' }, 'Bernhard')], 'Bernhard wants coffee'), /place_not_grounded/);
  assert.ok(!JSON.stringify(PRODUCT_MODEL_REQUIREMENTS_SCHEMA).includes('OTHER_PLACE'));
  assert.throws(() => parseModelRequirements([req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'OTHER_PLACE' }, 'Ausflug')], 'Ausflug'), /internal_classification/);
});

test('explicit unconditional dancing keeps a canonical club unverified under a broad activity intent without weakening other vetoes', async () => {
  const text = 'I want dancing, not a nightclub, and a step-free entrance or pottery';
  const dance = req('EXPERIENCE', { kind: 'NEED', code: 'DANCING', scope: 'UNSPECIFIED' }, 'dancing');
  const makeWorld = (purpose = 'ENTERTAINMENT', category = 'NIGHTLIFE', places = ['NIGHTCLUB'], extra = []) => {
    const binding = worldBinding();
    binding.decisionProjection.facts = binding.decisionProjection.facts.map(row => row.key === 'purpose.primary_visit' ? fact(row.key, purpose) : row.key === 'classification.primary_category' ? fact(row.key, category) : row.key === 'classification.place_types' ? fact(row.key, places) : row).concat(extra);
    return parseProductWorldResolverBinding(binding, 'Basel');
  };
  const evaluate = (result, spot = makeWorld()) => evaluateProductWorldViews(result.request, { authorizedCity: 'Basel', serverTime: at }, { status: 'NEUTRAL', projectionHash: contentHash('neutral') }, [spot], contentHash([spot.spot.spotId]), result.understanding).evaluation.candidates[0];
  const h = harness([dance], { primaryIntent: 'ACTIVITY_EXPERIENCE' });
  const cold = await h.run(request(text)); const warm = await h.run(request(text));
  assert.deepEqual(cold, warm); assert.equal(h.fetches(), 1);
  for (const purpose of ['ENTERTAINMENT', 'EAT_DRINK']) for (const place of ['NIGHTCLUB', 'MUSIC_CLUB']) {
    const candidate = evaluate(cold, makeWorld(purpose, 'NIGHTLIFE', [place]));
    assert.equal(candidate.tier, 'UNCONFIRMED_FALLBACK');
    assert.equal(candidate.coreIntentCoverage.state, 'UNKNOWN');
    assert.ok(candidate.coreIntentCoverage.mappingIds.includes('product-intent-activity-dancing-unverified'));
    assert.ok(candidate.limitations.includes('NEED_DANCING_UNVERIFIED'));
  }
  for (const rows of [[], [{ ...dance, operator: 'EXCLUDE', importance: 'HARD' }], [{ ...dance, operator: 'ALLOW', importance: 'PREFERRED' }], [{ ...dance, importance: 'PREFERRED' }], [{ ...dance, condition: 'DRY' }], [{ ...dance, group: 'R1' }, req('EXPERIENCE', { kind: 'NEED', code: 'POTTERY', scope: 'UNSPECIFIED' }, 'pottery', { group: 'R1' })]]) {
    const result = await harness(rows, { primaryIntent: 'ACTIVITY_EXPERIENCE' }).run(request(text));
    assert.equal(evaluate(result).tier, 'INELIGIBLE');
  }
  for (const explicit of [{ primaryIntent: 'EAT' }, { primaryIntent: 'SPORT_MOVEMENT' }, { hardConstraints: ['WK_REQUIRED:G1:classification.place_types:CAFE'] }]) {
    const result = await h.run(request(text, explicit));
    assert.equal(evaluate(result).tier, 'INELIGIBLE');
  }
  const excluded = await harness([dance, req('EXPERIENCE', { kind: 'FACET', key: 'classification.place_types', value: 'NIGHTCLUB' }, 'not a nightclub', { operator: 'EXCLUDE', importance: 'HARD' })], { primaryIntent: 'ACTIVITY_EXPERIENCE' }).run(request(text));
  assert.equal(evaluate(excluded).tier, 'INELIGIBLE');
  const accessible = await h.run(request(text, { hardConstraints: ['ACCESSIBILITY_STEP_FREE'] }));
  assert.equal(evaluate(accessible, makeWorld('ENTERTAINMENT', 'NIGHTLIFE', ['NIGHTCLUB'], [{ ...fact('accessibility.step_free_entrance', false), resolution: 'KNOWN_FALSE' }])).tier, 'INELIGIBLE');
  assert.equal(evaluate(cold, makeWorld('EAT_DRINK', 'EAT', ['RESTAURANT'])).tier, 'INELIGIBLE');
  const disputed = { ...makeWorld(), conflicts: [{ code: 'OVERLAPPING_CONTRADICTORY_CLAIMS', severity: 'BLOCKING', attributeKeys: ['classification.primary_category'] }] };
  assert.equal(evaluate(cold, disputed).tier, 'INELIGIBLE');
  assert.equal(evaluate(cold, disputed).coreIntentCoverage.state, 'DISPUTED');
  const minor = await h.run(request(text, { group: { size: 1, minimumAge: 17, adultPresent: false, companionType: null } }));
  const restricted = makeWorld('ENTERTAINMENT', 'NIGHTLIFE', ['NIGHTCLUB'], [fact('rule.age_access_conditions', { rules: [{ mode: 'GENERAL_MINIMUM', minimumAge: 18, accompaniment: 'NONE', appliesFromTime: null, days: [], area: null, event: null }], notes: null })]);
  assert.equal(evaluate(minor, restricted).tier, 'INELIGIBLE');
  assert.ok(evaluate(minor, restricted).failedHardConstraints.includes('AGE_OR_LEGAL'));

});
