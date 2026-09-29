import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createWorldResearchBatch, type WorldResearchBatchDocument } from "@backyrd/world-knowledge-core";

export const WORLD_RESEARCH_SPOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorldResearchDetail = {
  spotId: string; name: string; status: string;
  actor?: { role?: string };
  answers?: Record<string, { claimId?: string; knowledgeState?: string; value?: unknown; visibility?: string }>;
  manifest?: null | { manifestHash?: string; worldSnapshot?: { spotId?: string } };
};

export async function readWorldResearchDetail(actor: SupabaseClient, spotId: string): Promise<WorldResearchDetail> {
  const result = await actor.rpc("world_product_authoring_detail_v1", { p_spot_id: spotId });
  if (result.error || !result.data) throw new Error(result.error?.message ?? "world_research_spot_unavailable");
  const detail = result.data as WorldResearchDetail;
  if (detail.spotId !== spotId || detail.status !== "approved" || detail.actor?.role !== "ADMIN" || !detail.answers || !detail.manifest?.manifestHash) {
    throw new Error("world_research_spot_binding_invalid");
  }
  return detail;
}

export async function createAdminWorldResearchExport(actor: SupabaseClient, spotIds: string[]): Promise<WorldResearchBatchDocument> {
  if (spotIds.length < 1 || spotIds.length > 10 || new Set(spotIds).size !== spotIds.length || spotIds.some((id) => !WORLD_RESEARCH_SPOT_ID.test(id))) {
    throw new Error("world_research_export_selection_invalid");
  }
  const details = await Promise.all(spotIds.map((spotId) => readWorldResearchDetail(actor, spotId)));
  return createWorldResearchBatch({
    batchId: crypto.randomUUID(), createdAt: new Date().toISOString(),
    spots: details.map((detail) => ({
      spotId: detail.spotId, name: detail.name,
      locality: typeof detail.answers?.["location.locality"]?.value === "string" ? detail.answers["location.locality"].value as string : null,
      manifestHash: detail.manifest!.manifestHash!,
      // Only product-public World values leave the authoring boundary.
      existingValues: Object.fromEntries(Object.entries(detail.answers ?? {})
        .filter((entry): entry is [string, { claimId: string; knowledgeState: string; value: unknown; visibility: string }] =>
          entry[1].visibility === "PUBLIC" && typeof entry[1].claimId === "string" && typeof entry[1].knowledgeState === "string")
        .map(([key, value]) => [key, { claimId: value.claimId, knowledgeState: value.knowledgeState, value: value.value }])),
    })),
  });
}
