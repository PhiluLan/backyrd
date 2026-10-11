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
  assert.throws(() => parseModelRequirements([req('AGE', { kind: 'AGE', ages: [40] }, '40th birthday')], 'A 40th birthday dinner'), /birthday_not_group_age/);
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
  const needs = ['HALAL', 'DAIRY_FREE', 'LACTOSE_FREE', 'DOG_ACCESS', 'STEP_FREE_ROUTE', 'CHANGING_TABLE', 'GUIDED_TOUR', 'BOAT_RIDE', 'POTTERY'];
  const { validateDecisionProductRequirements } = await import('../../../../mobile/packages/product-decision-contract/src/index.mjs');
  for (const code of needs) {
    const value = { kind: 'NEED', code, scope: 'ONE_PERSON', ...(code === 'DOG_ACCESS' ? { accessArea: 'OUTDOOR_ONLY_ACCEPTABLE' } : {}) };
    const rows = [req('OTHER', value, code, { importance: 'HARD', operator: ['GUIDED_TOUR', 'BOAT_RIDE'].includes(code) ? 'EXCLUDE' : 'REQUIRE' })];
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
