export type NuknukCheck = "connection" | "model";

export type AdminNuknukStatus = {
  checkedAt: string;
  scope: "off" | "personal" | "all" | "invalid";
  model: string | null;
  state: "disabled" | "configuration" | "connected" | "unreachable" | "timeout" | "rejected" | "upstream" | "invalid_reply" | "healthy";
  durationMs: number | null;
  httpStatus: number | null;
};

type Configuration = {
  provider: string;
  aiEnabled: boolean;
  personalUser?: string;
  model?: string;
  endpoint?: string;
  apiKey?: string;
};

export async function checkAdminNuknukStatus(
  configuration: Configuration, check: NuknukCheck, signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<AdminNuknukStatus> {
  const { provider, aiEnabled, personalUser, model, endpoint, apiKey } = configuration;
  const scope = provider === "nuknuk" ? "all" : provider === "nuknuk-personal" ? "personal" : provider === "luna" ? "off" : "invalid";
  const safeModel = model && /^[a-z\d][a-z\d._:/-]{0,99}$/i.test(model) ? model : null;
  const summary = (state: AdminNuknukStatus["state"], durationMs: number | null = null, httpStatus: number | null = null): AdminNuknukStatus =>
    ({ checkedAt: new Date().toISOString(), scope, model: safeModel, state, durationMs, httpStatus });

  if (scope === "invalid") return summary("configuration");
  if (scope === "off" || !aiEnabled) return summary("disabled");
  if (!endpoint || !apiKey || !safeModel || (scope === "personal" && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(personalUser ?? ""))) {
    return summary("configuration");
  }

  let url: URL;
  try { url = new URL(endpoint); } catch { return summary("configuration"); }
  if (url.protocol !== "https:" || url.username || url.password) return summary("configuration");

  const active = check === "model";
  const personalGateway = safeModel === "nuknuk-35b-r15";
  const prompt = personalGateway ? "Reply with UPDATE_SEARCH as the route." : "Reply with OK.";
  const body = active ? {
    model: safeModel,
    stream: false,
    max_tokens: personalGateway ? 96 : 16,
    messages: [{ role: "system", content: prompt }, { role: "user", content: "Lieber ein Café mit Terrasse." }],
    chat_template_kwargs: { enable_thinking: false },
    ...(personalGateway ? { response_format: { type: "json_schema", json_schema: {
      name: "backyrd_dialogue_route",
      strict: true,
      schema: { type: "object", properties: { route: { type: "string", enum: ["UPDATE_SEARCH"] } }, required: ["route"], additionalProperties: false },
    } } } : {}),
  } : {};
  const timeout = AbortSignal.timeout(active ? 18_000 : 4_000);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([timeout, signal]),
      headers: { "content-type": "application/json", ...(active ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!active || !response.ok) {
      await response.body?.cancel();
      if (!active && [400, 401, 403, 405, 422].includes(response.status)) return summary("connected", elapsed(), response.status);
      if (response.status === 401 || response.status === 403) return summary("rejected", elapsed(), response.status);
      if (active && response.status >= 500 && response.status <= 504) return summary("upstream", elapsed(), response.status);
      if (active && response.status < 500) return summary("rejected", elapsed(), response.status);
      return summary("unreachable", elapsed(), response.status);
    }
    try {
      const result = await response.json();
      const content = result?.choices?.[0]?.message?.content;
      const valid = result?.model === safeModel && typeof content === "string" && (personalGateway
        ? JSON.parse(content)?.route === "UPDATE_SEARCH"
        : /^OK[.!]?$/i.test(content.trim()));
      return summary(valid ? "healthy" : "invalid_reply", elapsed(), response.status);
    } catch {
      return summary(timeout.aborted || signal.aborted ? "timeout" : "invalid_reply", elapsed(), response.status);
    }
  } catch {
    return summary(timeout.aborted || signal.aborted ? "timeout" : "unreachable", elapsed());
  }
}
