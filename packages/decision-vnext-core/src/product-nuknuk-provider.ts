import { buildNuknukCompactSearchRequest, validateCompactTurn, validateNuknukCompactSearch } from './nuknuk-understanding.js';
import { DecisionProductError, type DecisionProductRuntimePorts } from './product-decision.js';
import { assertExplicitContext } from './product-luna-provider.js';
import { buildNuknukDialogueUpdate, mergeNuknukDialogueUpdate, splitNuknukDialogue } from './nuknuk-dialogue.js';

const MAX_RESPONSE_BYTES = 65_536;

async function readModelResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('product_nuknuk_response_invalid');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode()) as unknown;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('product_nuknuk_response_too_large');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export function createDecisionProductNuknukProvider(input: {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly now?: () => Date;
  readonly fetchImpl?: typeof fetch;
}): NonNullable<DecisionProductRuntimePorts['understand']> {
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || endpoint.pathname !== '/v1/chat/completions' || !input.apiKey.trim() || !/^[a-zA-Z0-9_.:-]{1,128}$/u.test(input.model)) {
    throw new Error('product_nuknuk_configuration_invalid');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  return async (request, _actor, signal) => {
    signal.throwIfAborted();
    const query = request.naturalLanguage;
    const reference = { now: (input.now?.() ?? new Date()).toISOString(), timezone: 'Europe/Zurich' as const };
    const { targetCityRole, ...explicit } = request.explicit;
    if (targetCityRole === 'SEARCH_CONTEXT') delete explicit.targetCity;
    // No actor, session, approximate device location or ranking history enters the inference service.
    const explicitContext = { group: explicit.group, dateTime: explicit.dateTime, budget: explicit.budget, targetCity: explicit.targetCity };
    const hasExplicitContext = Object.values(explicitContext).some(value => value != null);
    async function complete(prompt: {instructions: string; outputSchema: object}, userInput: string): Promise<string> {
      const response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error', signal, cache: 'no-store',
        headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: input.model, temperature: 0, max_tokens: 2048, stream: false,
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            { role: 'system', content: hasExplicitContext
              ? prompt.instructions + '\nBehalte explizit gesetzte Suchangaben aus explicitContext. request bleibt der Nutzertext.'
              : prompt.instructions },
            { role: 'user', content: userInput },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'nuknuk_compact_search', strict: true, schema: prompt.outputSchema } },
        }),
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error('product_nuknuk_unavailable');
      }
      const raw = await readModelResponse(response) as { model?: unknown; choices?: { finish_reason?: unknown; message?: { content?: unknown; refusal?: unknown } }[] } | null;
      signal.throwIfAborted();
      const choice = Array.isArray(raw?.choices) && raw.choices.length === 1 ? raw.choices[0] : undefined;
      if (raw?.model !== input.model || choice?.finish_reason !== 'stop' || choice.message?.refusal || typeof choice.message?.content !== 'string') {
        throw new Error('product_nuknuk_response_invalid');
      }
      return choice.message.content;
    }
    const dialogue = splitNuknukDialogue(query);
    const original = dialogue?.original ?? query;
    const prompt = buildNuknukCompactSearchRequest({ query:original, reference });
    const raw = await complete(prompt, hasExplicitContext ? JSON.stringify({request:original, explicitContext}) : prompt.input);
    let result;
    try {
      result = validateNuknukCompactSearch(JSON.parse(raw) as unknown, { query:original, reference });
      if (dialogue && 'searchMeaning' in result) {
        const update = buildNuknukDialogueUpdate(prompt, result.searchMeaning, dialogue.turns);
        const changes: unknown = JSON.parse(await complete(update, update.input));
        const newMeaning = mergeNuknukDialogueUpdate(result.searchMeaning, changes, dialogue.turns);
        result = validateCompactTurn(newMeaning, {query,reference}, dialogue.turns.map(turn=>turn.answer).join('\n'));
      }
      if (result.plan) assertExplicitContext(request, result.plan);
    } catch {
      throw new DecisionProductError('DECISION_NUKNUK_UNRESOLVED', 422, 'Ich konnte deinen Suchwunsch noch nicht sicher verstehen. Kannst du ihn etwas konkreter beschreiben?');
    }
    if (result.requestState !== 'EXECUTABLE' || !result.plan) {
      if (result.clarification && (result.requestState === 'NEEDS_CLARIFICATION' || !result.boundary
          || result.boundary === 'UNSUPPORTED_OUTDOOR_COMPONENT_SCOPE' || result.boundary === 'UNSUPPORTED_BOOKING_SCOPE')) {
        return { meaning: null, clarification: result.clarification.question };
      }
      const message = result.requestState === 'UNSUPPORTED_CAPABILITY'
        ? 'Eine wichtige Bedingung können wir mit unseren Spotdaten derzeit nicht bestätigen.'
        : 'Was möchtest du am liebsten machen? Ein kurzer Zusatz zu deinem Wunsch genügt.';
      throw new DecisionProductError('DECISION_NUKNUK_UNRESOLVED', 422, message);
    }
    return result.clarification ? { meaning: result.plan, clarification: result.clarification.question } : result.plan;
  };
}
