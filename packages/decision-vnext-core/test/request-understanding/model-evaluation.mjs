import { performance } from 'node:perf_hooks';
import { contentHash, bindProductUnderstanding, createDecisionProductAiIntentInterpreter, resolveDecisionProductContext, PRODUCT_AI_INTENT_INTERPRETER_VERSION, PRODUCT_UNDERSTANDING_VERSION, PRODUCT_UNDERSTANDING_POLICY } from '../../dist/index.js';
import { PRODUCT_QUERY_CATALOG_HASH } from '../../dist/product-query-semantics.js';
import { validateCorpus, evaluateUnderstandingCase } from './evaluate.mjs';

const sha = contentHash;
const actor = { userId: '11111111-1111-4111-8111-111111111111', subjectBindingHash: 'a'.repeat(64), authenticationContextHash: 'b'.repeat(64), sessionBindingHash: 'c'.repeat(64), sessionId: '22222222-2222-4222-8222-222222222222' };
const identity = { releaseHash: 'd'.repeat(64), artifactHash: 'e'.repeat(64), sourceSetHash: 'f'.repeat(64), controlGeneration: 1 };
const counter = value => Number.isSafeInteger(value) && value >= 0;
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;

/** Cold interpretation per case. Only the canonical interpreter's retry uses
 * the same ephemeral cache. Never reads a database or a persisted answer. */
export async function runModelEvaluation({ corpus: input, model, apiKey, maxCalls = 8, timeoutMs = 20000, maxEstimatedCostUsd = 1, fetchImpl, requirementOracle = null, onObservation = null, onProgress = null }) {
  const corpus = validateCorpus(input);
  if (!Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > 5 || model !== 'gpt-6-luna' || typeof apiKey !== 'string' || !apiKey.trim() || typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(model)
    || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 400
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('model_evaluation_configuration_invalid');
  if (requirementOracle) validateRequirementOracle(corpus, requirementOracle);
  const transport = fetchImpl ?? fetch;
  let calls = 0; let stopReason = null; let promptHash = null;
  const usage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, measuredCalls: 0, unmeasuredCalls: 0 };
  const costEstimate = () => ((usage.inputTokens - usage.cachedInputTokens) * .10 + usage.cachedInputTokens * .01 + usage.cacheWriteTokens * .025 + usage.outputTokens * .50) / 1e6;
  // A conservative reservation, not an invoice guarantee. Byte/token/call
  // limits are independent; missing accounting stops all further calls.
  const reservePerCallUsd = (128000 * .125 + 3600 * .50) / 1e6;
  const responseModels = new Set(); const cases = [];
  for (const family of corpus.families) for (const [index, text] of family.queries.entries()) {
    const caseId = `${family.id}-${index + 1}`;
    if (stopReason || calls >= maxCalls) { stopReason ??= 'CALL_LIMIT'; cases.push({ caseId, familyId: family.id, dimension: family.dimension, outcome: 'NOT_RUN', reason: stopReason }); continue; }
    const cache = new Map(); const before = calls; const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('model_evaluation_timeout')), timeoutMs);
    let failureCode = null;
    const run = createDecisionProductAiIntentInterpreter({ model, apiKey, identity, allowedUserIds: '*', rpc: {
      async rpc(name, args) {
        if (name !== 'backyrd_decision_vnext_product_query_cache_v1') throw new Error('model_evaluation_rpc_forbidden');
        const key = sha([args.p_auth_user_id, args.p_request_hash, args.p_model_version]);
        if (args.p_write) cache.set(key, structuredClone(args.p_semantics));
        return { data: cache.has(key) ? { status: 'HIT', semantics: structuredClone(cache.get(key)) } : { status: 'MISS' }, error: null };
      },
    }, fetchImpl: async (url, options) => {
      if (url !== 'https://api.openai.com/v1/responses' || options.method !== 'POST') throw new Error('model_evaluation_transport_forbidden');
      if (stopReason) throw new Error('model_evaluation_stopped');
      if (costEstimate() + reservePerCallUsd > maxEstimatedCostUsd) { failureCode = stopReason = 'ESTIMATED_COST_LIMIT'; throw new Error('model_evaluation_cost_limit'); }
      if (calls >= maxCalls) { failureCode = stopReason = 'CALL_LIMIT'; throw new Error('model_evaluation_call_limit'); }
      const body = JSON.parse(options.body);
      if (body.store !== false || body.model !== model || body.max_output_tokens > 3600 || Buffer.byteLength(options.body) > 100000) throw new Error('model_evaluation_request_invalid');
      const hash = sha({ ...body, input: null });
      if (promptHash && promptHash !== hash) throw new Error('model_evaluation_prompt_changed');
      promptHash = hash; calls++; usage.unmeasuredCalls++;
      const response = await transport(url, { ...options, redirect: 'error' });
      if (!response.ok) {
        failureCode = `HTTP_${response.status}`;
        if ([400, 401, 403, 404, 429].includes(response.status)) stopReason = failureCode;
        return response;
      }
      const payload = await response.json();
      const u = payload.usage;
      if (u && counter(u.input_tokens) && counter(u.output_tokens) && counter(u.input_tokens_details?.cached_tokens) && u.input_tokens_details.cached_tokens <= u.input_tokens
        && (u.input_tokens_details.cache_write_tokens === undefined || counter(u.input_tokens_details.cache_write_tokens) && u.input_tokens_details.cache_write_tokens <= u.input_tokens - u.input_tokens_details.cached_tokens)) {
        usage.inputTokens += u.input_tokens; usage.outputTokens += u.output_tokens; usage.cachedInputTokens += u.input_tokens_details.cached_tokens;
        usage.cacheWriteTokens += counter(u.input_tokens_details?.cache_write_tokens) ? u.input_tokens_details.cache_write_tokens : 0;
        usage.measuredCalls++; usage.unmeasuredCalls--;
        if (u.input_tokens > 128000 || u.output_tokens > 3600) { failureCode = stopReason = 'TOKEN_BOUND_EXCEEDED'; throw new Error('model_evaluation_token_bound'); }
      } else { failureCode = stopReason = 'USAGE_UNAVAILABLE'; throw new Error('model_evaluation_usage_unavailable'); }
      if (typeof payload.model === 'string' && (payload.model === model || payload.model.startsWith(`${model}-`)) && /^[a-zA-Z0-9._-]{1,100}$/.test(payload.model)) responseModels.add(payload.model);
      return { ok: true, json: async () => payload };
    } });
    let result;
    try {
      const request = { contractVersion: 'backyrd.decision-vnext.product-request@1.0', requestId: caseId, idempotencyKey: caseId, naturalLanguage: text,
        explicit: { targetCity: corpus.reference.profileCity }, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
      const interpreted = await run(request, actor, controller.signal);
      const context = resolveDecisionProductContext(interpreted.request, { authorizedCity: corpus.reference.profileCity, serverTime: corpus.reference.serverTime }, interpreted.understanding);
      result = evaluateUnderstandingCase(family.expected, context);
      if (requirementOracle) {
        const requirements = scoreRequirements(requirementOracle.families[family.id], interpreted.understanding?.requirements ?? [], requirementOracle.optionalPrimaryRequirements ?? []);
        result = { ...result, contextOutcome: result.outcome, requirements, outcome: result.outcome === 'PASS' && requirements.outcome === 'PASS' ? 'PASS' : 'FAIL' };
        if (result.outcome === 'FAIL' && onObservation) onObservation(caseId, interpreted.understanding?.requirements ?? []);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const category = message.startsWith('product_understanding_evidence_') ? 'SOURCE_EVIDENCE_INVALID'
        : message.startsWith('product_understanding_') ? 'REQUIREMENT_INVALID'
        : message === 'product_ai_intent_cache_budget_exceeded' ? 'CACHE_BUDGET_EXCEEDED'
        : message.startsWith('product_ai_intent_result_invalid') || message === 'product_ai_intent_response_invalid' ? 'MODEL_OUTPUT_INVALID' : 'INTERPRETATION_ERROR';
      result = calls === before && stopReason ? { outcome: 'NOT_RUN', reason: stopReason }
        : { outcome: 'ERROR', reason: controller.signal.aborted ? 'TIMEOUT' : failureCode ?? category, checks: [] };
    }
    finally { clearTimeout(timer); cache.clear(); }
    cases.push({ caseId, familyId: family.id, dimension: family.dimension, ...result, providerCalls: calls - before, latencyMs: Math.round(performance.now() - start) });
    onProgress?.({ completed: cases.length, caseId, outcome: result.outcome, providerCalls: calls });
  }
  const latencies = cases.filter(c => c.outcome !== 'NOT_RUN').map(c => c.latencyMs);
  return {
    contractVersion: 'backyrd.request-understanding-model-evaluation@1.0', transport: fetchImpl ? 'FIXTURE' : 'LIVE_OPENAI',
    scope: corpus.scope, reviewStatus: corpus.reviewStatus, launchVerdict: 'NOT_EVALUATED', productionRead: false, productionWritten: false,
    model, responseModels: [...responseModels].sort(), promptHash, interpreterVersion: PRODUCT_AI_INTENT_INTERPRETER_VERSION,
    understandingVersion: PRODUCT_UNDERSTANDING_VERSION, policyVersion: PRODUCT_UNDERSTANDING_POLICY, catalogHash: PRODUCT_QUERY_CATALOG_HASH,
    corpusHash: sha(corpus), oracleHash: requirementOracle ? sha(requirementOracle) : null,
    limits: { maxCalls, timeoutMs, maxOutputTokensPerCall: 3600, maxRequestBytes: 100000, maxEstimatedCostUsd, reservePerCallUsd },
    providerCalls: calls, stopReason, usage, costUsd: model === 'gpt-6-luna' && usage.unmeasuredCalls === 0 ? costEstimate() : null,
    costStatus: model === 'gpt-6-luna' && usage.unmeasuredCalls === 0 ? 'STANDARD_RATE_ESTIMATE_NOT_INVOICE' : 'UNAVAILABLE',
    pricing: model === 'gpt-6-luna' ? { source: 'https://developers.openai.com/api/docs/models/gpt-6-luna', checkedAt: '2026-10-11', inputPerMillion: .10, cachedInputPerMillion: .01, cacheWritePerMillion: .125, outputPerMillion: .50 } : null,
    latencyMs: { p50: percentile(latencies, .5), p95: percentile(latencies, .95), maximum: latencies.length ? Math.max(...latencies) : null },
    caseCount: cases.length, passed: cases.filter(c => c.outcome === 'PASS').length, failed: cases.filter(c => c.outcome === 'FAIL').length,
    errors: cases.filter(c => c.outcome === 'ERROR').length, notRun: cases.filter(c => c.outcome === 'NOT_RUN').length,
    families: corpus.families.map(f => { const rows = cases.filter(c => c.familyId === f.id); return { familyId: f.id, outcome: rows.every(c => c.outcome === 'PASS') ? 'PASS' : rows.some(c => c.outcome === 'NOT_RUN') ? 'INCOMPLETE' : 'FAIL' }; }),
    cases,
  };
}

// Requirements are compared as a multiset. One observed requirement cannot
// satisfy two expected needs. OR identifiers are opaque; their partition matters.
const withoutGroup = ({ group, ...value }) => value;
export function scoreRequirements(expected, actual, optional = []) {
  const used = new Set(); const matches = [];
  for (const row of expected) {
    const index = actual.findIndex((value, i) => !used.has(i) && row.variants.some(variant => sha(withoutGroup(variant)) === sha(withoutGroup(value))));
    matches.push(index); if (index >= 0) used.add(index);
  }
  let groupingErrors = 0;
  for (let i = 0; i < expected.length; i++) if (matches[i] >= 0) {
    if ((expected[i].group === null) !== (actual[matches[i]].group === null)) groupingErrors++;
    for (let j = i + 1; j < expected.length; j++) if (matches[j] >= 0) {
      const expectedTogether = expected[i].group !== null && expected[i].group === expected[j].group;
      const observedTogether = actual[matches[i]].group !== null && actual[matches[i]].group === actual[matches[j]].group;
      if (expectedTogether !== observedTogether) groupingErrors++;
    }
  }
  const matched = used.size;
  for (const allowed of optional) {
    const index = actual.findIndex((value, i) => !used.has(i) && sha(value) === sha(allowed));
    if (index >= 0) used.add(index);
  }
  const missing = expected.length - matched; const unexpected = actual.length - used.size;
  return { outcome: !missing && !unexpected && !groupingErrors ? 'PASS' : 'FAIL', expected: expected.length, observed: actual.length, matched, optionalPrimary: used.size - matched, missing, unexpected, groupingErrors };
}
export function validateRequirementOracle(corpus, oracle) {
  if (!oracle || oracle.contractVersion !== 'backyrd.requirement-oracle@1.0' || oracle.reviewStatus !== 'PROPOSED_REQUIRES_HUMAN_REVIEW'
    || oracle.scope !== 'DEVELOPMENT_NOT_HOLDOUT' || !oracle.families || Object.keys(oracle.families).sort().join() !== corpus.families.map(f => f.id).sort().join()) throw new Error('requirement_oracle_invalid');
  if (oracle.optionalPrimaryRequirements !== undefined) {
    if (!Array.isArray(oracle.optionalPrimaryRequirements) || oracle.optionalPrimaryRequirements.length > 4) throw new Error('requirement_oracle_invalid');
    for (const variant of oracle.optionalPrimaryRequirements) bindProductUnderstanding({}, [variant]);
  }
  for (const rows of Object.values(oracle.families)) {
    if (!Array.isArray(rows) || rows.length > 12) throw new Error('requirement_oracle_invalid');
    const descriptors = new Set();
    for (const row of rows) {
      if (!row || Object.keys(row).sort().join() !== 'group,variants' || !Array.isArray(row.variants) || !row.variants.length || row.variants.length > 4 || row.group !== null && !/^R[1-9][0-9]?$/.test(row.group)) throw new Error('requirement_oracle_invalid');
      for (const variant of row.variants) {
        bindProductUnderstanding({}, [variant]);
        if (variant.group !== row.group) throw new Error('requirement_oracle_invalid');
        const hash = sha(withoutGroup(variant));
        if (descriptors.has(hash)) throw new Error('requirement_oracle_overlapping_expectations');
        descriptors.add(hash);
      }
    }
  }
}
