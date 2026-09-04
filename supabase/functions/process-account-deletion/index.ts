// supabase/functions/process-account-deletion/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}


function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack ?? null,
      raw: null,
    };
  }

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const message = [
      value.message,
      value.details,
      value.hint,
      value.code ? `code=${value.code}` : null,
    ]
      .filter((item) => typeof item === "string" && item.length > 0)
      .join(" | ");

    return {
      message: message || JSON.stringify(value),
      name: "SupabaseError",
      stack: null,
      raw: value,
    };
  }

  return {
    message: String(error ?? "account_deletion_failed"),
    name: "UnknownError",
    stack: null,
    raw: error ?? null,
  };
}

Deno.serve(async (request) => {
  let phase = "request_validation";

  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

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
    data: { user: adminUser },
    error: adminUserError,
  } = await userClient.auth.getUser();

  if (adminUserError || !adminUser) {
    return json({ error: "invalid_session" }, 401);
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc(
    "consent_is_admin_v1",
  );

  if (adminError || isAdmin !== true) {
    return json({ error: "admin_required" }, 403);
  }

  let body: {
    request_id?: string;
    confirmation?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const requestId = body.request_id?.trim();
  if (!requestId) {
    return json({ error: "request_id_required" }, 400);
  }

  if (body.confirmation !== "DELETE") {
    return json({ error: "confirmation_required" }, 400);
  }

  phase = "service_client";

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  phase = "load_request";

  const { data: requestRow, error: requestError } = await admin
    .from("data_rights_requests")
    .select(
      "id, user_id, request_type, status, scheduled_for, deletion_phase, deletion_started_at",
    )
    .eq("id", requestId)
    .eq("request_type", "account_deletion")
    .maybeSingle();

  if (requestError || !requestRow) {
    return json(
      {
        error: "deletion_request_not_found",
        details: requestError?.message ?? null,
      },
      404,
    );
  }

  const targetUserId = requestRow.user_id as string | null;

  if (!targetUserId) {
    return json(
      {
        error: "auth_user_already_removed",
        details:
          "The deletion request no longer contains a user_id. Complete the request manually only after verifying auth.users.",
      },
      409,
    );
  }

  const isAuthRecovery =
    requestRow.status === "failed" &&
    requestRow.deletion_phase === "auth_deletion" &&
    requestRow.deletion_started_at !== null;

  try {
    if (!isAuthRecovery) {
      phase = "preflight";

      const preview = await userClient.rpc(
        "admin_preview_account_deletion_v1",
        { p_request_id: requestId },
      );

      if (preview.error) throw preview.error;

      if (preview.data?.can_execute !== true) {
        return json(
          {
            error: "preflight_blocked",
            preview: preview.data,
          },
          409,
        );
      }
    }

    phase = isAuthRecovery
      ? "auth_recovery_storage_check"
      : "storage_cleanup";

    const storageSummary: Record<string, number> = {};

    const ownedStorage = await userClient.rpc(
      "admin_account_owned_storage_paths_v1",
      { p_user_id: targetUserId },
    );
    if (ownedStorage.error) throw ownedStorage.error;

    for (const bucket of [
      "profile-photos",
      "review-photos",
      "social-post-media",
      "chat-uploads",
    ]) {
      const paths = (ownedStorage.data ?? [])
        .filter((row: { bucket_id: string }) => row.bucket_id === bucket)
        .map((row: { object_path: string }) => row.object_path);
      if (paths.length > 0) {
        const removal = await admin.storage.from(bucket).remove(paths);
        if (removal.error) throw new Error(`${bucket}: ${removal.error.message}`);
      }
      storageSummary[bucket] = paths.length;
    }

    // Data exports are service-owned and therefore use the canonical user
    // prefix rather than storage ownership.
    for (const bucket of ["data-rights-exports"]) {
      let removed = 0;
      let offset = 0;

      while (true) {
        const list = await admin.storage
          .from(bucket)
          .list(targetUserId, {
            limit: 100,
            offset,
            sortBy: { column: "name", order: "asc" },
          });

        if (list.error) {
          if (list.error.message.toLowerCase().includes("not found")) break;
          throw new Error(`${bucket}: ${list.error.message}`);
        }

        const entries = list.data ?? [];
        if (entries.length === 0) break;

        const paths = entries
          .filter((entry) => entry.name)
          .map((entry) => `${targetUserId}/${entry.name}`);

        if (paths.length > 0) {
          const removal = await admin.storage.from(bucket).remove(paths);
          if (removal.error) {
            throw new Error(`${bucket}: ${removal.error.message}`);
          }
          removed += paths.length;
        }

        if (entries.length < 100) break;
        offset += 100;
      }

      storageSummary[bucket] = removed;
    }

    let erasureResult: unknown = {
      recovery_mode: true,
      database_erasure_skipped: true,
    };

    if (!isAuthRecovery) {
      phase = "database_erasure";

      const erase = await userClient.rpc(
        "admin_erase_account_data_v1",
        { p_request_id: requestId },
      );

      if (erase.error) throw erase.error;
      erasureResult = erase.data;
    }

    phase = isAuthRecovery ? "auth_deletion_recovery" : "auth_deletion";

    const authDeletion = await admin.auth.admin.deleteUser(targetUserId);

    if (authDeletion.error) {
      await userClient.rpc("admin_fail_account_deletion_v1", {
        p_request_id: requestId,
        p_phase: "auth_deletion",
        p_failure_code: authDeletion.error.message,
      });

      return json(
        {
          error: "auth_deletion_failed",
          details: authDeletion.error.message,
          erasure: erasureResult,
          storage: storageSummary,
        },
        500,
      );
    }

    phase = "completion";

    const completed = await userClient.rpc(
      "admin_complete_account_deletion_v1",
      {
        p_request_id: requestId,
        p_summary: {
          storage_removed: storageSummary,
          auth_user_deleted: true,
          executed_by: adminUser.id,
          executed_at: new Date().toISOString(),
          recovery_mode: isAuthRecovery,
        },
      },
    );

    if (completed.error) throw completed.error;

    return json({
      ok: true,
      request_id: requestId,
      user_id: targetUserId,
      status: "completed",
      storage_removed: storageSummary,
      recovery_mode: isAuthRecovery,
      erasure: erasureResult,
    });
  } catch (error) {
    const described = describeError(error);
    const failureCode = `${phase}: ${described.message}`.slice(0, 500);

    console.error(
      "[process-account-deletion]",
      JSON.stringify({
        phase,
        request_id: requestId,
        target_user_id: targetUserId,
        error: described,
      }),
    );

    const failureUpdate = await userClient.rpc(
      "admin_fail_account_deletion_v1",
      {
        p_request_id: requestId,
        p_phase: phase,
        p_failure_code: failureCode,
      },
    );

    if (failureUpdate.error) {
      console.error(
        "[process-account-deletion] failure status update failed",
        JSON.stringify(describeError(failureUpdate.error)),
      );
    }

    return json(
      {
        error: "account_deletion_failed",
        phase,
        details: described.message,
        database_error: described.raw,
      },
      500,
    );
  }
});
