/** Understanding examples are distinct from venue-research evidence and User learning.
 * Local review attribution is explicit; it never grants authenticated Admin authority. */
import { inspectNuknukTrainingVocabulary, NUKNUK_TRAINING_VOCABULARY_HASH } from './nuknuk-training-vocabulary.js';
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
  vocabularyHash: schema.optional(hash),
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
  reviewerKind?: 'HUMAN' | 'DELEGATED_ASSISTANT'; delegationHash?: string; vocabularyHash?: string }) {
  const dataset = datasetSchema.parse(raw);
  const existing = dataset.cases.find(c => c.id === input.id);
  if (!existing || existing.contentHash !== input.expectedContentHash) throw Error('nuknuk_review_content_mismatch');
  const review = reviewSchema.parse({ kind: input.kind, verdict: input.verdict, contentHash: existing.contentHash, reviewer: input.reviewer, reviewedAt: input.reviewedAt, note: input.note,
    ...(input.reviewerKind ? {reviewerKind:input.reviewerKind}:{}), ...(input.delegationHash ? {delegationHash:input.delegationHash}:{}), ...(input.vocabularyHash ? {vocabularyHash:input.vocabularyHash}:{}) });
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
    const blockers: string[] = inspectNuknukTrainingVocabulary(row.content.target).map(issue => issue.code + ':' + issue.factId);
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

// The local inference grammar requires exactly comma-space and colon-space.
// Serialize JSON recursively so punctuation inside strings is never rewritten.
function serverTargetJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(serverTargetJson).join(', ') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value)
    .map(([key, item]) => JSON.stringify(key) + ': ' + serverTargetJson(item)).join(', ') + '}';
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('nuknuk_target_json_invalid');
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw Error('nuknuk_target_json_invalid');
  return encoded;
}

/** llguidance's strict grammar uses schema property order. Reorder V6 wire
 * objects only; never alter the reviewed meaning or historical serialization. */
function orderForSchema(value: unknown, rawSchema: unknown, root: unknown): unknown {
  const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!object(rawSchema)) return value;
  const resolve = (node: Record<string, unknown>): Record<string, unknown> => {
    if (typeof node.$ref !== 'string') return node;
    if (!node.$ref.startsWith('#/')) throw Error('nuknuk_wire_schema_external_ref');
    let found: unknown = root;
    for (const part of node.$ref.slice(2).split('/')) found = object(found) ? found[part.replaceAll('~1', '/').replaceAll('~0', '~')] : undefined;
    if (!object(found)) throw Error('nuknuk_wire_schema_ref_invalid');
    return found;
  };
  const accepts = (v: unknown, candidate: unknown): boolean => {
    if (!object(candidate)) return true;
    const node = resolve(candidate);
    if (Array.isArray(node.anyOf)) return node.anyOf.some(branch => accepts(v, branch));
    if (Array.isArray(node.enum) && !node.enum.some(entry => JSON.stringify(entry) === JSON.stringify(v))) return false;
    const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    if (typeof node.type === 'string' && node.type !== type && !(node.type === 'integer' && typeof v === 'number' && Number.isInteger(v))) return false;
    if (Array.isArray(node.type) && !node.type.includes(type)) return false;
    if (Array.isArray(v)) return v.every(item => accepts(item, node.items));
    if (object(v) && object(node.properties)) {
      if (Array.isArray(node.required) && node.required.some(key => typeof key !== 'string' || !(key in v))) return false;
      const properties = node.properties;
      return Object.entries(v).every(([key, item]) => key in properties ? accepts(item, properties[key]) : node.additionalProperties !== false);
    }
    return true;
  };
  let node = resolve(rawSchema);
  if (Array.isArray(node.anyOf)) {
    const branch = node.anyOf.find(candidate => accepts(value, candidate));
    if (!branch) throw Error('nuknuk_wire_schema_target_mismatch');
    return orderForSchema(value, branch, root);
  }
  if (Array.isArray(value)) return value.map(item => orderForSchema(item, node.items, root));
  if (object(value) && object(node.properties)) {
    const properties = node.properties;
    const keys = [...Object.keys(properties).filter(key => key in value), ...Object.keys(value).filter(key => !(key in properties))];
    return Object.fromEntries(keys.map(key => [key, orderForSchema(value[key], properties[key], root)]));
  }
  return value;
}

export function exportUnderstandingDataset(raw: unknown, expectedSplitHash: string, instructionProfile: NuknukInstructionProfile = 'FULL') {
  const audit = auditUnderstandingDataset(raw, expectedSplitHash);
  if (!audit.exportReady) throw Error('nuknuk_dataset_not_reviewed');
  if (['SPOT_GROUNDED_V5', 'SPOT_GROUNDED_V6'].includes(instructionProfile) && audit.dataset.cases.some(row =>
    !row.reviews.some(review => review.kind === 'SEMANTICS' && review.verdict === 'ACCEPT'
      && review.vocabularyHash === NUKNUK_TRAINING_VOCABULARY_HASH))) {
    throw Error('nuknuk_vocabulary_review_required');
  }
  const rows = (splitName: 'TRAIN' | 'VALIDATION' | 'TEST') => audit.dataset.cases.filter(c => c.split === splitName).map(row => {
    const { request, target } = taskPair(row.content,instructionProfile);
    return { messages: [{ role: 'system', content: request.instructions }, { role: 'user', content: request.input },
      { role: 'assistant', content: serverTargetJson(instructionProfile === 'SPOT_GROUNDED_V6' ? orderForSchema(target, request.outputSchema, request.outputSchema) : target) }] };
  });
  const files = { train: rows('TRAIN'), valid: rows('VALIDATION'), test: rows('TEST') };
  return { files, manifest: {
    version: NUKNUK_UNDERSTANDING_DATASET_VERSION, datasetHash: contentHash(audit.dataset), splitPlanHash: audit.splitPlanHash,
    counts: audit.counts, filesHash: contentHash(files),
    purpose: 'SUPERVISED_UNDERSTANDING_ADAPTER_DATA_ONLY',
    productionEnabled: false, weightsTrained: false, instructionProfile,
    trainingVocabularyHash: NUKNUK_TRAINING_VOCABULARY_HASH,
    targetSerialization: instructionProfile === 'SPOT_GROUNDED_V6' ? 'schema-ordered-spaced-json@1' as const : 'mlx-llguidance-spaced-json@1' as const,
    cases: audit.cases.map(({ id, contentHash, split }) => ({ id, contentHash, split })),
  } };
}
