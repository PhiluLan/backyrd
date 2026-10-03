import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };
const MAX_REQUEST_BYTES = 16_384;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "invalid_origin" }, { status: 403, headers: noStore });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "invalid_content_type" }, { status: 415, headers: noStore });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
      return Response.json({ error: "request_too_large" }, { status: 413, headers: noStore });
    }
    body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_body");
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400, headers: noStore });
  }

  try {
    const client = await createSupabaseServerClient();
    const { data: verified, error: authError } = await client.auth.getUser();
    if (authError || !verified.user) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    }
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.access_token || sessionData.session.user.id !== verified.user.id) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    }

    // Forward only the verified user's token. The canonical function owns
    // authorization, rate limits, request validation and all Decision rules.
    const { data, error } = await client.functions.invoke<unknown>("decision-v13", {
      body,
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });
    if (error || !data) {
      console.error("decision_web_upstream_failed", {
        errorType: error?.name ?? "empty_response",
        status: error && "context" in error && error.context instanceof Response
          ? error.context.status : null,
      });
      return Response.json({ error: "decision_unavailable" }, { status: 503, headers: noStore });
    }
    return Response.json(data, { headers: noStore });
  } catch {
    return Response.json({ error: "decision_unavailable" }, { status: 503, headers: noStore });
  }
}
