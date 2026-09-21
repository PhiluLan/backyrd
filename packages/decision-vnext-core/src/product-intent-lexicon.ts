import type { ProductV1Intent } from "./product-v1-authority.js";

export const PRODUCT_INTENT_LEXICON_VERSION = "decision-vnext-product-intent-lexicon@3.0" as const;
export type ProductIntentConcept = Readonly<{ id: string; domain: string; intent: ProductV1Intent; aliases: readonly string[]; weight: number }>;
type Signal = Readonly<{ term: string; weight: number; conceptId: string; domain: string }>;

const concept = (intent: ProductV1Intent, domain: string, id: string, aliases: string, weight = 4): ProductIntentConcept => Object.freeze({
  id, domain, intent, weight, aliases: Object.freeze(aliases.split("|").map((value) => value.trim()).filter(Boolean)),
});

/**
 * Versioned Product language ontology. It identifies requested experiences;
 * it never proves that a spot offers an item and never ranks a spot. Those
 * decisions remain bound to canonical World Knowledge and the Product policy.
 */
export const PRODUCT_INTENT_ONTOLOGY: readonly ProductIntentConcept[] = Object.freeze([
  concept("COFFEE", "COFFEE_TEA", "coffee-general", "kaffee|coffee|café|cafe|kaffee trinken|kaffeetrinken|kaffeepause|käffchen|kaffi|käfeli|kafi|café besuchen|cafe besuchen"),
  concept("COFFEE", "COFFEE_TEA", "coffee-espresso", "espresso|doppio|ristretto|lungo|americano|café crème|cafe creme|schümli|schuemli"),
  concept("COFFEE", "COFFEE_TEA", "coffee-milk", "cappuccino|latte|latte macchiato|flat white|milchkaffee|café au lait|cafe au lait|cortado"),
  concept("COFFEE", "COFFEE_TEA", "coffee-filter", "filterkaffee|pour over|handfilter|aeropress|chemex|cold brew|nitro coffee"),
  concept("COFFEE", "COFFEE_TEA", "coffee-specialty", "specialty coffee|third wave coffee|kaffeerösterei|kaffeeroesterei|rösterei|roesterei|barista café|barista cafe"),
  concept("COFFEE", "COFFEE_TEA", "tea", "tee|tea|teestube|teeladen|teetrinken|chai|chai latte|matcha|matcha latte|grüntee|gruenttee|schwarztee|kräutertee|kraeutertee"),
  concept("COFFEE", "COFFEE_TEA", "cocoa", "heisse schokolade|heiße schokolade|hot chocolate|kakao|chocolat chaud"),

  concept("DRINKS", "BEER", "beer-general", "bier|beer|bier trinken|ein bier|bierchen|stange|herrgöttli|herrgoettli|kübel|kuebel|humpen"),
  concept("DRINKS", "BEER", "beer-lager", "lager|lagerbier|helles|helles bier|pils|pilsner|exportbier|zwickel|kellerbier"),
  concept("DRINKS", "BEER", "beer-wheat", "weizenbier|weissbier|weißbier|hefeweizen|witbier|blanche"),
  concept("DRINKS", "BEER", "beer-craft", "craft beer|craft bier|ipa|india pale ale|pale ale|double ipa|session ipa|stout|porter|sour beer|sauerbier|taproom|brauerei|brewery|bierdegustation"),
  concept("DRINKS", "WINE", "wine-general", "wein|wine|wein trinken|weinstube|weinbar|vinothek|weindegustation|weinprobe"),
  concept("DRINKS", "WINE", "wine-red", "rotwein|red wine|pinot noir|blauburgunder|merlot|cabernet|syrah|primitivo"),
  concept("DRINKS", "WINE", "wine-white", "weisswein|weißwein|white wine|riesling|sauvignon blanc|chardonnay|pinot gris|chasselas"),
  concept("DRINKS", "WINE", "wine-other", "rosé|rosewein|orange wine|naturwein|natural wine|schaumwein|prosecco|champagner|sekt|crémant|cremant"),
  concept("DRINKS", "COCKTAILS", "cocktails", "cocktail|cocktails|cocktailbar|mixology|longdrink|highball|martini|negroni|mojito|margarita|old fashioned|moscow mule|caipirinha|daiquiri"),
  concept("DRINKS", "COCKTAILS", "aperitif", "aperitif|apéro|apero|spritz|aperol spritz|hugo|vermouth|wermut|pastis|afterwork|feierabenddrink"),
  concept("DRINKS", "SPIRITS", "spirits", "spirituosen|schnaps|gin|gin tonic|whisky|whiskey|rum|tequila|mezcal|vodka|cognac|brandy|digestif"),
  concept("DRINKS", "NON_ALCOHOLIC", "mocktails", "mocktail|mocktails|alkoholfreier cocktail|virgin cocktail|alkoholfrei trinken|limonade|hausgemachte limo|kombucha"),
  concept("DRINKS", "BAR_NIGHTLIFE", "bar", "bar|pub|kneipe|beiz|stammbeiz|taverne|lounge|drink|drinks|etwas trinken|trinken gehen"),
  concept("DRINKS", "BAR_NIGHTLIFE", "nightlife", "nachtleben|nightlife|ausgehen|club|nachtclub|disco|diskothek|tanzen gehen|party|rave"),
  concept("DRINKS", "CIDER", "cider", "cider|cidre|most|saurer most|apfelwein"),

  concept("EAT", "FOOD_GENERAL", "eat-general", "essen|etwas essen|essen gehen|food|hunger|hungrig|mahlzeit|restaurant|lokal|gasthaus|gaststätte|gaststaette"),
  concept("EAT", "BREAKFAST_BRUNCH", "breakfast", "frühstück|fruehstueck|zmorge|morgenessen|breakfast|frühstücken|fruehstuecken|frühstücksbuffet|breakfast buffet"),
  concept("EAT", "BREAKFAST_BRUNCH", "brunch", "brunch|brunchen|sonntagsbrunch|brunchbuffet|bottomless brunch|spätstück|spaetstueck"),
  concept("EAT", "MEAL_TIME", "lunch", "mittagessen|mittag|lunch|zmittag|business lunch|mittagstisch|tagesmenü|tagesmenu"),
  concept("EAT", "MEAL_TIME", "dinner", "abendessen|dinner|nachtessen|znacht|supper|dinner date"),
  concept("EAT", "BAKERY_SWEETS", "bakery", "bäckerei|baeckerei|backstube|brot|brötchen|broetchen|gipfeli|croissant|focaccia|bagel|brezel|pretzel"),
  concept("EAT", "BAKERY_SWEETS", "patisserie", "konditorei|patisserie|pâtisserie|confiserie|törtchen|toertchen|torte|kuchen|cake|cupcake|muffin|gebäck|gebaeck"),
  concept("EAT", "BAKERY_SWEETS", "dessert", "dessert|nachspeise|süsses|suesses|süßspeise|suessspeise|crêpe|crepe|waffel|cheesecake|tiramisu|panna cotta"),
  concept("EAT", "BAKERY_SWEETS", "ice-cream", "glace|glacé|eiscreme|ice cream|gelato|sorbet|eisdiele|gelateria"),
  concept("EAT", "ITALIAN", "pizza", "pizza|pizzeria|neapolitanische pizza|pizza napoletana|pinsa|flammkuchen"),
  concept("EAT", "ITALIAN", "pasta", "pasta|nudeln|spaghetti|tagliatelle|penne|ravioli|tortellini|lasagne|gnocchi|carbonara|bolognese"),
  concept("EAT", "ITALIAN", "italian", "italienisch essen|italienisches restaurant|osteria|trattoria|ristorante|risotto|polenta|antipasti"),
  concept("EAT", "JAPANESE", "sushi", "sushi|sashimi|nigiri|maki|uramaki|temaki|omakase|sushi bar"),
  concept("EAT", "JAPANESE", "ramen", "ramen|ramen nudeln|ramenbar|ramen bar|tonkotsu|shoyu ramen|miso ramen|tantanmen"),
  concept("EAT", "JAPANESE", "japanese-other", "japanisch essen|japanisches restaurant|izakaya|yakitori|udon|soba|tempura|okonomiyaki|takoyaki|donburi|katsu|teriyaki"),
  concept("EAT", "CHINESE", "chinese", "chinesisch essen|chinesisches restaurant|dim sum|dumplings|jiaozi|bao|baozi|wonton|hotpot|hot pot|pekingente|szechuan|sichuan"),
  concept("EAT", "KOREAN", "korean", "koreanisch essen|koreanisches restaurant|kimchi|bibimbap|bulgogi|korean bbq|koreanisches barbecue|tteokbokki|japchae"),
  concept("EAT", "SOUTHEAST_ASIAN", "thai", "thai essen|thailändisch|thailaendisch|pad thai|tom yum|tom kha|grünes curry|gruenes curry|massaman|som tam"),
  concept("EAT", "SOUTHEAST_ASIAN", "vietnamese", "vietnamesisch essen|vietnamesisches restaurant|pho|bánh mì|banh mi|bun bo|sommerrollen|goi cuon"),
  concept("EAT", "SOUTHEAST_ASIAN", "other-se-asian", "indonesisch essen|nasi goreng|satay|malaysisch essen|laksa|singapurisch essen|philippinisch essen"),
  concept("EAT", "SOUTH_ASIAN", "indian", "indisch essen|indisches restaurant|curry|butter chicken|tikka masala|biryani|naan|dosa|samosa|tandoori|dal|thali"),
  concept("EAT", "MIDDLE_EASTERN", "levantine", "levantinisch essen|libanesisch essen|mezze|hummus|falafel|shawarma|schawarma|taboulé|taboule|manakish|fattoush"),
  concept("EAT", "MIDDLE_EASTERN", "turkish", "türkisch essen|tuerkisch essen|kebab|kebap|döner|doener|dürüm|dueruem|pide|lahmacun|köfte|koefte|börek|boerek"),
  concept("EAT", "MEXICAN_LATIN", "mexican", "mexikanisch essen|taco|tacos|burrito|quesadilla|nachos|enchilada|guacamole|taqueria|chilaquiles|tamales"),
  concept("EAT", "MEXICAN_LATIN", "latin-american", "lateinamerikanisch essen|peruanisch essen|ceviche|arepa|empanada|argentinisch essen|brasilianisch essen|churrasco"),
  concept("EAT", "BURGERS_FAST_FOOD", "burger", "burger|hamburger|cheeseburger|smash burger|veggie burger|chicken burger|burgerladen"),
  concept("EAT", "BURGERS_FAST_FOOD", "street-food", "street food|strassenessen|straßenessen|food truck|imbiss|snack|schnell etwas essen|fast food|hotdog|hot dog"),
  concept("EAT", "MEAT_GRILL", "steak-grill", "steak|steakhouse|grill|grillrestaurant|barbecue|bbq|smoker|ribs|spareribs|pulled pork|grillteller"),
  concept("EAT", "SEAFOOD", "seafood", "fisch|seafood|meeresfrüchte|meeresfruechte|austern|oysters|muscheln|fish and chips|fischrestaurant"),
  concept("EAT", "VEGETARIAN_HEALTHY", "vegetarian", "vegetarisch essen|vegetarisches restaurant|veggie|fleischlos|plant based|pflanzenbasiert"),
  concept("EAT", "VEGETARIAN_HEALTHY", "vegan", "vegan essen|veganes restaurant|rein pflanzlich|plant-based restaurant"),
  concept("EAT", "VEGETARIAN_HEALTHY", "healthy", "gesund essen|healthy food|salat|salatbar|bowl|poké|poke bowl|acai bowl|smoothie bowl|superfood"),
  concept("EAT", "EUROPEAN_REGIONAL", "swiss", "schweizerisch essen|schweizer küche|schweizer kueche|fondue|käsefondue|kaesefondue|raclette|rösti|roesti|cordon bleu|älplermagronen|aelplermagronen"),
  concept("EAT", "EUROPEAN_REGIONAL", "central-europe", "deutsch essen|österreichisch essen|oesterreichisch essen|schnitzel|wiener schnitzel|knödel|knoedel|spätzle|spaetzle"),
  concept("EAT", "EUROPEAN_REGIONAL", "french", "französisch essen|franzoesisch essen|bistro|brasserie|crêperie|creperie|quiche|coq au vin|bouillabaisse"),
  concept("EAT", "EUROPEAN_REGIONAL", "iberian", "spanisch essen|tapas|paella|pintxos|portugiesisch essen|bacalhau|petiscos"),
  concept("EAT", "EUROPEAN_REGIONAL", "greek-balkan", "griechisch essen|souvlaki|gyros|moussaka|balkan essen|cevapcici|ćevapčići|burek"),
  concept("EAT", "AFRICAN", "african", "afrikanisch essen|äthiopisch essen|aethiopisch essen|injera|eritreisch essen|marokkanisch essen|tajine|couscous|westafrikanisch essen"),

  concept("SPORT_MOVEMENT", "RACKET_SPORTS", "table-tennis", "ping pong|pingpong|ping-pong|tischtennis|tischtennis spielen|pingpöngle|pingpoengle"),
  concept("SPORT_MOVEMENT", "RACKET_SPORTS", "racket", "tennis|tennis spielen|padel|padel tennis|pickleball|squash|badminton|federball"),
  concept("SPORT_MOVEMENT", "CLIMBING", "climbing", "klettern|climbing|kletterhalle|sportklettern|seilklettern|klettersteig|bouldern|bouldering|boulderhalle|boulder gym"),
  concept("SPORT_MOVEMENT", "FITNESS", "gym", "fitness|fitnessstudio|gym|krafttraining|gewichtheben|bodybuilding|crossfit|functional training|workout|trainieren"),
  concept("SPORT_MOVEMENT", "FITNESS", "mind-body", "yoga|pilates|stretching|mobility training|qi gong|qigong|tai chi"),
  concept("SPORT_MOVEMENT", "RUNNING_WALKING", "running", "joggen|running|laufen gehen|dauerlauf|trailrunning|trail running|jogging|laufrunde|walken|nordic walking"),
  concept("SPORT_MOVEMENT", "CYCLING", "cycling", "radfahren|velofahren|velo fahren|cycling|rennrad|mountainbike|mountainbiken|biken|fahrradtour|velotour"),
  concept("SPORT_MOVEMENT", "WATER_SPORTS", "swimming", "schwimmen|swimming|hallenbad|freibad|schwimmbad|bahnen schwimmen|planschen"),
  concept("SPORT_MOVEMENT", "WATER_SPORTS", "water-sports", "kajak|kayak|kanu|stand up paddling|stand-up-paddling|sup|rudern|rowing|segeln|windsurfen|kitesurfen"),
  concept("SPORT_MOVEMENT", "TEAM_SPORTS", "team-sports", "fussball|fußball|soccer|kicken|futsal|basketball|volleyball|beachvolleyball|handball|unihockey|floorball"),
  concept("SPORT_MOVEMENT", "WINTER_SPORTS", "winter-sports", "ski fahren|skifahren|snowboarden|langlauf|schlitteln|rodeln|eislaufen|schlittschuhlaufen|curling|schneeschuhwandern"),
  concept("SPORT_MOVEMENT", "WHEELS", "skating", "skaten|skateboard|skateboarden|inline skaten|inlineskaten|rollschuhlaufen|bmx"),
  concept("SPORT_MOVEMENT", "DANCE_COMBAT", "dance-combat", "tanzen|tanzkurs|salsa tanzen|bachata|tango|boxen|kickboxen|judo|karate|taekwondo|jiu jitsu|fechten|kampfsport"),

  concept("NATURE_ANIMAL_EXPERIENCE", "PARK_FOREST", "park-forest", "park|stadtpark|grünanlage|gruenanlage|wiese|im grünen|im gruenen|wald|forst|waldspaziergang|naturpfad|waldweg|baumwipfelpfad"),
  concept("NATURE_ANIMAL_EXPERIENCE", "WALK_HIKE", "walk-hike", "spaziergang|spazieren|spazieren gehen|walk|flanieren|wandern|wanderung|hiking|bergwanderung|rundwanderung|wanderweg|trekking"),
  concept("NATURE_ANIMAL_EXPERIENCE", "WATER_NATURE", "lake-river", "see|fluss|rhein|ufer|seeufer|flussufer|badi|am wasser|wasserfall|bach|schlucht"),
  concept("NATURE_ANIMAL_EXPERIENCE", "MOUNTAIN_VIEW", "mountain-view", "berg|berge|gipfel|alpen|aussicht|aussichtspunkt|viewpoint|panorama|sonnenuntergang anschauen|sonnenaufgang anschauen"),
  concept("NATURE_ANIMAL_EXPERIENCE", "ANIMALS", "zoo-aquarium", "zoo|tierpark|wildpark|tiergarten|safaripark|aquarium|ozeaneum|sea life|unterwasserwelt"),
  concept("NATURE_ANIMAL_EXPERIENCE", "ANIMALS", "animal-encounter", "tiere anschauen|tierbeobachtung|vogelbeobachtung|birdwatching|bauernhof besuchen|ponyhof|alpaka wanderung"),
  concept("NATURE_ANIMAL_EXPERIENCE", "GARDENS", "botanical", "botanischer garten|botanical garden|pflanzengarten|rosengarten|arboretum|tropenhaus|gewächshaus|gewaechshaus"),
  concept("NATURE_ANIMAL_EXPERIENCE", "NATURE_GENERAL", "nature", "natur|draussen|draußen|outdoor|frische luft|ins freie|naturerlebnis|naturreservat|naturpark|naturschutzgebiet"),
  concept("NATURE_ANIMAL_EXPERIENCE", "PICNIC", "picnic", "picknick|picnic|draussen essen|draußen essen|grillplatz|feuerstelle|bräteln|braeteln"),

  concept("CULTURE_ART", "MUSEUMS", "museum", "museum|museen|museum besuchen|kunsthaus|sammlung|museumsbesuch|naturhistorisches museum|historisches museum|technikmuseum|wissenschaftsmuseum|science center"),
  concept("CULTURE_ART", "VISUAL_ART", "gallery", "galerie|gallery|kunstausstellung|ausstellung|exhibition|vernissage|kunst anschauen|zeitgenössische kunst|zeitgenoessische kunst"),
  concept("CULTURE_ART", "PERFORMING_ARTS", "theatre", "theater|schauspiel|bühne|buehne|theaterstück|theaterstueck|musical|improtheater|kabarett|oper|operette|ballett|tanztheater"),
  concept("CULTURE_ART", "MUSIC", "concert", "konzert|concert|livemusik|live musik|gig|klassikkonzert|kammermusik|symphonie|orchester|jazzkonzert|rockkonzert|jazzclub|konzerthaus|musikfestival"),
  concept("CULTURE_ART", "LITERATURE", "literature", "lesung|buchhandlung|bibliothek|literaturhaus|poetry slam|spoken word|autorengespräch|autorengespraech"),
  concept("CULTURE_ART", "ARCHITECTURE_HISTORY", "architecture", "architektur|historisches gebäude|historisches gebaeude|altstadt|baudenkmal|denkmal|kirche besichtigen|schloss besichtigen|burg besichtigen"),
  concept("CULTURE_ART", "KNOWLEDGE", "planetarium", "planetarium|sternwarte|observatorium|astronomie|sterne beobachten"),
  concept("CULTURE_ART", "CULTURE_GENERAL", "culture", "kultur|kulturell|kulturprogramm|kultur erleben|kulturausflug"),

  concept("ACTIVITY_EXPERIENCE", "GAMES", "escape-room", "escape room|escaperoom|escape game|rätselraum|raetselraum|exit game"),
  concept("ACTIVITY_EXPERIENCE", "GAMES", "bowling", "bowling|bowlen|kegeln|kegelbahn"),
  concept("ACTIVITY_EXPERIENCE", "GAMES", "billiards-darts", "billard|poolbillard|pool spielen|snooker|darts|dart spielen|dartbar|töggelen|toeggelen|tischfussball|tischfußball"),
  concept("ACTIVITY_EXPERIENCE", "GAMES", "mini-golf", "minigolf|mini golf|schwarzlicht minigolf|crazy golf"),
  concept("ACTIVITY_EXPERIENCE", "GAMES", "arcade-gaming", "arcade|spielhalle|flipper|pinball|gaming|videospiele|virtual reality|vr game|vr erlebnis|esports"),
  concept("ACTIVITY_EXPERIENCE", "ENTERTAINMENT", "cinema-karaoke", "kino|cinema|film schauen|ins kino|openair kino|programmkino|karaoke|karaoke bar|singen gehen|karaoke box"),
  concept("ACTIVITY_EXPERIENCE", "ENTERTAINMENT", "comedy", "comedy|stand up comedy|stand-up-comedy|comedy club|impro show|zaubershow|magie show"),
  concept("ACTIVITY_EXPERIENCE", "CREATIVE", "creative", "töpfern|toepfern|keramik bemalen|keramikkurs|malkurs|zeichnen|zeichenkurs|kreativworkshop|basteln|fotoworkshop"),
  concept("ACTIVITY_EXPERIENCE", "CREATIVE", "cooking-course", "kochkurs|backkurs|cocktailkurs|baristakurs|sushikurs|pastakurs|kulinarischer workshop"),
  concept("ACTIVITY_EXPERIENCE", "ADVENTURE", "action", "go kart|gokart|kartbahn|kart fahren|laser tag|lasertag|paintball|trampolin|trampolinpark|hochseilgarten|seilpark|zipline"),
  concept("ACTIVITY_EXPERIENCE", "ADVENTURE", "theme-park", "freizeitpark|vergnügungspark|vergnuegungspark|achterbahn|funpark|erlebnispark"),
  concept("ACTIVITY_EXPERIENCE", "WELLNESS", "wellness", "spa|wellness|wellnessen|thermalbad|therme|hamam|dampfbad|whirlpool|sauna|saunieren|massage|day spa"),
  concept("ACTIVITY_EXPERIENCE", "FAMILY", "family-play", "spielplatz|indoorspielplatz|familienzentrum|kinderland|mit kindern spielen|familienaktivität|familienaktivitaet"),
  concept("ACTIVITY_EXPERIENCE", "TOURS_MARKETS", "tour-market", "stadtführung|stadtfuehrung|führung|fuehrung|rundgang|food tour|walking tour|markt|wochenmarkt|flohmarkt|designmarkt|weihnachtsmarkt"),
  concept("ACTIVITY_EXPERIENCE", "ACTIVITY_GENERAL", "activity", "aktivität|aktivitaet|erlebnis|etwas unternehmen|unternehmen|ausflug|freizeitaktivität|freizeitaktivitaet", 1),
]);

export const PRODUCT_INTENT_DOMAINS = Object.freeze([...new Set(PRODUCT_INTENT_ONTOLOGY.map(({ domain }) => domain))].sort());
export const PRODUCT_INTENT_LEXICON: Readonly<Record<ProductV1Intent, readonly Signal[]>> = Object.freeze(
  PRODUCT_INTENT_ONTOLOGY.reduce((result, row) => {
    result[row.intent].push(...row.aliases.map((term) => Object.freeze({ term, weight: row.weight, conceptId: row.id, domain: row.domain })));
    return result;
  }, { EAT: [], COFFEE: [], DRINKS: [], SPORT_MOVEMENT: [], NATURE_ANIMAL_EXPERIENCE: [], CULTURE_ART: [], ACTIVITY_EXPERIENCE: [] } as Record<ProductV1Intent, Signal[]>),
);

const fold = (value: string): string => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("de-CH").replaceAll("ß", "ss").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll(" ", "\\s+");
const negatedBefore = (text: string, index: number): boolean => {
  const window = text.slice(Math.max(0, index - 55), index).trimEnd(); const contrast = window.split(/\b(?:sondern|aber|lieber|stattdessen|dafur)\b/u).at(-1) ?? "";
  return /(?:^|\s)(?:kein(?:e|en|er|es)?|ohne|nicht|weder)(?:\s+[a-z0-9]+){0,3}$/u.test(contrast.trim());
};
function matches(text: string, termValue: string): boolean {
  const matcher = new RegExp(`(?:^|\\s)${escaped(fold(termValue))}(?=$|\\s)`, "gu");
  for (const match of text.matchAll(matcher)) { const index = (match.index ?? 0) + (match[0].startsWith(" ") ? 1 : 0); if (!negatedBefore(text, index)) return true; }
  return false;
}

export type ProductIntentInference = Readonly<{ primaryIntent: ProductV1Intent | null; matchedConceptIds: readonly string[]; matchedDomains: readonly string[]; ambiguousIntents: readonly ProductV1Intent[] }>;
export function resolveProductV1Intent(value: string): ProductIntentInference {
  const text = fold(value); if (!text) return Object.freeze({ primaryIntent: null, matchedConceptIds: [], matchedDomains: [], ambiguousIntents: [] });
  const hits = PRODUCT_INTENT_ONTOLOGY.flatMap((row) => row.aliases.filter((alias) => matches(text, alias)).map((alias) => ({ row, alias: fold(alias) })));
  // A phrase such as "Sushi Bar" is stronger than the contained generic
  // token "Bar". Independent signals such as "Bier und Tacos" remain tied.
  const specificHits = hits.filter((hit) => !hits.some((other) => other.alias.length > hit.alias.length && ` ${other.alias} `.includes(` ${hit.alias} `)));
  const matched = [...new Map(specificHits.map(({ row }) => [row.id, row])).values()];
  const scored = (Object.keys(PRODUCT_INTENT_LEXICON) as ProductV1Intent[]).map((intent) => ({ intent, score: matched.filter((row) => row.intent === intent).reduce((sum, row) => sum + row.weight, 0) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.intent.localeCompare(b.intent));
  const top = scored[0]?.score ?? 0; const ambiguousIntents = scored.filter(({ score }) => score === top).map(({ intent }) => intent);
  return Object.freeze({ primaryIntent: ambiguousIntents.length === 1 ? (ambiguousIntents[0] ?? null) : null, matchedConceptIds: Object.freeze(matched.map(({ id }) => id).sort()), matchedDomains: Object.freeze([...new Set(matched.map(({ domain }) => domain))].sort()), ambiguousIntents: Object.freeze(ambiguousIntents) });
}
export function inferProductV1Intent(value: string): ProductV1Intent | null { return resolveProductV1Intent(value).primaryIntent; }
