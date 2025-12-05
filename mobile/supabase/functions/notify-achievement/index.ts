// supabase/functions/notify-achievement/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { user_id, achievement_id } = await req.json();

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profile } = await client
    .from("profiles")
    .select("expo_push_token")
    .eq("id", user_id)
    .single();

  const { data: ach } = await client
    .from("achievements")
    .select("name")
    .eq("id", achievement_id)
    .single();

  if (!profile?.expo_push_token) {
    return new Response("No token", { status: 200 });
  }

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title: "Neues Achievement!",
      body: ach?.name,
      sound: null,
    }),
  });

  return new Response("OK");
});
