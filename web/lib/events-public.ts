import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export type EventRow = {
  event_id: string;
  occurrence_id: string;
  source: string;
  source_event_id: string;
  title: string;
  short_description: string | null;
  category: string;
  categories: string[];
  event_status: string;
  occurrence_status: string;
  start_at: string;
  end_at: string | null;
  venue_id: string | null;
  venue_name: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  matched_spot_id: string | null;
  matched_spot_name: string | null;
  matched_spot_address: string | null;
  matched_spot_city: string | null;
  matched_spot_photo: string | null;
  is_free: boolean | null;
  price_min: number | null;
  price_currency: string | null;
  source_url: string;
  ticket_url: string | null;
  image_storage_path: string | null;
  image_credit: string | null;
  image_rights_verified: boolean;
  minimum_age: number | null;
  family_friendly: boolean | null;
  organizer: string | null;
  external_url: string | null;
  is_recurring: boolean;
  recurrence_summary: string | null;
  recurrence_index: number | null;
  is_recurrence_exception: boolean;
};

export async function events(limit = 100): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("event_discovery_v1")
    .select("*")
    .gte("end_at", new Date().toISOString())
    .order("start_at")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export async function eventDetail(
  id: string,
  occurrenceId?: string,
): Promise<EventRow | null> {
  let query = supabase
    .from("event_discovery_v1")
    .select("*")
    .eq("event_id", id)
    .order("start_at");
  if (occurrenceId) query = query.eq("occurrence_id", occurrenceId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data as EventRow | null;
}

export function imageUrl(
  path: string | null,
  rightsVerified: boolean,
): string | null {
  if (!path || !rightsVerified) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-images/${path}`;
}
