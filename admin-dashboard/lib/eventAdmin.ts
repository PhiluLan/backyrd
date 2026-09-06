export type EventSpot = { id: string; name: string; address: string | null; city: string | null };

export function normalizeSpotSearch(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").toLocaleLowerCase("de-CH").replace(/[^a-z0-9]+/g, " ").trim();
}

export function filterEventSpots(spots: EventSpot[], query: string, limit = 8): EventSpot[] {
  const terms = normalizeSpotSearch(query).split(" ").filter(Boolean);
  const matches = terms.length === 0 ? spots : spots.filter((spot) => {
    const haystack = normalizeSpotSearch(`${spot.name} ${spot.address ?? ""} ${spot.city ?? ""}`);
    return terms.every((term) => haystack.includes(term));
  });
  return matches.slice(0, limit);
}

export function venueFieldsAfterTyping(value: string): { venueName: string; spotId: "" } {
  return { venueName: value, spotId: "" };
}

export function validateEventInput(input: { title: string; description: string; categories: string[]; minimumAge: string; price: string; free: boolean; startDate: string; startTime: string; endTime: string }): string | null {
  const title = input.title.trim();
  if (!title || title.length > 300) return "Bitte gib einen Eventtitel mit höchstens 300 Zeichen ein.";
  if (input.description.length > 600) return "Die Beschreibung darf höchstens 600 Zeichen lang sein.";
  if (input.categories.length < 1 || input.categories.length > 12) return "Bitte wähle mindestens eine Kategorie aus.";
  if (input.minimumAge) {
    const age = Number(input.minimumAge);
    if (!Number.isInteger(age) || age < 0 || age > 99) return "Das Mindestalter muss zwischen 0 und 99 liegen.";
  }
  if (!input.free && input.price) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) return "Bitte gib einen gültigen Preis ein oder markiere das Event als gratis.";
  }
  if (!input.startDate || !input.startTime || !input.endTime) return "Bitte gib Datum, Startzeit und Endzeit vollständig ein.";
  if (input.endTime <= input.startTime) return "Die Endzeit muss nach der Startzeit liegen.";
  return null;
}

export function buildVenuePayload(args: { eventId: string; selectedSpot: EventSpot | null; venueName: string; address: string; now: string }): Record<string, unknown> | null {
  if (args.selectedSpot) return {
    source_id: "manual_admin", source_venue_id: `spot:${args.selectedSpot.id}`, name: args.selectedSpot.name,
    normalized_name: normalizeSpotSearch(args.selectedSpot.name), address_line: args.address.trim() || args.selectedSpot.address,
    city: args.selectedSpot.city, country_code: "CH", matched_spot_id: args.selectedSpot.id, match_method: "SOURCE_ID",
    match_confidence: 1, last_seen_at: args.now,
  };
  const venueName = args.venueName.trim();
  if (!venueName) return null;
  return {
    source_id: "manual_admin", source_venue_id: `event:${args.eventId}`, name: venueName,
    normalized_name: normalizeSpotSearch(venueName), address_line: args.address.trim() || null, city: null,
    country_code: "CH", matched_spot_id: null, match_method: "UNMATCHED", match_confidence: null, last_seen_at: args.now,
  };
}
