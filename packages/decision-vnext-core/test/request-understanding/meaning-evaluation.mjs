import { createDecisionProductMeaningStage, createDecisionProductMeaningPipeline, resolveDecisionProductContext, requestedProductCity, PRODUCT_REQUEST_MEANING_POLICY, PRODUCT_MEANING_MAPPING_POLICY, contentHash } from '../../dist/index.js';

/** Development evaluation only; VALID_CONTRACT is never semantic PASS.
 * Returned personal meaning is only suitable for explicitly approved fixtures,
 * never production logging or analytics. Expectations do not reach the provider. */
export async function evaluateMeaningCorpus({ corpus, apiKey, fetchImpl = fetch, maxCalls = 80, maxEstimatedCostUsd = 2, pipeline = false, serverTime = "2026-10-11T12:00:00.000Z" }) {
  if (typeof serverTime !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(serverTime) || !Number.isFinite(Date.parse(serverTime))
    || typeof pipeline !== "boolean" || !Array.isArray(corpus?.cases) || corpus.cases.length < 1 || corpus.cases.length > 60
    || !Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 120
    || !Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > 5)
    throw Error('meaning_evaluation_configuration_invalid');
  const ids = new Set();
  for (const c of corpus.cases) {
    if (typeof c.id !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(c.id) || ids.has(c.id)
      || typeof c.text !== 'string' || c.text.length < 3 || c.text.length > 2000 || !(typeof c.expected === 'string' || Array.isArray(c.expected) && c.expected.length >= 1 && c.expected.length <= 32 && c.expected.every(item => typeof item === 'string' && item.length >= 1 && item.length <= 2000)))
      throw Error('meaning_evaluation_corpus_invalid');
    ids.add(c.id);
  }
  const actor = { userId: '11111111-1111-4111-8111-111111111111' };
  let calls = 0, estimatedCostUsd = 0, stopReason = null;
  const results = [];
  const counter = n => Number.isSafeInteger(n) && n >= 0;
  for (const c of corpus.cases) {
    if (stopReason) { results.push({ id: c.id, status: 'NOT_RUN', reason: stopReason }); continue; }
    const started = performance.now(), callsBefore = calls;
    const run = (pipeline ? createDecisionProductMeaningPipeline : createDecisionProductMeaningStage)({ apiKey, model: 'gpt-6-luna', allowedUserIds: '*', fetchImpl: async (url, options) => {
      if (calls >= maxCalls || estimatedCostUsd + .0178 > maxEstimatedCostUsd) {
        stopReason = 'LIMIT'; throw Error('meaning_evaluation_limit');
      }
      const body = JSON.parse(options.body);
      if (url !== 'https://api.openai.com/v1/responses' || body.store !== false || body.model !== 'gpt-6-luna'
        || body.reasoning?.effort !== 'low' || body.max_output_tokens !== 3600
        || body.text?.format?.name !== "backyrd_compact_meaning_v1"
        || Object.keys(JSON.parse(body.input)).join() !== "request" || JSON.parse(body.input).request !== c.text) throw Error('meaning_evaluation_request_invalid');
      calls++;
      const response = await fetchImpl(url, options);
      if (!response.ok) {
        stopReason = `HTTP_${response.status}`;
        return response;
      }
      const payload = await response.json(), usage = payload.usage;
      const cached = usage?.input_tokens_details?.cached_tokens, written = usage?.input_tokens_details?.cache_write_tokens ?? 0;
      if (!counter(usage?.input_tokens) || !counter(usage?.output_tokens) || !counter(cached) || !counter(written)
        || cached > usage.input_tokens || written > usage.input_tokens - cached
        || usage.input_tokens > 128000 || usage.output_tokens > body.max_output_tokens) {
        stopReason = 'USAGE_INVALID'; throw Error('meaning_evaluation_usage_invalid');
      }
      estimatedCostUsd += ((usage.input_tokens - cached) * .1 + cached * .01 + written * .025 + usage.output_tokens * .5) / 1e6;
      return { ok: true, json: async () => payload };
    } });
    try {
      const request = { contractVersion: 'backyrd.decision-vnext.product-request@1.0', requestId: c.id, idempotencyKey: c.id,
        naturalLanguage: c.text, explicit: pipeline ? { targetCity: "Zurich", targetCitySource: "PROFILE_DEFAULT" } : {}, alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] };
      const output = await run(request, actor, new AbortController().signal);
      const meaning = pipeline ? output.plan.meaning : output;
      const mapped = pipeline ? { request, plan: output.plan, interpretation: output.interpretation,
        context: resolveDecisionProductContext(output.interpretation.request, {
          authorizedCity: requestedProductCity(output.interpretation.understanding, output.interpretation.request) ?? "Zurich",
          serverTime,
        }, output.interpretation.understanding) } : {};
      results.push({ id: c.id, status: 'VALID_CONTRACT', meaning, ...mapped, providerCalls: calls - callsBefore, latencyMs: Math.round(performance.now() - started) });
    } catch {
      results.push({ id: c.id, status: 'ERROR', reason: stopReason ?? 'INTERPRETATION_INVALID', providerCalls: calls - callsBefore,
        latencyMs: Math.round(performance.now() - started) });
    }
  }
  return { scope: 'DEVELOPMENT_NOT_HOLDOUT', semanticReview: 'NOT_REVIEWED', productionRead: false, productionWritten: false,
    evaluationServerTime: serverTime, model: 'gpt-6-luna', reasoning: 'low', policy: PRODUCT_REQUEST_MEANING_POLICY, ...(pipeline ? { mappingPolicy: PRODUCT_MEANING_MAPPING_POLICY } : {}), corpusHash: contentHash(corpus),
    costStatus: 'ESTIMATE_NOT_INVOICE', estimatedCostUsd, providerCalls: calls, stopReason, results };
}
