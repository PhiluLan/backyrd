import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BASEL_DECISION_LOCATIONS, SEMANTIC_CONTRACT_VERSION } from "@backyrd/canonical-semantics";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";

export const dynamic = "force-dynamic";

type RuntimeConfig = {
  version: string;
  cityKey: string;
  defaultNearRadiusM: number;
  status: "ACTIVE" | "DISABLED";
  updatedAt: string;
  updatedBy: string | null;
  replayed?: boolean;
  previousNearRadiusM?: number;
};

type AuditRow = {
  id: number;
  request_id: string;
  actor_id: string | null;
  action: string;
  previous_near_radius_m: number | null;
  next_near_radius_m: number;
  reason: string;
  created_at: string;
};

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("reference_location_server_not_configured");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function operationsPayload(client: ReturnType<typeof serverClient>) {
  const [configResult, auditResult] = await Promise.all([
    client.rpc("backyrd_decision_location_runtime_config_v1", { p_city_key: "basel" }),
    client.from("backyrd_decision_location_config_audit_v1")
      .select("id,request_id,actor_id,action,previous_near_radius_m,next_near_radius_m,reason,created_at")
      .eq("city_key", "basel").order("created_at", { ascending: false }).limit(20),
  ]);
  if (configResult.error || !configResult.data) throw new Error("reference_location_config_unavailable");
  if (auditResult.error) throw new Error("reference_location_audit_unavailable");

  const references = Object.entries(BASEL_DECISION_LOCATIONS).map(([key, row]) => ({
    key,
    name: row.label,
    type: row.kind,
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    source: "CANONICAL_BASEL_REFERENCE",
    persistence: "VERSIONED_CODE_REGISTRY",
    status: "ACTIVE",
    aliases: [...row.aliases],
    semanticContractVersion: SEMANTIC_CONTRACT_VERSION,
  }));

  return {
    references,
    persistedReferenceLocationCount: 0,
    knownReferenceLocationCount: references.length,
    dynamicResolution: {
      enabled: true,
      provider: "Google Places Text Search (Places API New)",
      mode: "SERVER_SIDE_REQUEST_TIME",
      persistence: "NOT_PERSISTED",
      baselBiasRadiusM: 15000,
      exactOrUniquePrefixRequired: true,
      unresolvedBehavior: "FAIL_CLOSED",
    },
    disambiguation: {
      inputs: ["Bahnhof", "Hauptbahnhof", "Basel Bahnhof"],
      result: "Basel SBB",
      source: "CITY_REFERENCE_ALIASES / packages/decision-input-runtime/src/location-reference.mjs",
    },
    config: configResult.data as RuntimeConfig,
    limits: { minimumNearRadiusM: 100, maximumNearRadiusM: 2000 },
    audit: (auditResult.data ?? []) as AuditRow[],
  };
}

function authorizationError(status: 401 | 403 | 500) {
  return NextResponse.json({ error: status === 403 ? "Admin-Berechtigung erforderlich." : "Die Admin-Sitzung ist nicht gültig." }, { status });
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorizationError(authorization.status);
  try {
    return NextResponse.json(await operationsPayload(serverClient()), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Reference Location operations read failed", { code: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Referenzort-Konfiguration ist momentan nicht verfügbar." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorizationError(authorization.status);

  let body: { radiusM?: unknown; reason?: unknown; requestId?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "Die Änderung ist unvollständig." }, { status: 400 }); }

  const radiusM = Number(body.radiusM);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!Number.isInteger(radiusM) || radiusM < 100 || radiusM > 2000) {
    return NextResponse.json({ error: "Der Standardradius muss zwischen 100 und 2’000 Metern liegen." }, { status: 400 });
  }
  if (reason.length < 8 || reason.length > 500) {
    return NextResponse.json({ error: "Bitte dokumentiere den Grund mit 8 bis 500 Zeichen." }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "Die Änderungsidentität ist ungültig." }, { status: 400 });
  }

  try {
    const client = serverClient();
    const { data, error } = await client.rpc("backyrd_admin_set_decision_near_radius_v1", {
      p_actor_id: authorization.userId,
      p_city_key: "basel",
      p_radius_m: radiusM,
      p_reason: reason,
      p_request_id: requestId,
    });
    if (error || !data) throw new Error(error?.message ?? "reference_location_update_failed");
    return NextResponse.json(await operationsPayload(client), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Reference Location operations update failed", { code: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Der Radius wurde nicht geändert. Bitte Berechtigung und Konfiguration prüfen." }, { status: 409 });
  }
}
