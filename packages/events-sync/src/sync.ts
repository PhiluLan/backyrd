import type {
  EventSourceAdapter,
  SyncMetrics,
  SyncMode,
} from "./contracts.js";
import { EventsRepository } from "./repository.js";

export async function runEventsSync(input: {
  adapter: EventSourceAdapter;
  repository: EventsRepository;
  mode: SyncMode;
  from: string;
  to: string;
  modifiedSince?: string;
  now?: () => Date;
}): Promise<SyncMetrics> {
  const now = input.now ?? (() => new Date());
  const run = await input.repository.startRun({
    sourceId: input.adapter.sourceId,
    mode: input.mode,
    from: input.from,
    to: input.to,
  });

  try {
    const records = await input.adapter.fetch({
      from: input.from,
      to: input.to,
      ...(input.modifiedSince ? { modifiedSince: input.modifiedSince } : {}),
    });
    const spots = await input.repository.loadSpotCandidates();
    const eventIds = new Set<string>();
    const occurrenceIds = new Set<string>();
    const matchedVenueIds = new Set<string>();
    const unmatchedVenueIds = new Set<string>();
    const freeEventIds = new Set<string>();
    let duplicatesMerged = 0;
    let sourceWatermark: string | null = null;

    for (const record of records) {
      const seenAt = now().toISOString();
      const { result, venueMatch } = await input.repository.ingest(
        record,
        run.id,
        seenAt,
        spots,
      );
      eventIds.add(result.canonical_event_id);
      occurrenceIds.add(result.canonical_occurrence_id);
      if (result.duplicate_merged) duplicatesMerged += 1;
      if (record.isFree === true) freeEventIds.add(result.canonical_event_id);
      if (record.venue) {
        if (venueMatch.spotId) matchedVenueIds.add(record.venue.sourceVenueId);
        else unmatchedVenueIds.add(record.venue.sourceVenueId);
      }
      if (!sourceWatermark || record.sourceModifiedAt > sourceWatermark) {
        sourceWatermark = record.sourceModifiedAt;
      }
    }

    const deletedRecords = input.mode === "RECONCILE"
      ? await input.repository.reconcile({
          sourceId: input.adapter.sourceId,
          runId: run.id,
          from: input.from,
          to: input.to,
          reconciledAt: now().toISOString(),
        })
      : 0;
    if (input.mode === "RECONCILE") {
      await input.repository.reconcileManualOccurrences();
    }
    const metrics: SyncMetrics = {
      rawEvents: records.length,
      rejectedEvents: 0,
      canonicalEvents: eventIds.size,
      occurrences: occurrenceIds.size,
      duplicatesMerged,
      matchedVenues: matchedVenueIds.size,
      unmatchedVenues: unmatchedVenueIds.size,
      freeEvents: freeEventIds.size,
      imageRightsVerified: 0,
      unauthorizedImagesStored: await input.repository.countUnauthorizedImages(),
      deletedRecords,
    };
    await input.repository.finishRun(run.id, metrics, sourceWatermark);
    return metrics;
  } catch (error) {
    await input.repository.failRun(run.id, error);
    throw error;
  }
}
