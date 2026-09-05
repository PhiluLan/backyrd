import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";

export async function POST(req: Request) {
  try {
    const authorization = await authorizeAdminRequest(req);
    if (!authorization.ok) {
      return NextResponse.json({ error: "Admin-Berechtigung erforderlich." }, { status: authorization.status });
    }
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Server misconfigured (missing SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey);
    const { data: boundary, error: boundaryError } = await admin.rpc("backyrd_consume_launch_cost_boundary_v1", {
      p_operation: "admin_invite_email",
      p_subject_key: authorization.userId,
      p_subject_minute_limit: 5,
      p_subject_day_limit: 50,
      p_global_minute_limit: 20,
      p_global_day_limit: 100,
    });
    if (boundaryError || boundary?.allowed !== true) {
      return NextResponse.json(
        { error: boundary?.allowed === false ? "Zu viele Einladungen. Bitte später erneut versuchen." : "Einladungen sind momentan nicht verfügbar." },
        { status: boundary?.allowed === false ? 429 : 503 },
      );
    }

    // Invite
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/`,
    });

    if (error) {
      console.error("Admin invite failed", { code: error.code ?? "invite_failed" });
      return NextResponse.json({ error: "Die Einladung konnte nicht gesendet werden." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ error: "Die Einladung konnte nicht verarbeitet werden." }, { status: 500 });
  }
}
