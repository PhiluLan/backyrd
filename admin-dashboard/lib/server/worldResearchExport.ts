import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createWorldResearchBatch, type WorldResearchBatchDocument } from "@backyrd/world-knowledge-core";

export const WORLD_RESEARCH_SPOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorldResearchDetail = {
  spotId: string; name: string; status: string;
  actor?: { role?: string; allowedAttributeKeys?: string[] };
  answers?: Record<string, { claimId?: string; knowledgeState?: string; value?: unknown; visibility?: string; validUntil?: string | null }>;
  manifest?: null | { manifestHash?: string; worldSnapshot?: { spotId?: string } };
};

async function readApprovedResearchProfile(actor: SupabaseClient, spotId: string): Promise<WorldResearchDetail> {
  const result = await actor.rpc("world_product_authoring_detail_v1", { p_spot_id: spotId });
  if (result.error || !result.data) throw new Error(result.error?.message ?? "world_research_spot_unavailable");
  const detail = result.data as WorldResearchDetail;
  if (detail.spotId !== spotId || detail.status !== "approved" || detail.actor?.role !== "ADMIN" || !detail.answers) {
    throw new Error("world_research_spot_binding_invalid");
  }
  return detail;
}

export async function readWorldResearchDetail(actor: SupabaseClient, spotId: string): Promise<WorldResearchDetail> {
  const detail = await readApprovedResearchProfile(actor, spotId);
  if (!detail.manifest?.manifestHash) throw new Error("world_research_spot_binding_invalid");
  return detail;
}

export async function createAdminWorldResearchExport(actor: SupabaseClient, spotIds: string[]): Promise<WorldResearchBatchDocument> {
  if (spotIds.length < 1 || spotIds.length > 10 || new Set(spotIds).size !== spotIds.length || spotIds.some((id) => !WORLD_RESEARCH_SPOT_ID.test(id))) {
    throw new Error("world_research_export_selection_invalid");
  }
  const details = await Promise.all(spotIds.map((spotId) => readWorldResearchDetail(actor, spotId)));
  return buildResearchExport(details);
}

export async function createAutomaticWorldResearchExport(
  actor: SupabaseClient,
  service: SupabaseClient,
  actorId: string,
  spotId: string,
): Promise<WorldResearchBatchDocument> {
  const detail = await readApprovedResearchProfile(actor, spotId);
  if (detail.manifest?.manifestHash) return buildResearchExport([detail]);

  const preparationError = `WORLD_RESEARCH_PROFILE_PREPARATION: ${detail.name}: Das World-Knowledge-Profil konnte nicht für die Recherche vorbereitet werden. Prüfe die Basisangaben unter «Profil & Angebote» und versuche es erneut.`;
  const { data: spot, error: spotError } = await actor.from("spots")
    .select("name,address,city,lat,lng,updated_at").eq("id", spotId).eq("status", "approved").single();
  if (spotError || !spot || spot.name !== detail.name) throw new Error(preparationError);

  // Switching to the canonical profile also switches the public opening-hours
  // reader. Preserve legacy hours until a public canonical schedule is available.
  const hours = detail.answers?.["hours.regular"];
  if (hours?.visibility !== "PUBLIC" || hours.knowledgeState !== "KNOWN_VALUE") {
    const legacyHours = await actor.from("spot_hours").select("id").eq("spot_id", spotId).limit(1);
    if (legacyHours.error) throw new Error(preparationError);
    if (legacyHours.data?.length) {
      throw new Error(`WORLD_RESEARCH_PROFILE_PREPARATION: ${detail.name}: Übernimm zuerst die bestehenden Öffnungszeiten unter «Profil & Angebote». Danach kannst du die Recherche starten.`);
    }
  }

  // Stage the already-public catalog values before publishing once. An existing
  // private, disputed or differently authored value requires an Admin decision.
  const baseline = {
    "identity.name": spot.name.trim(),
    "location.address_line1": spot.address?.trim() || null,
    "location.locality": spot.city?.trim() || null,
    "location.latitude": spot.lat,
    "location.longitude": spot.lng,
  };
  for (const [key, value] of Object.entries(baseline)) {
    const existing = detail.answers?.[key];
    if (value === null) continue;
    if (existing) {
      if (existing.visibility !== "PUBLIC" || existing.knowledgeState !== "KNOWN_VALUE" || existing.value !== value) {
        throw new Error(preparationError);
      }
      continue;
    }
    const submitted = await actor.rpc("world_product_admin_submit_claim_v1", {
      p_spot_id: spotId,
      p_attribute_key: key,
      p_knowledge_state: "KNOWN_VALUE",
      p_value: value,
      p_observed_at: spot.updated_at,
      p_visibility: "PUBLIC",
      p_idempotency_key: `research-profile:${spotId}:${key}:${spot.updated_at}`,
    });
    if (submitted.error) {
      console.error("Research profile baseline failed", { spotId, key, code: submitted.error.code });
      throw new Error(preparationError);
    }
  }

  const prepared = await service.rpc("world_product_rebuild_spot_v1", {
    p_actor_user_id: actorId,
    p_spot_id: spotId,
    p_as_of: new Date().toISOString(),
    p_idempotency_key: `research-profile-rebuild:${crypto.randomUUID()}`,
  });
  const current = await readWorldResearchDetail(actor, spotId).catch(() => null);
  if (!current || !Object.entries(baseline).every(([key, value]) => {
    const answer = current.answers?.[key];
    return value === null || (answer?.visibility === "PUBLIC" && answer.knowledgeState === "KNOWN_VALUE" && answer.value === value);
  })) {
    if (prepared.error) console.error("Research profile initialization failed", { spotId, code: prepared.error.code });
    throw new Error(preparationError);
  }
  return buildResearchExport([current], spot.city ?? null);
}

function buildResearchExport(details: WorldResearchDetail[], approvedLocality: string | null = null): WorldResearchBatchDocument {
  return createWorldResearchBatch({
    batchId: crypto.randomUUID(), createdAt: new Date().toISOString(),
    spots: details.map((detail) => {
      const locality = detail.answers?.["location.locality"];
      return {
        spotId: detail.spotId, name: detail.name,
        locality: locality?.visibility === "PUBLIC" && typeof locality.value === "string" ? locality.value : approvedLocality,
        manifestHash: detail.manifest!.manifestHash!,
        // Only product-public World values leave the authoring boundary.
        existingValues: Object.fromEntries(Object.entries(detail.answers ?? {})
          .filter((entry): entry is [string, { claimId: string; knowledgeState: string; value: unknown; visibility: string }] =>
            entry[1].visibility === "PUBLIC" && typeof entry[1].claimId === "string" && typeof entry[1].knowledgeState === "string")
          .map(([key, value]) => [key, { claimId: value.claimId, knowledgeState: value.knowledgeState, value: value.value }])),
      };
    }),
  });
}
