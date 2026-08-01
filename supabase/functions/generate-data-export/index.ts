// supabase/functions/generate-data-export/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function selectBy(
  client: ReturnType<typeof createClient>,
  table: string,
  column: string,
  userId: string,
) {
  const { data, error } = await client.from(table).select("*").eq(column, userId);

  if (error) {
    console.warn(`[data-export] ${table} skipped`, error.message);
    return {
      rows: [],
      warning: `${table}: ${error.message}`,
    };
  }

  return { rows: data ?? [], warning: null };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "server_configuration_missing" }, 500);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "missing_authorization" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: "invalid_session" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: requestRow, error: requestError } = await admin
    .from("data_rights_requests")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("request_type", "data_export")
    .in("status", ["requested", "processing", "ready"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (requestError || !requestRow) {
    return json(
      {
        error: "export_request_not_found",
        details: requestError?.message ?? null,
      },
      404,
    );
  }

  await admin
    .from("data_rights_requests")
    .update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      failure_code: null,
    })
    .eq("id", requestRow.id);

  try {
    const [
      profile,
      reviews,
      reviewComments,
      reviewLikes,
      reviewPhotos,
      socialPosts,
      socialComments,
      socialReactions,
      messages,
      favorites,
      decisions,
      analyticsEvents,
      analyticsSessions,
      analyticsErrors,
      mlEvents,
      tasteEvents,
      tasteConcepts,
      tasteMoods,
      tasteTime,
      tasteProfile,
      placeTypePreferences,
      contextPreferences,
      consents,
      consentEvents,
      legalAcceptances,
      pushDevices,
      spotClaims,
    ] = await Promise.all([
      selectBy(admin, "profiles", "id", user.id),
      selectBy(admin, "reviews", "user_id", user.id),
      selectBy(admin, "review_comments", "user_id", user.id),
      selectBy(admin, "review_likes", "user_id", user.id),
      selectBy(admin, "review_photos", "uploaded_by", user.id),
      selectBy(admin, "social_posts", "user_id", user.id),
      selectBy(admin, "social_comments", "user_id", user.id),
      selectBy(admin, "social_post_reactions", "user_id", user.id),
      selectBy(admin, "messages", "sender_id", user.id),
      selectBy(admin, "favorites", "user_id", user.id),
      selectBy(admin, "decision_sessions", "user_id", user.id),
      selectBy(admin, "analytics_events", "user_id", user.id),
      selectBy(admin, "analytics_sessions", "user_id", user.id),
      selectBy(admin, "analytics_errors", "user_id", user.id),
      selectBy(admin, "backyrd_ml_events_v1", "user_id", user.id),
      selectBy(admin, "user_taste_events_v2", "user_id", user.id),
      selectBy(admin, "user_taste_concepts_v2", "user_id", user.id),
      selectBy(admin, "user_taste_moods_v1", "user_id", user.id),
      selectBy(admin, "user_taste_time_v1", "user_id", user.id),
      selectBy(admin, "user_taste_profile_v1", "user_id", user.id),
      selectBy(admin, "user_place_type_preferences_v1", "user_id", user.id),
      selectBy(
        admin,
        "backyrd_user_context_feature_preferences_v1",
        "user_id",
        user.id,
      ),
      selectBy(admin, "user_consents", "user_id", user.id),
      selectBy(admin, "consent_events", "user_id", user.id),
      selectBy(admin, "user_legal_acceptances", "user_id", user.id),
      selectBy(admin, "user_push_devices", "user_id", user.id),
      selectBy(admin, "spot_claims", "user_id", user.id),
    ]);

    const { data: ownedSpots, error: ownedSpotsError } = await admin
      .from("spots")
      .select("*")
      .or(`owner_id.eq.${user.id},created_by.eq.${user.id}`);

    const { data: storageObjects, error: storageError } = await admin
      .schema("storage")
      .from("objects")
      .select("id, bucket_id, name, owner, created_at, updated_at, metadata")
      .or(`owner.eq.${user.id},name.like.${user.id}/%`);

    const warnings = [
      profile, reviews, reviewComments, reviewLikes, reviewPhotos,
      socialPosts, socialComments, socialReactions, messages, favorites,
      decisions, analyticsEvents, analyticsSessions, analyticsErrors,
      mlEvents, tasteEvents, tasteConcepts, tasteMoods, tasteTime,
      tasteProfile, placeTypePreferences, contextPreferences, consents,
      consentEvents, legalAcceptances, pushDevices, spotClaims,
    ]
      .map((entry) => entry.warning)
      .filter(Boolean);

    if (ownedSpotsError) warnings.push(`spots: ${ownedSpotsError.message}`);
    if (storageError) warnings.push(`storage.objects: ${storageError.message}`);

    const exportPayload = {
      export_metadata: {
        schema_version: "backyrd-data-export-v1",
        generated_at: new Date().toISOString(),
        user_id: user.id,
        account_email: user.email ?? null,
        request_id: requestRow.id,
        warnings,
      },
      account: {
        auth: {
          id: user.id,
          email: user.email ?? null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          app_metadata: user.app_metadata,
          user_metadata: user.user_metadata,
        },
        profile: profile.rows,
      },
      content: {
        reviews: reviews.rows,
        review_comments: reviewComments.rows,
        review_likes: reviewLikes.rows,
        review_photos: reviewPhotos.rows,
        social_posts: socialPosts.rows,
        social_comments: socialComments.rows,
        social_post_reactions: socialReactions.rows,
        messages_sent: messages.rows,
        favorites: favorites.rows,
        owned_or_created_spots: ownedSpots ?? [],
        spot_claims: spotClaims.rows,
      },
      decisions_and_personalization: {
        decision_sessions: decisions.rows,
        ml_events: mlEvents.rows,
        taste_events: tasteEvents.rows,
        taste_concepts: tasteConcepts.rows,
        taste_moods: tasteMoods.rows,
        taste_time: tasteTime.rows,
        taste_profile: tasteProfile.rows,
        place_type_preferences: placeTypePreferences.rows,
        context_feature_preferences: contextPreferences.rows,
      },
      analytics_and_diagnostics: {
        events: analyticsEvents.rows,
        sessions: analyticsSessions.rows,
        errors: analyticsErrors.rows,
      },
      privacy: {
        consents: consents.rows,
        consent_events: consentEvents.rows,
        legal_acceptances: legalAcceptances.rows,
        push_devices: pushDevices.rows.map((device: Record<string, unknown>) => ({
          ...device,
          expo_push_token: device.expo_push_token ? "[REDACTED]" : null,
        })),
      },
      storage_inventory: storageObjects ?? [],
      retention_note:
        "Safety- und Moderationsdaten können aus gesetzlichen und Integritätsgründen getrennt aufbewahrt werden. Sie werden in diesem Nutzerexport nicht vollständig offengelegt, wenn dadurch interne Sicherheitsmechanismen oder Rechte Dritter beeinträchtigt würden.",
    };

    const path = `${user.id}/${requestRow.id}.json`;
    const bytes = new TextEncoder().encode(
      JSON.stringify(exportPayload, null, 2),
    );

    const upload = await admin.storage
      .from("data-rights-exports")
      .upload(path, bytes, {
        contentType: "application/json",
        upsert: true,
      });

    if (upload.error) throw upload.error;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const signed = await admin.storage
      .from("data-rights-exports")
      .createSignedUrl(path, 24 * 60 * 60);

    if (signed.error || !signed.data?.signedUrl) {
      throw signed.error ?? new Error("signed_url_failed");
    }

    await admin
      .from("data_rights_requests")
      .update({
        status: "ready",
        completed_at: new Date().toISOString(),
        export_storage_path: path,
        export_expires_at: expiresAt.toISOString(),
        metadata: {
          format: "json",
          schema_version: "backyrd-data-export-v1",
          size_bytes: bytes.byteLength,
          warning_count: warnings.length,
        },
      })
      .eq("id", requestRow.id);

    return json({
      ok: true,
      request_id: requestRow.id,
      status: "ready",
      download_url: signed.data.signedUrl,
      expires_at: expiresAt.toISOString(),
      size_bytes: bytes.byteLength,
      warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "export_generation_failed";

    console.error("[data-export] failed", error);

    await admin
      .from("data_rights_requests")
      .update({
        status: "failed",
        failure_code: message.slice(0, 300),
      })
      .eq("id", requestRow.id);

    return json(
      {
        error: "export_generation_failed",
        details: message,
      },
      500,
    );
  }
});
