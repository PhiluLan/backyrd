import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Payload = {
  spot_id: string;
  text?: string | null;
  mood_a?: string | null;
  mood_b?: string | null;
  photo_urls?: string[];
  city?: string | null;
};

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await req.json()) as Payload;

    if (!payload?.spot_id) {
      return json({ error: "spot_id is required" }, { status: 400 });
    }

    const moodA = payload.mood_a?.trim() || null;
    const moodB = payload.mood_b?.trim() || null;

    const moodResolutions: unknown[] = [];
    for (const expression of [moodA, moodB]) {
      if (!expression) continue;
      const { data, error } = await adminClient.rpc("backyrd_resolve_mood_input_v2", {
        p_input: expression,
      });
      if (error) return json({ error: "mood_resolver_unavailable" }, { status: 503 });
      moodResolutions.push(data);
    }

    const { data: review, error: reviewError } = await adminClient
      .from("reviews")
      .insert({
        spot_id: payload.spot_id,
        user_id: user.id,
        data_origin: "REAL",
        review_origin: "SMART_REVIEW",
        product_evidence_origin: "smart_review_v1",
        text: payload.text?.trim() || null,
        mood_a: moodA,
        mood_b: moodB,
        mood_a_id: null,
        mood_b_id: null,
        city: payload.city?.trim() || null,
      })
      .select()
      .single();

    if (reviewError || !review) {
      return json(
        { error: reviewError?.message || "Failed to create review" },
        { status: 400 }
      );
    }

    const photoUrls = Array.isArray(payload.photo_urls)
      ? payload.photo_urls.filter(Boolean)
      : [];

    if (photoUrls.length > 0) {
      const rows = photoUrls.map((url) => ({
        review_id: review.id,
        url,
        uploaded_by: user.id,
      }));

      const { error: photosError } = await adminClient
        .from("review_photos")
        .insert(rows);

      if (photosError) {
        return json(
          { error: photosError.message, review_id: review.id },
          { status: 400 }
        );
      }
    }

    const { data: storedMoodResolutions } = await adminClient
      .from("backyrd_review_mood_expressions_v1")
      .select("slot,raw_expression,normalized_expression,resolution_status,concept_key,resolution_kind,invalid_reason")
      .eq("review_id", review.id)
      .order("slot");

    return json({
      ok: true,
      review_id: review.id,
      message: "Review created successfully",
      mood_resolutions: storedMoodResolutions?.map((row) => ({
        status: row.resolution_status,
        rawExpression: row.raw_expression,
        normalizedExpression: row.normalized_expression,
        conceptKey: row.concept_key ?? undefined,
        resolutionKind: row.resolution_kind,
        reason: row.invalid_reason ?? undefined,
        contractVersion: "backyrd-product-mood-v2",
      })) ?? moodResolutions,
    });
  } catch (error) {
    console.error("create-review-with-photos error:", error);

    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
