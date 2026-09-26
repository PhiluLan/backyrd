import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createWorldResearchBatch, parseWorldResearchBatch, planWorldResearchSpot, type WorldResearchClaim, type ReviewedResearchClaim, type ResearchReview, type WorldResearchExistingValue } from "@backyrd/world-knowledge-core";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { locationBinding, validateBrowserLocations, signLocation, verifyLocation } from "@/lib/server/researchLocation.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };
type Detail = {
  spotId: string; name: string; status: string;
  actor?: { role?: string };
  answers?: Record<string, { claimId?: string; knowledgeState?: string; value?: unknown; visibility?: string }>;
  manifest?: null | { manifestHash?: string; worldSnapshot?: { spotId?: string } };
};
type Accepted = { spotId: string; manifestHash: string; claim: ReviewedResearchClaim };
type LocationCandidate = { placeId: string; name: string; address: string; latitude: number; longitude: number; token: string; exact: boolean };
type SpotReport = { spotId: string; name: string; ready: string[]; imported: string[]; skipped: string[]; conflicts: string[]; invalid: string[]; unresolved: string[]; reviews: ResearchReview[]; blocked: string[]; derived: string[]; manifestHash?: string; location?: { message: string; candidates: LocationCandidate[]; automatic: string | null; query?: string } };

const message = (cause: unknown) => cause instanceof Error ? cause.message : "world_research_action_failed";

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers: noStore });
  if (Number(request.headers.get("content-length") ?? 0) > 2_000_000) return Response.json({ error: "world_research_payload_too_large" }, { status: 413, headers: noStore });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "WORLD_SERVICE_UNAVAILABLE" }, { status: 503, headers: noStore });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actor = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const readDetail = async (spotId: string): Promise<Detail> => {
    const result = await actor.rpc("world_product_authoring_detail_v1", { p_spot_id: spotId });
    if (result.error || !result.data) throw new Error(result.error?.message ?? "world_research_spot_unavailable");
    const detail = result.data as Detail;
    if (detail.spotId !== spotId || detail.status !== "approved" || detail.actor?.role !== "ADMIN" || !detail.answers || !detail.manifest?.manifestHash) throw new Error("world_research_spot_binding_invalid");
    return detail;
  };
  const body = await request.json().catch(() => null) as null | { action?: string; spotIds?: unknown; document?: unknown; locations?: Record<string, string>; browserPlaces?: Record<string, unknown>; confirmations?: Record<string, Record<string, string>> };

  try {
    if (body?.action === "export") {
      const spotIds = Array.isArray(body.spotIds) ? body.spotIds.filter((value): value is string => typeof value === "string") : [];
      if (spotIds.length < 1 || spotIds.length > 10 || new Set(spotIds).size !== spotIds.length || spotIds.some((id) => !UUID.test(id))) throw new Error("world_research_export_selection_invalid");
      const details = await Promise.all(spotIds.map(readDetail));
      const document = createWorldResearchBatch({
        batchId: crypto.randomUUID(), createdAt: new Date().toISOString(),
        spots: details.map((detail) => ({
          spotId: detail.spotId, name: detail.name,
          locality: typeof detail.answers?.["location.locality"]?.value === "string" ? detail.answers["location.locality"].value as string : null,
          manifestHash: detail.manifest!.manifestHash!,
          // External research receives only product-public World values. Admin-
          // internal claims and every user datum stay outside the export.
          existingValues: Object.fromEntries(Object.entries(detail.answers ?? {}).filter((entry): entry is [string, { claimId: string; knowledgeState: string; value: unknown; visibility: string }] => entry[1].visibility === "PUBLIC" && typeof entry[1].claimId === "string" && typeof entry[1].knowledgeState === "string").map(([key, value]) => [key, { claimId: value.claimId, knowledgeState: value.knowledgeState, value: value.value }])),
        })),
      });
      return Response.json(document, { headers: noStore });
    }

    if (body?.action !== "preview" && body?.action !== "commit") throw new Error("world_research_action_invalid");
    const document = parseWorldResearchBatch(body.document);
    const reports = new Map<string, SpotReport>();
    const accepted: Accepted[] = [];
    for (const exported of document.batch.spots) {
      const report: SpotReport = { spotId: exported.spotId, name: exported.name, ready: [], imported: [], skipped: [], conflicts: [], invalid: [], reviews: [], blocked: [], derived: [], unresolved: (document.research.spots.find((spot) => spot.spotId === exported.spotId)?.unresolved ?? []).map((gap) => gap.attributeKey) };
      reports.set(exported.spotId, report);
      let detail: Detail;
      try { detail = await readDetail(exported.spotId); }
      catch (cause) { report.invalid.push(message(cause)); continue; }
      if (detail.name !== exported.name || detail.manifest?.manifestHash !== exported.manifestHash) { report.conflicts.push("EXPORT_OR_MANIFEST_DRIFT"); continue; }
      const current = Object.fromEntries(Object.entries(detail.answers ?? {}).filter((entry): entry is [string, WorldResearchExistingValue] => typeof entry[1].claimId === "string" && typeof entry[1].knowledgeState === "string"));
      const plan = planWorldResearchSpot({ claims: document.validatedClaims.get(exported.spotId) ?? [], current, confirmations: body.confirmations?.[exported.spotId] ?? {}, observedAt: document.batch.createdAt });
      report.skipped = plan.skipped; report.reviews = plan.reviews; report.blocked = plan.blocked; report.derived = plan.derived;
      report.conflicts = plan.reviews.map((review) => review.attributeKey);
      for (const claim of plan.accepted) {
        accepted.push({ spotId: exported.spotId, manifestHash: exported.manifestHash, claim });
        report.ready.push(claim.attributeKey);
        report.unresolved = report.unresolved.filter((key) => key !== claim.attributeKey);
      }
      const addressClaim = document.validatedClaims.get(exported.spotId)?.find((claim) => claim.attributeKey === "location.address_line1");
      // Only the address that can actually be accepted is eligible for lookup.
      if (addressClaim && !report.conflicts.includes("location.address_line1")) {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const expectedValue = (key: string) => detail.answers?.[key]?.value ?? document.validatedClaims.get(exported.spotId)?.find((claim) => claim.attributeKey === key)?.value;
        const binding = locationBinding(body.document, exported.spotId, authorization.userId);
        if (body.action === "preview") {
          try {
            if (["location.latitude", "location.longitude"].some((key) => detail.answers?.[key] || document.validatedClaims.get(exported.spotId)?.some((claim) => claim.attributeKey === key))) throw new Error("Koordinaten sind bereits vorhanden oder Teil der Recherche. Keine automatische Ersetzung; Änderungen bitte im Spot-Editor prüfen.");
            if (!serviceKey) throw new Error("Standortabgleich ist noch nicht konfiguriert.");
            const query = [detail.name, addressClaim.value, expectedValue("location.locality"), expectedValue("location.country_code")].filter((value) => typeof value === "string" && value.trim()).join(", ");
            if (query.length > 160) throw new Error("Spot-Adresse ist für den Standortabgleich zu lang. Bitte im Spot-Editor prüfen.");
            if (!body.browserPlaces || !(exported.spotId in body.browserPlaces)) {
              report.location = { message: "Google-Standortsuche über die vorhandene Admin-Anbindung …", candidates: [], automatic: null, query };
              continue;
            }
            const browserPlaces = body.browserPlaces[exported.spotId];
            if (browserPlaces === null) throw new Error("Die Google-Suche im Browser ist nicht verfügbar. Bitte erneut prüfen; Koordinaten bleiben unverändert.");
            const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
            const stored = await service.from("spots").select("google_place_id").eq("id", exported.spotId).single();
            if (stored.error) throw new Error("Bestehende Google-Zuordnung konnte nicht geprüft werden.");
            const found = validateBrowserLocations(browserPlaces, stored.data.google_place_id);
            report.location = { message: found.candidates.length ? "Google-Vorschlag aus der Browser-Suche. Bitte Name, Adresse und Position prüfen. Mit der Auswahl bestätigst du diese Angaben als Admin; sie wurden nicht unabhängig serverseitig bei Google verifiziert." : "Kein passender Treffer zur bestehenden Google-Zuordnung gefunden. Koordinaten bleiben unverändert.",
              automatic: found.automatic, candidates: found.candidates.map((candidate) => ({ ...candidate, token: signLocation(candidate, binding, serviceKey) })) };
          } catch (cause) { report.location = { message: message(cause), candidates: [], automatic: null }; }
        } else if (body.locations?.[exported.spotId]) {
          if (!serviceKey) throw new Error("Standortbestätigung kann nicht verifiziert werden.");
          const candidate = verifyLocation(body.locations[exported.spotId], binding, serviceKey) as LocationCandidate & { sourceUrl: string; observedAt: string };
          const coordinateClaims: WorldResearchClaim[] = ["latitude", "longitude"].map((axis) => ({
            attributeKey: `location.${axis}`, knowledgeState: "KNOWN_VALUE", value: axis === "latitude" ? candidate.latitude : candidate.longitude,
            source: { url: candidate.sourceUrl, evidence: `Admin-bestätigter Standort aus Google-Browser-Suche; Place-ID ${candidate.placeId}; keine unabhängige serverseitige Provider-Verifikation`, observedAt: candidate.observedAt, trust: "AUTHORITATIVE_PRIMARY" },
          }));
          // Preserve all existing/researched coordinates. Never mix two different pairs.
          const occupied = coordinateClaims.some((claim) => detail.answers?.[claim.attributeKey] || document.validatedClaims.get(exported.spotId)?.some((item) => item.attributeKey === claim.attributeKey));
          if (occupied) report.conflicts.push("GOOGLE_COORDINATES_EXISTING_VALUES");
          else for (const claim of coordinateClaims) {
            accepted.push({ spotId: exported.spotId, manifestHash: exported.manifestHash, claim: { ...claim, supersedesClaimId: null } });
            report.ready.push(claim.attributeKey);
            report.unresolved = report.unresolved.filter((key) => key !== claim.attributeKey);
          }
        }
      }
    }

    if (body.action === "commit") {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) return Response.json({ error: "world_research_rebuild_not_configured" }, { status: 503, headers: noStore });
      const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const changed = new Set<string>();
      for (const exported of document.batch.spots) {
        const items = accepted.filter((item) => item.spotId === exported.spotId);
        const report = reports.get(exported.spotId)!;
        if (!items.length || report.invalid.length) continue;
        const result = await actor.rpc("world_product_admin_import_research_spot_v2", {
          p_batch_id: document.batch.batchId, p_spot_id: exported.spotId,
          p_expected_manifest_hash: exported.manifestHash, p_claims: items.map((item) => item.claim),
        });
        if (result.error) { report.invalid.push(`SPOT_BATCH_ROLLED_BACK:${result.error.message}`); continue; }
        report.imported.push(...items.map((item) => item.claim.attributeKey)); report.ready = []; changed.add(exported.spotId);
      }
      // A retry after claims committed but before rebuilding must still finish
      // the canonical projection. Same-value skips are therefore rebuild-safe.
      for (const exported of document.batch.spots) {
        const report = reports.get(exported.spotId)!;
        if ((document.validatedClaims.get(exported.spotId)?.length ?? 0) > 0 && report.conflicts.length === 0 && report.invalid.length === 0) changed.add(exported.spotId);
      }
      for (const spotId of changed) {
        const report = reports.get(spotId)!;
        const rebuilt = await service.rpc("world_product_rebuild_spot_v1", { p_actor_user_id: authorization.userId, p_spot_id: spotId, p_as_of: new Date().toISOString(), p_idempotency_key: `research:${document.batch.batchId}:${spotId}:rebuild` });
        if (rebuilt.error) { report.invalid.push(`REBUILD:${rebuilt.error.message}`); continue; }
        const verified = await readDetail(spotId);
        const manifestHash = verified.manifest?.manifestHash;
        if (!manifestHash || verified.manifest?.worldSnapshot?.spotId !== spotId || manifestHash !== (rebuilt.data as { manifestHash?: string } | null)?.manifestHash) report.invalid.push("READER_REBUILD_VERIFICATION_FAILED");
        else report.manifestHash = manifestHash;
      }
    }

    const perSpot = [...reports.values()];
    return Response.json({
      contractVersion: body.action === "commit" ? "backyrd.world-research-import-report@1.0" : "backyrd.world-research-preview@1.0",
      batchId: document.batch.batchId, mode: body.action === "commit" ? "COMMIT" : "PREVIEW",
      totals: {
        imported: perSpot.reduce((sum, item) => sum + item.imported.length, 0),
        ready: perSpot.reduce((sum, item) => sum + item.ready.length, 0),
        blocked: perSpot.reduce((sum, item) => sum + item.blocked.length, 0),
        skipped: perSpot.reduce((sum, item) => sum + item.skipped.length, 0),
        conflicts: perSpot.reduce((sum, item) => sum + item.conflicts.length, 0),
        invalid: perSpot.reduce((sum, item) => sum + item.invalid.length, 0),
        unresolved: perSpot.reduce((sum, item) => sum + item.unresolved.length, 0),
      }, perSpot,
    }, { headers: noStore });
  } catch (cause) {
    return Response.json({ error: message(cause) }, { status: 400, headers: noStore });
  }
}
