import type { WeatherResult } from "../../../packages/shared/src/weather-context.ts";

type Dependencies = {
  actorForToken: (token: string) => Promise<string | null>;
  consume: (actor: string) => Promise<"ALLOWED" | "LIMITED" | "UNAVAILABLE">;
  weather: (city: string, at?: string) => Promise<WeatherResult>;
};
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "private, no-store" } });

export function createWeatherHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return json({ error: "authentication_required" }, 401);
    try {
      const actor = await deps.actorForToken(bearer);
      if (!actor) return json({ error: "authentication_required" }, 401);
      let body: Record<string, unknown>;
      try {
        if (!request.body) return json({ error: "invalid_request" }, 400);
        const reader = request.body.getReader(), decoder = new TextDecoder();
        let text = "", size = 0;
        try {
          for (;;) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 512) return json({ error: "invalid_request" }, 400);
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } finally { await reader.cancel().catch(() => undefined); }
        const raw: unknown = JSON.parse(text);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json({ error: "invalid_request" }, 400);
        body = raw as Record<string, unknown>;
      } catch { return json({ error: "invalid_request" }, 400); }
      if (Object.keys(body).some(k => !["city", "at"].includes(k)) || typeof body.city !== "string" || !body.city.trim() || body.city.length > 100
        || (body.at !== undefined && (typeof body.at !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.at) || !Number.isFinite(Date.parse(body.at))))) return json({ error: "invalid_request" }, 400);
      const allowed = await deps.consume(actor);
      if (allowed !== "ALLOWED") return json({ error: "weather_unavailable" }, allowed === "LIMITED" ? 429 : 503);
      return json(await deps.weather(body.city.trim(), body.at as string | undefined));
    } catch { return json({ error: "weather_unavailable" }, 503); }
  };
}
