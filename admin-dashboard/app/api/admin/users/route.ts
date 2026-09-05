import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("admin_server_not_configured");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: "Admin-Berechtigung erforderlich." }, { status: authorization.status });
  }
  const { data, error } = await serverClient().auth.admin.listUsers();
  if (error) {
    console.error("Admin user list failed", { code: error.code ?? "list_users_failed" });
    return NextResponse.json({ error: "Die Nutzerliste ist momentan nicht verfügbar." }, { status: 500 });
  }
  return NextResponse.json(data.users);
}
