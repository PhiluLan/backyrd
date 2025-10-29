// mobile/lib/geocode.ts
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

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

  // Wir holen für jedes Ergebnis die Koordinaten (Place Details)
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
