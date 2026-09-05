// supabase/functions/send-test-push/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeLaunchCostBoundary } from "../_shared/launch-cost-boundary.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type TestPushBody = {
  title?: string;
  body?: string;
};

type PushDevice = {
  id: string;
  expo_push_token: string;
};

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
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: "invalid_session" }, 401);
  }

  let input: TestPushBody = {};

  try {
    input = (await request.json()) as TestPushBody;
  } catch {
    // Defaults are used.
  }

  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim().slice(0, 80)
      : "Backyrd Test";

  const body =
    typeof input.body === "string" && input.body.trim()
      ? input.body.trim().slice(0, 220)
      : "Deine Push-Benachrichtigungen funktionieren 🎉";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const boundary = await consumeLaunchCostBoundary(adminClient, {
    operation: "test_push",
    subjectKey: user.id,
    subjectMinute: 5,
    subjectDay: 20,
    globalMinute: 100,
    globalDay: 1000,
  });
  if (!boundary.allowed) {
    return json(
      { error: boundary.reason === "LIMITED" ? "test_push_rate_limited" : "test_push_unavailable" },
      boundary.reason === "LIMITED" ? 429 : 503,
    );
  }

  const { data: devices, error: devicesError } = await adminClient
    .from("user_push_devices")
    .select("id, expo_push_token")
    .eq("user_id", user.id)
    .eq("notifications_enabled", true)
    .is("disabled_at", null);

  if (devicesError) {
    console.error("[send-test-push] device lookup failed", devicesError);
    return json({ error: "device_lookup_failed" }, 500);
  }

  const activeDevices = (devices ?? []) as PushDevice[];

  if (activeDevices.length === 0) {
    return json(
      {
        error: "no_active_push_devices",
        message: "Für dein Konto wurde kein aktives Push-Gerät gefunden.",
        sent_count: 0,
      },
      404,
    );
  }

  const messages = activeDevices.map((device) => ({
    to: device.expo_push_token,
    title,
    body,
    sound: "default",
    priority: "high",
    data: {
      type: "test_push",
      route: "/privacy-consent",
      sent_at: new Date().toISOString(),
    },
  }));

  const expoResponse = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });

  const expoPayload = await expoResponse.json().catch(() => null);

  if (!expoResponse.ok) {
    console.error("[send-test-push] Expo rejected request", expoPayload);
    return json(
      {
        error: "expo_push_request_failed",
        status: expoResponse.status,
        details: expoPayload,
      },
      502,
    );
  }

  const tickets = Array.isArray(expoPayload?.data)
    ? expoPayload.data
    : expoPayload?.data
      ? [expoPayload.data]
      : [];

  const acceptedTickets = tickets.filter(
    (ticket: { status?: string }) => ticket?.status === "ok",
  );

  const rejectedTickets = tickets.filter(
    (ticket: { status?: string }) => ticket?.status === "error",
  );

  for (let index = 0; index < rejectedTickets.length; index += 1) {
    const ticket = rejectedTickets[index] as {
      details?: { error?: string };
    };

    if (ticket?.details?.error === "DeviceNotRegistered") {
      const device = activeDevices[index];

      if (device) {
        await adminClient
          .from("user_push_devices")
          .update({
            notifications_enabled: false,
            disabled_at: new Date().toISOString(),
          })
          .eq("id", device.id);
      }
    }
  }

  return json({
    ok: true,
    sent_count: acceptedTickets.length,
    rejected_count: rejectedTickets.length,
    tickets,
  });
});
