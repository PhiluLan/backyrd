#!/usr/bin/env node
// Local developer tool; no public host, authentication bypass or production writes.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const readJson = async path => JSON.parse(await readFile(resolve(path), 'utf8'));
async function writeNew(path, data) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--query', '--model', '--output', '--dataset', '--split-hash', '--catalog', '--adapter', '--adapter-sha256', '--report', '--case', '--content-hash', '--target', '--training-permission', '--kind', '--verdict', '--reviewer', '--note'].includes(args[i]) || !args[i + 1] || result[args[i]]) throw Error('nuknuk_arguments_invalid');
    result[args[i]] = args[i + 1];
  }
  return result;
}
async function adapterPin(opts) {
  if (!opts['--adapter'] && !opts['--adapter-sha256']) return {};
  if (!opts['--adapter'] || !/^[a-f0-9]{64}$/u.test(opts['--adapter-sha256'] ?? '')) throw Error('nuknuk_adapter_pin_required');
  const expectedAdapterPath = resolve(opts['--adapter']);
  const file = expectedAdapterPath.endsWith('.safetensors') ? expectedAdapterPath : resolve(expectedAdapterPath, 'adapters.safetensors');
  if (createHash('sha256').update(await readFile(file)).digest('hex') !== opts['--adapter-sha256']) throw Error('nuknuk_adapter_changed');
  return { expectedAdapterPath };
}

/** Same current evaluator and final ranking as Product, neutral synthetic actor.
 * Moment hypotheses are deliberately not added to required facts or World data. */
export async function evaluateNuknukAgainstCatalog(result, catalog, reference, fixture = null) {
  if (result.requestState === 'UNSUPPORTED_CAPABILITY') return { status: 'UNSUPPORTED_CAPABILITY', response: null, capabilityGaps: result.capabilityGaps, productionWrites: 0, learningWrites: 0 };
  if (!result.plan) return { status: 'NEEDS_CLARIFICATION', response: null, productionWrites: 0, learningWrites: 0 };
  if (!Array.isArray(catalog) || !catalog.length || catalog.length > 1000) throw Error('nuknuk_catalog_invalid');
  const { createDecisionProductRpcEvaluationProvider } = await import('../../packages/decision-vnext-core/dist/product-decision-production-adapter.js');
  const { buildDecisionProductExecution } = await import('../../packages/decision-vnext-core/dist/product-decision.js');
  const { BASEL_DISCOVERY_LOCALITIES } = await import('../../packages/decision-vnext-core/dist/product-librarian-geography.js');
  const { contentHash } = await import('../../packages/decision-vnext-core/dist/canonical.js');
  if (fixture !== null && (typeof fixture.syntheticSeed !== 'string' || !/^[a-z0-9-]{1,100}$/u.test(fixture.syntheticSeed))) throw Error('nuknuk_fixture_seed_invalid');
  const fixtureHash = fixture ? contentHash({ syntheticFixture: fixture.syntheticSeed }) : null;
  const id = fixtureHash ? `${fixtureHash.slice(0,8)}-${fixtureHash.slice(8,12)}-4${fixtureHash.slice(13,16)}-8${fixtureHash.slice(17,20)}-${fixtureHash.slice(20,32)}` : crypto.randomUUID();
  const request = { contractVersion: 'backyrd.decision-vnext.product-request@1.0', requestId: id, idempotencyKey: id,
    naturalLanguage: result.plan.source.sourceText, includeEvents: false,
    explicit: { targetCity: 'Basel', targetCityRole: 'SEARCH_CONTEXT', moods: [] },
    alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
  const actor = { userId: fixture ? id : crypto.randomUUID(), subjectBindingHash: contentHash('NUKNUK_LOCAL_SYNTHETIC'), authenticationContextHash: contentHash('NO_REAL_SESSION'), sessionBindingHash: contentHash(id), sessionId: fixture ? id : crypto.randomUUID() };
  const identity = { releaseHash: contentHash('LOCAL_NOT_RELEASED'), artifactHash: contentHash(result.identity), sourceSetHash: contentHash('NUKNUK_UNDERSTANDING'), controlGeneration: 1 };
  let search = null;
  const evaluator = createDecisionProductRpcEvaluationProvider({ async rpc(name) {
    if (name !== 'backyrd_decision_vnext_product_context_v7') throw Error('nuknuk_unexpected_rpc');
    return { error: null, data: { contractVersion: 'backyrd.decision-vnext.product-runtime-context@1.0', status: 'NO_CONSENT', consent: null, snapshot: null,
      authorizedCity: 'Basel', authorizedLocalities: BASEL_DISCOVERY_LOCALITIES, serverTime: reference.now, worldSnapshots: catalog } };
  } }, { meaningRequired: true, onSearch: value => { search = value; } });
  const evaluated = await evaluator.evaluate({ request, actor, identity, signal: AbortSignal.timeout(15000), meaning: result.plan });
  const execution = buildDecisionProductExecution({ request, actor, ...evaluated });
  return { response: execution.response, search, catalogHash: contentHash(catalog), momentUsedForRanking: false,
    warning: 'CANONICAL_MATCHING_ONLY_NO_NEW_OCCASION_RANKER', productionWrites: 0, learningWrites: 0, personalization: 'NEUTRAL_SYNTHETIC_IDENTITY' };
}

async function main() {
  const [command, ...args] = process.argv.slice(2), opts = options(args);
  if (!['probe', 'assess', 'audit', 'export', 'revise', 'review'].includes(command) || !opts['--output']) throw Error('nuknuk_usage_probe_assess_audit_export_revise_review');
  execFileSync('npm', ['run', 'decision-vnext:build'], { cwd: root, stdio: 'pipe' });
  if (command === 'assess') {
    if (!opts['--report'] || !opts['--model']) throw Error('nuknuk_assessment_arguments_required');
    const report = await readJson(opts['--report']);
    const { validateNuknukUnderstanding } = await import('../../packages/decision-vnext-core/dist/nuknuk-understanding.js');
    const { assessWithNuknuk } = await import('../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js');
    const understood = validateNuknukUnderstanding(report.result?.output, { query: report.query, reference: report.reference });
    const assessment = await assessWithNuknuk({ response: report.evaluation?.response, moment: understood.moment,
      modelPath: opts['--model'], ...await adapterPin(opts), signal: AbortSignal.timeout(240000) });
    await writeNew(opts['--output'], { assessment, boundaries: { advisoryOnly: true, rankingChanged: false, productionWrites: 0, learningWrites: 0 } });
    console.log(JSON.stringify({ state: assessment.state, productionWrites: 0 }));
  } else if (command === 'probe') {
    if (!opts['--query'] || !opts['--model']) throw Error('nuknuk_probe_arguments_required');
    const { understandWithNuknuk, buildNuknukUnderstandingRequest } = await import('../../packages/decision-vnext-core/dist/nuknuk-understanding.js');
    const reference = { now: new Date().toISOString(), timezone: 'Europe/Zurich' };
    const started = performance.now(); let rawOutput = null; let responseMetadata = null;
    const requestIdentity = buildNuknukUnderstandingRequest({ query: opts['--query'], reference }).identity;
    const adapter = await adapterPin(opts);
    try {
      const result = await understandWithNuknuk({ query: opts['--query'], reference, modelPath: opts['--model'], ...adapter, signal: AbortSignal.timeout(240000), onRawOutput: raw => { rawOutput = raw; }, onResponseMetadata: meta => { responseMetadata = meta; } });
      const evaluation = opts['--catalog'] ? await evaluateNuknukAgainstCatalog(result, await readJson(opts['--catalog']), reference) : null;
      await writeNew(opts['--output'], { status: 'STRUCTURALLY_VALID_REQUIRES_SEMANTIC_REVIEW', query: opts['--query'], reference, result, evaluation,
        boundaries: { productionWrites: 0, learningWrites: 0, weightsChanged: false, trainingExampleApproved: false },
        codeHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        workingTreeDirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0 });
      console.log(JSON.stringify({ status: 'STRUCTURALLY_VALID_REQUIRES_SEMANTIC_REVIEW', durationMs: result.durationMs, output: resolve(opts['--output']) }));
    } catch (error) {
      const code = error instanceof Error && /^(nuknuk_|librarian_contract_)/u.test(error.message) ? error.message : error?.name === 'ContractValidationError' ? 'nuknuk_output_schema_failed' : 'nuknuk_probe_failed';
      await writeNew(opts['--output'], { status: 'FAILED', query: opts['--query'], reference, rawOutput, code, validationPath: typeof error?.path === 'string' ? error.path : null, requestIdentity,
        durationMs: performance.now() - started, responseMetadata, productionWrites: 0, learningWrites: 0, weightsChanged: false });
      console.error(code); process.exitCode = 1;
    }
  } else {
    if (!opts['--dataset'] || !opts['--split-hash']) throw Error('nuknuk_dataset_arguments_required');
    const { auditUnderstandingDataset, exportUnderstandingDataset, reviseUnderstandingCase, recordUnderstandingReview } = await import('../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js');
    const dataset = await readJson(opts['--dataset']);
    auditUnderstandingDataset(dataset, opts['--split-hash']);
    if (command === 'revise' || command === 'review') {
      if (!opts['--case'] || !opts['--content-hash']) throw Error('nuknuk_review_arguments_required');
      const updated = command === 'revise'
        ? reviseUnderstandingCase(dataset, { id: opts['--case'], expectedContentHash: opts['--content-hash'], target: await readJson(opts['--target']), trainingPermission: opts['--training-permission'] })
        : recordUnderstandingReview(dataset, { id: opts['--case'], expectedContentHash: opts['--content-hash'], kind: opts['--kind'], verdict: opts['--verdict'], reviewer: opts['--reviewer'], note: opts['--note'], reviewedAt: new Date().toISOString() });
      await writeNew(opts['--output'], updated);
      console.log(JSON.stringify({ storedLocalReviewRecord: true, authenticatedAdminApproval: false, weightsTrained: false }));
    } else if (command === 'audit') {
      const { dataset: _, ...audit } = auditUnderstandingDataset(dataset, opts['--split-hash']);
      await writeNew(opts['--output'], audit);
      console.log(JSON.stringify({ exportReady: audit.exportReady, counts: audit.counts }));
    } else {
      const bundle = exportUnderstandingDataset(dataset, opts['--split-hash']);
      // New directory only: do not overwrite reviewed exports or model adapters.
      await mkdir(resolve(opts['--output']), { mode: 0o700 });
      const fileByteHashes = {};
      for (const [name, rows] of Object.entries(bundle.files)) {
        const bytes = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
        await writeFile(resolve(opts['--output'], name + '.jsonl'), bytes, { flag: 'wx', mode: 0o600 });
        fileByteHashes[name + '.jsonl'] = createHash('sha256').update(bytes).digest('hex');
      }
      bundle.manifest.fileByteHashes = fileByteHashes;
      await writeNew(resolve(opts['--output'], 'manifest.json'), bundle.manifest);
      console.log(JSON.stringify({ exported: bundle.manifest.counts, weightsTrained: false }));
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error && error.message.startsWith('nuknuk_') ? error.message : 'nuknuk_command_failed'); process.exitCode = 1; });
}
