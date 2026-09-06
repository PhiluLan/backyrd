import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  NormalizedEventRecord,
  SpotCandidate,
  SyncMetrics,
  SyncMode,
  VenueMatch,
} from "./contracts.js";
import {
  addressFingerprint,
  matchVenue,
  normalizeText,
} from "./normalization.js";

type RunRow = { id: string; started_at: string };
type IngestResult = {
  canonical_event_id: string;
  canonical_occurrence_id: string;
  created_event: boolean;
  created_occurrence: boolean;
  duplicate_merged: boolean;
};

function fail(message: string, error: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

export class EventsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async startRun(input: {
    sourceId: string;
    mode: SyncMode;
    from: string;
    to: string;
  }): Promise<RunRow> {
    const { data, error } = await this.client
      .from("event_ingest_runs_v1")
      .insert({
        source_id: input.sourceId,
        mode: input.mode,
        scope: { city: "Basel", from: input.from, to: input.to },
      })
      .select("id,started_at")
      .single();
    if (error || !data) fail("Could not start Events V1 ingest run", error);
    return data as RunRow;
  }

  async finishRun(
    runId: string,
    metrics: SyncMetrics,
    sourceWatermark: string | null,
  ): Promise<void> {
    const { error } = await this.client
      .from("event_ingest_runs_v1")
      .update({
        status: "SUCCEEDED",
        completed_at: new Date().toISOString(),
        source_watermark: sourceWatermark,
        metrics,
      })
      .eq("id", runId);
    if (error) fail("Could not finish Events V1 ingest run", error);
  }

  async failRun(runId: string, error: unknown): Promise<void> {
    const detail = error instanceof Error ? error.message : String(error);
    await this.client
      .from("event_ingest_runs_v1")
      .update({
        status: "FAILED",
        completed_at: new Date().toISOString(),
        error_code: "EVENT_SYNC_FAILED",
        error_detail: detail.slice(0, 1_000),
      })
      .eq("id", runId);
  }

  async loadSpotCandidates(): Promise<SpotCandidate[]> {
    const { data, error } = await this.client
      .from("spots")
      .select("id,name,address,city,lat,lng")
      .eq("status", "approved")
      .limit(2_000);
    if (error) fail("Could not load canonical Backyrd spots", error);
    return (data ?? []).map((spot) => ({
      id: String(spot.id),
      name: String(spot.name),
      address: typeof spot.address === "string" ? spot.address : null,
      city: typeof spot.city === "string" ? spot.city : null,
      lat: typeof spot.lat === "number" && Number.isFinite(spot.lat) ? spot.lat : null,
      lng: typeof spot.lng === "number" && Number.isFinite(spot.lng) ? spot.lng : null,
    }));
  }

  private async resolveVenueMatch(
    record: NormalizedEventRecord,
    spots: SpotCandidate[],
  ): Promise<VenueMatch> {
    if (!record.venue) return { spotId: null, method: "UNMATCHED", confidence: null };
    const { data, error } = await this.client
      .from("event_venues_v1")
      .select("matched_spot_id")
      .eq("source_id", record.source)
      .eq("source_venue_id", record.venue.sourceVenueId)
      .maybeSingle();
    if (error) fail("Could not read stable source venue mapping", error);
    if (data?.matched_spot_id) {
      return { spotId: String(data.matched_spot_id), method: "SOURCE_ID", confidence: 1 };
    }
    return matchVenue(record.venue, spots);
  }

  async ingest(
    record: NormalizedEventRecord,
    runId: string,
    seenAt: string,
    spots: SpotCandidate[],
  ): Promise<{ result: IngestResult; venueMatch: VenueMatch }> {
    const venueMatch = await this.resolveVenueMatch(record, spots);
    const rpcRecord = {
      ...record,
      venue: record.venue
        ? {
            ...record.venue,
            normalizedName: normalizeText(record.venue.name),
            addressFingerprint: addressFingerprint(record.venue),
          }
        : null,
    };
    const { data, error } = await this.client.rpc("ingest_event_record_v1", {
      p_record: rpcRecord,
      p_venue_match: venueMatch,
      p_ingest_run_id: runId,
      p_seen_at: seenAt,
    });
    if (error) fail(`Could not ingest source event ${record.sourceEventId}`, error);
    const row = (Array.isArray(data) ? data[0] : data) as IngestResult | undefined;
    if (!row) fail(`No ingest result for source event ${record.sourceEventId}`, null);
    return { result: row, venueMatch };
  }

  async reconcile(input: {
    sourceId: string;
    runId: string;
    from: string;
    to: string;
    reconciledAt: string;
  }): Promise<number> {
    const { data, error } = await this.client.rpc("reconcile_event_source_v1", {
      p_source_id: input.sourceId,
      p_ingest_run_id: input.runId,
      p_from: input.from,
      p_to: input.to,
      p_reconciled_at: input.reconciledAt,
    });
    if (error) fail("Could not reconcile Events V1 source", error);
    return Number(data ?? 0);
  }

  async reconcileManualOccurrences(): Promise<number> {
    const { data, error } = await this.client.rpc(
      "reconcile_manual_event_occurrences_v1",
    );
    if (error) fail("Could not refresh manual Events V1 occurrence horizon", error);
    return Number(data ?? 0);
  }

  async countUnauthorizedImages(): Promise<number> {
    const { count, error } = await this.client
      .from("events_v1")
      .select("id", { count: "exact", head: true })
      .not("image_storage_path", "is", null)
      .eq("image_rights_verified", false);
    if (error) fail("Could not verify event image rights invariant", error);
    return count ?? 0;
  }
}
