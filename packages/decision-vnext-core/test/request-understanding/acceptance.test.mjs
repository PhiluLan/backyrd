import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateUnderstandingCase, evaluateUnderstandingCorpus, validateCorpus } from './evaluate.mjs';

const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));
const check = (path, op, value) => ({ path, op, value });
const oneFamily = expected => ({ ...corpus, families: [{ id: 'test-case', dimension: 'INTENT', queries: ['synthetic request'], expected }] });

test('understanding development corpus contains 160 unique requests in 40 families, without claiming human review or holdout', () => {
  validateCorpus(corpus);
  assert.equal(corpus.families.length, 40);
  assert.equal(corpus.families.flatMap(row => row.queries).length, 160);
  assert.equal(new Set(corpus.families.map(row => row.dimension)).size, 8);
  assert.equal(corpus.reviewStatus, 'PROPOSED_REQUIRES_HUMAN_REVIEW');
  assert.equal(corpus.scope, 'DEVELOPMENT_NOT_HOLDOUT');
});

test('an omitted field cannot pass even a negative expectation; explicit unknown differs from omission', () => {
  assert.equal(evaluateUnderstandingCase([check('budget.amount', 'equals', null)], {}).outcome, 'FAIL');
  assert.equal(evaluateUnderstandingCase([check('budget.amount', 'equals', null)], { budget: { amount: null } }).outcome, 'PASS');
  assert.equal(evaluateUnderstandingCase([check('hardConstraints', 'excludes', 'BUDGET_MAXIMUM')], {}).outcome, 'FAIL');
  assert.equal(evaluateUnderstandingCase([check('hardConstraints', 'excludes', 'BUDGET_MAXIMUM')], { hardConstraints: [] }).outcome, 'PASS');
});

test('numbers, booleans, units and structure are compared without coercion', () => {
  const expected = [check('budget.amount', 'equals', 30), check('budget.perPerson', 'equals', true), check('budget.currency', 'equals', 'CHF')];
  assert.equal(evaluateUnderstandingCase(expected, { budget: { amount: 30, perPerson: true, currency: 'CHF' } }).outcome, 'PASS');
  for (const budget of [{ amount: '30', perPerson: true, currency: 'CHF' }, { amount: 30, perPerson: 'true', currency: 'CHF' }, { amount: 30, perPerson: true, currency: 'EUR' }]) {
    assert.equal(evaluateUnderstandingCase(expected, { budget }).outcome, 'FAIL');
  }
});

test('invented hard requirements and lost negation fail their declared checks', () => {
  const expected = [check('hardConstraints', 'excludes', 'ACCESSIBILITY_BASIC'), check('primaryIntent', 'equals', 'COFFEE')];
  const result = evaluateUnderstandingCase(expected, { hardConstraints: ['ACCESSIBILITY_BASIC'], primaryIntent: 'DRINKS' });
  assert.equal(result.checks.filter(row => row.outcome === 'FAIL').length, 2);
});

test('set membership checks accept reordered context without accepting string substrings', () => {
  const expected = [check('hardConstraints', 'contains', 'OPEN_ON_REQUESTED_DAY')];
  assert.equal(evaluateUnderstandingCase(expected, { hardConstraints: ['TARGET_LOCATION', 'OPEN_ON_REQUESTED_DAY'] }).outcome, 'PASS');
  assert.equal(evaluateUnderstandingCase(expected, { hardConstraints: 'OPEN_ON_REQUESTED_DAY' }).outcome, 'FAIL');
});

test('explicit oracle alternatives do not require one arbitrarily selected answer', () => {
  assert.equal(evaluateUnderstandingCase([check('primaryIntent', 'oneOf', ['COFFEE', null])], { primaryIntent: null }).outcome, 'PASS');
  assert.equal(evaluateUnderstandingCase([check('primaryIntent', 'oneOf', ['COFFEE', null])], { primaryIntent: 'EAT' }).outcome, 'FAIL');
});

test('empty, duplicate, malformed and prototype-based oracles cannot manufacture a green result', () => {
  assert.throws(() => evaluateUnderstandingCase([], {}));
  for (const expected of [[], [check('__proto__.polluted', 'equals', true)], [check('x', 'oneOf', [])], [check('x', 'ignored-operator', 1)], [check('x', 'equals', 1), check('x', 'equals', 1)]]) {
    assert.throws(() => validateCorpus(oneFamily(expected)));
  }
  const inherited = Object.create({ primaryIntent: 'COFFEE' });
  assert.equal(evaluateUnderstandingCase([check('primaryIntent', 'equals', 'COFFEE')], inherited).outcome, 'FAIL');
  assert.throws(() => validateCorpus({ ...corpus, families: [corpus.families[0], corpus.families[0]] }));
});

test('provider errors are counted separately and never expose input, output or raw error text', async () => {
  const report = await evaluateUnderstandingCorpus(oneFamily([check('primaryIntent', 'equals', 'COFFEE')]), () => { throw new Error('private provider payload'); });
  assert.equal(report.caseCount, 1); assert.equal(report.errors, 1); assert.equal(report.passed, 0); assert.equal(report.failed, 0);
  assert.doesNotMatch(JSON.stringify(report), /synthetic request|private provider payload/);
});

test('a single missed condition fails the case; partial matches cannot hide behind an aggregate', async () => {
  const report = await evaluateUnderstandingCorpus(oneFamily([check('budget.amount', 'equals', 30), check('group.minimumAge', 'equals', 4)]), () => ({ budget: { amount: 30 }, group: { minimumAge: null } }));
  assert.equal(report.failed, 1); assert.equal(report.passed, 0);
  assert.equal(report.cases[0].checks.filter(row => row.outcome === 'PASS').length, 1);
  assert.equal(report.byDimension.INTENT.failed, 1);
  assert.equal(report.metric, 'ALL_DECLARED_CHECKS_PASS_NOT_FULL_UNDERSTANDING');
});
