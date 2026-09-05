// mobile/lib/geocode.ts
import { supabase } from "./supabase";

type AddressResult = { id: string; place_name: string; coords: [number, number] };
type ReverseResult = { name: string | null; place_name: string | null; address: string | null };

export async function searchAddress(query: string) {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; results?: AddressResult[] }>("mobile-geocode", {
    body: { action: "search_address", query },
  });
  if (error || !data?.ok) throw new Error("address_search_unavailable");
  return Array.isArray(data.results) ? data.results : [];
}

export async function reverseGeocode(lng: number, lat: number) {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; result?: ReverseResult }>("mobile-geocode", {
    body: { action: "reverse_geocode", longitude: lng, latitude: lat },
  });
  if (error || !data?.ok || !data.result) throw new Error("reverse_geocode_unavailable");
  return data.result;
}
