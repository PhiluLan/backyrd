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

export async function POST(req: Request) {
  const authorization = await authorizeAdminRequest(req);
  if (!authorization.ok) return NextResponse.json({ error: "Admin-Berechtigung erforderlich." }, { status: authorization.status });
  const { id } = await req.json();
  if (typeof id !== "string" || !uuidPattern.test(id)) return NextResponse.json({ error: "Ungültige Nutzer-ID." }, { status: 400 });

  const { error } = await serverClient().auth.admin.deleteUser(id);
  if (error) {
    console.error("Admin user delete failed", { code: error.code ?? "delete_user_failed" });
    return NextResponse.json({ error: "Der Nutzer konnte nicht gelöscht werden." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
