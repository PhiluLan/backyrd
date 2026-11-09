import test from 'node:test';
import assert from 'node:assert/strict';
import { contentHash } from '../dist/canonical.js';
import { buildNuknukUnderstandingRequest, understandWithNuknuk, validateNuknukUnderstanding } from '../dist/nuknuk-understanding.js';
import { auditUnderstandingDataset, exportUnderstandingDataset, understandingSplitHash, reviseUnderstandingCase, recordUnderstandingReview } from '../dist/nuknuk-understanding-learning.js';
import { draftUnderstandingDataset, understandingDevelopmentCases } from '../../../scripts/decision-diagnostics/nuknuk-understanding-cases.mjs';
import { evaluateNuknukAgainstCatalog } from '../../../scripts/decision-diagnostics/nuknuk-understanding.mjs';
import { binding, profile } from './librarian-matching-fixtures.mjs';
import { buildNuknukAssessmentRequest, validateNuknukAssessment, assessWithNuknuk } from '../dist/nuknuk-grounded-assessment.js';
import { buildPilotCohort, pilotReviewMarkdown, PILOT_PLAN_HASH } from '../../../scripts/decision-diagnostics/nuknuk-pilot-cohort.mjs';

const example = understandingDevelopmentCases[0].content;
const modelPath = '/models/45797d2985a12c55e6473686e9ea91b95e959553';
const copy = () => structuredClone(example.target);

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
