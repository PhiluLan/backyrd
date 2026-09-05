import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("admin_server_not_configured");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

type ToggleUserBody = {
  id?: unknown;
  active?: unknown;
};

export async function POST(req: Request) {
  try {
    const authorization = await authorizeAdminRequest(req);
    if (!authorization.ok) return NextResponse.json({ error: "Admin-Berechtigung erforderlich." }, { status: authorization.status });
    const body = (await req.json()) as ToggleUserBody;

    if (typeof body.id !== "string" || !uuidPattern.test(body.id) || typeof body.active !== "boolean") {
      return NextResponse.json(
        { error: "Ungültige Anfrage: id und active fehlen." },
        { status: 400 }
      );
    }

    const { error } = await serverClient().auth.admin.updateUserById(body.id, {
      // "none" hebt eine bestehende Sperre auf.
      // 876000 Stunden entsprechen ungefähr 100 Jahren.
      ban_duration: body.active ? "none" : "876000h",
    });

    if (error) {
      console.error("Admin user toggle failed", { code: error.code ?? "toggle_user_failed" });
      return NextResponse.json({ error: "Der Nutzerstatus konnte nicht geändert werden." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      active: body.active,
    });
  } catch {
    return NextResponse.json({ error: "Die Anfrage konnte nicht verarbeitet werden." }, { status: 500 });
  }
}
