export type SpotAddressParts = {
  street?: string | null;
  postalCode?: string | null;
  locality?: string | null;
  neighborhood?: string | null;
  country?: string | null;
};

const clean = (value: string | null | undefined) => value?.trim() || null;
const countries: Record<string, string> = { CH: "Schweiz", DE: "Deutschland", AT: "Österreich", FR: "Frankreich", IT: "Italien", LI: "Liechtenstein" };

export function spotAddressLines(parts: SpotAddressParts): string[] {
  const street = clean(parts.street);
  const locality = clean(parts.locality);
  const postalCode = clean(parts.postalCode);
  const neighborhood = clean(parts.neighborhood);
  const rawCountry = clean(parts.country);
  const country = rawCountry ? countries[rawCountry.toUpperCase()] ?? rawCountry : null;
  const place = [postalCode, locality].filter(Boolean).join(" ");
  const region = [neighborhood, country].filter(Boolean).join(" · ");
  return [street, place || null, region || null].filter((line): line is string => Boolean(line));
}
