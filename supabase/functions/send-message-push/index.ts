// supabase/functions/send-message-push/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    message_id?: string;
    chat_id?: string;
    sender_id?: string;
    recipient_id?: string;
    status?: string;
  };
};

type PushDevice = {
  id: string;
  expo_push_token: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-backyrd-webhook-secret",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("MESSAGE_PUSH_WEBHOOK_SECRET");
  const providedSecret = request.headers.get("x-backyrd-webhook-secret");

  if (
    !expectedSecret ||
    !providedSecret ||
    providedSecret !== expectedSecret
  ) {
    return json(401, { error: "invalid_webhook_secret" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "missing_supabase_environment" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let payload: WebhookPayload;

  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const outboxId = payload.record?.id;
  if (!outboxId) {
    return json(400, { error: "outbox_id_missing" });
  }

  const { data: claimed, error: claimError } = await admin
    .from("message_push_outbox")
    .update({
      status: "processing",
      attempts: 1,
      last_error: null,
    })
    .eq("id", outboxId)
    .in("status", ["pending", "failed"])
    .select(
      "id,message_id,chat_id,sender_id,recipient_id,status,attempts",
    )
    .maybeSingle();

  if (claimError) {
    return json(500, { error: claimError.message });
  }

  if (!claimed) {
    return json(200, { ok: true, skipped: "already_processed" });
  }

  try {
    const [
      { data: message, error: messageError },
      { data: sender, error: senderError },
      { data: devices, error: deviceError },
    ] = await Promise.all([
      admin
        .from("messages")
        .select("id,text")
        .eq("id", claimed.message_id)
        .single(),
      admin
        .from("profiles")
        .select("display_name,first_name,username")
        .eq("id", claimed.sender_id)
        .single(),
      admin
        .from("user_push_devices")
        .select("id,expo_push_token")
        .eq("user_id", claimed.recipient_id)
        .eq("notifications_enabled", true)
        .is("disabled_at", null),
    ]);

    if (messageError) throw messageError;
    if (senderError) throw senderError;
    if (deviceError) throw deviceError;

    const activeDevices = (devices ?? []) as PushDevice[];

    if (activeDevices.length === 0) {
      await admin
        .from("message_push_outbox")
        .update({
          status: "skipped",
          processed_at: new Date().toISOString(),
          last_error: "no_active_push_devices",
        })
        .eq("id", claimed.id);

      return json(200, { ok: true, skipped: "no_active_push_devices" });
    }

    const senderName =
      sender?.display_name?.trim() ||
      sender?.first_name?.trim() ||
      sender?.username?.trim() ||
      "Backyrd";

    const body =
      typeof message?.text === "string" && message.text.trim()
        ? message.text.trim().slice(0, 180)
        : "Neue Nachricht";

    const expoMessages = activeDevices.map((device) => ({
      to: device.expo_push_token,
      sound: "default",
      title: senderName,
      body,
      data: {
        type: "direct_message",
        chat_id: claimed.chat_id,
        sender_id: claimed.sender_id,
      },
    }));

    const expoResponse = await fetch(
      "https://exp.host/--/api/v2/push/send",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(expoMessages),
      },
    );

    const expoResult = await expoResponse.json();

    if (!expoResponse.ok) {
      throw new Error(
        `expo_push_failed:${expoResponse.status}:${JSON.stringify(expoResult)}`,
      );
    }

    await admin
      .from("message_push_outbox")
      .update({
        status: "sent",
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", claimed.id);

    return json(200, {
      ok: true,
      sent_devices: activeDevices.length,
      expo: expoResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await admin
      .from("message_push_outbox")
      .update({
        status: "failed",
        processed_at: new Date().toISOString(),
        last_error: message.slice(0, 1000),
      })
      .eq("id", claimed.id);

    return json(500, { error: message });
  }
});
