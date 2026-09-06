import type {
  EventDiscoveryDTO,
  EventTimeFilter,
} from "../../packages/shared/src/dto/event";

import { supabase } from "./supabase";

export type EventDateRange = {
  start: Date;
  end: Date;
};

export type UpcomingEventGroups = {
  sameEvent: EventDiscoveryDTO[];
  sameVenue: EventDiscoveryDTO[];
};

const BASEL_TIME_ZONE = "Europe/Zurich";

type CalendarDate = { year: number; month: number; day: number };

function calendarDateInBasel(value: Date): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BASEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function baselStartOfDay(value: CalendarDate): Date {
  const utcGuess = new Date(Date.UTC(value.year, value.month - 1, value.day));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BASEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcGuess);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  const representedAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return new Date(utcGuess.getTime() - (representedAsUtc - utcGuess.getTime()));
}

export function eventDateRange(
  filter: EventTimeFilter,
  now = new Date(),
): EventDateRange {
  const today = calendarDateInBasel(now);
  const range = (start: CalendarDate, end: CalendarDate) => ({
    start: baselStartOfDay(start),
    end: baselStartOfDay(end),
  });
  if (filter === "today") return range(today, addCalendarDays(today, 1));
  if (filter === "tomorrow") {
    return range(addCalendarDays(today, 1), addCalendarDays(today, 2));
  }
  if (filter === "weekend") {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    const daysUntilSaturday = day === 0 ? -1 : day === 6 ? 0 : 6 - day;
    const saturday = addCalendarDays(today, daysUntilSaturday);
    return range(saturday, addCalendarDays(saturday, 2));
  }
  return range(today, addCalendarDays(today, 366));
}

function normalizeRow(row: Record<string, unknown>): EventDiscoveryDTO {
  return {
    event_id: String(row.event_id),
    occurrence_id: String(row.occurrence_id),
    source: String(row.source),
    source_event_id: String(row.source_event_id),
    title: String(row.title),
    short_description:
      typeof row.short_description === "string" ? row.short_description : null,
    category: row.category as EventDiscoveryDTO["category"],
    categories: Array.isArray(row.categories) ? row.categories.map(String) : [String(row.category)],
    event_status: row.event_status as EventDiscoveryDTO["event_status"],
    occurrence_status: row.occurrence_status as EventDiscoveryDTO["occurrence_status"],
    start_at: String(row.start_at),
    end_at: typeof row.end_at === "string" ? row.end_at : null,
    venue_id: typeof row.venue_id === "string" ? row.venue_id : null,
    venue_name: typeof row.venue_name === "string" ? row.venue_name : null,
    address_line: typeof row.address_line === "string" ? row.address_line : null,
    postal_code: typeof row.postal_code === "string" ? row.postal_code : null,
    city: typeof row.city === "string" ? row.city : null,
    country_code: typeof row.country_code === "string" ? row.country_code : null,
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    matched_spot_id:
      typeof row.matched_spot_id === "string" ? row.matched_spot_id : null,
    is_free: typeof row.is_free === "boolean" ? row.is_free : null,
    price_min: typeof row.price_min === "number" ? row.price_min : null,
    price_currency:
      typeof row.price_currency === "string" ? row.price_currency : null,
    source_url: String(row.source_url),
    ticket_url: typeof row.ticket_url === "string" ? row.ticket_url : null,
    image_storage_path:
      row.image_rights_verified === true && typeof row.image_storage_path === "string"
        ? row.image_storage_path
        : null,
    image_credit:
      row.image_rights_verified === true && typeof row.image_credit === "string"
        ? row.image_credit
        : null,
    image_rights_verified: row.image_rights_verified === true,
    minimum_age: typeof row.minimum_age === "number" ? row.minimum_age : null,
    family_friendly: typeof row.family_friendly === "boolean" ? row.family_friendly : null,
    organizer: typeof row.organizer === "string" ? row.organizer : null,
    external_url: typeof row.external_url === "string" ? row.external_url : null,
    is_recurring: row.is_recurring === true,
    recurrence_summary: typeof row.recurrence_summary === "string" ? row.recurrence_summary : null,
    matched_spot_name: typeof row.matched_spot_name === "string" ? row.matched_spot_name : null,
    matched_spot_address: typeof row.matched_spot_address === "string" ? row.matched_spot_address : null,
    matched_spot_photo: typeof row.matched_spot_photo === "string" ? row.matched_spot_photo : null,
    last_seen_at: String(row.last_seen_at),
    updated_at: String(row.updated_at),
  };
}

export async function loadEvents(input: {
  filter: EventTimeFilter;
  category?: EventDiscoveryDTO["category"] | null;
}): Promise<EventDiscoveryDTO[]> {
  const range = eventDateRange(input.filter);
  let query = supabase
    .from("event_discovery_v1")
    .select("*")
    .lt("start_at", range.end.toISOString())
    .or(
      `end_at.gte.${range.start.toISOString()},and(end_at.is.null,start_at.gte.${range.start.toISOString()})`,
    )
    .order("start_at", { ascending: true })
    .limit(500);
  if (input.category) query = query.contains("categories", [input.category]);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
}

export async function loadEventOccurrence(
  eventId: string,
  occurrenceId?: string,
): Promise<EventDiscoveryDTO | null> {
  let query = supabase
    .from("event_discovery_v1")
    .select("*")
    .eq("event_id", eventId)
    .order("start_at", { ascending: true });
  if (occurrenceId) query = query.eq("occurrence_id", occurrenceId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeRow(data as Record<string, unknown>) : null;
}

export function eventImageUrl(path: string | null): string | null {
  return path ? supabase.storage.from("event-images").getPublicUrl(path).data.publicUrl : null;
}

export async function loadUpcomingEvents(current: EventDiscoveryDTO): Promise<UpcomingEventGroups> {
  const after = current.start_at;
  const sameEventQuery = supabase
    .from("event_discovery_v1")
    .select("*")
    .eq("event_id", current.event_id)
    .gt("start_at", after)
    .order("start_at")
    .limit(40);
  const sameVenueQuery = current.matched_spot_id
    ? supabase
        .from("event_discovery_v1")
        .select("*")
        .eq("matched_spot_id", current.matched_spot_id)
        .neq("event_id", current.event_id)
        .gt("start_at", after)
        .order("start_at")
        .limit(6)
    : current.venue_id
      ? supabase
          .from("event_discovery_v1")
          .select("*")
          .eq("venue_id", current.venue_id)
          .neq("event_id", current.event_id)
          .gt("start_at", after)
          .order("start_at")
          .limit(6)
      : null;

  const [sameEventResult, sameVenueResult] = await Promise.all([
    sameEventQuery,
    sameVenueQuery ?? Promise.resolve({ data: [], error: null }),
  ]);
  if (sameEventResult.error) throw new Error(sameEventResult.error.message);
  if (sameVenueResult.error) throw new Error(sameVenueResult.error.message);

  const available = (rows: unknown[] | null) =>
    (rows ?? [])
      .map((row) => normalizeRow(row as Record<string, unknown>))
      .filter(
        (event) =>
          event.event_status !== "CANCELLED" && event.occurrence_status !== "CANCELLED",
      );
  return {
    sameEvent: available(sameEventResult.data),
    sameVenue: available(sameVenueResult.data),
  };
}
