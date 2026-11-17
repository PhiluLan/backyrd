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

  // The approved catalog already has a public name. Use it to initialize the
  // World Knowledge profile while preserving any earlier authored identity.
  const identity = detail.answers?.["identity.name"];
  const preparationError = `WORLD_RESEARCH_PROFILE_PREPARATION: ${detail.name}: Das World-Knowledge-Profil konnte nicht für die Recherche vorbereitet werden. Prüfe den Namen unter «Profil & Angebote» und versuche es erneut.`;
  if (identity && (identity.visibility !== "PUBLIC" || identity.knowledgeState !== "KNOWN_VALUE")) {
    throw new Error(preparationError);
  }
  const { data: spot, error: spotError } = await actor.from("spots")
    .select("name,city,updated_at").eq("id", spotId).eq("status", "approved").single();
  if (spotError || !spot || spot.name !== detail.name) {
    throw new Error(`WORLD_RESEARCH_PROFILE_PREPARATION: ${detail.name}: Das freigegebene Profil konnte nicht bestätigt werden. Bitte erneut versuchen.`);
  }

  const prepared = identity
    ? await service.rpc("world_product_rebuild_spot_v1", {
      p_actor_user_id: actorId,
      p_spot_id: spotId,
      p_as_of: new Date().toISOString(),
      p_idempotency_key: `research-profile-rebuild:${crypto.randomUUID()}`,
    })
    : await actor.rpc("world_product_save_and_publish_claim_v1", {
      p_spot_id: spotId,
      p_attribute_key: "identity.name",
      p_knowledge_state: "KNOWN_VALUE",
      p_value: spot.name.trim(),
      p_observed_at: spot.updated_at,
      p_visibility: "PUBLIC",
      p_idempotency_key: `research-profile-name:${spotId}:${spot.updated_at}`,
    });
  const current = await readWorldResearchDetail(actor, spotId).catch(() => null);
  const currentName = current?.answers?.["identity.name"];
  if (!current || currentName?.visibility !== "PUBLIC" || currentName.knowledgeState !== "KNOWN_VALUE") {
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
