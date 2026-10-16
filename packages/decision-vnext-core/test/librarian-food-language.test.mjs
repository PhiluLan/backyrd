import test from 'node:test';
import assert from 'node:assert/strict';
import { fact, request, profile, offer, area, prop, price, binding, search, budget } from './librarian-matching-fixtures.mjs';

// Expected outcomes describe product duties, independently of the matching implementation.
// The source sentence is not interpreted by this deterministic stage.
for (const kind of ['LUNCH', 'DINNER', 'FULL_MEAL']) {
  test(`a normalized food.meal wish can use a real ${kind} offer`, () => {
    const result = search(request([fact('food', 'food.meal', 'essen gehen')]), [binding(1, profile([offer('food', kind)]))]);
    assert.equal(result.ranked[0]?.status, 'CONFIRMED');
    assert.deepEqual(result.ranked[0].offerIds, ['food']);
    assert.equal(result.ranked[0].facts.find(f => f.factId === 'food').family, 'food.meal');
  });
}
test('a drinks offer alone does not prove a meal', () => {
  const r = search(request([fact('food', 'food.meal', 'essen gehen')]), [binding(1, profile([offer('bar', 'DRINKS')]))]);
  assert.equal(r.ranked.length, 0);
  assert.equal(r.unresolved.length, 1);
});
test('generic drinking can use the drinks offer, while wine still needs wine evidence', () => {
  const catalog = [binding(1, profile([offer('bar', 'DRINKS')]))];
  assert.equal(search(request([fact('drink', 'food.drink', 'etwas trinken')]), catalog).ranked[0]?.status, 'CONFIRMED');
  assert.equal(search(request([fact('drink', 'food.drink', 'Wein')]), catalog).ranked.length, 0);
});
test('a museum meal request uses its dining offer, preserving venue and meal separately', () => {
  const p = profile([offer('entry', 'SELF_GUIDED_VISIT'), offer('food', 'LUNCH')], [area()], 'MUSEUM');
  const q = request([fact('museum', 'offer.kind', 'Museum', 'REQUIRED', []), fact('food', 'food.meal', 'essen gehen')]);
  assert.equal(search(q, [binding(1, p)]).ranked[0]?.status, 'CONFIRMED');
});
test('diet and budget remain attached to the meal selected through food.meal', () => {
  const p = profile([offer('food', 'DINNER', ['inside'], [prop('food.diet', 'vegan')], [price(30)]), offer('bar', 'DRINKS', ['inside'], [], [price(5)])]);
  const q = request([fact('food', 'food.meal', 'essen gehen'), fact('diet', 'food.diet', 'vegan'), ...budget(35)]);
  const r = search(q, [binding(1, p)]);
  assert.equal(r.ranked[0]?.status, 'CONFIRMED');
  assert.deepEqual(r.ranked[0].offerIds, ['food']);
});
test('diet in another meal cannot satisfy the requested dinner', () => {
  const p = profile([offer('dinner', 'DINNER'), offer('lunch', 'LUNCH', ['inside'], [prop('food.diet', 'vegan')])]);
  const q = request([fact('dinner', 'food.meal', 'Abendessen'), fact('diet', 'food.diet', 'vegan')]);
  const r = search(q, [binding(1, p)]);
  assert.notEqual(r.ranked[0]?.status, 'CONFIRMED');
});
test('a cheap drink does not lower a meal budget through the food.meal family', () => {
  const p = profile([offer('food', 'DINNER', ['inside'], [], [price(65)]), offer('bar', 'DRINKS', ['inside'], [], [price(5)])]);
  const r = search(request([fact('food', 'food.meal', 'essen gehen'), ...budget(35)]), [binding(1, p)]);
  assert.ok(r.excluded[0]?.failedFactIds.includes('money'));
});
test('an unrecognized food concept remains unknown rather than becoming a meal', () => {
  const r = search(request([fact('food', 'food.meal', 'unbekanntes Spezialangebot')]), [binding(1, profile())]);
  assert.equal(r.ranked.length, 0);
  assert.equal(r.unresolved[0].facts.find(f => f.factId === 'food').state, 'UNKNOWN');
});

test('recorded Luna output reaches catalog matching unchanged, including date, city and mood', async () => {
  const { readFileSync } = await import('node:fs');
  const { prepareLibrarianRequest, LUNA_LIBRARIAN_CONTRACT_VERSION } = await import('../dist/product-luna-librarian.js');
  const { searchLibrarianCatalog } = await import('../dist/product-librarian-matching.js');
  const fixture = JSON.parse(readFileSync(new URL('./request-understanding/luna-librarian-fixtures.json', import.meta.url), 'utf8'))[0];
  const q = prepareLibrarianRequest({contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, output: fixture.output, sourceText: fixture.request, reference: fixture.reference});
  const candidates = ['gemütlich', 'lebhaft'].map((mood, index) => {
    const b = binding(index + 1, profile([offer('drinks', 'DRINKS')], [area('inside', [prop('atmosphere.character', mood)])], 'BAR'));
    b.decisionProjection.facts.find(f => f.key === 'location.locality').value = 'Baden';
    return b;
  });
  const result = searchLibrarianCatalog({request: q, catalog: candidates, authority: {city: 'Baden', now: '2026-10-14T08:00:00Z'}});
  assert.equal(result.ranked[0].status, 'CONFIRMED');
  assert.deepEqual(result.ranked[0].unknownFactIds, []);
  assert.equal(result.ranked[1].status, 'PARTIAL');
  assert.equal(q.source.sourceText, fixture.request);
  assert.deepEqual(q.raw, fixture.output);
});
