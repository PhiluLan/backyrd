// types/spots.ts
export type SpotStatus = "pending" | "approved" | "rejected" | "archived";

export interface Spot {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  category_id: string | null;
  price_level: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  header_photo_path: string | null;
  google_place_id: string | null;
  google_photo_enabled: boolean;
  status: SpotStatus;
  created_at: string;
  created_by: string | null;
}
