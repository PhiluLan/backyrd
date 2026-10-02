export type SpotAddressParts = {
  street?: string | null;
  postalCode?: string | null;
  locality?: string | null;
  neighborhood?: string | null;
  country?: string | null;
  legacyAddress?: string | null;
};

const clean = (value: string | null | undefined) => value?.trim() || null;
const countries: Record<string, string> = { CH: "Schweiz", DE: "Deutschland", AT: "Österreich", FR: "Frankreich", IT: "Italien", LI: "Liechtenstein" };

export function spotAddressLines(parts: SpotAddressParts): string[] {
  let street = clean(parts.street);
  const locality = clean(parts.locality);
  let postalCode = clean(parts.postalCode);
  // The older spot address contains the postcode for some canonical World spots.
  // Use it for display only when its locality matches; never guess a postcode.
  if (!postalCode && locality) {
    const legacy = clean(parts.legacyAddress);
    const escapedLocality = locality.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = legacy?.match(new RegExp(`(?:^|,)\\s*(\\d{4,5})\\s+${escapedLocality}(?:\\s*,|$)`, "i"));
    if (match) postalCode = match[1];
  }
  if (street && locality) {
    const escapedLocality = locality.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = street.match(new RegExp(`^(.+),\\s*\\d{4,5}\\s+${escapedLocality}(?:\\s*,.*)?$`, "i"));
    if (match) street = match[1].trim();
  }
  const neighborhood = clean(parts.neighborhood);
  const rawCountry = clean(parts.country);
  const country = rawCountry ? countries[rawCountry.toUpperCase()] ?? rawCountry : null;
  const place = [postalCode, locality].filter(Boolean).join(" ");
  const region = [neighborhood, country].filter(Boolean).join(" · ");
  return [street, place || null, region || null].filter((line): line is string => Boolean(line));
}
