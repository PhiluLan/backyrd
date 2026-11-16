import { buildNuknukCompactSearchRequest, validateCompactTurn, validateNuknukCompactSearch } from './nuknuk-understanding.js';
import { DecisionProductError, type DecisionProductRuntimePorts } from './product-decision.js';
import { assertExplicitContext } from './product-luna-provider.js';
import { LibrarianContractError, type LibrarianRequest } from './product-luna-librarian.js';
import { buildNuknukDialogueUpdate, mergeNuknukDialogueUpdate, splitNuknukDialogue } from './nuknuk-dialogue.js';
import { librarianConcept } from '@backyrd/world-knowledge-core';

const MAX_RESPONSE_BYTES = 65_536;
const SIMPLE_SEARCH_TIMEOUT_MS = 6_000;
const simpleSearchInstructions = `Du bist NukNuk. Übersetze diese einfache Suche nach einem Ort mit genau einer Aktivität in das vorgegebene JSON-Schema. Ausgabe nur {"singleActivity":true,"meaning":{"facts":[...]}}. facts ohne id und subjectIds. Jeder Fakt hat key, modality, basis und value. Bewahre alle genannten Wünsche. Trinken gehen: food.drink mit value {"text":"drinks"}, REQUIRED. Kaffee trinken: food.drink mit Text coffee, REQUIRED. Café/Restaurant als ausdrücklich gewünschter Ortstyp: offer.kind mit Text CAFE/RESTAURANT, REQUIRED. Essen gehen: food.meal mit Text meal, REQUIRED. Gemütlich: atmosphere.character mit Text gemütlich, PREFERRED. Ausdrücklich genannter Suchort: location.destination mit seinem Namen, REQUIRED. basis EXPLICIT für genannte Fakten. Keine zusätzlichen Fakten, Entitäten oder Leereinträge. Keine Erläuterung.`;

type SimpleCriterion = readonly [key: string, modality: 'REQUIRED' | 'PREFERRED', value: string];

/** Match the entire wish. An extra word may carry a constraint the short prompt does not cover. */
function simpleSearchCriteria(query: string): SimpleCriterion[] | null {
  const text = query.normalize('NFC').trim().toLocaleLowerCase('de-CH').replace(/\s+/gu, ' ').replace(/[.?]$/u, '');
  const criteria: SimpleCriterion[] = [];
  const drinks = /^(?:(gemütlich) )?(?:(?:et)?was )?trinken(?: gehen)?$/u.exec(text);
  const coffee = /^(?:ein )?(?:(gemütliches) )?caf[eé]( in basel)?( für einen kaffee)?$/u.exec(text);
  const restaurant = /^(?:ein )?(?:(gemütliches) )?restaurant( in basel)?$/u.exec(text);
  if (drinks) criteria.push(['food.drink', 'REQUIRED', 'drinks']);
  else if (coffee) {
    criteria.push(['offer.kind', 'REQUIRED', 'cafe']);
    if (coffee[3]) criteria.push(['food.drink', 'REQUIRED', 'coffee']);
  } else if (restaurant) criteria.push(['offer.kind', 'REQUIRED', 'restaurant']);
  else return null;
  if (drinks?.[1] || coffee?.[1] || restaurant?.[1]) criteria.push(['atmosphere.character', 'PREFERRED', 'cozy']);
  if (coffee?.[2] || restaurant?.[2]) criteria.push(['location.destination', 'REQUIRED', 'basel']);
  return criteria;
}

function matchesSimpleCriteria(plan: LibrarianRequest, expected: readonly SimpleCriterion[]): boolean {
  if (plan.facts.length !== expected.length || plan.entities.length > 1 || plan.entities.some(e => e.kind !== 'ACTIVITY')
    || plan.bindings.length || plan.weatherConditions.length || plan.extensions.length || plan.raw.uncertainties.length) return false;
  const clauses = plan.logic.kind === 'ALL' ? plan.logic.children : [plan.logic];
  if (clauses.length !== plan.facts.length || !plan.facts.every(fact => clauses.some(c => c.kind === 'FACT' && c.factId === fact.id))) return false;
  return expected.every(([key, modality, value]) => plan.facts.some(fact => {
    if (fact.key !== key || fact.modality !== modality || fact.basis !== 'EXPLICIT' || fact.value.kind !== 'TEXT') return false;
    const text = fact.value.text.trim().toLocaleLowerCase('de-CH');
    return (key === 'atmosphere.character' || key === 'food.drink' ? librarianConcept(text) : text) === value;
  }));
}
const purposeInstructions = `SUCHZIEL UND GEGENSTAND: Beginne mit dem eigentlichen Vorhaben. Was man anschauen, hören oder
kennenlernen möchte, beschreibt das Thema des Besuchs. Beispiel: «alte Druckmaschinen
anschauen» = experience.activity Ausstellung besuchen + experience.theme alte Druckmaschinen.
«Selber mit einer Druckmaschine arbeiten» verlangt dagegen eine Tätigkeit zum Mitmachen.
Wähle bei ausdrücklich genannter Ortsart zuerst den kanonischen Ortstyp: «Museum für
Kunsthandwerk» = offer.kind MUSEUM + experience.theme Kunsthandwerk. Wenn nur etwas über ein
Thema gesucht wird, darfst du eine passende Besuchsform ableiten; erfinde keine Ausstellung,
keinen konkreten Spot und keine Mitmachpflicht.
ORTSROLLE: «In X suche ich …» und «ich bin in X und möchte dort …» binden die Suche an X.
Gemeinde = location.destination, Quartier = location.area. Ein Ortsname mit «vorher»,
«wohnen», «kommen aus», «später treffen» oder als anderer Termin ist nur Kontext, sofern
die Aktivität nicht ausdrücklich dort stattfinden soll. Bei offenem Termin erfinde kein Datum.
«Im Dezember» ist eine Monatsangabe, kein beliebiger Tag im Dezember.
`;

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

const dialogueRouteInstructions = 'Du entscheidest nur, wie Backyrd eine Nachricht behandelt. FIRST_SEARCH: neuer Spot- oder Unternehmungswunsch ohne bisherigen Plan. UPDATE_SEARCH: gleiche Unternehmung wird konkretisiert oder eine Anforderung dieses Plans geändert. NEW_SEARCH: eigenständige neue Unternehmung oder anderer Anlass, auch wenn die vorherige Unternehmung ausfällt. Eine vollständige eigenständige Unternehmung mit anderem Anlass, Hauptangebot oder neuer Begleitung kann ein neuer Plan sein, auch wenn beide Vorhaben draussen stattfinden. OUT_OF_SCOPE: erkennbar fachfremde Aufgabe wie Übersetzung oder Textarbeit. Spot, Ort, Ausflug, Aktivität, Kultur und Vorschläge können Suchwünsche sein. Verwende nur route.';
const dialogueRouteLabels = ['FIRST_SEARCH', 'UPDATE_SEARCH', 'NEW_SEARCH', 'OUT_OF_SCOPE'] as const;
type DialogueRoute = typeof dialogueRouteLabels[number];

const dialogueRoutePrompt = {
  instructions: dialogueRouteInstructions,
  outputSchema: {type:'object',properties:{route:{type:'string',enum:dialogueRouteLabels}},required:['route'],additionalProperties:false},
};

const clarifiedDialogueInstructions = 'Prüfe, wer was erleben soll. Ein neuer vollständiger Wunsch über eine andere Gruppe oder eine eigene Unternehmung bedeutet NEW_SEARCH, selbst wenn Tag, Ort oder Kategorie gleich bleiben. Ein einzelner neuer Wunsch an die bestehende Unternehmung bleibt UPDATE_SEARCH. Änderungen am gewünschten Angebotsumfang, an der Uhrzeit oder an der Zusammensetzung der Besuchsgruppe können zum selben Vorhaben gehören. Ein anderer Termin ist nicht allein ein neuer Plan. Eine Antwort, die sich auf die Rückfrage oder bestehende Wahl bezieht, bleibt eine Änderung. Ein klar als eigenes zweites Vorhaben formulierter Wunsch öffnet einen neuen Plan.';

export async function classifyNuknukDialogue(currentWish: string, message: string,
  complete: (prompt: typeof dialogueRoutePrompt, userInput: string) => Promise<string>, clarify = false): Promise<DialogueRoute | null> {
  const prompt = clarify ? {...dialogueRoutePrompt, instructions: dialogueRouteInstructions + '\n' + clarifiedDialogueInstructions}
    : dialogueRoutePrompt;
  const raw: unknown = JSON.parse(await complete(prompt, JSON.stringify({currentWish, message})));
  if (!raw || typeof raw !== 'object' || !('route' in raw)) return null;
  return dialogueRouteLabels.find(label => label === raw.route) ?? null;
}

export function createDecisionProductNuknukProvider(input: {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
  readonly now?: () => Date;
  readonly fetchImpl?: typeof fetch;
  readonly routeDialogue?: boolean;
  readonly clarifyDialogue?: boolean;
  readonly repairCompactMeaning?: boolean;
  readonly includePurposeInstructions?: boolean;
  readonly fastSimpleSearch?: boolean;
  readonly onModelCall?: (mode: 'full' | 'dialogue' | 'simple') => void;
  readonly onDialogue?: () => void;
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
    async function complete(prompt: {instructions: string; outputSchema: object}, userInput: string, mode: 'full' | 'dialogue' | 'simple' = 'full'): Promise<string> {
      const routing = mode === 'dialogue';
      const baseInstructions = hasExplicitContext && !routing
        ? prompt.instructions + '\nBehalte explizit gesetzte Suchangaben aus explicitContext. request bleibt der Nutzertext.'
        : prompt.instructions;
      const instructions = input.includePurposeInstructions && mode === 'full' && !prompt.instructions.includes("removeFactIds")
        ? baseInstructions + "\n" + purposeInstructions : baseInstructions;
      const requestSignal = mode === 'simple' ? AbortSignal.any([signal,AbortSignal.timeout(SIMPLE_SEARCH_TIMEOUT_MS)]) : signal;
      input.onModelCall?.(mode);
      const response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error', signal: requestSignal, cache: 'no-store',
        headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: input.model, temperature: 0, max_tokens: routing ? 96 : 2048, stream: false,
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: userInput },
          ],
          response_format: { type: 'json_schema', json_schema: { name: routing ? 'backyrd_dialogue_route' : 'nuknuk_compact_search', strict: true, schema: prompt.outputSchema } },
        }),
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error('product_nuknuk_unavailable');
      }
      const raw = await readModelResponse(response) as { model?: unknown; choices?: { finish_reason?: unknown; message?: { content?: unknown; refusal?: unknown } }[] } | null;
      requestSignal.throwIfAborted();
      const choice = Array.isArray(raw?.choices) && raw.choices.length === 1 ? raw.choices[0] : undefined;
      if (raw?.model !== input.model || choice?.finish_reason !== 'stop' || choice.message?.refusal || typeof choice.message?.content !== 'string') {
        throw new Error('product_nuknuk_response_invalid');
      }
      return choice.message.content;
    }
    const dialogue = splitNuknukDialogue(query);
    if (dialogue) input.onDialogue?.();
    const latestTurn = dialogue?.turns.at(-1);
    if (input.routeDialogue && dialogue && latestTurn) {
      const route = await classifyNuknukDialogue(dialogue.original, latestTurn.answer,
        (prompt, userInput) => complete(prompt, userInput, 'dialogue'), input.clarifyDialogue).catch(() => null);
      signal.throwIfAborted();
      if (route === 'NEW_SEARCH') {
        throw new DecisionProductError('DECISION_NUKNUK_NEW_PLAN', 422, 'Möchtest du für den neuen Plan suchen?');
      }
      if (route === 'OUT_OF_SCOPE') {
        throw new DecisionProductError('DECISION_NUKNUK_OFF_TOPIC', 422, 'NukNuk hilft dir bei der Suche nach passenden Orten und Erlebnissen.');
      }
    }
    const original = dialogue?.original ?? query;
    const prompt = buildNuknukCompactSearchRequest({ query:original, reference });
    const userInput = hasExplicitContext ? JSON.stringify({request:original, explicitContext}) : prompt.input;
    const interpret = (content: string) =>
      validateNuknukCompactSearch(JSON.parse(content) as unknown, { query:original, reference });
    const simpleCriteria = input.fastSimpleSearch && !dialogue && !Object.values(explicit).some(v => v != null)
      && !request.alternativeRequested && !request.previouslyPresentedCandidateIds.length && !request.rejectedCandidateIds.length
      ? simpleSearchCriteria(original) : null;
    if (simpleCriteria) {
      try {
        const simple = interpret(await complete({ ...prompt, instructions: simpleSearchInstructions }, userInput, 'simple'));
        if (simple.requestState === 'EXECUTABLE' && simple.plan && !simple.clarification && !simple.clarificationIssue
          && matchesSimpleCriteria(simple.plan, simpleCriteria)) {
          assertExplicitContext(request, simple.plan);
          return simple.plan;
        }
      } catch {
        signal.throwIfAborted();
      }
    }
    const raw = await complete(prompt, userInput);
    let result;
    try {
      try {
        result = interpret(raw);
      } catch (error) {
        if (!input.repairCompactMeaning) throw error;
        const defect = error instanceof LibrarianContractError && error.code === 'condition_unbound'
          ? 'Wetter nur übernehmen, falls es im Nutzerwunsch vorkommt. Verknüpfe echte Wenn-dann-Bedingungen mit den zugehörigen Alternativen.'
          : 'Achte auf getrennte Rollen für Suchort, Besuchszeit, Art des Angebots, eigene Tätigkeit und Inhalt zum Anschauen.';
        const repairPrompt = { ...prompt, instructions: prompt.instructions + '\n' + [
          'Erstelle die Suchübergabe einmal neu, direkt aus dem ursprünglichen Wunsch.',
          'Behalte ausdrücklich genannte Orte, Zeiten, Personen und Ausschlüsse. Erzwinge eine Vorliebe nicht als Pflicht.',
          defect,
        ].join(' ') };
        result = interpret(await complete(repairPrompt, userInput));
      }
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
