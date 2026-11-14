#!/usr/bin/env node
// Materializes one frozen, synthetic/deidentified offline cohort. No model calls.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { contentHash } from '../../packages/decision-vnext-core/dist/canonical.js';
import { auditUnderstandingDataset, recordUnderstandingReview, understandingSplitHash } from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import { validateNuknukUnderstanding, NUKNUK_UNDERSTANDING_VERSION } from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import { buildNuknukAssessmentRequest, validateNuknukAssessment } from '../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js';
import { draftUnderstandingDataset, understandingDevelopmentCases } from './nuknuk-understanding-cases.mjs';
import { makeInterpretation, reference } from './nuknuk-pilot-authoring.mjs';
import { trainingSpecs, validationSpecs, worldSpecs } from './nuknuk-pilot-specs.mjs';
import { holdoutSpecs, holdoutWorldSpecs } from './nuknuk-pilot-holdout.mjs';
import { evaluateNuknukAgainstCatalog } from './nuknuk-understanding.mjs';
import { binding, profile, offer, area, prop, price } from '../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';

export const PILOT_PLAN_HASH = '44bc38ea9861361e84c132ec9f196a90541f5d954e04b9ef00874c846955bdc9';
const planPath = new URL('./nuknuk-pilot-plan.json', import.meta.url);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

export async function worldCases(spec, byId) {
  const result = [];
  for (let index = 0; index < spec.ids.length; index++) {
    const id = spec.ids[index], group = byId.get(id);
    if (!group) throw Error('nuknuk_pilot_case_not_planned:' + id);
    const source = makeInterpretation({ ...spec, id }, group);
    const understood = validateNuknukUnderstanding(source.content.target, source.content);
    const mode=spec.variantModes?.[index];
    const hasFeature = mode ? mode.startsWith('PRESENT') : !!spec.bothEvidence || index === 1;
    const offerProperties = [...spec.facts.filter(f => f.key === 'food.drink').map(f => prop(f.key, f.value.text)),
      ...(spec.offerProperties ?? []).map(p => prop(p.key,p.value))];
    const areaProperties = (spec.areaProperties ?? []).map(p=>prop(p.key,p.value));
    if (hasFeature && spec.feature) {
      const value = spec.feature === 'participation.booking' ? (index === 0 ? 'Empfohlen' : 'Nicht erforderlich') : spec.value;
      (spec.propertyScope === 'AREA' || spec.feature.startsWith('atmosphere.') ? areaProperties : offerProperties).push(prop(spec.feature, value));
    }
    const venue = profile([offer('main', spec.kind ?? 'DINNER', ['inside'], offerProperties, [price(spec.prices?.[index] ?? 35)])], [{...area('inside', areaProperties),...(spec.areaKind?{kind:spec.areaKind}:{})}], spec.category ?? 'RESTAURANT');
    const venueSeed = contentHash({ scenario: group.scenarioGroup });
    const venueIndex = parseInt(venueSeed.slice(0, 8), 16) * 2;
    const world = binding(venueIndex, venue);
    world.decisionProjection.facts.find(f => f.key === 'identity.name').value = 'Fiktiver Lernort ' + venueSeed.slice(0, 5);
    if(spec.placeType)world.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=[spec.placeType];
    const compareEqualCandidates = mode ? mode.endsWith('_TWO') : ((spec.bothEvidence && spec.feature !== 'participation.booking') || !!spec.prices) && index === 1;
    const worlds = [world];
    if (compareEqualCandidates) {
      const second = binding(venueIndex + 1, venue);
      if(spec.placeType)second.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=[spec.placeType];
      second.decisionProjection.facts.find(f => f.key === 'identity.name').value = 'Zweiter fiktiver Lernort ' + venueSeed.slice(0, 5);
      worlds.push(second);
    }
    let evaluation, counterfactualProof;
    if(spec.useHttpFixture){
      const {exercise}=await import('../../packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs');
      // Inject the validated synthetic understanding: these are evidence
      // exercises for NukNuk, not tests of the separate Luna prose guard.
      let captured;
      const http=await exercise({text:spec.query,meaning:understood.plan,catalog:worlds,understandOverride:async()=>understood.plan,onSearch:s=>{captured=s;}});
      if(!captured || captured.ranked.length!==worlds.length || captured.ranked.some(c=>(c.facts.find(f=>f.factId==='f2')?.state==='MET')!==hasFeature))
        throw Error('nuknuk_counterfactual_not_proven:'+id);
      if(http.status!==200)throw Error('nuknuk_synthetic_http_failed:'+id+':'+JSON.stringify(http.diagnostics));
      counterfactualProof={catalogHash:contentHash(worlds),httpStatus:http.status,expectedPreferenceMet:hasFeature,
        ranked:captured.ranked.map(c=>({spotId:c.spotId,preferenceState:c.facts.find(f=>f.factId==='f2')?.state}))};
      evaluation={response:http.body};
    }else evaluation = await evaluateNuknukAgainstCatalog({ ...understood, identity: { syntheticFixture: id } }, worlds, reference, { syntheticSeed: id });
    if (!evaluation.response) throw Error('nuknuk_pilot_evaluation_not_executable:' + id);
    const request = buildNuknukAssessmentRequest({ response: evaluation.response, moment: understood.moment });
    if (request.candidates.length !== worlds.length) throw Error('nuknuk_pilot_world_not_confirmed:' + id);
    const isBirthday = id.startsWith('world-birthday');
    const knownSpecific = hasFeature || !!spec.prices;
    const judgment = spec.feature === 'participation.booking'
      ? (index === 0 ? 'Für dieses Essensangebot ist Reservation empfohlen, aber nicht vorgeschrieben. Das passt zur fehlenden Reservationspflicht; ein freier Tisch ist damit nicht bestätigt.'
        : 'Für dieses Essensangebot ist keine Reservation erforderlich. Das erfüllt den genannten Regelwunsch; tatsächliche freie Plätze bleiben unbekannt.')
      : spec.prices ? 'Der Bibliothekar bestätigt, dass die Preisspanne dieses Essensangebots zum genannten Budget passt. Ein genauer Preis ist in den übergebenen Angaben nicht genannt; er darf nicht ergänzt werden. Das bestätigt nicht jede mögliche Bestellung.'
      : spec.feature === 'food.diet' ? 'Für das ausgewählte Essensangebot ist die gewünschte Ernährungsoption bestätigt. Das bedeutet weder, dass der ganze Betrieb so ausgerichtet ist, noch dass alle Gerichte diese Eigenschaft haben.'
      : knownSpecific ? 'Die bestätigten Angebots- und Eigenschaftsbelege passen zu den ausdrücklich genannten Wünschen. Daraus folgt keine Garantie für persönliche Begeisterung oder freie Plätze.'
        : 'Die gewünschte Tätigkeit ist belegt. Für die zusätzlich gewünschte Atmosphäre fehlt ein bestätigter Beleg; sie darf deshalb nicht als erfüllt dargestellt werden.';
    const target = { assessments: request.candidates.map(candidate => {
      const codes = candidate.evidence.filter(e => e.reasonCode.startsWith('LBR_EVIDENCE:')).map(e => e.reasonCode).slice(0, 8);
      if (!codes.length) throw Error('nuknuk_pilot_world_no_fact_evidence:' + id);
      return { candidateId: candidate.candidateId, fit: isBirthday || !knownSpecific ? 'POSSIBLE' : 'STRONG',
        judgment: (knownSpecific ? spec.knownJudgment ?? judgment : spec.missingJudgment ?? judgment) + (compareEqualCandidates ? ' Für beide Kandidaten liegen gleich passende Belege vor; ein besserer persönlicher Treffer ist daraus nicht ableitbar.' : ''),
        reasonCodes: codes, uncertainty: isBirthday ? 'Die Vorlieben der Frau und eine besondere Geburtstagseignung sind nicht belegt. Freie Plätze sind ebenfalls nicht bestätigt.'
          : !knownSpecific ? spec.missingUncertainty ?? 'Die gewünschte Atmosphäre ist nicht bestätigt.' : 'Konkrete Plätze und persönliche Begeisterung sind nicht bestätigt.' };
    }),
      missingKnowledge: isBirthday ? ['Was diesen Abend für die Frau besonders macht, bleibt offen.'] : !knownSpecific ? [spec.missingUncertainty ?? 'Ein Beleg für die gewünschte Atmosphäre fehlt.'] : ['Die tatsächliche Platzverfügbarkeit wurde nicht geprüft.'] };
    validateNuknukAssessment(target, request);
    const content = { version: NUKNUK_UNDERSTANDING_VERSION, task: 'ASSESS_CANDIDATES', query: spec.query, reference: spec.reference ?? reference,
      target, context: { response: evaluation.response, moment: understood.moment },
      provenance: { kind: 'SYNTHETIC', reference: id }, trainingPermission: 'PENDING' };
    result.push({ row: { id, scenarioGroup: group.scenarioGroup, split: group.split, content, contentHash: contentHash(content), reviews: [] },
      note: { id, query: spec.query, must: spec.must, avoid: spec.avoid + (compareEqualCandidates ? ' Keinen Sieger zwischen gleich belegten Kandidaten erfinden.' : ''),
        ...(counterfactualProof?{counterfactualProof}:{}), suppliedEvidence: request.candidates.flatMap(candidate => candidate.evidence.map(e => `${candidate.name}: ${e.statement}`)), expectedJudgment: target.assessments.map(a => a.judgment).join(' ') } });
  }
  return result;
}

export async function buildPilotCohort({ founderApproval = null } = {}) {
  const plan = await readJson(planPath);
  if (contentHash(plan) !== PILOT_PLAN_HASH) throw Error('nuknuk_pilot_frozen_plan_changed');
  const byId = new Map();
  for (const group of plan.groups) for (const id of group.caseIds) {
    if (byId.has(id)) throw Error('nuknuk_pilot_duplicate_planned_id');
    byId.set(id, group);
  }
  const seed = draftUnderstandingDataset();
  let dataset = { ...seed, splitPlan: plan.groups.map(({ scenarioGroup, split }) => ({ scenarioGroup, split })) };
  const notes = understandingDevelopmentCases.map(c => ({ id: c.id, query: c.content.query, must: c.content.target.moment.goal.statement, avoid: c.reviewFocus }));
  for (const spec of [...trainingSpecs, ...validationSpecs, ...holdoutSpecs]) {
    const group = byId.get(spec.id);
    if (!group) throw Error('nuknuk_pilot_case_not_planned:' + spec.id);
    dataset.cases.push(makeInterpretation(spec, group));
    notes.push({ id: spec.id, query: spec.query, must: spec.must, avoid: spec.avoid });
  }
  for (const spec of [...worldSpecs, ...holdoutWorldSpecs]) for (const built of await worldCases(spec, byId)) {
    dataset.cases.push(built.row); notes.push(built.note);
  }
  const present = new Set(dataset.cases.map(c => c.id));
  if (present.size !== byId.size || dataset.cases.length !== byId.size || [...byId.keys()].some(id => !present.has(id))) throw Error('nuknuk_pilot_inventory_mismatch');
  if (founderApproval !== null) {
    // Only the six explicitly reviewed original contents. Never apply this to
    // new variants, privacy reviews or training permission by extrapolation.
    if (founderApproval.kind !== 'SEMANTICS' || founderApproval.verdict !== 'ACCEPT' || founderApproval.cases?.length !== 6
      || new Set(founderApproval.cases.map(c => c.id)).size !== 6) throw Error('nuknuk_pilot_approval_scope_invalid');
    for (const approved of founderApproval.cases) {
      const original = seed.cases.find(c => c.id === approved.id);
      if (!original || original.contentHash !== approved.contentHash) throw Error('nuknuk_pilot_seed_approval_mismatch');
      dataset = recordUnderstandingReview(dataset, { id: approved.id, expectedContentHash: approved.contentHash,
        kind: 'SEMANTICS', verdict: 'ACCEPT', reviewer: 'founder-chat-confirmation', reviewedAt: founderApproval.recordedAt,
        note: 'Founder bestätigte die sechs angezeigten fachlichen Sollantworten im Chat. Keine Privacyprüfung oder Freigabe neuer Fälle daraus abgeleitet.' });
    }
  }
  const splitHash = understandingSplitHash(dataset.splitPlan);
  const { dataset: checked, ...audit } = auditUnderstandingDataset(dataset, splitHash);
  for (const split of ['TRAIN', 'VALIDATION', 'TEST']) if (audit.counts[split] !== plan.counts[split]) throw Error('nuknuk_pilot_count_mismatch');
  const manifest = { version: plan.version, cohortId: plan.cohortId, planHash: PILOT_PLAN_HASH, splitPlanHash: splitHash,
    datasetHash: contentHash(checked), counts: audit.counts,
    contentHashes: checked.cases.map(c => ({ id: c.id, split: c.split, hash: c.contentHash })),
    taskCounts: Object.fromEntries(['INTERPRET_REQUEST', 'ASSESS_CANDIDATES'].map(task => [task, checked.cases.filter(c => c.content.task === task).length])),
    semanticApprovals: checked.cases.filter(c => c.reviews.some(r => r.kind === 'SEMANTICS' && r.verdict === 'ACCEPT')).length,
    exportReady: audit.exportReady, modelCalls: 0, weightsTrained: false, productionWrites: 0,
    holdout: { submittedToModelByThisBuilder: false, independentlyAuthored: false, humanApproved: false, usedForPromptTuning: false },
    limitations: ['AUTHOR_DEFINED_HOLDOUT_NOT_INDEPENDENT_BLIND_PROOF', 'NEW_TARGETS_REQUIRE_SEMANTIC_REVIEW', 'SYNTHETIC_WORLD_NOT_REAL_VENUE_EVIDENCE'] };
  return { dataset: checked, manifest, audit, notes: notes.filter(n => byId.get(n.id).split !== 'TEST') };
}

const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
export function pilotReviewMarkdown(cohort) {
  const lines = ['# NukNuk: erster Lernbestand zur Prüfung', '',
    '40 Lernfälle · 10 Entwicklungsfälle · 14 separat zurückgehaltene Prüfaufgaben.', '',
    'Die sechs ursprünglichen Sollantworten sind fachlich bestätigt. Neue Antworten sind Entwürfe. Kein Modell wurde mit diesem Bestand trainiert.', '',
    'Bei jedem Fall prüfen: Ist die Bedeutung richtig? Wurde etwas vergessen? Wird etwas dazuerfunden? Bei den Spotübungen sind alle Orte und Angaben ausdrücklich fiktiv.', ''];
  for (const split of ['TRAIN', 'VALIDATION']) {
    lines.push(split === 'TRAIN' ? '## Lernfälle' : '## Entwicklungsprüfung', '');
    for (const row of cohort.dataset.cases.filter(c => c.split === split)) {
      const note = cohort.notes.find(n => n.id === row.id);
      const approved = row.reviews.some(r => r.kind === 'SEMANTICS' && r.verdict === 'ACCEPT');
      lines.push(`### ${escape(row.id)} — ${approved ? 'fachlich bestätigt' : 'neuer Entwurf'}`, '', `**Anfrage:** ${escape(note.query)}`, '',
        `**Richtig verstehen:** ${escape(note.must)}`, '', `**Nicht dazuerfinden:** ${escape(note.avoid)}`, '');
      if (note.suppliedEvidence) lines.push('**Vorgegebene fiktive Angaben:**', '', ...note.suppliedEvidence.map(e => '- ' + escape(e)), '', '**Erwartete Einschätzung:** ' + escape(note.expectedJudgment), '');
    }
  }
  lines.push('## Zurückgehaltene Prüfung', '', '14 weitere Fälle liegen separat. Ihre Aufgaben und Zielantworten werden weder hier angezeigt noch als Lernbeispiele verwendet. Sie sind von der Assistenz entworfen; ein unabhängiger, menschlich geprüfter Blindtest wird damit nicht behauptet.', '');
  return lines.join('\n');
}

async function main() {
  const [directory, approvalPath] = process.argv.slice(2);
  if (!directory) throw Error('nuknuk_pilot_output_required');
  const cohort = await buildPilotCohort({ founderApproval: approvalPath ? await readJson(resolve(approvalPath)) : null });
  const folder = resolve(directory);
  await mkdir(folder, { mode: 0o700 }); // New cohort only; never replace frozen files.
  const write = (name, data) => writeFile(resolve(folder, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await write('cohort.json', cohort.dataset);
  for (const split of ['TRAIN', 'VALIDATION', 'TEST']) await write(split.toLowerCase() + '-review-records.json', { ...cohort.dataset, cases: cohort.dataset.cases.filter(c => c.split === split) });
  await write('manifest.json', cohort.manifest); await write('audit.json', cohort.audit);
  await writeFile(resolve(folder, 'pruefung.md'), pilotReviewMarkdown(cohort), { flag: 'wx', mode: 0o600 });
  const reviewCases = cohort.dataset.cases.filter(c => c.split !== 'TEST');
  for (let start = 0; start < reviewCases.length; start += 10) {
    const batch = { ...cohort, dataset: { ...cohort.dataset, cases: reviewCases.slice(start, start + 10) } };
    await writeFile(resolve(folder, `pruefung-${String(1 + start / 10).padStart(2, '0')}.md`), pilotReviewMarkdown(batch), { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify(cohort.manifest));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'nuknuk_pilot_failed'); process.exitCode = 1; });
}
