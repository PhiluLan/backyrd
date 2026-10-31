/** Versioned retrieval region. This is a municipality cohort, not a distance
 * claim. Explicit required destinations are still checked against each venue's
 * actual locality; account/default Basel may discover its nearby municipalities. */
export const LIBRARIAN_GEOGRAPHY_VERSION = "backyrd.librarian-geography@1";
export const BASEL_DISCOVERY_LOCALITIES: readonly string[] = Object.freeze([
  "Basel", "Riehen", "Bettingen", "Birsfelden", "Muttenz", "Pratteln",
  "Münchenstein", "Arlesheim", "Reinach", "Bottmingen", "Binningen", "Allschwil", "Oberwil", "Therwil",
]);
export const localityKey = (value: string): string => value.trim().normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("de-CH");
export const librarianDiscoveryLocalities = (city: string): readonly string[] => localityKey(city) === "basel" ? BASEL_DISCOVERY_LOCALITIES : [city];
