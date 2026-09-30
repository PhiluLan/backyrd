import { isDeepStrictEqual } from "node:util";

export type ReviewableJob = {
  id: string;
  spot_id: string;
  actor_id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  export_document?: unknown;
  result_document?: unknown;
};

type ResearchDocument = {
  batch: { spots: Array<{ spotId: string }> };
  research: { spots: unknown[] };
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function matchesAutomatedReviewJob(job: ReviewableJob, document: ResearchDocument, actorId: string): boolean {
  const exported = object(job.export_document);
  const batch = object(exported?.batch);
  const original = object(job.result_document);
  const originalBatch = object(original?.batch);
  const originalResearch = object(original?.research);
  return job.actor_id === actorId && job.status === "READY_FOR_REVIEW"
    && document.batch.spots.length === 1 && document.batch.spots[0].spotId === job.spot_id
    && Array.isArray(originalResearch?.spots)
    && typeof batch?.batchId === "string" && batch.batchId === originalBatch?.batchId
    && isDeepStrictEqual(originalResearch.spots, document.research.spots);
}

export function reviewCanFinish(report: {
  ready: string[]; conflicts: string[]; blocked: string[]; invalid: string[];
  imported: string[]; manifestHash?: string;
}): boolean {
  return report.ready.length === 0 && report.conflicts.length === 0
    && report.blocked.length === 0 && report.invalid.length === 0
    && (report.imported.length === 0 || !!report.manifestHash);
}

export function visibleResearchJobs<T extends Pick<ReviewableJob, "spot_id" | "created_at" | "reviewed_at">>(jobs: T[]): T[] {
  const latestReviewed = new Map<string, number>();
  for (const job of jobs) {
    if (!job.reviewed_at) continue;
    const created = Date.parse(job.created_at);
    latestReviewed.set(job.spot_id, Math.max(latestReviewed.get(job.spot_id) ?? 0, created));
  }
  return jobs.filter((job) => !job.reviewed_at && Date.parse(job.created_at) > (latestReviewed.get(job.spot_id) ?? 0));
}
