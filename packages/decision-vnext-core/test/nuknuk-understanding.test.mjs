import test from 'node:test';
import assert from 'node:assert/strict';
import { contentHash } from '../dist/canonical.js';
import { buildNuknukCompactSearchRequest, validateNuknukCompactSearch, buildNuknukUnderstandingRequest, understandWithNuknuk, validateNuknukUnderstanding } from '../dist/nuknuk-understanding.js';
import { auditUnderstandingDataset, exportUnderstandingDataset, understandingSplitHash, reviseUnderstandingCase, recordUnderstandingReview } from '../dist/nuknuk-understanding-learning.js';
import { draftUnderstandingDataset, understandingDevelopmentCases } from '../../../scripts/decision-diagnostics/nuknuk-understanding-cases.mjs';
import { evaluateNuknukAgainstCatalog } from '../../../scripts/decision-diagnostics/nuknuk-understanding.mjs';
import { binding, offer, profile, prop, worldFact } from './librarian-matching-fixtures.mjs';
import { buildNuknukAssessmentRequest, validateNuknukAssessment, assessWithNuknuk } from '../dist/nuknuk-grounded-assessment.js';
import { buildPilotCohort, pilotReviewMarkdown, PILOT_PLAN_HASH } from '../../../scripts/decision-diagnostics/nuknuk-pilot-cohort.mjs';

const example = understandingDevelopmentCases[0].content;
const modelPath = '/models/45797d2985a12c55e6473686e9ea91b95e959553';
const copy = () => structuredClone(example.target);

test('a birthday dinner stays searchable alongside an optional clarification', () => {
  const query = 'Geburtstag von meiner Frau, suche etwas besonderes für uns zwei zum Essen heute Abend in Basel';
  const meaning = {facts: [
    {id:'meal',key:'experience.activity',value:{text:'essen'},modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[]},
    {id:'special',key:'experience.character',value:{text:'besonders'},modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[]},
  ]};
  const first = validateNuknukCompactSearch({meaning},{...example,query});
  assert.equal(first.requestState,'EXECUTABLE');
  assert.equal(first.plan.facts.find(f => f.id === 'meal').value.text,'dinner');
  assert.equal(first.plan.facts.find(f => f.id === 'special').modality,'PREFERRED');
  assert.match(first.clarification.question,/Atmosphäre, die Küche oder ein persönlicher Bezug/u);
  const answered = query + ' Rückfrage: ' + first.clarification.question + ' Antwort: Wir haben uns im Restaurant Krafft kennen gelernt.';
  const second = validateNuknukCompactSearch({meaning},{...example,query:answered});
  assert.equal(second.clarification,null);
  const withoutEvening = validateNuknukCompactSearch({meaning},{...example,query:'Zum Geburtstag möchten wir etwas Besonderes essen gehen.'});
  assert.equal(withoutEvening.plan.facts.find(f => f.id === 'meal').key,'experience.activity');
});

test('a completed Wohin turn suppresses the repeated model question and keeps the search plan', () => {
  const question = {question:'Was würde den Abend besonders machen?',dimension:'EXPERIENCE_DIRECTION',
    options:['Ruhig essen','Etwas Neues probieren']};
  const original = 'Wir suchen ein Abendessen in Basel.';
  const meaning = {facts:[{id:'meal',key:'food.meal',value:{text:'dinner'},modality:'REQUIRED',
    basis:'EXPLICIT',subjectIds:[]}]};
  const query = [original,`Rückfrage: ${question.question}`,'Antwort: Wir würden gern etwas Neues probieren.'].join('\n');
  for (const text of [query,query.replace(/\s+/gu,' ')]) {
    const result = validateNuknukCompactSearch({meaning,clarification:question},{...example,query:text});
    assert.equal(result.requestState,'EXECUTABLE');
    assert.equal(result.clarification,null);
    assert.equal(result.plan.facts[0].value.text,'dinner');
  }
  const first = validateNuknukCompactSearch({meaning,clarification:question},{...example,query:original});
  assert.deepEqual(first.clarification,question);
  const next = {...question,question:'Welche Küche möchtet ihr ausprobieren?',options:['Koreanisch','Libanesisch']};
  const second = validateNuknukCompactSearch({meaning,clarification:next},{...example,query});
  assert.deepEqual(second.clarification,next);
});

test('legacy children_activity keeps its scope and modality under the canonical suitability family', () => {
  const fact = {id:'children',key:'experience.activity',value:{text:'children_activity'},
    modality:'REQUIRED',basis:'EXPLICIT',subjectIds:['visit']};
  const meaning = {entities:[{id:'visit',kind:'ACTIVITY',label:'Besuch',members:[]}],facts:[fact]};
  const result = validateNuknukCompactSearch({meaning}, {...example,query:'Was können wir mit den Kindern machen?'});
  assert.equal(result.requestState,'EXECUTABLE');
  assert.deepEqual(result.plan.facts.find(f=>f.id==='children'), {
    ...fact,key:'condition.children',value:{...fact.value,kind:'TEXT'},
  });
  assert.equal(result.output.facts[0].key,'experience.activity');
  assert.throws(()=>validateNuknukCompactSearch({meaning},{...example,query:'Was kann ich alleine machen?'}),
    /nuknuk_meaning_contract_failed/u);
});

test('explicit walk-in survives a missing model fact, while a flexible booking wish stays open', () => {
  const activity = {id:'piano',key:'experience.activity',value:{text:'Klavier üben'},modality:'REQUIRED',basis:'EXPLICIT',subjectIds:['visit']};
  const meaning = {entities:[{id:'visit',kind:'ACTIVITY',label:'Klavier üben',members:[]}],facts:[activity]};
  const query = 'Zum Klavierüben möchte ich einfach vorbeigehen können, ohne dafür ein Zeitfenster zu reservieren.';
  for (const value of [null,'walk-in','walk_in']) {
    const facts = value ? [...meaning.facts,{...activity,id:'booking',key:'participation.booking',value:{text:value}}] : meaning.facts;
    const result = validateNuknukCompactSearch({meaning:{...meaning,facts}}, {...example,query});
    const booking = result.plan.facts.filter(f=>f.key==='participation.booking');
    assert.equal(booking.length,1);
    assert.equal(booking[0].modality,'REQUIRED');
    assert.deepEqual(booking[0].subjectIds,['visit']);
  }
  const optional = validateNuknukCompactSearch({meaning},{...example,query:'Zum Klavierüben ist für mich spontan oder mit Reservation gleich gut.'});
  assert.equal(optional.plan.facts.some(f=>f.key==='participation.booking'),false);
  const multi = validateNuknukCompactSearch({meaning:{...meaning,entities:[...meaning.entities,{id:'other',kind:'ACTIVITY',label:'Andere Aktivität',members:[]}]}},
    {...example,query});
  assert.equal(multi.requestState,'UNSUPPORTED_CAPABILITY');
  assert.equal(multi.plan,null);
  assert.match(multi.clarification.question,/Für welchen Teil/u);
});

test('an unsupported hard need offers a clarification without running a partial spot search', async () => {
  const {createDecisionProductNuknukProvider} = await import('../dist/product-nuknuk-provider.js');
  const {exercise} = await import('./librarian-active-route-fixtures.mjs');
  const text = 'Ich suche einen Garten. Auf dem Weg dorthin brauche ich regelmässig Bänke.';
  const raw = {meaning:{facts:[{id:'garden',key:'experience.activity',value:{text:'Garten besuchen'},
    modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[]}],extensions:[{id:'benches',
    description:'Auf dem benutzten Weg sind regelmässig Bänke nötig.',modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[]}]}};
  const result = validateNuknukCompactSearch(raw,{query:text,reference:example.reference});
  assert.equal(result.requestState,'UNSUPPORTED_CAPABILITY');
  assert.equal(result.searchMeaning.extensions[0].modality,'REQUIRED');
  assert.match(result.clarification.question,/Spotdaten reichen/u);
  const provider = createDecisionProductNuknukProvider({endpoint:'https://example.test/v1/chat/completions',apiKey:'test-key',model:'synthetic',
    fetchImpl:async()=>new Response(JSON.stringify({model:'synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]}))});
  const reply = await exercise({text,catalog:[binding(1,profile())],understandOverride:provider});
  assert.equal(reply.status,422);
  assert.equal(reply.reads,0);
  assert.match(JSON.stringify(reply.body),/DECISION_NEEDS_CLARIFICATION/u);
});

test('uses current canonical meaning without installing a new Product provider', () => {
  const body = buildNuknukUnderstandingRequest(example);
  assert.ok(body.instructions.includes('experience.occasion'));
  assert.ok(body.instructions.includes('HYPOTHESIS'));
  assert.ok(body.outputSchema.$defs.fact);
  assert.equal(body.outputSchema.properties.meaning.properties.facts.items.$ref, '#/$defs/fact');
  assert.equal(body.identity.schemaHash, contentHash(body.outputSchema));
  const result = validateNuknukUnderstanding(copy(), example);
  assert.equal(result.plan.source.sourceText, example.query);
  assert.equal(result.plan.facts.find(f => f.key === 'food.meal').value.text, 'dinner');
});
test('compact search preserves canonical meaning, plan and clarification on development fixtures', () => {
  for (const { content } of understandingDevelopmentCases) {
    const full = validateNuknukUnderstanding(content.target, content);
    const meaning = Object.fromEntries(Object.entries(content.target.meaning)
      .filter(([key, value]) => key === 'facts' || (value !== null && (!Array.isArray(value) || value.length > 0))));
    const question = content.target.moment.clarification;
    const compact = validateNuknukCompactSearch({ meaning, ...(question ? { clarification: question } : {}) }, content);
    assert.deepEqual(compact.plan, full.plan);
    assert.deepEqual(compact.capabilityGaps, full.capabilityGaps);
    assert.deepEqual(compact.clarification, full.moment.clarification);
  }
});

test('compact single activity restores identifiers and keeps duration and proximity executable', async () => {
  const query = 'Ich bin am Bahnhof SBB und habe 25 Minuten bis zum Zug. Irgendwo schnell etwas Warmes essen?';
  const input = { query, reference: example.reference };
  const request = buildNuknukCompactSearchRequest(input);
  assert.equal(JSON.parse(request.input).request, query);
  assert.deepEqual(request.outputSchema.required, ['meaning']);
  assert.doesNotMatch(request.instructions, /moment:\{|Quotes wortwörtlich/u);
  assert.match(request.instructions, /Mahlzeit als food\.meal/u);
  assert.match(request.instructions, /Keine Rückfrage zu einem\s+anderen Termin/u);
  const fact = (key, value) => ({ key, value, modality: 'REQUIRED', basis: 'EXPLICIT' });
  const meaning = { facts: [
    fact('location.proximity', { text: 'Bahnhof SBB' }),
    fact('time.duration', { amount: 25, operator: 'LTE', unit: 'MINUTES', measurementScope: 'AVAILABLE_TOTAL', includes: [] }),
    fact('food.meal', { text: 'meal' }),
    fact('food.dish', { text: 'warm' }),
  ] };
  const result = validateNuknukCompactSearch({ meaning, singleActivity: true }, input);
  assert.deepEqual(result.plan.facts.map(({ id, key, subjectIds }) => ({ id, key, subjectIds })),
    meaning.facts.map(({ key }, index) => ({ id: `f${index + 1}`, key, subjectIds: ['a1'] })));
  assert.throws(() => validateNuknukCompactSearch({ meaning }, input));
  assert.throws(() => validateNuknukCompactSearch({
    meaning: { ...meaning, bindings: [{ kind: 'SAME_PLACE', factIds: ['f1', 'f2'] }] }, singleActivity: true,
  }, input), /nuknuk_compact_single_activity_has_references/);
  const food = profile([offer('warm-meal', 'DINNER', ['inside'], [prop('food.dish', 'warm')])]);
  const nearby = binding(101, food, [worldFact('location.latitude', 47.54757), worldFact('location.longitude', 7.58956)]);
  const far = binding(102, food, [worldFact('location.latitude', 47.568243), worldFact('location.longitude', 7.58165)]);
  const evaluation = await evaluateNuknukAgainstCatalog({ ...result, identity: { local: true } }, [nearby, far], input.reference);
  const nearResult = evaluation.search.unresolved.find(candidate => candidate.spotId === nearby.decisionProjection.spotId);
  const farResult = evaluation.search.excluded.find(candidate => candidate.spotId === far.decisionProjection.spotId);
  assert.ok(nearResult);
  assert.ok(farResult);
  assert.equal(nearResult.facts.find(fact => fact.factId === 'f1').state, 'MET');
  assert.equal(nearResult.facts.find(fact => fact.factId === 'f2').state, 'UNKNOWN');
  assert.equal(nearResult.facts.find(fact => fact.factId === 'f3').state, 'MET');
  assert.equal(nearResult.facts.find(fact => fact.factId === 'f4').state, 'MET');
  assert.equal(farResult.facts.find(fact => fact.factId === 'f1').state, 'FAILED');
  const redundantQuestion = {
    question: 'Soll der Ort in der Nähe des genannten Ausgangspunkts sein?',
    dimension: 'DATE', options: ['In der Nähe', 'Anderswo'],
  };
  const explicitMeaning = result.output;
  const redundant = validateNuknukCompactSearch({
    meaning: explicitMeaning, singleActivity: true, clarification: redundantQuestion,
  }, input);
  assert.deepEqual(redundant.plan, result.plan);
  assert.equal(redundant.clarification, null);
  const usefulQuestion = {
    question: 'Möchtest du vor Ort essen oder etwas mitnehmen?',
    dimension: 'OTHER', options: ['Vor Ort', 'Mitnehmen'],
  };
  assert.deepEqual(validateNuknukCompactSearch({
    meaning, singleActivity: true, clarification: usefulQuestion,
  }, input).clarification, usefulQuestion);
  const restricted = validateNuknukCompactSearch({ meaning, singleActivity: true },
    { ...input, query: query + ' Spuren von Sesam sind nicht erlaubt.' });
  assert.equal(restricted.requestState, 'UNSUPPORTED_CAPABILITY');
  assert.equal(restricted.plan, null);
});

test('a broken compact clarification leaves a valid search executable and never makes a broken search valid', () => {
  const input = { query: 'Wo kann ich in Basel Rösti essen?', reference: example.reference };
  const meal = { id: 'meal', key: 'food.dish', value: { text: 'Rösti' }, modality: 'REQUIRED', basis: 'EXPLICIT', subjectIds: [] };
  const meaning = { facts: [meal] };
  const valid = validateNuknukCompactSearch({ meaning }, input);
  for (const badQuestion of [
    { question: ',', dimension: 'OTHER', options: ['outdoor', 'outdoor'] },
    { question: 'Möchtest du lieber drinnen oder draussen essen?', dimension: 'OTHER', options: ['Draussen', 'draussen '] },
    { question: 'Möchtest du lieber drinnen oder draussen essen?', options: ['Drinnen', 'Draussen'] },
  ]) {
    const result = validateNuknukCompactSearch({ meaning, clarification: badQuestion }, input);
    assert.deepEqual(result.plan, valid.plan);
    assert.equal(result.clarification, null);
    assert.equal(result.clarificationIssue, 'INVALID_MODEL_CLARIFICATION');
    assert.throws(() => validateNuknukCompactSearch({
      meaning: { facts: [{ ...meal, modality: 'UNKNOWN' }] }, clarification: badQuestion,
    }, input));
  }
  const badQuestion = { question: ',', dimension: 'OTHER', options: ['A', 'B'] };
  const budget = { ...meal, key: 'budget.maximum', value: { amount: 20, operator: 'LTE', currency: 'CHF' } };
  assert.throws(() => validateNuknukCompactSearch({
    meaning: { facts: [] }, clarification: badQuestion,
  }, input), /librarian_contract_empty_meaning/u);
  const result = validateNuknukCompactSearch({ meaning: { facts: [budget] }, clarification: badQuestion }, input);
  assert.equal(result.requestState, 'NEEDS_CLARIFICATION');
  assert.equal(result.plan, null);
  assert.equal(result.clarification, null);
});

test('an explicit outdoor component filters indoor-only results and reports missing evidence', async () => {
  const input = { query: 'Sonntag Bewegung mit meinem Kind. Bei Schauern gern kurz unter ein Dach, aber wir möchten auch draussen spielen.', reference: example.reference };
  const fact = (id, key, text, modality) => ({ id, key, value: { text }, modality, basis: 'EXPLICIT', subjectIds: [] });
  const activity = fact('movement', 'experience.activity', 'movement_play', 'REQUIRED');
  const meaning = { facts: [activity, fact('out', 'offer.area', 'outdoor', 'CONTEXT')] };
  const result = validateNuknukCompactSearch({ meaning }, input);
  assert.equal(result.plan.facts.find(f => f.id === 'out').modality, 'REQUIRED');
  const indoor = binding(1, profile([offer('play', 'MOVEMENT_PLAY', ['inside'])]));
  const outside = { id: 'terrace', kind: 'TERRACE', name: 'Aussenteil', properties: [] };
  const mixed = binding(2, profile([offer('play', 'MOVEMENT_PLAY', ['terrace'])], [outside]));
  const run = catalog => evaluateNuknukAgainstCatalog({ ...result, identity: { local: true } }, catalog, input.reference);
  const noMatch = await run([indoor]);
  assert.equal(noMatch.response.primaryCandidateId, null);
  assert.ok(noMatch.response.candidates.some(candidate => candidate.unknownHardConstraints.length > 0 || candidate.failedHardConstraints.length > 0));
  assert.equal((await run([indoor, mixed])).response.primaryCandidateId, mixed.decisionProjection.spotId);

  const indoorQuery = { ...input, query: 'Bei Dauerregen bitte den ganzen Nachmittag drinnen bleiben.' };
  const indoorOnly = validateNuknukCompactSearch({ meaning: { facts: [activity, fact('inside', 'offer.area', 'indoor', 'REQUIRED')] } }, indoorQuery);
  assert.equal(indoorOnly.plan.facts.some(f => f.value.text === 'outdoor'), false);
});

test('an unbound rain condition gets a scoped question and cannot reach spot selection', async () => {
  const query = 'Wenn es immer wieder regnet, möchten wir nicht den ganzen Nachmittag drinnen sein.';
  const meaning = {
    facts: [{ id: 'inside', key: 'offer.area', value: { text: 'indoor' }, modality: 'CONTEXT', basis: 'EXPLICIT', subjectIds: [] }],
    weatherConditions: [{ id: 'rain', role: 'CONDITIONAL', state: 'RAIN', basis: 'EXPLICIT', subjectIds: [], detail: null }],
  };
  const result = validateNuknukCompactSearch({ meaning }, { query, reference: example.reference });
  assert.equal(result.requestState, 'NEEDS_CLARIFICATION');
  assert.equal(result.plan, null);
  const evaluation = await evaluateNuknukAgainstCatalog({ ...result, moment: { clarification: result.clarification } }, [], example.reference);
  assert.equal(evaluation.response, null);
  assert.match(evaluation.clarification.question, /draussen.*Regen/u);
  assert.throws(() => validateNuknukCompactSearch({ meaning }, { query: 'Ich möchte heute etwas unternehmen.', reference: example.reference }), /condition_unbound/u);
});

for (const item of understandingDevelopmentCases) test(`development target is structurally valid, not semantically approved: ${item.id}`, () => {
  const result = validateNuknukUnderstanding(item.content.target, item.content);
  assert.ok(result.limitations.includes('STRUCTURAL_VALIDATION_IS_NOT_SEMANTIC_PROOF'));
  assert.equal(item.reviews.length, 0);
});
test('a plausible emotional interpretation never creates a mandatory fact', () => {
  const raw = copy();
  raw.moment.hypotheses.push({ statement: 'Vielleicht soll der Abend Wertschätzung ausdrücken.', evidence: [{ quote: 'Geburtstag' }], status: 'HYPOTHESIS' });
  const parsed = validateNuknukUnderstanding(raw, example);
  assert.deepEqual(parsed.output.meaning, example.target.meaning);
  assert.equal(parsed.plan.facts.some(f => f.key === 'budget.maximum' || f.key === 'time.date'), false);
});
test('explicit trace prohibitions stop the canonical search even when meaning omits them', async () => {
  const variants = [
    ['Pekannüsse als Zutat und Spuren von Pekannüssen dürfen keinesfalls vorkommen.', true],
    ['Kreuzkontakt mit Erdnüssen muss ausgeschlossen sein.', false],
    ['Spuren von Sesam sind nicht erlaubt.', false],
  ];
  for (const [restriction, excludesIngredient] of variants) {
    const result = validateNuknukUnderstanding(copy(), { ...example, query: `${example.query} ${restriction}` });
    assert.equal(result.boundary, 'UNSUPPORTED_FOOD_TRACE_VERIFICATION');
    assert.equal(result.plan, null);
    assert.equal(result.capabilityGaps.some(gap => gap.factId === 'source:food-ingredient-exclusion'), excludesIngredient);
    const evaluation = await evaluateNuknukAgainstCatalog(result, [binding(1, profile())], example.reference);
    assert.equal(evaluation.status, 'UNSUPPORTED_CAPABILITY');
    assert.equal(evaluation.response, null);
  }
});
test('optional and accepted traces do not create a hard requirement', () => {
  for (const preference of [
    'Am liebsten ohne Spuren von Mandeln, Spuren wären aber völlig okay.',
    'Gerne ohne Spuren von Haselnüssen, falls das klappt.',
    'Ohne Spuren von Walnüssen ist kein Muss.',
    'Spuren von Pistazien sind für mich okay.',
  ]) {
    const result = validateNuknukUnderstanding(copy(), { ...example, query: `${example.query} ${preference}` });
    assert.equal(result.requestState, 'EXECUTABLE');
    assert.equal(result.boundary, null);
  }
});
test('rejects made-up quotes, unexpected fields, invalid meanings and multiple questions', () => {
  const fabricated = copy(); fabricated.moment.goal.evidence[0].quote = 'sie liebt Fine Dining';
  assert.throws(() => validateNuknukUnderstanding(fabricated, example), /nuknuk_quote_not_in_query/);
  const shifted = copy(); shifted.moment.goal.evidence[0].offset = 3;
  assert.throws(() => validateNuknukUnderstanding(shifted, example));
  const duty = copy(); duty.meaning.facts[0].modality = 'REQUIRED';
  assert.throws(() => validateNuknukUnderstanding(duty, example));
  const questions = copy(); questions.moment.clarification = [questions.moment.clarification, questions.moment.clarification];
  assert.throws(() => validateNuknukUnderstanding(questions, example));
});
test('refuses a different local model or silently loaded adapter before inference', async () => {
  for (const health of [{ loaded_model: '/other', loaded_adapter: null }, { loaded_model: modelPath, loaded_adapter: 'unknown' }]) {
    const urls = [];
    await assert.rejects(understandWithNuknuk({ ...example, modelPath, signal: AbortSignal.timeout(2000), fetchImpl: async url => { urls.push(url); return Response.json(health); } }), /nuknuk_model_identity_mismatch/);
    assert.equal(urls.length, 1);
  }
});
test('local model transport never forwards provider keys or follows redirects; no automatic output repair', async () => {
  let calls = 0;
  const result = await understandWithNuknuk({ ...example, modelPath, signal: AbortSignal.timeout(2000), fetchImpl: async (url, options) => {
    assert.ok(url.startsWith('http://127.0.0.1:8088/')); assert.equal(options.redirect, 'error');
    assert.equal(options.headers?.authorization, undefined);
    if (++calls === 1) return Response.json({ loaded_model: modelPath, loaded_adapter: null });
    const body = JSON.parse(options.body); assert.equal(body.temperature, 0); assert.equal(body.stream, false);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(example.target) } }], usage: { prompt_tokens: 12, completion_tokens: 25 } });
  } });
  assert.equal(calls, 2); assert.equal(result.usage.outputTokens, 25); assert.equal(result.identity.adapter, null);
});
test('an interrupted answer is not accepted even if its JSON parses', async () => {
  let calls = 0;
  await assert.rejects(understandWithNuknuk({ ...example, modelPath, signal: AbortSignal.timeout(2000), fetchImpl: async () => ++calls === 1
    ? Response.json({ loaded_model: modelPath, loaded_adapter: null })
    : Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(example.target) } }] }) }), /nuknuk_response_incomplete/);
  assert.equal(calls, 2);
});
test('corrected birthday understanding reaches the same canonical dinner evaluator; hypotheses cannot invent eligibility', async () => {
  const result = validateNuknukUnderstanding(copy(), example);
  const evaluation = await evaluateNuknukAgainstCatalog({ ...result, identity: { local: true } }, [binding(1, profile())], example.reference);
  assert.equal(evaluation.productionWrites, 0); assert.equal(evaluation.learningWrites, 0);
  assert.equal(evaluation.momentUsedForRanking, false);
  assert.equal(evaluation.response.primaryCandidateId, binding(1, profile()).decisionProjection.spotId);
  const open = understandingDevelopmentCases.at(-1).content;
  const clarification = await evaluateNuknukAgainstCatalog(validateNuknukUnderstanding(open.target, open), [], open.reference);
  assert.equal(clarification.status, 'NEEDS_CLARIFICATION'); assert.equal(clarification.response, null);
});
async function assessmentFixture() {
  const understood = validateNuknukUnderstanding(copy(), example);
  const evaluation = await evaluateNuknukAgainstCatalog({ ...understood, identity: { local: true } }, [binding(1, profile())], example.reference);
  const request = buildNuknukAssessmentRequest({ response: evaluation.response, moment: understood.moment });
  const candidate = request.candidates[0];
  const target = { assessments: [{ candidateId: candidate.candidateId, fit: 'POSSIBLE',
    judgment: 'Ein Abendessen ist belegt; ob es für diesen Geburtstag besonders passt, ist noch offen.',
    reasonCodes: [candidate.evidence[0].reasonCode], uncertainty: 'Die Vorlieben der Frau sind nicht bekannt.' }],
    missingKnowledge: ['Es fehlen unterscheidende Belege für die besondere Anlasspassung.'] };
  return { understood, evaluation, request, target };
}
test('structured evidence exercise receives only eligible candidates and public-safe reasons, no taste vectors', async () => {
  const fixture = await assessmentFixture();
  assert.equal(fixture.request.candidates.length, 1);
  assert.equal(fixture.request.input.includes('userRelevance'), false);
  assert.equal(fixture.request.input.includes('projectionHash'), false);
  const excluded = structuredClone(fixture.evaluation.response);
  excluded.candidates[0].rank = null;
  assert.equal(buildNuknukAssessmentRequest({ response: excluded, moment: fixture.understood.moment }).candidates.length, 0);
  const unknown = structuredClone(fixture.evaluation.response); unknown.candidates[0].unknownHardConstraints.push('unknown');
  assert.equal(buildNuknukAssessmentRequest({ response: unknown, moment: fixture.understood.moment }).candidates.length, 0);
});
test('advisory assessment cannot cite another spot or invent an evidence code', async () => {
  const { request, target } = await assessmentFixture();
  assert.equal(validateNuknukAssessment(target, request).state, 'ADVISORY_REQUIRES_SEMANTIC_REVIEW');
  const overclaim = structuredClone(target);
  overclaim.assessments[0].judgment = 'Schattige Terrasse bestätigt.';
  const checked = validateNuknukAssessment(overclaim, request);
  assert.doesNotMatch(JSON.stringify(checked.groundedOutput), /Schattige Terrasse bestätigt/);
  assert.deepEqual(checked.groundedOutput[0].evidence, [request.candidates[0].evidence[0]]);
  const wrongSpot = structuredClone(target); wrongSpot.assessments[0].candidateId = 'not-in-input';
  assert.throws(() => validateNuknukAssessment(wrongSpot, request), /candidate_not_authorized/);
  const falseProof = structuredClone(target); falseProof.assessments[0].reasonCodes = ['invented-romantic'];
  assert.throws(() => validateNuknukAssessment(falseProof, request), /evidence_not_authorized/);
});
test('grounded judgment can call the same pinned local model but never changes ranking', async () => {
  const { evaluation, understood, target } = await assessmentFixture(); let calls = 0;
  const result = await assessWithNuknuk({ response: evaluation.response, moment: understood.moment, modelPath, signal: AbortSignal.timeout(2000),
    fetchImpl: async () => ++calls === 1 ? Response.json({ loaded_model: modelPath, loaded_adapter: null })
      : Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(target) } }] }) });
  assert.equal(result.modelCalls, 1); assert.equal(result.rankingChanged, false); assert.equal(calls, 2);
});
test('learning intake supports structured Bibliothekar exercises without mixing them into interpretation targets', async () => {
  const { evaluation, understood, target } = await assessmentFixture();
  const dataset = draftUnderstandingDataset(); const row = structuredClone(dataset.cases[0]);
  row.id = 'birthday-evidence-exercise'; row.content.task = 'ASSESS_CANDIDATES';
  row.content.context = { response: evaluation.response, moment: understood.moment }; row.content.target = target;
  row.contentHash = contentHash(row.content); dataset.cases.push(row);
  const audit = auditUnderstandingDataset(dataset, understandingSplitHash(dataset.splitPlan));
  assert.equal(audit.cases.length, 7); assert.equal(audit.exportReady, false);
  row.content.target.assessments[0].reasonCodes = ['invented-proof']; row.contentHash = contentHash(row.content);
  assert.throws(() => auditUnderstandingDataset(dataset, understandingSplitHash(dataset.splitPlan)), /evidence_not_authorized/);
});

test('drafts and historic successful outputs cannot silently become training data', () => {
  const dataset = draftUnderstandingDataset(), hash = understandingSplitHash(dataset.splitPlan);
  const audit = auditUnderstandingDataset(dataset, hash);
  assert.equal(audit.exportReady, false);
  assert.equal(audit.cases.every(c => c.blockers.includes('SEMANTICS_REVIEW_MISSING')), true);
  assert.throws(() => exportUnderstandingDataset(dataset, hash), /nuknuk_dataset_not_reviewed/);
});
test('correction invalidates review, and frozen scenario groups prevent split movement', () => {
  const dataset = draftUnderstandingDataset(), hash = understandingSplitHash(dataset.splitPlan);
  dataset.cases[0].content.trainingPermission = 'APPROVED';
  assert.throws(() => auditUnderstandingDataset(dataset, hash), /nuknuk_case_content_changed/);
  dataset.cases[0].contentHash = contentHash(dataset.cases[0].content);
  dataset.cases[0].reviews.push({ kind: 'SEMANTICS', verdict: 'ACCEPT', contentHash: 'a'.repeat(64), reviewer: 'local-human', reviewedAt: '2026-11-07T13:00:00Z', note: 'test' });
  assert.throws(() => auditUnderstandingDataset(dataset, hash), /nuknuk_stale_review/);
  dataset.cases[0].reviews = []; dataset.cases[0].split = 'TEST';
  assert.throws(() => auditUnderstandingDataset(dataset, hash), /nuknuk_group_split_mismatch/);
  dataset.splitPlan[0].split = 'TEST';
  assert.throws(() => auditUnderstandingDataset(dataset, hash), /nuknuk_split_plan_changed/);
});
test('local review records bind the exact correction; a later edit clears both reviews', () => {
  let dataset = draftUnderstandingDataset(); const originalHash = dataset.cases[0].contentHash;
  dataset = reviseUnderstandingCase(dataset, { id: dataset.cases[0].id, expectedContentHash: originalHash,
    target: dataset.cases[0].content.target, trainingPermission: 'APPROVED' });
  const revised = dataset.cases[0];
  assert.notEqual(revised.contentHash, originalHash);
  const review = { id: revised.id, expectedContentHash: revised.contentHash, kind: 'SEMANTICS', verdict: 'ACCEPT', reviewer: 'test-record-only', reviewedAt: '2026-11-07T13:00:00Z', note: 'Synthetic test record, not a real review.' };
  dataset = recordUnderstandingReview(dataset, review);
  assert.equal(dataset.cases[0].reviews.length, 1);
  assert.throws(() => recordUnderstandingReview(dataset, { ...review, expectedContentHash: originalHash }), /review_content_mismatch/);
  const target = structuredClone(dataset.cases[0].content.target); target.moment.goal.statement = 'Einen passenden Geburtstagsabend mit Abendessen finden.';
  dataset = reviseUnderstandingCase(dataset, { id: revised.id, expectedContentHash: revised.contentHash, target, trainingPermission: 'APPROVED' });
  assert.equal(dataset.cases[0].reviews.length, 0);
});
test('identical query leaks across different scenario IDs are rejected', () => {
  const dataset = draftUnderstandingDataset();
  const duplicate = structuredClone(dataset.cases[0]);
  duplicate.id = 'different-id'; duplicate.scenarioGroup = 'different-group'; duplicate.split = 'TEST';
  dataset.splitPlan.push({ scenarioGroup: duplicate.scenarioGroup, split: 'TEST' }); dataset.cases.push(duplicate);
  assert.throws(() => auditUnderstandingDataset(dataset, understandingSplitHash(dataset.splitPlan)), /nuknuk_query_split_leakage/);
});
test('approved training export keeps validation/test targets in their own files and uses corrected targets only', () => {
  const dataset = draftUnderstandingDataset();
  dataset.cases[1].split = dataset.splitPlan[1].split = 'VALIDATION'; dataset.cases[2].split = dataset.splitPlan[2].split = 'TEST';
  for (const row of dataset.cases) {
    row.content.trainingPermission = 'APPROVED'; row.contentHash = contentHash(row.content);
    row.reviews = ['SEMANTICS', 'PRIVACY_AND_SOURCE_USE'].map(kind => ({ kind, verdict: 'ACCEPT', contentHash: row.contentHash,
      reviewer: 'synthetic-test-review-only', reviewedAt: '2026-11-07T13:00:00Z', note: 'Synthetic unit test, no actual human review.' }));
  }
  const bundle = exportUnderstandingDataset(dataset, understandingSplitHash(dataset.splitPlan));
  assert.equal(bundle.files.train.length, 4); assert.equal(bundle.files.valid.length, 1); assert.equal(bundle.files.test.length, 1);
  assert.equal(bundle.manifest.weightsTrained, false);
  assert.equal(bundle.manifest.targetSerialization, 'mlx-llguidance-spaced-json@1');
  assert.ok(bundle.files.train[0].messages[2].content.startsWith('{"meaning": '));
  assert.equal(bundle.files.train.some(row => row.messages[1].content.includes(dataset.cases[2].content.query)), false);
  assert.deepEqual(JSON.parse(bundle.files.train[0].messages[2].content), dataset.cases[0].content.target);
});

test('server-spaced targets preserve punctuation, quotes and Unicode inside reviewed text', () => {
  const dataset = draftUnderstandingDataset();
  dataset.cases[1].split = dataset.splitPlan[1].split = 'VALIDATION';
  dataset.cases[2].split = dataset.splitPlan[2].split = 'TEST';
  const statement = 'Ein Ort mit "Kaffee: Tee, Snacks", außerdem {Ruhe} und \\ Weg.';
  dataset.cases[0].content.target.moment.goal.statement = statement;
  for (const row of dataset.cases) {
    row.content.trainingPermission = 'APPROVED'; row.contentHash = contentHash(row.content);
    row.reviews = ['SEMANTICS', 'PRIVACY_AND_SOURCE_USE'].map(kind => ({ kind, verdict: 'ACCEPT', contentHash: row.contentHash,
      reviewer: 'synthetic-test-review-only', reviewedAt: '2026-11-07T13:00:00Z', note: 'Synthetic unit test only.' }));
  }
  const bundle = exportUnderstandingDataset(dataset, understandingSplitHash(dataset.splitPlan));
  assert.equal(JSON.parse(bundle.files.train[0].messages[2].content).moment.goal.statement, statement);
  assert.ok(bundle.files.train[0].messages[2].content.includes('Kaffee: Tee, Snacks'));
});

test('pilot contains the frozen 40/10/14 inventory, no automatic approvals or model calls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('pilot-must-not-call-a-provider'); };
  try {
    const cohort = await buildPilotCohort();
    assert.deepEqual(cohort.manifest.counts, { TRAIN: 40, VALIDATION: 10, TEST: 14 });
    assert.deepEqual(cohort.manifest.taskCounts, { INTERPRET_REQUEST: 44, ASSESS_CANDIDATES: 20 });
    assert.equal(cohort.manifest.planHash, PILOT_PLAN_HASH);
    assert.equal(cohort.manifest.modelCalls, 0); assert.equal(cohort.manifest.exportReady, false);
    assert.equal(cohort.dataset.cases.every(c => c.reviews.length === 0), true);
    assert.equal(cohort.manifest.holdout.independentlyAuthored, false);
    const review = pilotReviewMarkdown(cohort);
    for (const row of cohort.dataset.cases.filter(c => c.split === 'TEST')) assert.equal(review.includes(row.content.query), false);
    assert.equal(review.includes('holdout-01'), false);
    assert.equal((await buildPilotCohort()).manifest.datasetHash, cohort.manifest.datasetHash);
  } finally { globalThis.fetch = originalFetch; }
});
test('same query with changed visible evidence is valid; UUID-only copies remain duplicates', async () => {
  const cohort = await buildPilotCohort();
  const a = cohort.dataset.cases.find(c => c.id === 'world-birthday-basic');
  const b = cohort.dataset.cases.find(c => c.id === 'world-birthday-atmosphere');
  assert.equal(a.content.query, b.content.query);
  const changed = structuredClone(cohort.dataset);
  const copy = structuredClone(a); copy.id = 'same-input-new-uuid';
  copy.content.context.response.decisionId = 'different-decision-id';
  copy.contentHash = contentHash(copy.content); changed.cases.push(copy);
  assert.throws(() => auditUnderstandingDataset(changed, cohort.manifest.splitPlanHash), /nuknuk_duplicate_query/);
});
test('unsupported software capability is retained as a need and cannot reach matching', async () => {
  // Separate technical fixture, never consume a holdout target as a regression.
  const query = 'Ein Café mit biologischem Kaffee.';
  const target = copy();
  target.meaning.facts = [{id:'quality',key:'food.quality',value:{text:'biologischer Anbau'},modality:'REQUIRED',basis:'EXPLICIT',subjectIds:['a1']}];
  target.moment = {goal:{statement:'Biologischen Kaffee trinken.',evidence:[{quote:query}]},hypotheses:[],missing:[],clarification:null};
  const result = validateNuknukUnderstanding(target, {query,reference:example.reference});
  assert.equal(result.requestState, 'UNSUPPORTED_CAPABILITY');
  assert.ok(result.capabilityGaps.length > 0);
  assert.ok(result.output.meaning.facts.some(f => f.key === 'food.quality' && f.modality === 'REQUIRED'));
  const noEvaluation = await evaluateNuknukAgainstCatalog(result, [], example.reference);
  assert.equal(noEvaluation.status, 'UNSUPPORTED_CAPABILITY'); assert.equal(noEvaluation.response, null);
});

test('expanded collection adds real model-visible tasks, preserves parent and never trains or auto-approves', async () => {
  const { buildExpandedCohort } = await import('../../../scripts/decision-diagnostics/nuknuk-expanded-cohort.mjs');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('collection_must_remain_offline');};
  try {
    const first=await buildExpandedCohort(), second=await buildExpandedCohort();
    assert.deepEqual(first.manifest.counts,{TRAIN:200,VALIDATION:10,TEST:14});
    assert.deepEqual(first.manifest.trainingTasks,{INTERPRET_REQUEST:128,ASSESS_CANDIDATES:72});
    assert.equal(first.manifest.datasetHash,second.manifest.datasetHash);
    assert.equal(first.manifest.modelCalls,0); assert.equal(first.manifest.weightsTrained,false);
    assert.equal(first.manifest.exportReady,false); assert.equal(first.manifest.semanticHumanApprovals,0);
    assert.ok(first.dataset.cases.every(row=>row.reviews.length===0));
    assert.equal(first.notes.length,160);
    assert.ok(first.notes.every(note=>note.id.startsWith('expanded-')));
    const newlyAuthored=first.dataset.cases.filter(row=>row.id.startsWith('expanded-'));
    assert.ok(newlyAuthored.every(row=>row.split==='TRAIN' && row.content.trainingPermission==='PENDING'));
    assert.equal(newlyAuthored.filter(row=>row.content.target.moment?.hypotheses.length).length,10);
    for(const row of newlyAuthored) for(const hypothesis of row.content.target.moment?.hypotheses??[]) assert.equal(hypothesis.status,'HYPOTHESIS');
  } finally { globalThis.fetch=originalFetch; }
});

test('expansion cannot silently replace a parent target or move its partitions', async () => {
  const {buildPilotCohort}=await import('../../../scripts/decision-diagnostics/nuknuk-pilot-cohort.mjs');
  const {buildExpandedCohort}=await import('../../../scripts/decision-diagnostics/nuknuk-expanded-cohort.mjs');
  const original=await buildPilotCohort();
  const tampered=structuredClone(original.dataset);
  tampered.cases.pop();
  await assert.rejects(()=>buildExpandedCohort({reviewedParent:tampered}),/nuknuk_expansion_parent_changed/);
  const intact=await buildExpandedCohort({reviewedParent:original.dataset});
  for(const row of original.dataset.cases) assert.deepEqual(intact.dataset.cases.find(c=>c.id===row.id),row);
});

test('compact adapter profile preserves the exact schema and input and remains opt-in', () => {
  const full=buildNuknukUnderstandingRequest({query:example.query,reference:example.reference});
  const compact=buildNuknukUnderstandingRequest({query:example.query,reference:example.reference,instructionProfile:'COMPACT_ADAPTER_V1'});
  assert.deepEqual(compact.outputSchema,full.outputSchema);
  assert.equal(compact.input,full.input);
  assert.ok(compact.instructions.length<full.instructions.length/4);
  assert.notEqual(compact.identity.promptHash,full.identity.promptHash);
});

test('second local profile preserves the wire contract and corpus partitions without activating Product', async () => {
  const full=buildNuknukUnderstandingRequest(example);
  const v1=buildNuknukUnderstandingRequest({...example,instructionProfile:'COMPACT_ADAPTER_V1'});
  const v2=buildNuknukUnderstandingRequest({...example,instructionProfile:'COMPACT_ADAPTER_V2'});
  assert.deepEqual(v2.outputSchema,full.outputSchema);
  assert.equal(v2.input,full.input);
  assert.notEqual(v2.identity.promptHash,v1.identity.promptHash);
  assert.ok(v2.instructions.includes('conditionFactId'));
  assert.ok(!full.instructions.includes('Präzisierung COMPACT_ADAPTER_V2'));
  const {round2Train,round2Development,round2FreshTest}=await import('../../../scripts/decision-diagnostics/nuknuk-round2-cases.mjs');
  const {makeInterpretation}=await import('../../../scripts/decision-diagnostics/nuknuk-pilot-authoring.mjs');
  assert.deepEqual([round2Train.length,round2Development.length,round2FreshTest.length],[120,12,12]);
  const querySplits=new Map();
  for(const spec of [...round2Train,...round2Development,...round2FreshTest]){
    const row=makeInterpretation(spec,spec);
    assert.equal(row.reviews.length,0);
    assert.equal(row.content.trainingPermission,'PENDING');
    const prior=querySplits.get(spec.query);
    assert.ok(prior===undefined||prior===spec.split);
    querySplits.set(spec.query,spec.split);
  }
});

test('third local profile separates user wishes from normalization metadata without changing historical prompts', () => {
  const query='Mit Kollegen bowlen, danach woanders essen.';
  const reference={now:'2026-11-07T12:00:00Z',timezone:'Europe/Zurich'};
  const v2=buildNuknukUnderstandingRequest({query,reference,instructionProfile:'COMPACT_ADAPTER_V2'});
  assert.equal(v2.identity.promptHash,'34170e59805452de09700ef0cc5e7027a654a932c24db4ca332e0cf3188d2020');
  const v3=buildNuknukUnderstandingRequest({query,reference,instructionProfile:'COMPACT_ADAPTER_V3'});
  assert.deepEqual(v3.outputSchema,v2.outputSchema);
  assert.deepEqual(JSON.parse(v3.input),{request:query});
  assert.ok(!v3.input.includes(reference.now));
  const metadata=JSON.parse(v3.instructions.split('NORMALIZATION_REFERENCE (nur Rechenhilfe, niemals Nutzerwunsch):\n')[1]);
  assert.deepEqual(metadata.reference,reference);
  assert.equal(metadata.calendar.today,'2026-11-07');
  assert.equal(metadata.calendar.localTime,'13:00');
  const changed=buildNuknukUnderstandingRequest({query,reference:{...reference,now:'2026-11-08T23:30:00Z'},instructionProfile:'COMPACT_ADAPTER_V3'});
  assert.equal(changed.input,v3.input);
  assert.notEqual(changed.identity.promptHash,v3.identity.promptHash);
  assert.equal(JSON.parse(changed.instructions.split('NORMALIZATION_REFERENCE (nur Rechenhilfe, niemals Nutzerwunsch):\n')[1]).calendar.today,'2026-11-09');
});

test('third profile training export and inference use the same role separation', async () => {
  // A reviewed fixture is created through the existing review path, not from a
  // generated model answer or an implicitly promoted TEST result.
  let data=draftUnderstandingDataset();
  data.cases[1].split=data.splitPlan[1].split='VALIDATION';
  data.cases[2].split=data.splitPlan[2].split='TEST';
  for(const row of data.cases){
    row.content.trainingPermission='APPROVED'; row.contentHash=contentHash(row.content);
  }
  for(const row of [...data.cases]){
    for(const kind of ['SEMANTICS','PRIVACY_AND_SOURCE_USE']) data=recordUnderstandingReview(data,{id:row.id,expectedContentHash:row.contentHash,kind,verdict:'ACCEPT',reviewer:'test-human',reviewedAt:'2026-11-09T12:00:00Z',note:'Synthetic test fixture only.'});
  }
  const bundle=exportUnderstandingDataset(data,understandingSplitHash(data.splitPlan),'COMPACT_ADAPTER_V3');
  const row=data.cases.find(c=>c.split==='TRAIN');
  const request=buildNuknukUnderstandingRequest({...row.content,instructionProfile:'COMPACT_ADAPTER_V3'});
  assert.equal(bundle.files.train[0].messages[0].content,request.instructions);
  assert.equal(bundle.files.train[0].messages[1].content,request.input);
  assert.ok(!buildNuknukUnderstandingRequest(row.content).instructions.includes('COMPACT_ADAPTER_V3'));
});

test('assisted review attribution requires explicit delegation and cannot claim human provenance', () => {
  const data=draftUnderstandingDataset();
  const row=data.cases[0];
  const input={id:row.id,expectedContentHash:row.contentHash,kind:'SEMANTICS',verdict:'ACCEPT',reviewer:'assistant-reviewer',reviewedAt:'2026-11-07T12:00:00Z',note:'Synthetic fixture for review attribution.',reviewerKind:'DELEGATED_ASSISTANT'};
  assert.throws(()=>recordUnderstandingReview(data,input),/nuknuk_review_delegation_required/);
  const reviewed=recordUnderstandingReview(data,{...input,delegationHash:contentHash('explicit test commission')});
  assert.equal(reviewed.cases[0].reviews[0].reviewerKind,'DELEGATED_ASSISTANT');
  assert.throws(()=>recordUnderstandingReview(data,{...input,reviewerKind:'HUMAN',delegationHash:contentHash('test')}),/nuknuk_review_delegation_misattributed/);
});

test('focused continuation keeps open dates open across varied local reference dates and preserves the corpus boundary',async()=>{
 const {round3Train,round3Development,round3FreshTest}=await import('../../../scripts/decision-diagnostics/nuknuk-round3-cases.mjs');
 const {makeInterpretation}=await import('../../../scripts/decision-diagnostics/nuknuk-pilot-authoring.mjs');
 assert.deepEqual([round3Train.length,round3Development.length,round3FreshTest.length],[96,12,12]);
 const rows=[...round3Train,...round3Development,...round3FreshTest].map(spec=>makeInterpretation(spec,spec));
 const queries=new Map();
 for(const row of rows){
  const previous=queries.get(row.content.query);
  assert.ok(previous===undefined||previous===row.split,'the same literal query cannot move between train and held-out splits');
  queries.set(row.content.query,row.split);
  assert.equal(row.reviews.length,0);
  assert.equal(row.content.trainingPermission,'PENDING');
 }
 const referenceRows=rows.filter(r=>r.scenarioGroup==='r3-train-reference');
 const today=referenceRows.filter(r=>r.content.query.startsWith('Heute'));
 assert.deepEqual(today.map(r=>r.content.target.meaning.facts.find(f=>f.key==='time.date').value.date),['2026-11-09','2026-11-16','2027-01-01','2027-03-28']);
 for(const row of referenceRows.filter(r=>r.content.query.includes('offen'))){
  assert.ok(!row.content.target.meaning.facts.some(f=>f.key==='time.date'));
  assert.deepEqual(row.content.reference,round3Train.find(s=>s.id===row.id).reference);
 }
 const optional=rows.filter(r=>r.content.query.includes('Abendessen brauche ich nicht'));
 assert.equal(optional.length,4);
 for(const row of optional)assert.equal(row.content.target.meaning.facts.find(f=>f.key==='food.meal').modality,'NOT_REQUIRED');
 const alternatives=rows.filter(r=>r.scenarioGroup==='r3-train-relations'&&r.content.query.includes(' oder '));
 for(const row of alternatives){assert.equal(row.content.target.meaning.logic.kind,'ANY');assert.equal(row.content.target.meaning.facts.length,2);}
});

// Local prompt optimization must preserve the exact production meaning schema.
test('fourth local profile shortens instructions without changing schema or role separation',()=>{
 const input={query:'Morgen mit meiner Tochter etwas Besonderes essen.',reference:{now:'2026-11-10T09:00:00Z',timezone:'Europe/Zurich'}};
 const prior=buildNuknukUnderstandingRequest({...input,instructionProfile:'COMPACT_ADAPTER_V3'});
 const next=buildNuknukUnderstandingRequest({...input,instructionProfile:'COMPACT_ADAPTER_V4'});
 assert.deepEqual(next.outputSchema,prior.outputSchema);
 assert.equal(next.input,prior.input);
 assert.ok(next.instructions.length<prior.instructions.length*0.75);
 assert.ok(next.instructions.includes('NORMALIZATION_REFERENCE'));
 assert.ok(next.instructions.includes('participation.accessibility=wheelchair'));
 assert.ok(!next.instructions.includes('offer.accessibility'));
});

test('the direct handoff returns the Librarian ranking for the requested municipality', async () => {
  const raw = copy();
  raw.meaning.facts = raw.meaning.facts.filter(fact => fact.key !== 'location.destination');
  raw.meaning.facts.push({
    id: 'municipality', key: 'location.destination', modality: 'REQUIRED', basis: 'EXPLICIT',
    subjectIds: [], value: { text: 'Riehen' },
  });
  const understood = validateNuknukUnderstanding(raw, example);
  const basel = binding(1, profile());
  const riehen = binding(2, profile());
  riehen.decisionProjection.facts.find(fact => fact.key === 'location.locality').value = 'Riehen';
  const evaluation = await evaluateNuknukAgainstCatalog(
    {...understood, identity: { local: true }}, [basel, riehen], example.reference, null, [],
  );
  assert.equal(evaluation.response.primaryCandidateId, riehen.decisionProjection.spotId);
  assert.deepEqual(evaluation.response.candidates.map(candidate => [candidate.rank, candidate.presentation.locality]), [[1, 'Riehen']]);
});

test('a verified nearby spot and a relevant clarification survive the same product handoff', async () => {
  const query = 'Ich suche ein Abendessen beim Spalentor, vielleicht ist jemand dabei.';
  const raw = copy();
  raw.moment.goal.evidence = [{quote:query}];
  raw.moment.hypotheses = [];
  raw.moment.missing = [{dimension:'OTHER', whyItMatters:'Die Gruppengrösse kann die Auswahl verfeinern.'}];
  raw.moment.clarification = {question:'Weisst du schon, ob du zu zweit bist?',dimension:'OTHER',options:['Allein','Zu zweit']};
  raw.meaning.facts = raw.meaning.facts.filter(fact => !fact.key.startsWith('location.'));
  raw.meaning.facts.push({id:'anchor', key:'location.destination', modality:'REQUIRED', basis:'EXPLICIT', subjectIds:[], value:{text:'Spalentor'}});
  const understood = validateNuknukUnderstanding(raw,{query,reference:example.reference});
  assert.ok(understood.plan.facts.some(fact=>fact.key==='location.proximity' && fact.value.text==='Spalentor'));
  const point = (id, latitude, longitude) => binding(id, profile(), [
    worldFact('location.latitude',latitude),worldFact('location.longitude',longitude),
  ]);
  const near = point(1,47.5583,7.5814);
  const far = point(2,47.574,7.616);
  const unknown = binding(3,profile());
  const evaluation = await evaluateNuknukAgainstCatalog({...understood,identity:{local:true}},[near,far,unknown],example.reference);
  assert.equal(evaluation.response.clarification,raw.moment.clarification.question);
  assert.equal(evaluation.response.primaryCandidateId,near.decisionProjection.spotId);
  assert.deepEqual(evaluation.response.candidates.filter(row=>row.rank!==null).map(row=>row.spotId),[near.decisionProjection.spotId]);
});

test('coordinates establish a Basel neighborhood without a stored neighborhood tag', async () => {
  const query = 'Ein Abendessen im St. Johann.';
  const raw = copy();
  raw.moment.goal.evidence = [{quote:query}];
  raw.moment.hypotheses = [];
  raw.meaning.facts = raw.meaning.facts.filter(fact=>!fact.key.startsWith('location.'));
  raw.meaning.facts.push({id:'quarter',key:'location.destination',modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[],value:{text:'St. Johann'}});
  const understood = validateNuknukUnderstanding(raw,{query,reference:example.reference});
  assert.ok(understood.plan.facts.some(fact=>fact.key==='location.area'));
  const spot = binding(1,profile(),[worldFact('location.latitude',47.568243),worldFact('location.longitude',7.58165)]);
  const evaluation = await evaluateNuknukAgainstCatalog({...understood,identity:{local:true}},[spot],example.reference);
  assert.equal(evaluation.response.primaryCandidateId,spot.decisionProjection.spotId);
});

test('an explicit venue destination does not turn into a search around it', () => {
  const query = 'Ich möchte ins Basler Münster.';
  const raw = copy();
  raw.moment.goal.evidence = [{quote:query}];
  raw.moment.hypotheses = [];
  raw.meaning.facts = raw.meaning.facts.filter(fact=>!fact.key.startsWith('location.'));
  raw.meaning.facts.push({id:'venue',key:'location.destination',modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[],value:{text:'Basler Münster'}});
  const understood = validateNuknukUnderstanding(raw,{query,reference:example.reference});
  assert.ok(understood.plan.facts.some(fact=>fact.key==='location.destination' && fact.value.text==='Basler Münster'));
  assert.ok(!understood.plan.facts.some(fact=>fact.key==='location.proximity'));
});

test('an explicitly forgotten cafe name yields one question alongside the existing search', async () => {
  const query = 'Ich will wieder ins gleiche Café wie sonst. Ich weiss nicht, wie es heisst, aber es ist beim Kannenfeldpark.';
  const raw = copy();
  raw.moment = {goal:{statement:'Ein bekanntes Café finden.',evidence:[{quote:'gleiche Café'}]},hypotheses:[],missing:[],clarification:null};
  raw.meaning.facts = [{id:'kind',key:'offer.kind',value:{text:'CAFE'},modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[]},
    {id:'near',key:'location.proximity',value:{text:'Kannenfeldpark'},modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[]}];
  const first = validateNuknukUnderstanding(raw, {query, reference:example.reference});
  assert.equal(first.requestState, 'EXECUTABLE');
  assert.match(first.moment.clarification.question, /Café wiedererkennen/);
  assert.equal(first.output.moment.clarification, null);
  const followup = query + ' Rückfrage: ' + first.moment.clarification.question + ' Antwort: An der Ecke mit der roten Tür.';
  const second = validateNuknukUnderstanding(raw, {query:followup, reference:example.reference});
  assert.equal(second.moment.clarification, null);
  assert.equal(validateNuknukUnderstanding(raw, {
    query:'Ich möchte ins gleiche Café. Ich weiss nicht, ob es geöffnet ist.',reference:example.reference,
  }).moment.clarification, null);
});
