import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_CASES, qualityScenario } from './decision-quality-catalog.mjs';
import { prepareQualityMeaning, traceQualityCase, checkUnderstanding, captureMatchesCase } from '../../../../scripts/product/decision-quality.mjs';
import { binding, profile, offer, price, fact, date, request, search, meal, area, prop } from '../librarian-matching-fixtures.mjs';

test('fixed acceptance corpus contains 40 unique wishes across 12 groups', () => {
  assert.equal(QUALITY_CASES.length, 40);
  assert.equal(new Set(QUALITY_CASES.map(c => c.id)).size, 40);
  assert.equal(new Set(QUALITY_CASES.map(c => c.query)).size, 40);
  assert.equal(new Set(QUALITY_CASES.map(c => c.group)).size, 12);
});
for (const c of QUALITY_CASES) test(`quality chain ${c.id}: ${c.query}`, () => {
  const s = qualityScenario(c.group, c.query), meaning = prepareQualityMeaning(c, s.raw);
  const trace = traceQualityCase(c, meaning);
  assert.deepEqual(trace.failures, []);
  assert.equal(trace.rows.length, s.catalog.length);
  assert.equal(trace.personalization, 'NEUTRAL');
});
test('diagnostics distinguish missing cohort, documented price failure and no visit evidence', () => {
  const c = QUALITY_CASES.find(c => c.group === 'budget'), s = qualityScenario(c.group, c.query), meaning = prepareQualityMeaning(c, s.raw);
  const absent = '99999999-9999-4999-a999-999999999999';
  const trace = traceQualityCase(c, meaning, {expected: {...s.expected, included: [...s.expected.included, absent]}});
  assert.equal(trace.rows.find(r => r.spotId === absent).stage, 'NOT_IN_COHORT');
  const expensive = trace.rows.find(r => r.spotId === s.expected.excluded[0]);
  assert.equal(expensive.stage, 'ELIGIBILITY');
  assert.ok(expensive.facts.some(f => f.family === 'budget.maximum' && f.state === 'FAILED'));
  assert.ok(trace.failures.some(f => f.spotId === absent && f.code === 'EXPECTED_CANDIDATE_MISSING'));
  const pub = QUALITY_CASES[0], ps = qualityScenario(pub.group, pub.query);
  assert.equal(traceQualityCase(pub, prepareQualityMeaning(pub, ps.raw)).rows.find(r => r.spotId === ps.expected.excluded[0]).stage, 'VISIT_EVIDENCE');
});
test('an expected eligible candidate outside the visible window retains its true global rank', () => {
  const c = QUALITY_CASES.find(c => c.group === 'undated'), s = qualityScenario(c.group, c.query);
  const catalog = Array.from({length: 10}, (_, i) => binding(i + 1, profile([offer('dinner', 'DINNER', ['inside'], [], [price()])])));
  const expected = {...s.expected, included: catalog.map(b => b.decisionProjection.spotId)};
  const trace = traceQualityCase(c, prepareQualityMeaning(c, s.raw), {catalog, expected});
  assert.deepEqual(trace.failures, []);
  assert.ok(trace.rows.some(r => r.stage === 'PRESENTATION_WINDOW' && r.rank > trace.displayedIds.length));
  assert.ok(trace.rows.some(r => r.stage === 'MOBILE_WINDOW'));
  assert.equal(new Set(trace.rows.map(r => r.rank)).size, 10);
});
test('understanding oracle catches lost budget and invented date without inspecting model explanations', () => {
  const c = QUALITY_CASES.find(c => c.group === 'budget'), s = qualityScenario(c.group, c.query);
  const gold = prepareQualityMeaning(c, s.raw), raw = structuredClone(s.raw);
  raw.facts = raw.facts.filter(f => f.key !== 'budget.maximum');
  raw.facts.push({id: 'date', key: 'time.date', value: {date: '2026-10-14', operator: 'EQ', timezone: 'Europe/Zurich'}, modality: 'REQUIRED', basis: 'EXPLICIT', subjectIds: []});
  const failures = checkUnderstanding(gold, prepareQualityMeaning(c, raw));
  assert.ok(failures.some(f => f.family === 'budget.maximum'));
  assert.ok(failures.some(f => f.code === 'UNREQUESTED_CALENDAR_DATE'));
});
test('an exclusion expected by the oracle cannot silently become an admitted lower-ranked candidate', () => {
  const c = QUALITY_CASES.find(c => c.group === 'budget'), s = qualityScenario(c.group, c.query);
  const catalog = [s.catalog[0], binding(2, profile([offer('dinner', 'DINNER', ['inside'], [], [price(15)])]))];
  const trace = traceQualityCase(c, prepareQualityMeaning(c, s.raw), {catalog});
  assert.ok(trace.failures.some(f => f.code === 'UNEXPECTED_CANDIDATE_ADMITTED'));
});
test('captured meanings bind the exact wish and reference instant, accepting equivalent ISO offsets', () => {
  const c = QUALITY_CASES[0];
  const capture = {query: c.query, reference: {now: '2026-10-14T08:00:00.000Z', timezone: 'Europe/Zurich'}};
  assert.ok(captureMatchesCase(c, capture));
  assert.equal(captureMatchesCase(c, {...capture, query: 'another wish'}), false);
  assert.equal(captureMatchesCase(c, {...capture, reference: {...capture.reference, now: '2026-10-15T08:00:00.000Z'}}), false);
});
test('unknown terminology can survive as a free typed value, but cannot disappear or become another concept', () => {
  const c = QUALITY_CASES.find(c => c.id === 'unknown-1'), s = qualityScenario(c.group, c.query), gold = prepareQualityMeaning(c, s.raw);
  const raw = structuredClone(s.raw); raw.extensions = [];
  raw.facts.push({id: 'free', key: 'offer.feature', value: {text: 'Quantenlounge'}, modality: 'PREFERRED', basis: 'EXPLICIT', subjectIds: []});
  assert.deepEqual(checkUnderstanding(gold, prepareQualityMeaning(c, raw)), []);
  raw.facts.at(-1).value.text = 'Cocktailbar';
  assert.ok(checkUnderstanding(gold, prepareQualityMeaning(c, raw)).some(f => f.code === 'UNKNOWN_TERM_NOT_RETAINED'));
});
test('a dated dinner needs no invented day phase to reject a documented midday-only offer', () => {
  const c = QUALITY_CASES.find(c => c.id === 'dated-2'), s = qualityScenario(c.group, c.query);
  const raw = structuredClone(s.raw); raw.facts = raw.facts.filter(f => f.key !== 'time.day_phase');
  const actual = prepareQualityMeaning(c, raw);
  assert.deepEqual(checkUnderstanding(prepareQualityMeaning(c, s.raw), actual), []);
  assert.deepEqual(traceQualityCase(c, actual).failures, []);
});
test('general loudness uses the frozen bustle family; explicit disturbance noise remains distinct', () => {
  const c = QUALITY_CASES.find(c => c.id === 'access-3'), s = qualityScenario(c.group, c.query);
  const gold = prepareQualityMeaning(c, s.raw);
  assert.equal(gold.facts.find(f => f.id === 'soft').key, 'atmosphere.bustle');
  const raw = structuredClone(s.raw); raw.facts.find(f => f.id === 'soft').key = 'atmosphere.noise';
  assert.ok(checkUnderstanding(prepareQualityMeaning(c, raw), gold).some(f => f.family === 'atmosphere.noise'));
});
for (const [kind, concept, good, bad] of [
  ['BREAKFAST', 'breakfast', ['08:00', '10:00'], ['18:00', '22:00']],
  ['LUNCH', 'lunch', ['12:00', '14:00'], ['18:00', '22:00']],
  ['DINNER', 'dinner', ['18:00', '22:00'], ['11:00', '14:00']],
]) test(`dated ${concept} checks its own documented service hours without an invented day phase`, () => {
  const b = (i, hours) => {const v = binding(i, profile([{...offer('meal', kind), schedule: [{weekday: 4, start: hours[0], end: hours[1]}]}]));
    v.decisionProjection.facts.find(f => f.key === 'hours.regular').value = [{day: 'THURSDAY', intervals: [{start: '07:00', end: '23:00'}]}]; return v;};
  const result = search(request([date(), fact('meal', 'experience.activity', concept)]), [b(1, good), b(2, bad)]);
  assert.equal(result.ranked[0].spotId, b(1, good).decisionProjection.spotId);
  assert.ok(result.excluded.some(c => c.spotId === b(2, bad).decisionProjection.spotId));
});
test('an explicit meal clock wins; undated dinner and unknown hours remain nonblocking', () => {
  const midday = binding(1, profile([{...offer(), schedule: [{weekday: 4, start: '11:00', end: '14:00'}]}]));
  const dinner = fact('dinner', 'experience.activity', 'dinner');
  assert.equal(search(request([dinner]), [midday]).ranked.length, 1);
  assert.equal(search(request([dinner, date(), fact('clock', 'time.clock', {time: '12:00', operator: 'EQ', timezone: 'Europe/Zurich'})]), [midday]).ranked.length, 1);
  const unknown = binding(2, profile([{...offer(), schedule: []}]));
  assert.equal(search(request([dinner, date()]), [unknown]).ranked.length, 1);
  assert.equal(search(request([meal(), date()]), [midday]).ranked.length, 1);
});
test('a dinner service window cannot narrow a separate hotel stay witness or an alternative lunch', () => {
  const dinner = fact('dinner', 'experience.activity', 'dinner'), lunch = fact('lunch', 'experience.activity', 'lunch');
  const q = request([dinner, lunch, date()], {logic: {kind: 'ANY', strength: 'REQUIRED', children: [{kind: 'FACT', factId: 'dinner'}, {kind: 'FACT', factId: 'lunch'}]}});
  const b = binding(1, profile([{...offer('lunch', 'LUNCH'), schedule: [{weekday: 4, start: '11:00', end: '14:00'}]}]));
  assert.equal(search(q, [b]).ranked[0].status, 'CONFIRMED');
  const stay = fact('stay', 'experience.activity', 'overnight_stay', 'REQUIRED', ['a2']);
  const p = profile([{...offer('dinner', 'DINNER'), schedule: [{weekday: 4, start: '18:00', end: '22:00'}]}, {...offer('stay', 'OVERNIGHT_STAY'), schedule: [{weekday: 4, start: '11:00', end: '14:00'}]}]);
  assert.equal(search(request([dinner, stay, date()]), [binding(2, p)]).ranked[0].status, 'CONFIRMED');
});
test('Luna loudness matches the Owner noise level and only changes ranking, never admission', () => {
  const q = request([meal(), fact('noise', 'atmosphere.bustle', 'loud', 'EXCLUDED')]);
  const b = (i, level) => binding(i, profile([offer()], [area('inside', level ? [prop('atmosphere.noise', level)] : [])]));
  const result = search(q, [b(1, 'quiet'), b(2, 'loud'), b(3, null)]);
  assert.equal(result.ranked.length, 3);
  assert.equal(result.excluded.length, 0);
  for (const [i, state] of [[1, 'MET'], [2, 'FAILED'], [3, 'UNKNOWN']]) {
    const c = result.ranked.find(c => c.spotId === b(i, null).decisionProjection.spotId);
    assert.equal(c.facts.find(f => f.factId === 'noise').state, state);
  }
  assert.equal(result.ranked[0].spotId, b(1, 'quiet').decisionProjection.spotId);
});
test('bustle without a quiet/loud meaning cannot borrow the noise field', () => {
  const b = binding(1, profile([offer()], [area('inside', [prop('atmosphere.noise', 'quiet')])]));
  const result = search(request([meal(), fact('bustle', 'atmosphere.bustle', 'quietly bustling', 'PREFERRED')]), [b]);
  assert.equal(result.ranked[0].facts.find(f => f.factId === 'bustle').state, 'UNKNOWN');
});
