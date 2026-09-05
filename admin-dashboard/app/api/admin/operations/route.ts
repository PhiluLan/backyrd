import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";

export const dynamic = "force-dynamic";

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("operations_server_not_configured");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: "Admin-Berechtigung erforderlich." }, { status: authorization.status });
  }
  try {
    const { data, error } = await serverClient().rpc("backyrd_launch_operations_snapshot_v1");
    if (error || !data) throw new Error(error?.code ?? "operations_snapshot_unavailable");
    return NextResponse.json({
      ...data,
      recovery: {
        databaseDailyBackup: "VERIFIED_PROVIDER_DAILY_7_DAYS",
        pointInTimeRecovery: "NOT_ENABLED",
        storageObjectBackup: "VERIFIED_AWS_DAILY_AND_WEEKLY",
      },
      runbook: "/founder/operations#runbook",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Launch operations snapshot failed", { code: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Der Betriebszustand ist momentan nicht verfügbar." }, { status: 503 });
  }
}
