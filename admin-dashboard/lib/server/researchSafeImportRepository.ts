import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorldResearchBatchDocument } from "@backyrd/world-knowledge-core";
import { readWorldResearchDetail } from "./worldResearchExport";
import {
  type PipelineJob,
  type PipelineMetadata,
  type SafeImportRepository,
} from "./researchSafeImport";
const table = "world_research_automation_jobs_v1";
const kind = "CODEX_RESEARCH_PIPELINE";
type Row = {
  id: string;
  actor_id: string;
  spot_id: string;
  export_document: WorldResearchBatchDocument & {
    kind: string;
    pipeline: PipelineMetadata;
  };
  result_document: WorldResearchBatchDocument;
};
function decode(row: Row): PipelineJob {
  const m = row.export_document?.pipeline;
  if (
    row.export_document?.kind !== kind ||
    !m ||
    !Array.isArray(m.accepted) ||
    m.accepted.length > 80 ||
    !Array.isArray(m.decisions) ||
    m.decisions.length > 80 ||
    !["RECEIVED", "PROVED", "FINISHED"].includes(m.phase)
  )
    throw new Error("research_pipeline_stored_job_invalid");
  return {
    id: row.id,
    actorId: row.actor_id,
    spotId: row.spot_id,
    document: row.result_document,
    metadata: m,
  };
}
export function safeImportRepository(
  actor: SupabaseClient,
  service: SupabaseClient,
  actorId: string,
): SafeImportRepository {
  const bound = (id: string) =>
    service
      .from(table)
      .select("id,actor_id,spot_id,export_document,result_document")
      .eq("id", id)
      .eq("actor_id", actorId)
      .maybeSingle();
  const update = async (
    job: PipelineJob,
    lease: string,
    values: Record<string, unknown>,
  ) => {
    const result = await service
      .from(table)
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("actor_id", actorId)
      .eq("lease_token", lease)
      .eq("status", "READY_FOR_REVIEW")
      .is("reviewed_at", null)
      .select("id")
      .maybeSingle();
    if (result.error || !result.data)
      throw new Error("research_pipeline_lease_lost");
  };
  return {
    readSpot: (id) => readWorldResearchDetail(actor, id),
    async createOrRead(job) {
      const existing = await bound(job.id);
      if (existing.error)
        throw new Error("research_pipeline_queue_unavailable");
      if (existing.data) return decode(existing.data as Row);
      const inserted = await service
        .from(table)
        .insert({
          id: job.id,
          actor_id: actorId,
          spot_id: job.spotId,
          spot_name: job.document.batch.spots[0].name,
          status: "READY_FOR_REVIEW",
          export_document: { ...job.document, kind, pipeline: job.metadata },
          result_document: job.document,
          completed_at: new Date().toISOString(),
        })
        .select("id,actor_id,spot_id,export_document,result_document")
        .single();
      if (!inserted.error && inserted.data) return decode(inserted.data as Row);
      const raced = await bound(job.id);
      if (raced.error || !raced.data)
        throw new Error("research_pipeline_job_creation_failed");
      return decode(raced.data as Row);
    },
    async acquire(id, lease) {
      const now = new Date().toISOString();
      const result = await service
        .from(table)
        .update({
          lease_token: lease,
          lease_expires_at: new Date(Date.now() + 120000).toISOString(),
          updated_at: now,
        })
        .eq("id", id)
        .eq("actor_id", actorId)
        .eq("status", "READY_FOR_REVIEW")
        .is("reviewed_at", null)
        .or(`lease_token.is.null,lease_expires_at.lt.${now}`)
        .select("id")
        .maybeSingle();
      if (result.error) throw new Error("research_pipeline_lease_unavailable");
      return !!result.data;
    },
    async checkpoint(job, lease) {
      await update(job, lease, {
        export_document: { ...job.document, kind, pipeline: job.metadata },
        lease_expires_at: new Date(Date.now() + 120000).toISOString(),
      });
    },
    async importClaims(spotId, batchId, manifestHash, claims) {
      const result = await actor.rpc(
        "world_product_admin_import_research_spot_v2",
        {
          p_batch_id: batchId,
          p_spot_id: spotId,
          p_expected_manifest_hash: manifestHash,
          p_claims: claims,
        },
      );
      if (result.error) throw new Error("CANONICAL_IMPORT_REJECTED");
    },
    async rebuild(spotId, key) {
      const result = await service.rpc("world_product_rebuild_spot_v1", {
        p_actor_user_id: actorId,
        p_spot_id: spotId,
        p_as_of: new Date().toISOString(),
        p_idempotency_key: key,
      });
      if (result.error || !result.data?.manifestHash)
        throw new Error("PROFILE_REBUILD_FAILED");
      return result.data as { manifestHash: string; worldSnapshot?: unknown };
    },
    async finish(job, lease, document) {
      await update(job, lease, {
        export_document: { ...document, kind, pipeline: job.metadata },
        result_document: document,
        lease_token: null,
        lease_expires_at: null,
      });
    },
  };
}
