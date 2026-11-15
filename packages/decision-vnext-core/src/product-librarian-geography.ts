/** Versioned retrieval region. This is a municipality cohort, not a distance
 * claim. Explicit required destinations are still checked against each venue's
 * actual locality; account/default Basel may discover its nearby municipalities. */
export const LIBRARIAN_GEOGRAPHY_VERSION = "backyrd.librarian-geography@2";
export const BASEL_DISCOVERY_LOCALITIES: readonly string[] = Object.freeze([
  "Basel", "Riehen", "Bettingen", "Birsfelden", "Muttenz", "Pratteln",
  "Münchenstein", "Arlesheim", "Reinach", "Bottmingen", "Binningen", "Allschwil", "Oberwil", "Therwil",
]);
export const localityKey = (value: string): string => value.trim().normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("de-CH");
export function librarianCityIdentifier(value: string): string {
  const key = localityKey(value);
  if (key === "zurich") return "Zurich";
  const regionalCity = BASEL_DISCOVERY_LOCALITIES.find(city => localityKey(city) === key);
  return regionalCity?.normalize("NFKD").replace(/\p{M}/gu, "") ?? value;
}
export const librarianDiscoveryLocalities = (city: string): readonly string[] => localityKey(city) === "basel" ? BASEL_DISCOVERY_LOCALITIES : [city];

import { contentHash } from "./canonical.js";
import { BASEL_NEIGHBORHOOD_RINGS } from "../../canonical-semantics/src/basel-neighborhoods.mjs";
import { BASEL_DECISION_LOCATIONS, findBaselReferencePoint } from "../../canonical-semantics/src/basel-reference-points.mjs";

const kleinbaselNeighborhoods = ["altstadt kleinbasel", "clara", "wettstein", "hirzbrunnen", "rosental", "matthaus", "klybeck", "kleinhuningen"];
const baselOldTown: readonly string[] = ["altstadt grossbasel", "altstadt kleinbasel"];
// The canton includes both historic quarters in the city centre along with
// parts of other districts. Membership in the two quarters is positive
// evidence; their outer edges are not the boundary of the city centre.
const baselCityCentreCore = {
  names: baselOldTown,
  evidenceHash: contentHash({
    source: "https://grosserrat.bs.ch/dokumente/100370/000000370621.pdf",
    section: "2.2",
    names: baselOldTown,
  }),
};
const areaKey = (value: string) => localityKey(value).replace(/[^a-z0-9]+/g, " ").trim();
const neighborhoods = new Map(Object.entries(BASEL_NEIGHBORHOOD_RINGS).map(([label, rings]) =>
  [areaKey(label), { rings, evidenceHash: contentHash({ dataset: "BS-100042", label, rings }) }] as const));
export function baselCityCentreEvidence(name: string) {
  return ["innenstadt", "basler innenstadt", "innenstadt basel", "innenstadt von basel"].includes(areaKey(name))
    ? baselCityCentreCore : null;
}

export function baselNeighborhoodNames(name: string): readonly string[] | null {
  const key = areaKey(name);
  if (key === "kleinbasel") return ["kleinbasel", ...kleinbaselNeighborhoods];
  if (["altstadt", "basler altstadt", "altstadt basel", "altstadt von basel"].includes(key)) {
    return ["altstadt", "basler altstadt", "altstadt basel", ...baselOldTown];
  }
  if (key === "st johann" || key === "st johanns quartier") return ["st johann", "st johanns quartier"];
  if (key === "gundeldingen" || key === "gundeli") return ["gundeldingen", "gundeli"];
  if (key === "claraquartier") return ["clara", "claraquartier"];
  if (key === "wettsteinquartier") return ["wettstein"];
  return neighborhoods.has(key) ? [key] : null;
}

function insideRing(longitude: number, latitude: number, ring: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [leftX, leftY] = ring[i - 1]!, [rightX, rightY] = ring[i]!;
    if ((leftY > latitude) !== (rightY > latitude)
        && longitude < (rightX - leftX) * (latitude - leftY) / (rightY - leftY) + leftX) inside = !inside;
  }
  return inside;
}

export function baselNeighborhoodAt(names: readonly string[], latitude: number, longitude: number) {
  const shapes = names.flatMap(name => neighborhoods.get(name) ?? []);
  if (!shapes.length) return null;
  return {
    matches: shapes.some(shape => insideRing(longitude, latitude, shape.rings[0]!)
      && !shape.rings.slice(1).some(ring => insideRing(longitude, latitude, ring))),
    evidenceHashes: shapes.map(shape => shape.evidenceHash),
  };
}
export function baselSearchAnchor(name: string) {
  const key = areaKey(name);
  const id = ["sbb", "basel sbb", "bahnhof sbb", "bahnhof basel sbb"].includes(key) ? "BASEL_SBB"
    : key === "marktplatz" ? "MARKTPLATZ" : null;
  const legacy = id ? BASEL_DECISION_LOCATIONS[id] : undefined;
  return legacy ? {id, ...legacy} : findBaselReferencePoint(name);
}

// Same default as the existing Basel SBB vicinity rule. This measures straight-line distance.
export const BASEL_PROXIMITY_METERS = 800;
export function straightLineMeters(a: {latitude:number;longitude:number}, b: {latitude:number;longitude:number}): number {
  const radians = Math.PI / 180;
  const halfLat = (b.latitude - a.latitude) * radians / 2;
  const halfLon = (b.longitude - a.longitude) * radians / 2;
  const chord = Math.sin(halfLat) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(halfLon) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, chord)));
}
