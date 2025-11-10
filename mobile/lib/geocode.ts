// mobile/lib/geocode.ts
import { GOOGLE_KEY } from "./config";

export async function searchAddress(query: string) {
  if (!GOOGLE_KEY) throw new Error("Google API Key fehlt");

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    query
  )}&types=geocode&language=de&key=${GOOGLE_KEY}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.status !== "OK") {
    console.warn("Google Places error:", data.status, data.error_message);
    return [];
  }

  const results = await Promise.all(
    data.predictions.map(async (p: any) => {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=geometry,formatted_address&key=${GOOGLE_KEY}`;
      const detailResp = await fetch(detailUrl);
      const detailData = await detailResp.json();
      const loc = detailData.result.geometry.location;
      return {
        id: p.place_id,
        place_name: detailData.result.formatted_address,
        coords: [loc.lng, loc.lat] as [number, number],
      };
    })
  );

  return results;
}
