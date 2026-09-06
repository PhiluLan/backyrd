export type EventCategoryDTO =
  | "MUSIC"
  | "NIGHTLIFE"
  | "ART"
  | "THEATRE"
  | "FILM"
  | "FOOD_DRINK"
  | "FAMILY"
  | "SPORT"
  | "ACTIVITY"
  | "LEISURE"
  | "MARKET"
  | "WORKSHOP"
  | "COMMUNITY"
  | "OTHER";

export type EventTimeFilter = "today" | "tomorrow" | "weekend" | "all";

export type EventDiscoveryDTO = {
  event_id: string;
  occurrence_id: string;
  source: string;
  source_event_id: string;
  title: string;
  short_description: string | null;
  category: EventCategoryDTO;
  categories: string[];
  event_status: "PUBLISHED" | "SCHEDULED" | "POSTPONED" | "CANCELLED" | "ENDED";
  occurrence_status: "SCHEDULED" | "POSTPONED" | "CANCELLED";
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
  matched_spot_name: string | null;
  matched_spot_address: string | null;
  matched_spot_photo: string | null;
  last_seen_at: string;
  updated_at: string;
};
