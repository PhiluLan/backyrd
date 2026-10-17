// Offline diagnostics over the canonical matcher, evaluator and ranker; no second decision engine.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { contentHash } from '../../packages/decision-vnext-core/dist/canonical.js';
import { prepareLibrarianRequest, LUNA_LIBRARIAN_CONTRACT_VERSION } from '../../packages/decision-vnext-core/dist/product-luna-librarian.js';
import { searchLibrarianCatalog } from '../../packages/decision-vnext-core/dist/product-librarian-matching.js';
import { evaluateLibrarianProduct, PRODUCT_LIBRARIAN_EVALUATOR_VERSION } from '../../packages/decision-vnext-core/dist/product-librarian-evaluator.js';
import { buildDecisionProductExecution } from '../../packages/decision-vnext-core/dist/product-decision.js';
import { productProjection } from '../../packages/decision-vnext-core/dist/product-decision-production-adapter.js';
import { librarianConcept } from '../../packages/decision-vnext-core/dist/product-librarian-language.js';
import { requestedLibrarianPlaceType } from '../../packages/decision-vnext-core/dist/product-librarian-world-language.js';
import { QUALITY_REFERENCE, qualityScenario } from '../../packages/decision-vnext-core/test/request-understanding/decision-quality-catalog.mjs';

// Exercise the real Mobile selection helper, as its existing unit harness does.
const mobileSource = readFileSync(new URL('../../mobile/lib/decision/wohinModel.ts', import.meta.url), 'utf8');
const mobileCompiled = ts.transpileModule(mobileSource, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const { visibleWohinCandidates } = await import(`data:text/javascript,${encodeURIComponent(mobileCompiled)}`);

export const QUALITY_ACTOR = Object.freeze({userId: '11111111-1111-4111-a111-111111111111', subjectBindingHash: contentHash('quality-subject'), authenticationContextHash: contentHash('quality-auth'), sessionBindingHash: contentHash('quality-session'), sessionId: '22222222-2222-4222-a222-222222222222'});
export function qualityRequest(c, city) {
  return {contractVersion: 'backyrd.decision-vnext.product-request@1.0', requestId: `quality-${c.id}`, idempotencyKey: `quality-${c.id}`, naturalLanguage: c.query, explicit: {targetCity: city}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: []};
}
export function prepareQualityMeaning(c, raw, reference = QUALITY_REFERENCE) {
  return prepareLibrarianRequest({contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, sourceText: c.query, reference, output: raw});
}
function signature(f) {
  const type = requestedLibrarianPlaceType(f);
  if (type) return `venue:${type}`;
  if (f.value.kind === 'TEXT') {
    if (f.key === 'location.destination' && /^(?:zürich|zurich)$/iu.test(f.value.text.trim())) return 'location.destination:zurich';
    const concept = librarianConcept(f.value.text);
    const family = ['experience.activity', 'food.meal', 'offer.kind'].includes(f.key) || f.key === 'food.drink' && ['coffee', 'tea'].includes(concept) ? 'activity'
      : ['atmosphere.character', 'atmosphere.noise'].includes(f.key) && ['quiet', 'loud'].includes(concept) ? 'atmosphere' : f.key;
    return `${family}:${concept ?? f.value.text.trim().toLocaleLowerCase('de-CH')}`;
  }
  return `${f.key}:${contentHash(f.value)}`;
}
export function captureMatchesCase(c, capture) {
  return capture?.query === c.query && capture.reference?.timezone === QUALITY_REFERENCE.timezone
    && Date.parse(capture.reference?.now) === Date.parse(QUALITY_REFERENCE.now);
}
/** No model judges its own answers. This is intentionally a partial, fixed oracle,
 * not a general semantic-equivalence score or proof that extra facts are correct. */
export function checkUnderstanding(gold, actual) {
  const failures = [];
  for (const expected of gold.facts) {
    const found = actual.facts.find(f => signature(f) === signature(expected)
      && (expected.modality === 'CONTEXT' ? f.modality !== 'EXCLUDED' : f.modality === expected.modality));
    if (!found) failures.push({code: 'EXPECTED_MEANING_MISSING', family: expected.key, expectedSignature: signature(expected), modality: expected.modality});
  }
  if (!gold.facts.some(f => f.value.kind === 'DATE') && actual.facts.some(f => f.value.kind === 'DATE' && f.modality === 'REQUIRED')) failures.push({code: 'UNREQUESTED_CALENDAR_DATE'});
  if (gold.raw.logic?.kind === 'ANY' && actual.raw.logic?.kind !== 'ANY' && !JSON.stringify(actual.raw.logic).includes('"ANY"')) failures.push({code: 'ALTERNATIVE_NOT_RETAINED'});
  for (const expected of gold.extensions) {
    const text = expected.description.toLowerCase();
    const retained = actual.extensions.some(e => e.modality === expected.modality && e.description.toLowerCase().includes(text))
      || actual.facts.some(f => f.modality === expected.modality && f.value.kind === 'TEXT' && f.value.text.toLowerCase() === text);
    if (!retained) failures.push({code: 'UNKNOWN_TERM_NOT_RETAINED'});
  }
  return failures;
}

export function traceQualityCase(c, meaning, options = {}) {
  const scenario = qualityScenario(c.group, c.query);
  const catalog = options.catalog ?? scenario.catalog;
  const expected = options.expected ?? scenario.expected;
  const authority = {authorizedCity: scenario.city, serverTime: new Date(meaning.source.reference.now).toISOString()};
  const request = qualityRequest(c, scenario.city);
  const projection = productProjection({request, actor: QUALITY_ACTOR, serverTime: authority.serverTime, context: {status: 'NO_CONSENT', snapshot: null, consent: null}});
  const search = searchLibrarianCatalog({request: meaning, catalog, authority: {city: scenario.city, now: authority.serverTime}, limit: 1000});
  function execute(req) {
    const evaluated = evaluateLibrarianProduct({request: req, meaning, catalog, authority, projection});
    const execution = buildDecisionProductExecution({request: req, ...evaluated, projection, actor: QUALITY_ACTOR,
      authority: {...authority, locationBindingHash: contentHash({city: scenario.city, cohort: evaluated.evaluation.worldCohort.cohortHash})}, evaluatorContractVersion: PRODUCT_LIBRARIAN_EVALUATOR_VERSION});
    return {evaluated, response: execution.response};
  }
  const {evaluated, response} = execute(request);
  const returned = new Map(response.candidates.filter(c => c.rank !== null).map(c => [c.spotId, c]));
  const displayed = new Map(visibleWohinCandidates(response).map(c => [c.spotId, c]));
  const matches = new Map([...search.ranked, ...search.excluded, ...search.unresolved].map(c => [c.spotId, c]));
  const unresolved = new Set(search.unresolved.map(c => c.spotId));
  const rows = evaluated.evaluation.candidates.map(assessment => {
    const id = assessment.candidateId, match = matches.get(id), shown = returned.get(id);
    return {spotId: id, stage: displayed.has(id) ? 'DISPLAYED' : shown ? 'MOBILE_WINDOW' : assessment.tier === 'INELIGIBLE' ? 'ELIGIBILITY' : unresolved.has(id) ? 'VISIT_EVIDENCE' : 'NOT_DISPLAYED', rank: shown?.rank ?? null,
      tier: assessment.tier, availability: assessment.actualAvailability.status,
      failed: assessment.failedHardConstraints, unknown: assessment.unknownHardConstraints,
      facts: match?.facts.map(f => ({factId: f.factId, family: f.family, modality: f.modality, state: f.state, reason: f.reason, offerIds: f.offerIds, areaIds: f.areaIds, evidenceHashes: f.evidenceHashes})) ?? [],
      conditionalPlans: match?.conditionalPlans ?? [],
      selectedOffers: match?.offerIds ?? [], selectedAreas: match?.areaIds ?? [],
      rankingReason: shown?.reasons.find(r => r.code === 'product-rank-versus-next-v1')?.statement ?? null,
      rankVector: shown?.rankVector ?? null};
  });
  const wanted = new Set([...expected.included, ...expected.excluded, ...expected.unconfirmed, ...(expected.first ? [expected.first] : [])]);
  for (const id of wanted) {
    const row = rows.find(r => r.spotId === id);
    if (!row) { rows.push({spotId: id, stage: 'NOT_IN_COHORT', rank: null}); continue; }
    if (row.stage !== 'NOT_DISPLAYED') continue;
    // Ask the same canonical ranker for this candidate's window. Do not invent
    // a second comparator or assume an omitted candidate is merely rank six.
    const replay = execute({...request, previouslyPresentedCandidateIds: rows.map(r => r.spotId).filter(other => other !== id)}).response;
    const ranked = replay.candidates.find(c => c.spotId === id && c.rank !== null);
    if (ranked) { row.stage = 'PRESENTATION_WINDOW'; row.rank = ranked.rank; row.rankVector = ranked.rankVector; }
    else row.stage = 'PRODUCT_RANKABILITY';
  }
  const failures = [];
  for (const id of expected.included) { const row = rows.find(r => r.spotId === id); if (!row?.rank) failures.push({code: 'EXPECTED_CANDIDATE_MISSING', spotId: id, stage: row?.stage}); }
  for (const id of expected.excluded) if (rows.find(r => r.spotId === id)?.rank) failures.push({code: 'UNEXPECTED_CANDIDATE_ADMITTED', spotId: id});
  for (const id of expected.unconfirmed) if (rows.find(r => r.spotId === id)?.tier === 'ELIGIBLE_CONFIRMED') failures.push({code: 'UNSUPPORTED_CONFIRMATION', spotId: id});
  if (expected.first && response.primaryCandidateId !== expected.first) failures.push({code: 'WRONG_PRIMARY_CANDIDATE', spotId: expected.first});
  return {requestHash: meaning.requestHash, catalogHash: search.catalogHash, resultHash: response.resultHash, rankingPolicyVersion: response.rankingPolicyVersion,
    personalization: response.personalization.state, candidateCount: catalog.length, returnedIds: [...returned.keys()], displayedIds: [...displayed.keys()], rows, failures};
}
