import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDecisionProductContext } from '../../dist/product-v1-evaluator.js';
import { hasPreciseRequestedTime, requestBudget } from '../../dist/product-request-context.js';
const resolve = (naturalLanguage, explicit = {}, serverTime = '2026-10-10T12:00:00.000Z') => resolveDecisionProductContext({
  contractVersion: 'backyrd.decision-vnext.product-request@1.0', requestId: 'context-test', idempotencyKey: 'context-test', naturalLanguage,
  explicit, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [],
}, { authorizedCity: 'Basel', serverTime });

test('stated ages survive German words, English and multiple people without fabricating group size', () => {
  for (const [text, age] of [
    ['Museum mit meiner vierjährigen Tochter', 4], ['Mit meinem 4-jährigen Kind ins Museum', 4], ['Museum with my four-year-old daughter', 4],
    ['Museum mit meinem 12-jährigen Sohn und meiner 4-jährigen Tochter', 4],
    ['Museum mit meiner vierjährigen Tochter und meinem achtjährigen Sohn', 4],
    ['Museum with a 4 year old child', 4], ['Museum mit meiner 104-jährigen Oma', 104],
  ]) {
    const context = resolve(text);
    assert.equal(context.group.minimumAge, age, text);
    assert.equal(context.group.size, null, text);
  }
  const family = resolve('Familienausflug ins Museum');
  assert.equal(family.group.minimumAge, null);
  assert.equal(family.group.size, null);
  assert.equal(family.group.adultPresent, false);
  assert.equal(family.group.companionType, 'FAMILY');
  assert.equal(resolve('Kindergartenmuseum').group.companionType, null);
});

test('explicit group stays authoritative over inferred request context', () => {
  const group = { size: 3, minimumAge: 6, adultPresent: false, companionType: 'FAMILY' };
  assert.deepEqual(resolve('Museum mit meiner vierjährigen Tochter', { group }).group, group);
});

test('CHF ceiling variants retain amount and scope without implying unsupported comparisons', () => {
  for (const text of ['Kaffee maximal 30 CHF pro Person', 'Coffee at most CHF 30 per person', 'Kaffee Budget: 30 Franken pro Person', 'Pro Person maximal 30 CHF.', 'Coffee at most CHF 30, per person']) {
    const context = resolve(text);
    assert.equal(context.budget.amount, 30);
    assert.equal(context.budget.perPerson, true);
    assert.ok(context.hardConstraints.includes('BUDGET_MAXIMUM'));
    assert.ok(!context.unresolvedTerms.includes('BUDGET_SEMANTICS_UNVERIFIED'));
  }
  for (const text of ['Kaffee unter 30 CHF pro Person', 'Coffee under CHF 30 per person', 'Kaffee maximal 30 CHF insgesamt', 'Kaffee maximal 30 CHF', 'Kaffee maximal 29,50 CHF pro Person', 'Kaffee maximal 30 CHF oder maximal 40 CHF pro Person']) {
    const context = resolve(text);
    assert.ok(context.hardConstraints.includes('BUDGET_MAXIMUM'), text);
    assert.ok(context.unresolvedTerms.includes('BUDGET_SEMANTICS_UNVERIFIED'), text);
  }
  assert.equal(resolve('Kaffee maximal 29,50 CHF pro Person').budget.amount, null, 'do not round fractional ceilings');
  assert.equal(requestBudget('Maximal vier Personen, Kaffee kostet 30 CHF').requested, false);
  assert.equal(requestBudget('Kaffee für 30 CHF').requested, false);
});

test('English relative dates and weekdays use authoritative Swiss time including DST', () => {
  assert.equal(resolve('Kaffee übermorgen').dateTime.localDate, '2026-10-12');
  assert.equal(resolve('Coffee tomorrow evening').dateTime.dayPhase, 'EVENING');
  assert.equal(resolve('Coffee tomorrow').dateTime.localDate, '2026-10-11');
  assert.equal(resolve('Coffee day after tomorrow').dateTime.localDate, '2026-10-12');
  assert.equal(resolve('Coffee Sunday').dateTime.localDate, '2026-10-11');
  assert.equal(resolve('Coffee tomorrow', {}, '2026-10-24T22:30:00.000Z').dateTime.localDate, '2026-10-26');
  assert.equal(resolve('Kaffee am Morgen').dateTime.localDate, '2026-10-10');
  assert.ok(resolve('Coffee tomorrow').hardConstraints.includes('OPEN_ON_REQUESTED_DAY'));
});

test('exact time remains unverified with or without the optional AI interpreter', () => {
  for (const text of ['Cocktails nach 22 Uhr', 'Coffee at 10:30', 'Coffee before 10pm', 'Kaffee um 09:15', 'Kaffee 09:15']) {
    assert.equal(hasPreciseRequestedTime(text), true, text);
    assert.ok(resolve(text).unresolvedTerms.includes('PRECISE_TIME_UNVERIFIED'), text);
  }
  for (const text of ['Coffee tomorrow evening', 'Kaffee heute Abend', 'Museum mit 10 Kindern', 'Kaffee für 10 CHF']) {
    assert.equal(hasPreciseRequestedTime(text), false, text);
  }
});


test('directly negated calendar references cannot override the requested day', () => {
  for (const text of ['Nicht morgen, heute Kaffee trinken', 'Kaffee heute statt morgen', 'Heute Kaffee, nicht morgen', 'Coffee today, not tomorrow', 'Coffee today instead of tomorrow', 'Kaffee nicht am Sonntag, sondern am Montag']) {
    assert.equal(resolve(text).dateTime.localDate, text.includes('Montag') ? '2026-10-12' : '2026-10-10', text);
  }
});
