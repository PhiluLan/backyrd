import { hashBody } from "./canonical.js";
import { AMENITY_FEATURES, CUISINES, FOOD_SPECIALITIES, OFFERING_GROUPS, PLACE_TYPES, PRIMARY_CATEGORIES, type PrimaryCategory } from "./registry.js";

export const AUTHORING_TAXONOMY_VERSION = "backyrd.world-knowledge.authoring-taxonomy@4a.2" as const;
export type AuthoringTaxonomyState = "CANONICAL" | "NOT_CONFIGURED";
export interface AuthoringTaxonomyOption {
  readonly value: string;
  readonly label: string;
  readonly group: string;
  readonly state: AuthoringTaxonomyState;
}

const canonical = (values: readonly string[]) => new Set(values);
const option = (value: string, label: string, group: string, approved: ReadonlySet<string>): AuthoringTaxonomyOption => Object.freeze({ value, label, group, state: approved.has(value) ? "CANONICAL" : "NOT_CONFIGURED" });

const placeTypeLabels: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  RESTAURANT: ["Restaurant", "Gastronomie"], BRASSERIE: ["Brasserie", "Gastronomie"], BISTRO: ["Bistro", "Gastronomie"], CAFE: ["Café", "Gastronomie"], BAR: ["Bar", "Getränke & Nachtleben"], PUB: ["Pub", "Getränke & Nachtleben"], SNACK_BAR: ["Imbiss", "Gastronomie"], TAKEAWAY: ["Take-away", "Gastronomie"], FAST_FOOD: ["Fast Food", "Gastronomie"],
  BAKERY: ["Bäckerei", "Gastronomie"], PATISSERIE: ["Patisserie", "Gastronomie"], FOOD_HALL: ["Food Hall", "Gastronomie"], BREWERY: ["Brauerei", "Getränke & Nachtleben"], TAPROOM: ["Taproom", "Getränke & Nachtleben"], WINE_BAR: ["Weinbar", "Getränke & Nachtleben"], COCKTAIL_BAR: ["Cocktailbar", "Getränke & Nachtleben"], NIGHTCLUB: ["Nachtclub", "Getränke & Nachtleben"], MUSIC_CLUB: ["Musikclub", "Getränke & Nachtleben"], LOUNGE: ["Lounge", "Getränke & Nachtleben"],
  MUSEUM: ["Museum", "Kultur"], GALLERY: ["Galerie", "Kultur"], THEATRE: ["Theater", "Kultur & Unterhaltung"], CINEMA: ["Kino", "Kultur & Unterhaltung"], CONCERT_VENUE: ["Konzertort", "Kultur & Unterhaltung"], CULTURAL_CENTRE: ["Kulturzentrum", "Kultur"], LIBRARY: ["Bibliothek", "Kultur"], COMEDY_CLUB: ["Comedy-Club", "Unterhaltung"],
  ARCADE: ["Spielhalle / Arcade", "Aktivitäten & Spiel"], ESCAPE_ROOM: ["Escape Room", "Aktivitäten & Spiel"], BOWLING_ALLEY: ["Bowling", "Aktivitäten & Spiel"], MINI_GOLF: ["Minigolf", "Aktivitäten & Spiel"], WORKSHOP_STUDIO: ["Workshop-Atelier", "Aktivitäten & Spiel"], AMUSEMENT_PARK: ["Freizeitpark", "Aktivitäten & Spiel"],
  GYM: ["Fitnessstudio", "Sport & Bewegung"], SPORTS_CENTRE: ["Sportzentrum", "Sport & Bewegung"], CLIMBING_GYM: ["Kletterhalle", "Sport & Bewegung"], SWIMMING_POOL: ["Schwimmbad", "Sport & Bewegung"], ICE_RINK: ["Eisbahn", "Sport & Bewegung"], SPORTS_COURT: ["Sportplatz", "Sport & Bewegung"], STADIUM: ["Stadion", "Sport & Bewegung"],
  PARK: ["Park", "Draußen & Natur"], TRAIL: ["Wander- oder Spazierweg", "Draußen & Natur"], VIEWPOINT: ["Aussichtspunkt", "Draußen & Natur"], WATERFRONT: ["Seeufer / Flussufer", "Draußen & Natur"], BOTANICAL_GARDEN: ["Botanischer Garten", "Draußen & Natur"], NATURE_RESERVE: ["Naturschutzgebiet", "Draußen & Natur"],
  SPA: ["Spa", "Wellness"], SAUNA: ["Sauna", "Wellness"], THERMAL_BATH: ["Thermalbad", "Wellness"], MASSAGE_STUDIO: ["Massage-Studio", "Wellness"], YOGA_STUDIO: ["Yoga-Studio", "Wellness"],
  SHOP: ["Geschäft", "Shopping & Märkte"], MARKET: ["Markt", "Shopping & Märkte"], SHOPPING_CENTRE: ["Einkaufszentrum", "Shopping & Märkte"], CONCEPT_STORE: ["Concept Store", "Shopping & Märkte"],
  HOTEL: ["Hotel", "Übernachten"], HOSTEL: ["Hostel", "Übernachten"], GUESTHOUSE: ["Pension / Gästehaus", "Übernachten"], CAMPGROUND: ["Campingplatz", "Übernachten"], HOLIDAY_APARTMENT: ["Ferienwohnung", "Übernachten"],
  COMMUNITY_CENTRE: ["Gemeinschaftszentrum", "Community"], COWORKING_SPACE: ["Coworking Space", "Community"], CLUBHOUSE: ["Vereinslokal", "Community"], YOUTH_CENTRE: ["Jugendzentrum", "Community"],
  LANDMARK: ["Wahrzeichen", "Attraktionen"], ZOO: ["Zoo", "Attraktionen"], AQUARIUM: ["Aquarium", "Attraktionen"], VISITOR_CENTRE: ["Besucherzentrum", "Attraktionen"],
  EVENT_VENUE: ["Veranstaltungsort", "Temporäre Orte"], POP_UP: ["Pop-up", "Temporäre Orte"], FESTIVAL_SITE: ["Festivalgelände", "Temporäre Orte"], SEASONAL_MARKET: ["Saisonaler Markt", "Temporäre Orte"], OTHER_PLACE: ["Andere Art des Ortes", "Sonstiges"],
});

const categoryPlaces: Readonly<Record<PrimaryCategory, readonly string[] | "NOT_CONFIGURED">> = Object.freeze({
  EAT: ["RESTAURANT", "BRASSERIE", "BISTRO", "BAR", "PUB", "SNACK_BAR", "TAKEAWAY", "FAST_FOOD", "BAKERY", "PATISSERIE", "FOOD_HALL"],
  DRINKS: ["BAR", "PUB", "BREWERY", "TAPROOM", "WINE_BAR", "COCKTAIL_BAR", "LOUNGE"],
  COFFEE_DAYTIME: ["CAFE", "BAKERY", "PATISSERIE", "BISTRO"], NIGHTLIFE: ["NIGHTCLUB", "MUSIC_CLUB", "BAR", "PUB", "LOUNGE", "CONCERT_VENUE"],
  CULTURE_ARTS: ["MUSEUM", "GALLERY", "THEATRE", "CINEMA", "CONCERT_VENUE", "CULTURAL_CENTRE", "LIBRARY"],
  ENTERTAINMENT: ["CINEMA", "THEATRE", "CONCERT_VENUE", "COMEDY_CLUB", "ARCADE", "ESCAPE_ROOM", "BOWLING_ALLEY"],
  ACTIVITIES_PLAY: ["ARCADE", "ESCAPE_ROOM", "BOWLING_ALLEY", "MINI_GOLF", "WORKSHOP_STUDIO", "AMUSEMENT_PARK"],
  SPORT_MOVEMENT: ["GYM", "SPORTS_CENTRE", "CLIMBING_GYM", "SWIMMING_POOL", "ICE_RINK", "SPORTS_COURT", "STADIUM", "YOGA_STUDIO"],
  OUTDOOR_NATURE: ["PARK", "TRAIL", "VIEWPOINT", "WATERFRONT", "BOTANICAL_GARDEN", "NATURE_RESERVE"],
  WELLNESS_RELAXATION: ["SPA", "SAUNA", "THERMAL_BATH", "MASSAGE_STUDIO", "YOGA_STUDIO", "SWIMMING_POOL"],
  SHOPPING_MARKETS: ["SHOP", "MARKET", "SHOPPING_CENTRE", "CONCEPT_STORE", "SEASONAL_MARKET"],
  STAY: ["HOTEL", "HOSTEL", "GUESTHOUSE", "CAMPGROUND", "HOLIDAY_APARTMENT"],
  COMMUNITY_SOCIAL: ["COMMUNITY_CENTRE", "COWORKING_SPACE", "CLUBHOUSE", "YOUTH_CENTRE", "CULTURAL_CENTRE"],
  ATTRACTIONS_LANDMARKS: ["LANDMARK", "VIEWPOINT", "ZOO", "AQUARIUM", "AMUSEMENT_PARK", "VISITOR_CENTRE"],
  TEMPORARY_PLACES: ["EVENT_VENUE", "POP_UP", "FESTIVAL_SITE", "SEASONAL_MARKET"], OTHER: ["OTHER_PLACE"],
});

const gastronomic = ["EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "STAY", "TEMPORARY_PLACES"] as const;
const always = ["basics", "classification", "price", "hours", "objective", "amenities", "review"] as const;
export const CATEGORY_AUTHORING_MATRIX = Object.freeze(Object.fromEntries(PRIMARY_CATEGORIES.map((category) => [category, Object.freeze({
  category,
  placeTypes: categoryPlaces[category],
  relevantSteps: category === "OTHER" ? [...always] : gastronomic.includes(category as typeof gastronomic[number]) ? [...always, "offering"] : [...always, "activities"],
  relevantAttributeKeys: category === "OTHER" ? "NOT_CONFIGURED" : gastronomic.includes(category as typeof gastronomic[number])
    ? ["offering.cuisines", "offering.food_specialities", "offering.groups", "operation.service_model", "operation.service_format", "operation.takeaway", "hours.kitchen"]
    : ["classification.place_types", "operation.price_level", "operation.payment_methods", "hours.regular", "amenity.features", "capacity.group_size_supported"],
})])) as unknown as Record<PrimaryCategory, { readonly category: PrimaryCategory; readonly placeTypes: readonly string[] | "NOT_CONFIGURED"; readonly relevantSteps: readonly string[]; readonly relevantAttributeKeys: readonly string[] | "NOT_CONFIGURED" }>);

export const PLACE_TYPE_AUTHORING_OPTIONS = Object.freeze(Object.entries(placeTypeLabels).map(([value, [label, group]]) => option(value, label, group, canonical(PLACE_TYPES))));

const cuisineLabels: Readonly<Record<string, string>> = Object.freeze({ ITALIAN: "Italienisch", INDIAN: "Indisch", SWISS: "Schweizerisch", FRENCH: "Französisch", JAPANESE: "Japanisch", MEDITERRANEAN: "Mediterran", ASIAN: "Asiatisch", GERMAN: "Deutsch", AUSTRIAN: "Österreichisch", SPANISH: "Spanisch", PORTUGUESE: "Portugiesisch", GREEK: "Griechisch", TURKISH: "Türkisch", LEVANTINE: "Levantinisch", MIDDLE_EASTERN: "Nahöstlich", CHINESE: "Chinesisch", THAI: "Thailändisch", VIETNAMESE: "Vietnamesisch", KOREAN: "Koreanisch", INDONESIAN: "Indonesisch", MALAYSIAN: "Malaysisch", MEXICAN: "Mexikanisch", LATIN_AMERICAN: "Lateinamerikanisch", AMERICAN: "Amerikanisch", AFRICAN: "Afrikanisch", ETHIOPIAN: "Äthiopisch", MOROCCAN: "Marokkanisch", INTERNATIONAL: "International", FUSION: "Fusion", VEGETARIAN: "Vegetarisch geprägt", VEGAN: "Vegan geprägt" });
export const CUISINE_AUTHORING_OPTIONS = Object.freeze(Object.entries(cuisineLabels).map(([value, label]) => option(value, label, "Küchenrichtungen", canonical(CUISINES))));

const specialityLabels: Readonly<Record<string, string>> = Object.freeze({ PIZZA: "Pizza", BURGER: "Burger", SUSHI: "Sushi", PASTA: "Pasta", STEAK: "Steak", SEAFOOD: "Fisch & Meeresfrüchte", RAMEN: "Ramen", CURRY: "Curry", TACOS: "Tacos", KEBAB: "Kebab", FALAFEL: "Falafel", SANDWICHES: "Sandwiches", SALADS: "Salate", SOUPS: "Suppen", BREAKFAST_DISHES: "Frühstücksgerichte", BRUNCH_DISHES: "Brunch-Gerichte", BAKED_GOODS: "Backwaren", DESSERTS: "Desserts", ICE_CREAM: "Glace", CHEESE: "Käse", FONDUE: "Fondue", RACLETTE: "Raclette", TAPAS: "Tapas", DUMPLINGS: "Teigtaschen", FRIED_CHICKEN: "Fried Chicken", VEGETARIAN_DISHES: "Vegetarische Gerichte", VEGAN_DISHES: "Vegane Gerichte" });
export const FOOD_SPECIALITY_AUTHORING_OPTIONS = Object.freeze(Object.entries(specialityLabels).map(([value, label]) => option(value, label, "Speisen & Spezialitäten", canonical(FOOD_SPECIALITIES))));

const offeringGroups: Readonly<Record<string, readonly [string, string]>> = Object.freeze({ BEER: ["Bier", "Getränke"], WINE: ["Wein", "Getränke"], COCKTAILS: ["Cocktails", "Getränke"], NON_ALCOHOLIC_DRINKS: ["Alkoholfreie Getränke", "Getränke"], COFFEE: ["Kaffee", "Getränke"], TEA: ["Tee", "Getränke"], SPIRITS: ["Spirituosen", "Getränke"], CRAFT_BEER: ["Craft Beer", "Getränke"], NATURAL_WINE: ["Naturwein", "Getränke"],
  SNACKS: ["Snacks", "Angebot"], FULL_MEALS: ["Vollständige Mahlzeiten", "Angebot"], TAKEAWAY_MEALS: ["Speisen zum Mitnehmen", "Angebot"], BAKED_GOODS: ["Backwaren", "Angebot"], DESSERTS: ["Desserts", "Angebot"], TASTING_MENU: ["Degustationsmenü", "Angebot"],
  BREAKFAST: ["Frühstück", "Mahlzeiten"], BRUNCH: ["Brunch", "Mahlzeiten"], LUNCH: ["Mittagessen", "Mahlzeiten"], DINNER: ["Abendessen", "Mahlzeiten"], LATE_NIGHT_FOOD: ["Spätes Essen", "Mahlzeiten"],
});
export const OFFERING_AUTHORING_OPTIONS = Object.freeze(Object.entries(offeringGroups).map(([value, [label, group]]) => option(value, label, group, canonical(OFFERING_GROUPS))));

const amenityLabels: Readonly<Record<string, readonly [string, string]>> = Object.freeze({ WIFI: ["WLAN", "Arbeiten & Technik"], POWER_OUTLETS: ["Steckdosen", "Arbeiten & Technik"], WORK_TABLES: ["Geeignete Arbeitstische", "Arbeiten & Technik"], TOILET: ["WC", "Grundausstattung"], CLOAKROOM: ["Garderobe", "Grundausstattung"], LOCKERS: ["Schliessfächer", "Grundausstattung"], CHANGING_ROOM: ["Umkleide", "Grundausstattung"], SHOWER: ["Dusche", "Grundausstattung"], PARKING: ["Parkplätze", "Anreise"], BICYCLE_PARKING: ["Veloparkplätze", "Anreise"], PUBLIC_TRANSPORT_NEARBY: ["ÖV in der Nähe", "Anreise"], HIGH_CHAIR: ["Kinderhochstuhl", "Familie"], STROLLER_SPACE: ["Platz für Kinderwagen", "Familie"], CHANGING_TABLE: ["Wickeltisch", "Familie"], PLAY_AREA: ["Spielbereich", "Familie"], TERRACE: ["Terrasse", "Innen & Aussen"], GARDEN: ["Garten", "Innen & Aussen"], OUTDOOR_SEATING: ["Sitzplätze draussen", "Innen & Aussen"], COVERED_OUTDOOR: ["Überdachter Aussenbereich", "Innen & Aussen"], HEATED_OUTDOOR: ["Beheizter Aussenbereich", "Innen & Aussen"], WATER_BOWL: ["Wassernapf", "Tiere"], LIVE_MUSIC_EQUIPMENT: ["Bühne / Live-Musik-Technik", "Programm & Räume"], PRIVATE_ROOM: ["Separater Raum", "Programm & Räume"], DANCE_FLOOR: ["Tanzfläche", "Programm & Räume"] });
export const AMENITY_AUTHORING_OPTIONS = Object.freeze(Object.entries(amenityLabels).map(([value, [label, group]]) => option(value, label, group, canonical(AMENITY_FEATURES))));

export const getCategoryPlaceTypes = (category: PrimaryCategory | null | undefined): readonly AuthoringTaxonomyOption[] => {
  if (!category) return [];
  const allowed = CATEGORY_AUTHORING_MATRIX[category].placeTypes;
  if (allowed === "NOT_CONFIGURED") return [];
  return PLACE_TYPE_AUTHORING_OPTIONS.filter((entry) => allowed.includes(entry.value));
};

export const assessPlaceTypeCompatibility = (category: PrimaryCategory | null | undefined, placeTypes: readonly string[]): { readonly compatible: readonly string[]; readonly incompatible: readonly string[]; readonly state: "COMPATIBLE" | "CONFLICT" | "NOT_CONFIGURED" } => {
  if (!category) return { compatible: [], incompatible: [...placeTypes], state: "NOT_CONFIGURED" };
  const allowed = CATEGORY_AUTHORING_MATRIX[category].placeTypes as readonly string[];
  const compatible = placeTypes.filter((value) => allowed.includes(value));
  const incompatible = placeTypes.filter((value) => !allowed.includes(value));
  const containsUnreleased = compatible.some((value) => PLACE_TYPE_AUTHORING_OPTIONS.find((entry) => entry.value === value)?.state === "NOT_CONFIGURED");
  return { compatible, incompatible, state: incompatible.length ? "CONFLICT" : containsUnreleased ? "NOT_CONFIGURED" : "COMPATIBLE" };
};

export const AUTHORING_TAXONOMY_HASH = hashBody({ version: AUTHORING_TAXONOMY_VERSION, categoryMatrix: CATEGORY_AUTHORING_MATRIX, placeTypes: PLACE_TYPE_AUTHORING_OPTIONS, cuisines: CUISINE_AUTHORING_OPTIONS, foodSpecialities: FOOD_SPECIALITY_AUTHORING_OPTIONS, offerings: OFFERING_AUTHORING_OPTIONS, amenities: AMENITY_AUTHORING_OPTIONS }, []);
