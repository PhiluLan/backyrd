/** Understanding examples are distinct from venue-research evidence and User learning.
 * Local review attribution is explicit; it never grants authenticated Admin authority. */
import { contentHash, deepFreeze } from './canonical.js';
import { schema, type Infer } from './schema.js';
import { buildNuknukUnderstandingRequest, validateNuknukUnderstanding, NuknukMomentSchema, NUKNUK_UNDERSTANDING_VERSION, type NuknukInstructionProfile } from './nuknuk-understanding.js';
import { buildNuknukAssessmentRequest, validateNuknukAssessment } from './nuknuk-grounded-assessment.js';

export const NUKNUK_UNDERSTANDING_DATASET_VERSION = 'backyrd.nuknuk-understanding-dataset@1' as const;
const id = schema.string({ min: 1, max: 100, pattern: /^[A-Za-z][A-Za-z0-9_.:-]*$/ });
const hash = schema.string({ pattern: /^[a-f0-9]{64}$/ });
const text = schema.string({ min: 1, max: 8000, pattern: /\S/u });
const split = schema.enum(['TRAIN', 'VALIDATION', 'TEST'] as const);
const date = schema.string({ pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/ });
const opaque = { parse(value: unknown): unknown { return structuredClone(value); } };
const contentSchema = schema.object({
  version: schema.literal(NUKNUK_UNDERSTANDING_VERSION),
  task: schema.enum(['INTERPRET_REQUEST', 'ASSESS_CANDIDATES'] as const),
  query: text,
  reference: schema.object({ now: date, timezone: schema.literal('Europe/Zurich') }),
  target: opaque,
  context: opaque,
  provenance: schema.object({ kind: schema.enum(['SYNTHETIC', 'DEIDENTIFIED_COMMISSIONED_EXAMPLE'] as const), reference: id }),
  trainingPermission: schema.enum(['PENDING', 'APPROVED'] as const),
});
const reviewSchema = schema.object({
  kind: schema.enum(['SEMANTICS', 'PRIVACY_AND_SOURCE_USE'] as const),
  verdict: schema.enum(['ACCEPT', 'REJECT'] as const),
  contentHash: hash,
  reviewer: id,
  reviewedAt: date,
  note: schema.string({ min: 1, max: 2000, pattern: /\S/u }),
  reviewerKind: schema.optional(schema.enum(['HUMAN', 'DELEGATED_ASSISTANT'] as const)),
  delegationHash: schema.optional(hash),
});
const caseSchema = schema.object({ id, scenarioGroup: id, split, content: contentSchema, contentHash: hash, reviews: schema.array(reviewSchema, { max: 2 }) });
const datasetSchema = schema.object({
  version: schema.literal(NUKNUK_UNDERSTANDING_DATASET_VERSION),
  splitPlan: schema.array(schema.object({ scenarioGroup: id, split }), { min: 1, max: 10000 }),
  cases: schema.array(caseSchema, { min: 1, max: 10000 }),
});
export type NuknukUnderstandingDataset = Infer<typeof datasetSchema>;
export type NuknukUnderstandingCaseContent = Infer<typeof contentSchema>;

function taskPair(content: NuknukUnderstandingCaseContent, instructionProfile?: NuknukInstructionProfile) {
  if (content.task === 'INTERPRET_REQUEST') {
    if (content.context !== null) throw Error('nuknuk_interpretation_context_must_be_null');
    return { request: buildNuknukUnderstandingRequest({...content,...(instructionProfile ? {instructionProfile}:{})}), target: validateNuknukUnderstanding(content.target, content).output };
  }
  const context = schema.object({ response: opaque, moment: opaque }).parse(content.context);
  const request = buildNuknukAssessmentRequest(context);
  if (!request.candidates.length) throw Error('nuknuk_assessment_training_has_no_candidates');
  const moment = NuknukMomentSchema.parse(context.moment);
  if ([moment.goal, ...moment.hypotheses].some(item => item.evidence.some(e => !content.query.includes(e.quote)))) throw Error('nuknuk_quote_not_in_query');
  return { request, target: validateNuknukAssessment(content.target, request).output };
}

export function understandingSplitHash(value: NuknukUnderstandingDataset['splitPlan']) {
  return contentHash([...value].sort((a, b) => a.scenarioGroup.localeCompare(b.scenarioGroup)));
}

/** Local review helpers. Attribute assisted work honestly and retain its explicit
 * human commission. These records are not signed Admin authorizations. */
export function reviseUnderstandingCase(raw: unknown, change: { id: string; expectedContentHash: string; target: unknown; trainingPermission: 'PENDING' | 'APPROVED' }) {
  const dataset = datasetSchema.parse(raw);
  const existing = dataset.cases.find(c => c.id === change.id);
  if (!existing || existing.contentHash !== change.expectedContentHash) throw Error('nuknuk_review_content_mismatch');
  const content = contentSchema.parse({ ...existing.content, target: change.target, trainingPermission: change.trainingPermission });
  taskPair(content);
  const corrected = { ...dataset, cases: dataset.cases.map(c => c.id === change.id ? { ...c, content, contentHash: contentHash(content), reviews: [] } : c) };
  auditUnderstandingDataset(corrected, understandingSplitHash(dataset.splitPlan));
  return corrected;
}

export function recordUnderstandingReview(raw: unknown, input: { id: string; expectedContentHash: string; kind: 'SEMANTICS' | 'PRIVACY_AND_SOURCE_USE';
  verdict: 'ACCEPT' | 'REJECT'; reviewer: string; reviewedAt: string; note: string;
  reviewerKind?: 'HUMAN' | 'DELEGATED_ASSISTANT'; delegationHash?: string }) {
  const dataset = datasetSchema.parse(raw);
  const existing = dataset.cases.find(c => c.id === input.id);
  if (!existing || existing.contentHash !== input.expectedContentHash) throw Error('nuknuk_review_content_mismatch');
  const review = reviewSchema.parse({ kind: input.kind, verdict: input.verdict, contentHash: existing.contentHash, reviewer: input.reviewer, reviewedAt: input.reviewedAt, note: input.note,
    ...(input.reviewerKind ? {reviewerKind:input.reviewerKind}:{}), ...(input.delegationHash ? {delegationHash:input.delegationHash}:{}) });
  const updated = { ...dataset, cases: dataset.cases.map(c => c.id === input.id ? { ...c, reviews: [...c.reviews.filter(r => r.kind !== review.kind), review] } : c) };
  auditUnderstandingDataset(updated, understandingSplitHash(dataset.splitPlan));
  return updated;
}

/** Structural/lineage validation does not rate human usefulness or certify rights. */
export function auditUnderstandingDataset(raw: unknown, expectedSplitHash: string) {
  hash.parse(expectedSplitHash);
  const dataset = datasetSchema.parse(raw);
  if (understandingSplitHash(dataset.splitPlan) !== expectedSplitHash) throw Error('nuknuk_split_plan_changed');
  const groups = new Map<string, string>();
  for (const row of dataset.splitPlan) {
    if (groups.has(row.scenarioGroup)) throw Error('nuknuk_duplicate_split_group');
    groups.set(row.scenarioGroup, row.split);
  }
  const ids = new Set<string>(), seen = new Map<string, string>(), taskQueries = new Set<string>(), candidateSplits = new Map<string, string>();
  const cases = dataset.cases.map(row => {
    if (ids.has(row.id)) throw Error('nuknuk_duplicate_case');
    ids.add(row.id);
    if (groups.get(row.scenarioGroup) !== row.split) throw Error('nuknuk_group_split_mismatch');
    if (contentHash(row.content) !== row.contentHash) throw Error('nuknuk_case_content_changed');
    if (!Number.isFinite(Date.parse(row.content.reference.now))) throw Error('nuknuk_reference_date_invalid');
    const pair = taskPair(row.content);
    if ('candidates' in pair.request) for (const candidate of pair.request.candidates) {
      const prior = candidateSplits.get(candidate.candidateId);
      if (prior !== undefined && prior !== row.split) throw Error('nuknuk_candidate_split_leakage');
      candidateSplits.set(candidate.candidateId, row.split);
    }
    // Catch exact and superficial duplicate queries across splits. Semantically
    // equivalent paraphrases still need reviewed scenario grouping.
    const fingerprint = contentHash(row.content.query.normalize('NFKC').toLocaleLowerCase('de-CH').replace(/[\p{P}\p{S}\s]+/gu, ' ').trim());
    const priorSplit = seen.get(fingerprint);
    if (priorSplit !== undefined && priorSplit !== row.split) throw Error('nuknuk_query_split_leakage');
    // Same sentence with genuinely different visible evidence is a necessary
    // counterfactual exercise. Irrelevant response UUIDs must not create a new
    // example; taskPair projects only the actual model-visible input.
    const taskQuery = contentHash({ task: row.content.task, input: JSON.parse(pair.request.input) as unknown });
    if (taskQueries.has(taskQuery)) throw Error('nuknuk_duplicate_query:' + row.id);
    taskQueries.add(taskQuery);
    seen.set(fingerprint, row.split);
    const kinds = new Set<string>();
    const blockers: string[] = [];
    for (const review of row.reviews) {
      if (review.reviewerKind === 'DELEGATED_ASSISTANT' && !review.delegationHash) throw Error('nuknuk_review_delegation_required');
      if (review.delegationHash && review.reviewerKind !== 'DELEGATED_ASSISTANT') throw Error('nuknuk_review_delegation_misattributed');
      if (review.contentHash !== row.contentHash) throw Error('nuknuk_stale_review');
      if (!Number.isFinite(Date.parse(review.reviewedAt))) throw Error('nuknuk_review_date_invalid');
      if (kinds.has(review.kind)) throw Error('nuknuk_duplicate_review');
      kinds.add(review.kind);
      if (review.verdict !== 'ACCEPT') blockers.push('REVIEW_REJECTED');
    }
    for (const kind of ['SEMANTICS', 'PRIVACY_AND_SOURCE_USE']) if (!kinds.has(kind)) blockers.push(kind + '_REVIEW_MISSING');
    if (row.content.trainingPermission !== 'APPROVED') blockers.push('TRAINING_PERMISSION_MISSING');
    return { id: row.id, split: row.split, contentHash: row.contentHash, blockers };
  });
  return deepFreeze({ dataset, cases, splitPlanHash: expectedSplitHash,
    exportReady: cases.every(row => !row.blockers.length) && ['TRAIN', 'VALIDATION', 'TEST'].every(s => cases.some(row => row.split === s)),
    counts: Object.fromEntries(['TRAIN', 'VALIDATION', 'TEST'].map(s => [s, cases.filter(c => c.split === s).length])),
    limitations: ['REVIEWS_ARE_LOCAL_RECORDS_NOT_AUTHENTICATED_ADMIN_DECISIONS', 'SEMANTIC_PARAPHRASE_LEAKAGE_REQUIRES_HUMAN_REVIEW', 'EXPORT_READY_DOES_NOT_MEAN_MODEL_READY'] });
}

export function exportUnderstandingDataset(raw: unknown, expectedSplitHash: string, instructionProfile: NuknukInstructionProfile = 'FULL') {
  const audit = auditUnderstandingDataset(raw, expectedSplitHash);
  if (!audit.exportReady) throw Error('nuknuk_dataset_not_reviewed');
  const rows = (splitName: 'TRAIN' | 'VALIDATION' | 'TEST') => audit.dataset.cases.filter(c => c.split === splitName).map(row => {
    const { request, target } = taskPair(row.content,instructionProfile);
    return { messages: [{ role: 'system', content: request.instructions }, { role: 'user', content: request.input },
      { role: 'assistant', content: JSON.stringify(target) }] };
  });
  const files = { train: rows('TRAIN'), valid: rows('VALIDATION'), test: rows('TEST') };
  return { files, manifest: {
    version: NUKNUK_UNDERSTANDING_DATASET_VERSION, datasetHash: contentHash(audit.dataset), splitPlanHash: audit.splitPlanHash,
    counts: audit.counts, filesHash: contentHash(files),
    purpose: 'SUPERVISED_UNDERSTANDING_ADAPTER_DATA_ONLY',
    productionEnabled: false, weightsTrained: false, instructionProfile,
    cases: audit.cases.map(({ id, contentHash, split }) => ({ id, contentHash, split })),
  } };
}
