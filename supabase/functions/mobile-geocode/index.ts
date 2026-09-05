import { createClient } from "npm:@supabase/supabase-js@2";
import { consumeLaunchCostBoundary } from "../_shared/launch-cost-boundary.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
});
const finiteCoordinate = (value: unknown, minimum: number, maximum: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!url || !serviceKey || !googleKey || !bearer) return json({ ok: false, error: "geocode_unavailable" }, 503);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !auth.user) return json({ ok: false, error: "authentication_required" }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  const action = body.action;
  if (action !== "search_address" && action !== "reverse_geocode") return json({ ok: false, error: "invalid_action" }, 400);

  const query = action === "search_address" && typeof body.query === "string" ? body.query.trim() : "";
  if (action === "search_address" && (query.length < 4 || query.length > 160)) {
    return json({ ok: false, error: "invalid_query" }, 400);
  }
  if (
    action === "reverse_geocode" &&
    (!finiteCoordinate(body.latitude, -90, 90) || !finiteCoordinate(body.longitude, -180, 180))
  ) {
    return json({ ok: false, error: "invalid_coordinates" }, 400);
  }

  const boundary = await consumeLaunchCostBoundary(admin, {
    operation: "mobile_geocode",
    subjectKey: auth.user.id,
    subjectMinute: 20,
    subjectDay: 100,
    globalMinute: 100,
    globalDay: 2000,
  });
  if (!boundary.allowed) {
    return json(
      { ok: false, error: boundary.reason === "LIMITED" ? "geocode_rate_limited" : "geocode_unavailable" },
      boundary.reason === "LIMITED" ? 429 : 503,
    );
  }

  try {
    if (action === "search_address") {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": googleKey,
          "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({ textQuery: query, languageCode: "de", maxResultCount: 5 }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return json({ ok: false, error: "geocode_provider_unavailable" }, response.status === 429 ? 429 : 503);
      const payload = await response.json() as { places?: Array<Record<string, unknown>> };
      const results = (payload.places ?? []).flatMap((place) => {
        const location = place.location as { latitude?: unknown; longitude?: unknown } | undefined;
        if (typeof place.id !== "string" || !finiteCoordinate(location?.latitude, -90, 90) || !finiteCoordinate(location?.longitude, -180, 180)) return [];
        const displayName = place.displayName as { text?: unknown } | undefined;
        const formatted = typeof place.formattedAddress === "string" ? place.formattedAddress : null;
        return [{
          id: place.id,
          place_name: formatted ?? (typeof displayName?.text === "string" ? displayName.text : query),
          coords: [location.longitude as number, location.latitude as number],
        }];
      });
      return json({ ok: true, results });
    }

    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.searchParams.set("latlng", `${body.latitude},${body.longitude}`);
    endpoint.searchParams.set("language", "de");
    endpoint.searchParams.set("key", googleKey);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return json({ ok: false, error: "geocode_provider_unavailable" }, response.status === 429 ? 429 : 503);
    const payload = await response.json() as { status?: string; results?: Array<Record<string, unknown>> };
    if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") return json({ ok: false, error: "geocode_provider_unavailable" }, payload.status === "OVER_QUERY_LIMIT" ? 429 : 503);
    const first = payload.results?.[0];
    const components = Array.isArray(first?.address_components) ? first.address_components : [];
    const firstComponent = components[0] as { long_name?: unknown } | undefined;
    const formatted = typeof first?.formatted_address === "string" ? first.formatted_address : null;
    return json({ ok: true, result: {
      name: typeof firstComponent?.long_name === "string" ? firstComponent.long_name : formatted,
      place_name: formatted,
      address: formatted,
    } });
  } catch {
    return json({ ok: false, error: "geocode_provider_unavailable" }, 503);
  }
});
