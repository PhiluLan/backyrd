import { buildLunaLibrarianModelRequest, prepareLibrarianRequest, validateActiveLunaMeaningOutput, LUNA_LIBRARIAN_CONTRACT_VERSION, type LibrarianRequest } from "./product-luna-librarian.js";
import { DecisionProductRequestSchema, type DecisionProductRequest } from "./product-v1-contracts.js";
import type { DecisionProductAuthenticatedActor } from "./product-decision.js";

export const PRODUCT_LUNA_PROVIDER_VERSION = "backyrd.luna-provider@3" as const;


function modelOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("product_luna_response_invalid");
  const response = value as Record<string, unknown>;
  if (response.status !== "completed" || !Array.isArray(response.output)) throw new Error("product_luna_response_incomplete");
  const messages = response.output.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item) && item.type === "message");
  const parts = messages.flatMap(item => Array.isArray(item.content) ? item.content : []) as unknown[];
  if (parts.some(part => part && typeof part === "object" && "type" in part && part.type === "refusal")) throw new Error("product_luna_response_refused");
  const texts = parts.filter((part): part is { type: "output_text"; text: string } => !!part && typeof part === "object" && "type" in part && part.type === "output_text" && "text" in part && typeof part.text === "string");
  if (texts.length !== 1 || texts[0]!.text.length > 65_536) throw new Error("product_luna_response_invalid");
  try { return JSON.parse(texts[0]!.text); } catch { throw new Error("product_luna_response_invalid"); }
}

/** Typed UI inputs may not disappear during model interpretation. This only
 * compares already typed values; it never reads prose or invents participants. */
function assertExplicitContext(request: DecisionProductRequest, meaning: LibrarianRequest): void {
  const facts = meaning.facts.filter(f => !["EXCLUDED", "PREFERRED", "NOT_REQUIRED"].includes(f.modality));
  const explicit = request.explicit;
  const count = explicit.group?.size, age = explicit.group?.minimumAge;
  if (count != null && !facts.some(f => f.key === "people.count" && f.value.kind === "COUNT" && f.value.operator === "EQ" && f.value.amount === count)) throw new Error("product_luna_explicit_count_not_retained");
  if (age != null && !facts.some(f => f.key === "people.age" && f.value.kind === "AGE" && f.value.operator === "EQ" && f.value.amount === age)) throw new Error("product_luna_explicit_age_not_retained");
  const date = explicit.dateTime?.localDate, phase = explicit.dateTime?.dayPhase;
  if (date && !facts.some(f => f.value.kind === "DATE" && f.value.operator === "EQ" && f.value.date === date)) throw new Error("product_luna_explicit_date_not_retained");
  if (phase && !facts.some(f => f.value.kind === "DAY_PHASE" && f.value.phase === phase)) throw new Error("product_luna_explicit_daypart_not_retained");
  const budget = explicit.budget;
  if (budget?.state === "KNOWN" && budget.amount !== null) {
    if (!facts.some(f => f.value.kind === "MONEY" && f.value.amount === budget.amount && f.value.currency === budget.currency)) throw new Error("product_luna_explicit_budget_not_retained");
    if (!facts.some(f => f.value.kind === "BUDGET_SCOPE" && f.value.scope === (budget.perPerson ? "PER_PERSON" : "GROUP_TOTAL"))) throw new Error("product_luna_explicit_budget_scope_not_retained");
  }
}

/** One bounded model call. Source and meaning stay request-local; no legacy
 * facet cache, provider-response persistence or repair call is used. */
export function createDecisionProductLunaProvider(input: {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}) {
  if (!input.apiKey) throw new Error("product_luna_configuration_invalid");
  const fetchImpl = input.fetchImpl ?? fetch;
  return async (requestValue: DecisionProductRequest, _actor: DecisionProductAuthenticatedActor, signal: AbortSignal): Promise<LibrarianRequest> => {
    const request = DecisionProductRequestSchema.parse(requestValue);
    if (signal.aborted) throw new Error("product_luna_aborted");
    const reference = { now: (input.now?.() ?? new Date()).toISOString(), timezone: "Europe/Zurich" as const };
    // Profile/device/default cities authorize retrieval, not an additional
    // user wish. Do not send them to the language model as explicit input.
    const {targetCityRole, ...explicitContext} = request.explicit;
    if (targetCityRole === "SEARCH_CONTEXT") delete explicitContext.targetCity;
    const body = buildLunaLibrarianModelRequest({ sourceText: request.naturalLanguage, reference, explicitContext });
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST", signal, headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (signal.aborted) throw new Error("product_luna_aborted");
    if (!response.ok) throw new Error("product_luna_provider_unavailable");
    const output = modelOutput(await response.json());
    if (signal.aborted) throw new Error("product_luna_aborted");
    try {
      const meaning = prepareLibrarianRequest({ contractVersion: LUNA_LIBRARIAN_CONTRACT_VERSION, output: validateActiveLunaMeaningOutput(output), sourceText: request.naturalLanguage, reference });
      assertExplicitContext(request, meaning);
      return meaning;
    } catch { throw new Error("product_luna_meaning_invalid"); }
  };
}
