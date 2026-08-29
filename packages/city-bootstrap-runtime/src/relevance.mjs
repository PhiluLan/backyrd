const TYPE_POLICY = Object.freeze({
  restaurant: ["Restaurant", "SUPPORTED_TYPE"], cafe: ["Café", "SUPPORTED_TYPE"], coffee_shop: ["Café", "SUPPORTED_TYPE"], bakery: ["Café", "SUPPORTED_TYPE"],
  bar: ["Bar", "SUPPORTED_TYPE"], pub: ["Bar", "SUPPORTED_TYPE"], night_club: ["Bar", "SUPPORTED_TYPE"], wine_bar: ["Bar", "SUPPORTED_TYPE"],
  museum: ["Museum", "SUPPORTED_TYPE"], art_museum: ["Museum", "SUPPORTED_TYPE"], history_museum: ["Museum", "SUPPORTED_TYPE"], art_gallery: ["Museum", "SUPPORTED_TYPE"],
  performing_arts_theater: ["Besonderes Erlebnis", "SUPPORTED_TYPE"], movie_theater: ["Besonderes Erlebnis", "SUPPORTED_TYPE"], cultural_center: ["Besonderes Erlebnis", "SUPPORTED_TYPE"], historical_place: ["Besonderes Erlebnis", "SUPPORTED_TYPE"],
  amusement_center: ["Aktivität", "SUPPORTED_TYPE"], bowling_alley: ["Aktivität", "SUPPORTED_TYPE"], escape_room: ["Aktivität", "SUPPORTED_TYPE"], indoor_playground: ["Aktivität", "SUPPORTED_TYPE"], sports_activity_location: ["Aktivität", "SUPPORTED_TYPE"], climbing_gym: ["Aktivität", "SUPPORTED_TYPE"], swimming_pool: ["Aktivität", "SUPPORTED_TYPE"], spa: ["Wellness / Spa", "SUPPORTED_TYPE"],
  zoo: ["Aktivität", "SUPPORTED_TYPE"], aquarium: ["Aktivität", "SUPPORTED_TYPE"], botanical_garden: ["Spaziergang", "SUPPORTED_TYPE"], park: ["Spaziergang", "SUPPORTED_TYPE"], hiking_area: ["Spaziergang", "SUPPORTED_TYPE"],
  tourist_attraction: ["Besonderes Erlebnis", "AMBIGUOUS_TYPE"], visitor_center: ["Besonderes Erlebnis", "AMBIGUOUS_TYPE"], observation_deck: ["Aussichtspunkt", "SUPPORTED_TYPE"], hotel: ["Unterkunft / Hotel", "SUPPORTED_TYPE"],
  pharmacy: [null, "IRRELEVANT_SERVICE"], dentist: [null, "IRRELEVANT_SERVICE"], doctor: [null, "IRRELEVANT_SERVICE"], supermarket: [null, "ORDINARY_RETAIL"], convenience_store: [null, "ORDINARY_RETAIL"], bank: [null, "IRRELEVANT_SERVICE"], gas_station: [null, "IRRELEVANT_SERVICE"], car_repair: [null, "IRRELEVANT_SERVICE"]
});

export function classifyRelevance(types) {
  const unique = [...new Set((types ?? []).map(String))];
  const supported = unique.map((type) => ({ type, policy: TYPE_POLICY[type] })).filter((row) => row.policy?.[0]);
  const ambiguous = supported.filter((row) => row.policy[1] === "AMBIGUOUS_TYPE");
  const exact = supported.filter((row) => row.policy[1] === "SUPPORTED_TYPE");
  if (exact.length) return Object.freeze({ state: "RELEVANT", reason: "SUPPORTED_TYPE", confidence: "HIGH", categoryName: exact[0].policy[0], matchedType: exact[0].type });
  if (ambiguous.length) return Object.freeze({ state: "AMBIGUOUS", reason: "AMBIGUOUS_REVIEW", confidence: "LOW", categoryName: ambiguous[0].policy[0], matchedType: ambiguous[0].type });
  const rejected = unique.map((type) => TYPE_POLICY[type]?.[1]).find((reason) => reason?.startsWith("IRRELEVANT") || reason === "ORDINARY_RETAIL");
  if (rejected) return Object.freeze({ state: "IRRELEVANT", reason: rejected, confidence: "EXACT", categoryName: null, matchedType: null });
  return Object.freeze({ state: "AMBIGUOUS", reason: "UNMAPPED_EXTERNAL_TYPE", confidence: "LOW", categoryName: null, matchedType: null });
}

export const canonicalCategoryNames = Object.freeze([...new Set(Object.values(TYPE_POLICY).map((row) => row[0]).filter(Boolean))]);
