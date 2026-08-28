import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GoogleAuthorAttribution = { displayName?: string; uri?: string; photoUri?: string };
type GooglePhoto = { name?: string; authorAttributions?: GoogleAuthorAttribution[]; googleMapsUri?: string };
type GooglePlace = { photos?: GooglePhoto[] };

const publicOrigins = new Set(["https://backyrd.ch", "https://www.backyrd.ch"]);
const requestsInFlight = new Map<string, Promise<ResponsePayload>>();
const spotIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResponsePayload = {
  source: "google" | "backyrd" | "placeholder";
  imageUrl: string | null;
  authorAttributions?: GoogleAuthorAttribution[];
  googleMapsUri?: string | null;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return publicOrigins.has(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : {};
}

function response(request: Request, payload: ResponsePayload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fallback(): ResponsePayload {
  return { source: "placeholder", imageUrl: null };
}

function requestIp(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = cfIp || forwarded || "";
  return /^[0-9a-f:.]{3,64}$/i.test(candidate) ? candidate : null;
}

async function saltedIpKey(ip: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function googlePlacePhoto(placeId: string, apiKey: string): Promise<ResponsePayload> {
  const placeResponse = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" },
  });
  if (!placeResponse.ok) return fallback();

  const place = await placeResponse.json() as GooglePlace;
  const photo = place.photos?.find((candidate) => Boolean(candidate.name));
  if (!photo?.name) return fallback();

  const media = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
  media.searchParams.set("maxWidthPx", "1600");
  media.searchParams.set("maxHeightPx", "1600");
  media.searchParams.set("skipHttpRedirect", "true");
  const mediaResponse = await fetch(media, { headers: { "X-Goog-Api-Key": apiKey } });
  if (!mediaResponse.ok) return fallback();

  const mediaPayload = await mediaResponse.json();
  if (typeof mediaPayload?.photoUri !== "string") return fallback();
  return {
    source: "google",
    imageUrl: mediaPayload.photoUri,
    authorAttributions: photo.authorAttributions ?? [],
    googleMapsUri: photo.googleMapsUri ?? null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return publicOrigins.has(request.headers.get("origin") ?? "")
      ? new Response(null, { status: 204, headers: corsHeaders(request) })
      : new Response(null, { status: 403 });
  }
  if (request.method !== "POST" || !publicOrigins.has(request.headers.get("origin") ?? "")) {
    return response(request, fallback(), 404);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  const rateLimitSalt = Deno.env.get("PUBLIC_SPOT_PHOTO_RATE_LIMIT_SALT");
  const ip = requestIp(request);
  if (!supabaseUrl || !serviceRoleKey || !googleApiKey || !rateLimitSalt || !ip) return response(request, fallback());

  const body = await request.json().catch(() => null);
  const spotId = typeof body?.spotId === "string" ? body.spotId.trim() : "";
  const preferredOwnerImageFailed = body?.preferredOwnerImageFailed === true;
  if (!spotIdPattern.test(spotId)) return response(request, fallback(), 404);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const ipKey = await saltedIpKey(ip, rateLimitSalt);
  const limits = await Promise.all([
    admin.rpc("backyrd_consume_public_spot_photo_rate_limit_v1", { p_scope: "ip-minute", p_bucket_key: ipKey, p_window_seconds: 60, p_limit: 20 }),
    admin.rpc("backyrd_consume_public_spot_photo_rate_limit_v1", { p_scope: "global-minute", p_bucket_key: "all", p_window_seconds: 60, p_limit: 1000 }),
    admin.rpc("backyrd_consume_public_spot_photo_rate_limit_v1", { p_scope: "global-hour", p_bucket_key: "all", p_window_seconds: 3600, p_limit: 5000 }),
  ]);
  if (limits.some(({ error, data }) => error || data !== true)) return response(request, fallback(), 429);

  const requestKey = `${spotId}:${preferredOwnerImageFailed ? "owner-failed" : "missing-owner"}`;
  const inFlight = requestsInFlight.get(requestKey);
  if (inFlight) return response(request, await inFlight);

  const work = (async (): Promise<ResponsePayload> => {
    const { data: spot } = await admin
      .from("spots")
      .select("id,status,header_photo_path,google_place_id,google_photo_enabled")
      .eq("id", spotId)
      .eq("status", "approved")
      .maybeSingle();
    if (!spot || (spot.header_photo_path && !preferredOwnerImageFailed) || !spot.google_place_id || spot.google_photo_enabled === false) return fallback();

    const { data: eligible } = await admin.rpc("distribution_trust_entity_is_eligible_v1", {
      p_entity_type: "spot", p_entity_id: spotId, p_surface: "discovery",
    });
    if (eligible !== true) return fallback();

    return googlePlacePhoto(spot.google_place_id, googleApiKey);
  })().catch(() => fallback()).finally(() => requestsInFlight.delete(requestKey));

  requestsInFlight.set(requestKey, work);
  return response(request, await work);
});
