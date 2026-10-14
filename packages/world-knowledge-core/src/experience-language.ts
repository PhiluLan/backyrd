/** Finite product concepts, not a German-language parser. Exact labels only;
 * whole prose, substring similarity and model confidence are never truth. */
export const librarianTerm = (text: string): string => text.normalize("NFKC").trim().toLocaleLowerCase("de-CH").replace(/\s+/gu, " ");
export type LibrarianConcept = {
    readonly id: string;
    readonly labels: readonly string[];
};
const concepts: readonly LibrarianConcept[] = [
    { id: "snacks", labels: ["snacks", "snack", "kleinigkeit essen"] },
    { id: "entry", labels: ["eintritt", "entry", "admission"] },
    { id: "meal", labels: ["essen", "essen gehen", "etwas essen", "vollständige mahlzeit", "vollstaendige mahlzeit", "full_meals", "full_meal"] },
    { id: "drinks", labels: ["trinken", "etwas trinken", "etwas trinken gehen", "trinken gehen", "getränke", "drinks"] },
    { id: "coffee", labels: ["café", "cafe", "kaffee", "coffee"] },
    { id: "aperitif", labels: ["apéro", "apero", "aperitif"] },
    { id: "lunch", labels: ["mittagessen", "lunch"] }, { id: "dinner", labels: ["abendessen", "dinner"] },
    { id: "breakfast", labels: ["frühstück", "breakfast"] },
    { id: "restaurant", labels: ["restaurant", "restaurantbesuch"] },
    { id: "museum", labels: ["museum", "museumsbesuch", "museum besuchen"] },
    { id: "zoo", labels: ["zoo", "zoobesuch", "zoo besuchen"] },
    { id: "bar", labels: ["bar", "barbesuch"] },
    { id: "guided", labels: ["führung", "geführt", "guided_tour"] },
    { id: "workshop", labels: ["workshop", "kreativworkshop"] },
    { id: "animals", labels: ["tiere beobachten", "tierbeobachtung", "animal_observation"] },
    { id: "exhibition", labels: ["ausstellung", "ausstellung besuchen"] },
    { id: "party", labels: ["private feier", "private feiern", "private_celebration"] },
    { id: "music_event", labels: ["musikveranstaltung", "music_event"] },
    { id: "quiet", labels: ["ruhig", "leise", "quiet"] },
    { id: "loud", labels: ["laut", "loud"] },
    { id: "romantic", labels: ["romantisch", "romantische atmosphäre", "romantic"] },
    { id: "relaxed", labels: ["entspannt", "entspannte atmosphäre", "relaxed"] },
    { id: "cozy", labels: ["gemütlich", "gemuetlich", "cozy"] },
    { id: "vegan", labels: ["vegan", "vegane gerichte", "vegane gerichte möglich"] },
    { id: "vegetarian", labels: ["vegetarisch", "vegetarische gerichte"] },
    { id: "music", labels: ["musik", "music"] }, { id: "no_music", labels: ["keine musik", "ohne musik"] },
    { id: "live_music", labels: ["live-musik", "livemusik", "live musik"] },
    { id: "background_music", labels: ["hintergrundmusik", "background music"] },
    { id: "indoor", labels: ["drinnen", "innen", "innenraum", "indoor"] },
    { id: "outdoor", labels: ["draußen", "draussen", "außen", "outdoor"] },
    { id: "terrace", labels: ["terrasse", "terrace"] },
    { id: "covered", labels: ["überdacht", "regengeschützt", "covered"] },
    { id: "shade", labels: ["schatten", "schattig"] },
    { id: "playground", labels: ["spielplatz", "playground"] },
    { id: "toilet", labels: ["wc", "toilette", "toilet"] },
    { id: "changing_table", labels: ["wickeltisch", "changing_table"] },
    { id: "high_chair", labels: ["kinderhochstuhl", "hochstuhl", "high_chair"] },
    { id: "step_free", labels: ["stufenlos", "stufenfrei", "step_free"] },
    { id: "stroller", labels: ["kinderwagenzugänglich", "mit kinderwagen zugänglich", "stroller"] },
    { id: "parking", labels: ["parkplatz", "parkplätze", "parking"] },
];
const byTerm = new Map<string, string>();
for (const concept of concepts)
    for (const label of concept.labels) {
        const term = librarianTerm(label);
        if (byTerm.has(term))
            throw new Error("librarian_language_duplicate_term");
        byTerm.set(term, concept.id);
    }
export const librarianConcept = (text: string): string | null => byTerm.get(librarianTerm(text)) ?? null;
export const sameLibrarianText = (a: string, b: string): boolean => librarianTerm(a) === librarianTerm(b) || (librarianConcept(a) !== null && librarianConcept(a) === librarianConcept(b));
export const EXPERIENCE_LANGUAGE_VERSION = "backyrd.world-knowledge.experience-language@1" as const;
export const EXPERIENCE_LANGUAGE_CONCEPTS = concepts;
export const OFFER_CONCEPTS: Readonly<Record<string, readonly string[]>> = {
    LUNCH: ["lunch", "meal", "restaurant"], DINNER: ["dinner", "meal", "restaurant"], BREAKFAST: ["breakfast", "meal", "restaurant"],
    APERITIF: ["aperitif"], DRINKS: ["drinks", "bar"], FULL_MEAL: ["meal"], CAFE: ["coffee"], GASTRONOMY: ["meal"],
    GUIDED_TOUR: ["guided"], WORKSHOP: ["workshop"], ANIMAL_OBSERVATION: ["animals"],
    PERMANENT_EXHIBITION: ["exhibition", "museum"], SPECIAL_EXHIBITION: ["exhibition", "museum"], SELF_GUIDED_VISIT: ["museum"],
    PRIVATE_CELEBRATION: ["party"], MUSIC_EVENT: ["music_event"],
};
export const AREA_CONCEPTS: Readonly<Record<string, readonly string[]>> = { INDOOR: ["indoor"], TERRACE: ["terrace", "outdoor"], OUTDOOR: ["outdoor"], PRIVATE_ROOM: ["indoor"], EXHIBITION: ["indoor"], LOUNGE: ["indoor"], CAFE: ["indoor"] };
export const BOOLEAN_CONCEPTS: Readonly<Record<string, string>> = { "amenity.playground": "playground", "amenity.toilet": "toilet", "amenity.changing_table": "changing_table", "amenity.high_chair": "high_chair", "amenity.step_free": "step_free", "amenity.stroller": "stroller", "amenity.parking": "parking", "condition.weather_protection": "covered", "offer.shade": "shade" };
export const EXPERIENCE_VALUE_CHOICES: Readonly<Record<string, readonly string[]>> = {
    "atmosphere.character": ["ruhig", "entspannt", "romantisch", "gemütlich", "lebhaft", "gesellig", "elegant", "lässig", "kreativ", "familienfreundlich"],
    "atmosphere.noise": ["ruhig", "laut"], "atmosphere.music": ["keine Musik", "Hintergrundmusik", "Live-Musik"],
    "food.diet": ["vegan", "vegetarisch"], "food.meal_extent": ["Essen", "Snacks"],
    "experience.activity": ["etwas trinken", "essen gehen", "Kaffee", "Führung", "Workshop", "Ausstellung besuchen", "Zoo besuchen"],
};
export const WORLD_VALUE_LABELS: Readonly<Record<string, string>> = {
    QUIET: "ruhig", RELAXED: "entspannt", ROMANTIC: "romantisch", COZY: "gemütlich", LIVELY: "lebhaft", SOCIABLE: "gesellig", ELEGANT: "elegant", CASUAL: "lässig", CREATIVE: "kreativ", FAMILY_FRIENDLY: "familienfreundlich", BUSINESS_SUITABLE: "geschäftlich geeignet",
    BEER: "Bier", CRAFT_BEER: "Craft-Bier", WINE: "Wein", NATURAL_WINE: "Naturwein", COCKTAILS: "Cocktails", NON_ALCOHOLIC_DRINKS: "alkoholfreie Getränke", COFFEE: "Kaffee", TEA: "Tee", SPIRITS: "Spirituosen",
    ITALIAN: "Italienisch", INDIAN: "Indisch", SWISS: "Schweizerisch", FRENCH: "Französisch", JAPANESE: "Japanisch", MEDITERRANEAN: "Mediterran", ASIAN: "Asiatisch", GERMAN: "Deutsch", AUSTRIAN: "Österreichisch", SPANISH: "Spanisch", PORTUGUESE: "Portugiesisch", GREEK: "Griechisch", TURKISH: "Türkisch", LEVANTINE: "Levantinisch", MIDDLE_EASTERN: "Nahöstlich", CHINESE: "Chinesisch", THAI: "Thai", VIETNAMESE: "Vietnamesisch", KOREAN: "Koreanisch", INDONESIAN: "Indonesisch", MALAYSIAN: "Malaysisch", MEXICAN: "Mexikanisch", LATIN_AMERICAN: "Lateinamerikanisch", AMERICAN: "Amerikanisch", AFRICAN: "Afrikanisch", ETHIOPIAN: "Äthiopisch", MOROCCAN: "Marokkanisch", INTERNATIONAL: "International", FUSION: "Fusion", VEGETARIAN: "vegetarisch", VEGAN: "vegan",
    PIZZA: "Pizza", BURGER: "Burger", SUSHI: "Sushi", PASTA: "Pasta", STEAK: "Steak", SEAFOOD: "Meeresfrüchte", RAMEN: "Ramen", CURRY: "Curry", TACOS: "Tacos", KEBAB: "Kebab", FALAFEL: "Falafel", SANDWICHES: "Sandwiches", SALADS: "Salate", SOUPS: "Suppen", BREAKFAST_DISHES: "Frühstücksgerichte", BRUNCH_DISHES: "Brunchgerichte", BAKED_GOODS: "Backwaren", CAKE: "Kuchen", DESSERTS: "Desserts", ICE_CREAM: "Glace", CHEESE: "Käse", FONDUE: "Fondue", RACLETTE: "Raclette", TAPAS: "Tapas", DUMPLINGS: "Dumplings", FRIED_CHICKEN: "Frittiertes Poulet", VEGETARIAN_DISHES: "vegetarische Gerichte", VEGAN_DISHES: "vegane Gerichte"
};
export const WORLD_OFFER_CONCEPTS: Readonly<Record<string, readonly string[]>> = {
    BEER: ["drinks"], CRAFT_BEER: ["drinks"], WINE: ["drinks"], NATURAL_WINE: ["drinks"], COCKTAILS: ["drinks"], NON_ALCOHOLIC_DRINKS: ["drinks"], SPIRITS: ["drinks"], COFFEE: ["coffee", "drinks"], TEA: ["drinks"],
    FULL_MEALS: ["meal"], TAKEAWAY_MEALS: ["meal"], TASTING_MENU: ["meal"], LUNCH: ["lunch", "meal"], DINNER: ["dinner", "meal"], BREAKFAST: ["breakfast", "meal"], BRUNCH: ["meal"], LATE_NIGHT_FOOD: ["meal"], SNACKS: ["snacks"],
};
// Exact pairs in the typed domain catalogue, not transformations of user prose.
for (const [token, label] of Object.entries(WORLD_VALUE_LABELS)) {
    const tokenTerm = librarianTerm(token), labelTerm = librarianTerm(label);
    const id = byTerm.get(labelTerm) ?? byTerm.get(tokenTerm) ?? `world-value:${token}`;
    if (byTerm.has(tokenTerm) && byTerm.get(tokenTerm) !== id)
        throw new Error("experience_language_token_collision");
    byTerm.set(tokenTerm, id);
    byTerm.set(labelTerm, id);
}
for (const c of concepts) {
    Object.freeze(c.labels);
    Object.freeze(c);
}
Object.freeze(concepts);
for (const values of Object.values(WORLD_OFFER_CONCEPTS))
    Object.freeze(values);
Object.freeze(WORLD_VALUE_LABELS);
Object.freeze(WORLD_OFFER_CONCEPTS);
export const EXPERIENCE_LANGUAGE_DATA = Object.freeze({ version: EXPERIENCE_LANGUAGE_VERSION, concepts, worldValueLabels: WORLD_VALUE_LABELS, worldOfferConcepts: WORLD_OFFER_CONCEPTS, offeringConcepts:OFFER_CONCEPTS, areaConcepts:AREA_CONCEPTS, booleanConcepts:BOOLEAN_CONCEPTS });
