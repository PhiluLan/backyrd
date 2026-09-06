export type EventCategory =
  | "MUSIC"
  | "NIGHTLIFE"
  | "ART"
  | "THEATRE"
  | "FILM"
  | "FOOD_DRINK"
  | "FAMILY"
  | "SPORT"
  | "MARKET"
  | "WORKSHOP"
  | "COMMUNITY"
  | "OTHER";

export type CanonicalStatus =
  | "SCHEDULED"
  | "POSTPONED"
  | "CANCELLED"
  | "DELETED";

export type SyncMode = "INCREMENTAL" | "RECONCILE";

export type SourceVenue = {
  sourceVenueId: string;
  name: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type NormalizedEventRecord = {
  source: string;
  sourceEventId: string;
  sourceGroupId: string | null;
  sourceOccurrenceId: string;
  sourceModifiedAt: string;
  title: string;
  shortDescription: string | null;
  category: EventCategory;
  sourceCategory: string | null;
  status: CanonicalStatus;
  startAt: string;
  endAt: string | null;
  venue: SourceVenue | null;
  isFree: boolean | null;
  priceMin: number | null;
  priceCurrency: string | null;
  sourceUrl: string;
  ticketUrl: string | null;
  eventDedupeKey: string;
  occurrenceDedupeKey: string;
  payloadHash: string;
  rawPayload: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

export type SpotCandidate = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
};

export type VenueMatch = {
  spotId: string | null;
  method:
    | "SOURCE_ID"
    | "ADDRESS"
    | "COORDINATES"
    | "NORMALIZED_NAME"
    | "UNMATCHED";
  confidence: number | null;
};

export type SyncMetrics = {
  rawEvents: number;
  rejectedEvents: number;
  canonicalEvents: number;
  occurrences: number;
  duplicatesMerged: number;
  matchedVenues: number;
  unmatchedVenues: number;
  freeEvents: number;
  imageRightsVerified: number;
  unauthorizedImagesStored: number;
  deletedRecords: number;
};

export interface EventSourceAdapter {
  readonly sourceId: string;
  fetch(input: {
    from: string;
    to: string;
    modifiedSince?: string;
  }): Promise<NormalizedEventRecord[]>;
}
