import { isDeepStrictEqual } from 'node:util';

export const UNDERSTANDING_EVALUATOR_VERSION = 'backyrd.request-understanding-evaluator@1.0';
const operators = new Set(['equals', 'contains', 'excludes', 'oneOf']);
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const keysEqual = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => own(value, key));

export function validateCorpus(value) {
  if (!keysEqual(value, ['contractVersion', 'reviewStatus', 'scope', 'reference', 'families'])
    || value.contractVersion !== 'backyrd.request-understanding-corpus@1.0'
    || value.reviewStatus !== 'PROPOSED_REQUIRES_HUMAN_REVIEW'
    || value.scope !== 'DEVELOPMENT_NOT_HOLDOUT'
    || !keysEqual(value.reference, ['serverTime', 'profileCity'])
    || value.reference.serverTime !== '2026-10-10T12:00:00.000Z' || value.reference.profileCity !== 'Basel'
    || !Array.isArray(value.families) || value.families.length === 0) throw new Error('understanding_corpus_invalid');
  const ids = new Set(); const texts = new Set();
  for (const family of value.families) {
    if (!keysEqual(family, ['id', 'dimension', 'queries', 'expected'])
      || typeof family.id !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(family.id) || ids.has(family.id)
      || !['INTENT', 'BUDGET', 'GROUP', 'TIME', 'LOCATION', 'ACCESS', 'ATMOSPHERE', 'UNCERTAINTY'].includes(family.dimension)
      || !Array.isArray(family.queries) || family.queries.length === 0
      || !Array.isArray(family.expected) || family.expected.length === 0) throw new Error('understanding_family_invalid');
    ids.add(family.id);
    for (const text of family.queries) {
      if (typeof text !== 'string' || text.length < 3 || text.length > 2000 || texts.has(text)) throw new Error('understanding_query_invalid');
      texts.add(text);
    }
    const checks = new Set();
    for (const criterion of family.expected) {
      if (!keysEqual(criterion, ['path', 'op', 'value']) || typeof criterion.path !== 'string'
        || !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(criterion.path)
        || criterion.path.split('.').some(key => ['__proto__', 'constructor', 'prototype'].includes(key))
        || !operators.has(criterion.op) || criterion.value === undefined
        || criterion.op === 'oneOf' && (!Array.isArray(criterion.value) || criterion.value.length === 0)) throw new Error('understanding_criterion_invalid');
      const checkId = JSON.stringify(criterion);
      if (checks.has(checkId)) throw new Error('understanding_duplicate_criterion');
      checks.add(checkId);
    }
  }
  return value;
}

function readPath(object, path) {
  let result = object;
  for (const key of path.split('.')) {
    if (!own(result, key)) return { present: false };
    result = result[key];
  }
  return { present: result !== undefined, value: result };
}

/** Scores only declared checks; never claims full semantic understanding. */
export function evaluateUnderstandingCase(expected, actual) {
  if (!Array.isArray(expected) || expected.length === 0) throw new Error('understanding_expectations_required');
  const checks = expected.map(criterion => {
    if (!operators.has(criterion.op)) throw new Error('understanding_operator_invalid');
    const observed = readPath(actual, criterion.path);
    const pass = observed.present && (
      criterion.op === 'equals' ? isDeepStrictEqual(observed.value, criterion.value)
        : criterion.op === 'oneOf' ? criterion.value.some(value => isDeepStrictEqual(observed.value, value))
          : Array.isArray(observed.value) && (criterion.op === 'contains'
            ? observed.value.some(value => isDeepStrictEqual(value, criterion.value))
            : !observed.value.some(value => isDeepStrictEqual(value, criterion.value)))
    );
    return { path: criterion.path, operator: criterion.op, outcome: pass ? 'PASS' : 'FAIL',
      reason: pass ? null : observed.present ? 'VALUE_MISMATCH' : 'FIELD_MISSING' };
  });
  return { outcome: checks.every(check => check.outcome === 'PASS') ? 'PASS' : 'FAIL', checks };
}

export async function evaluateUnderstandingCorpus(corpusValue, interpret) {
  const corpus = validateCorpus(corpusValue); const cases = [];
  for (const family of corpus.families) {
    for (const [index, text] of family.queries.entries()) {
      let result;
      try { result = evaluateUnderstandingCase(family.expected, await interpret(text, corpus.reference)); }
      catch { result = { outcome: 'ERROR', checks: [] }; }
      // No raw query, model output or error message is retained in reports.
      cases.push({ caseId: `${family.id}-${index + 1}`, familyId: family.id, dimension: family.dimension, ...result });
    }
  }
  return {
    evaluatorVersion: UNDERSTANDING_EVALUATOR_VERSION, corpusReviewStatus: corpus.reviewStatus,
    scope: corpus.scope, metric: 'ALL_DECLARED_CHECKS_PASS_NOT_FULL_UNDERSTANDING',
    caseCount: cases.length, familyCount: corpus.families.length,
    passed: cases.filter(row => row.outcome === 'PASS').length,
    failed: cases.filter(row => row.outcome === 'FAIL').length,
    errors: cases.filter(row => row.outcome === 'ERROR').length,
    byDimension: Object.fromEntries([...new Set(cases.map(row => row.dimension))].sort().map(dimension => {
      const rows = cases.filter(row => row.dimension === dimension);
      return [dimension, { total: rows.length, passed: rows.filter(row => row.outcome === 'PASS').length,
        failed: rows.filter(row => row.outcome === 'FAIL').length, errors: rows.filter(row => row.outcome === 'ERROR').length }];
    })), cases,
  };
}
