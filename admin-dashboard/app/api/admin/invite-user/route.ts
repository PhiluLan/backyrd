import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";

export async function POST(req: Request) {
  try {
    const authorization = await authorizeAdminRequest(req);
    if (!authorization.ok) return NextResponse.json({ error: "Diese Aktion ist nur für autorisierte Admins verfügbar." }, { status: authorization.status });
    const body = await req.json() as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Bitte gib eine gültige E-Mail-Adresse ein." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Einladungen sind momentan nicht verfügbar." },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey);

    // Invite
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/`,
    });

    if (error) {
      console.error("Admin invite failed", { code: error.code, message: error.message });
      return NextResponse.json({ error: "Die Einladung konnte nicht gesendet werden." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    console.error("Admin invite request failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "Die Einladung konnte nicht verarbeitet werden." }, { status: 500 });
  }
}
