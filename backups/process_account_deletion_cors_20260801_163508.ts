// supabase/functions/process-account-deletion/index.ts

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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: requestRow, error: requestError } = await admin
    .from("data_rights_requests")
    .select("id, user_id, request_type, status, scheduled_for")
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

  const targetUserId = requestRow.user_id as string;

  try {
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

    const storageSummary: Record<string, number> = {};

    for (const bucket of [
      "profile-photos",
      "review-photos",
      "social-post-media",
      "data-rights-exports",
    ]) {
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

    const erase = await userClient.rpc(
      "admin_erase_account_data_v1",
      { p_request_id: requestId },
    );

    if (erase.error) throw erase.error;

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
          erasure: erase.data,
          storage: storageSummary,
        },
        500,
      );
    }

    const completed = await userClient.rpc(
      "admin_complete_account_deletion_v1",
      {
        p_request_id: requestId,
        p_summary: {
          storage_removed: storageSummary,
          auth_user_deleted: true,
          executed_by: adminUser.id,
          executed_at: new Date().toISOString(),
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
      erasure: erase.data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "account_deletion_failed";

    console.error("[process-account-deletion]", error);

    await userClient.rpc("admin_fail_account_deletion_v1", {
      p_request_id: requestId,
      p_phase: "processing",
      p_failure_code: message,
    });

    return json(
      {
        error: "account_deletion_failed",
        details: message,
      },
      500,
    );
  }
});
