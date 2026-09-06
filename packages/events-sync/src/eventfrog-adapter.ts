import type {
  EventCategory,
  EventSourceAdapter,
  NormalizedEventRecord,
  SourceVenue,
} from "./contracts.js";
import {
  addressFingerprint,
  mapCategory,
  normalizeText,
  stableHash,
} from "./normalization.js";

type LocalizedText = Record<string, string | null>;

type EventfrogImage = {
  url: string;
  width?: number | null;
  height?: number | null;
};

type EventfrogEvent = {
  id: string;
  extSrcId?: string | null;
  extId?: string | null;
  groupId: string;
  rubricId: number;
  title: LocalizedText;
  url: string;
  organizerId?: string;
  organizerName?: string;
  presaleLink?: string;
  emblemToShow?: EventfrogImage | null;
  emblemCredits?: string | null;
  begin: string;
  end?: string | null;
  cancelled: boolean;
  visible: boolean;
  published: boolean;
  agendaEntryOnly: boolean;
  littleTicketsLeft: boolean;
  soldOut: boolean;
  lowestTicketPrice?: number | null;
  locationIds: string[];
  locationAlias?: LocalizedText;
  modifyDate: string;
  shortDescription: LocalizedText;
  descriptionAsHTML: LocalizedText;
};

type EventfrogLocation = {
  id: string;
  title: LocalizedText;
  addressLine?: string | null;
  country?: string | null;
  zip?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type EventfrogEventsResponse = {
  totalNumberOfResources: number;
  events: EventfrogEvent[];
};

type EventfrogLocationsResponse = {
  totalNumberOfResources: number;
  locations: EventfrogLocation[];
};

type EventfrogRubric = {
  id: number;
  parentId: number;
  title: LocalizedText;
};

type EventfrogRubricsResponse = {
  totalNumberOfResources: number;
  rubrics: EventfrogRubric[];
};

function localized(value: LocalizedText | undefined): string | null {
  if (!value) return null;
  for (const language of ["de", "en", "fr", "it"]) {
    const candidate = value[language]?.trim();
    if (candidate) return candidate;
  }
  const fallback = Object.values(value).find(
    (candidate): candidate is string => Boolean(candidate?.trim()),
  );
  return fallback?.trim() ?? null;
}

function stripHtml(value: string | null): string | null {
  if (!value) return null;
  const clean = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, 600) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export class EventfrogAdapter implements EventSourceAdapter {
  readonly sourceId = "eventfrog";
  private readonly baseUrl = "https://api.eventfrog.net/public/v1";

  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly center = { latitude: 47.5596, longitude: 7.5886 },
    private readonly radiusKm = 12,
  ) {
    if (!token.trim()) throw new Error("EVENTFROG_API_TOKEN is required");
  }

  private async getJson<T>(path: string, params: URLSearchParams): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}?${params}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Eventfrog ${path} failed with HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private async fetchEvents(input: {
    from: string;
    to: string;
    modifiedSince?: string;
  }): Promise<EventfrogEvent[]> {
    const events: EventfrogEvent[] = [];
    let page = 1;
    while (true) {
      const params = new URLSearchParams({
        lat: String(this.center.latitude),
        lng: String(this.center.longitude),
        r: String(this.radiusKm),
        country: "CH",
        from: input.from,
        to: input.to,
        page: String(page),
        perPage: "1000",
      });
      if (input.modifiedSince) params.set("modifiedSince", input.modifiedSince);
      const response = await this.getJson<EventfrogEventsResponse>("/events", params);
      events.push(...response.events);
      if (events.length >= response.totalNumberOfResources || response.events.length === 0) {
        return events;
      }
      page += 1;
    }
  }

  private async fetchLocations(ids: string[]): Promise<Map<string, EventfrogLocation>> {
    const locations = new Map<string, EventfrogLocation>();
    const uniqueIds = Array.from(new Set(ids));
    for (let index = 0; index < uniqueIds.length; index += 100) {
      const batch = uniqueIds.slice(index, index + 100);
      const params = new URLSearchParams({ perPage: "100" });
      for (const id of batch) params.append("id", id);
      const response = await this.getJson<EventfrogLocationsResponse>("/locations", params);
      for (const location of response.locations) locations.set(location.id, location);
    }
    return locations;
  }

  private async fetchRubrics(): Promise<Map<number, string>> {
    const response = await this.getJson<EventfrogRubricsResponse>(
      "/rubrics",
      new URLSearchParams(),
    );
    return new Map(
      response.rubrics.map((rubric) => [rubric.id, localized(rubric.title) ?? ""]),
    );
  }

  async fetch(input: {
    from: string;
    to: string;
    modifiedSince?: string;
  }): Promise<NormalizedEventRecord[]> {
    const events = await this.fetchEvents(input);
    const [locations, rubrics] = await Promise.all([
      this.fetchLocations(events.flatMap((event) => event.locationIds)),
      this.fetchRubrics(),
    ]);

    return events.map((event) => {
      const title = localized(event.title);
      if (!title) throw new Error(`Eventfrog event ${event.id} has no title`);
      if (!event.begin || Number.isNaN(Date.parse(event.begin))) {
        throw new Error(`Eventfrog event ${event.id} has invalid begin`);
      }

      const sourceLocation = event.locationIds[0]
        ? locations.get(event.locationIds[0]) ?? null
        : null;
      const venueName = localized(event.locationAlias) ?? localized(sourceLocation?.title);
      const venue: SourceVenue | null = sourceLocation && venueName
        ? {
            sourceVenueId: sourceLocation.id,
            name: venueName,
            addressLine: sourceLocation.addressLine?.trim() || null,
            postalCode: sourceLocation.zip?.trim() || null,
            city: sourceLocation.city?.trim() || null,
            countryCode: sourceLocation.country?.trim() || null,
            latitude: finiteNumber(sourceLocation.lat),
            longitude: finiteNumber(sourceLocation.lng),
          }
        : null;
      const sourceCategory = rubrics.get(event.rubricId) || null;
      const category: EventCategory = mapCategory(sourceCategory);
      const venueIdentity = venue
        ? venue.sourceVenueId || addressFingerprint(venue) || normalizeText(venue.name)
        : "no-venue";
      const occurrenceDedupeKey = stableHash(
        "event-occurrence-v1",
        normalizeText(title),
        event.begin,
        venueIdentity,
      );
      const grouped = event.groupId && event.groupId !== "0";
      const eventDedupeKey = grouped
        ? stableHash("event-v1", "eventfrog-group", event.groupId)
        : stableHash("event-v1", occurrenceDedupeKey);
      const priceMin = finiteNumber(event.lowestTicketPrice);
      const isFree = priceMin === 0 ? true : priceMin !== null && priceMin > 0 ? false : null;
      const rawPayload = Object.fromEntries(
        Object.entries(event).filter(
          ([key]) => key !== "emblemToShow" && key !== "emblemCredits",
        ),
      );
      const status = event.cancelled
        ? "CANCELLED"
        : !event.visible || !event.published
          ? "DELETED"
          : "SCHEDULED";

      return {
        source: "eventfrog",
        sourceEventId: event.id,
        sourceGroupId: grouped ? event.groupId : null,
        sourceOccurrenceId: event.id,
        sourceModifiedAt: event.modifyDate,
        title,
        shortDescription: stripHtml(
          localized(event.shortDescription) ?? localized(event.descriptionAsHTML),
        ),
        category,
        sourceCategory,
        status,
        startAt: event.begin,
        endAt: event.end && !Number.isNaN(Date.parse(event.end)) ? event.end : null,
        venue,
        isFree,
        priceMin,
        priceCurrency: priceMin === null ? null : "CHF",
        sourceUrl: event.url,
        ticketUrl: event.presaleLink?.trim() || null,
        eventDedupeKey,
        occurrenceDedupeKey,
        payloadHash: stableHash(JSON.stringify(rawPayload)),
        rawPayload,
        provenance: {
          source: "eventfrog",
          sourceEventId: event.id,
          sourceGroupId: grouped ? event.groupId : null,
          sourceModifiedAt: event.modifyDate,
          fetchedVia: "public-api-v1",
          imageImported: false,
          imageReason: "Events V1 pilot disables image ingestion until per-asset rights are verified",
        },
      } satisfies NormalizedEventRecord;
    });
  }
}
