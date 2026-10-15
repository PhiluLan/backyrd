import { SPOT_TYPE_CATALOG, OFFER_CATALOG, hasOfferModule, EXPERIENCE_VALUE_CHOICES, WORLD_VALUE_LABELS, type ExperienceCategory } from "@backyrd/world-knowledge-core";

export type ExperienceAnswerGuidance =
  | { readonly kind: "CHOICES"; readonly choices: readonly string[]; readonly help: string; readonly multiple?: boolean; readonly exclusiveGroups?: readonly (readonly string[])[] }
  | { readonly kind: "NAME"; readonly placeholder: string; readonly help: string };
const choice = (choices: readonly string[], help = "Wähle eine zutreffende Antwort. Weitere Angaben kannst du getrennt hinzufügen."): Extract<ExperienceAnswerGuidance, { kind: "CHOICES" }> => ({ kind: "CHOICES", choices, help, multiple: true });
const named = (placeholder: string, help: string): ExperienceAnswerGuidance => ({ kind: "NAME", placeholder, help });
const labels = (keys: readonly string[]) => keys.map(key => WORLD_VALUE_LABELS[key]).filter((value): value is string => typeof value === "string");
const cuisineKeys = ["ITALIAN","INDIAN","SWISS","FRENCH","JAPANESE","MEDITERRANEAN","ASIAN","GERMAN","AUSTRIAN","SPANISH","PORTUGUESE","GREEK","TURKISH","LEVANTINE","MIDDLE_EASTERN","CHINESE","THAI","VIETNAMESE","KOREAN","INDONESIAN","MALAYSIAN","MEXICAN","LATIN_AMERICAN","AMERICAN","AFRICAN","ETHIOPIAN","MOROCCAN","INTERNATIONAL","FUSION"];
const guidance: Readonly<Record<string, ExperienceAnswerGuidance>> = {
  "stay.check_in": named("Zum Beispiel 15:00", "Früheste reguläre Check-in-Zeit im Format HH:MM. Abweichungen getrennt mit ihren Bedingungen erfassen."),
  "stay.check_out": named("Zum Beispiel 11:00", "Späteste reguläre Check-out-Zeit im Format HH:MM."),
  "stay.room_type": choice(["Einzelzimmer", "Doppelzimmer", "Familienzimmer", "Mehrbettzimmer", "Suite", "Apartment", "Stellplatz", "Zeltunterkunft", "Hütte"]),
  "stay.meal_inclusion": choice(["Ohne Verpflegung", "Frühstück inklusive", "Halbpension", "Vollpension", "All inclusive"]),
  "sport.level": choice(["Anfänger", "Fortgeschrittene", "Alle Erfahrungsstufen"]),
  "sport.equipment": choice(["Kletterschuhe", "Sportkleidung", "Klettergurt", "Sicherungsgerät", "Eigene Ausrüstung erforderlich"], "Wähle nur die Ausrüstung, die für dieses konkrete Angebot benötigt wird. Leihmaterial und dessen Preis pflegst du separat."),
  "participation.format": choice(["Selbstständig", "Geführt", "Betreut"]),
  "participation.language": choice(["Deutsch", "Englisch", "Französisch", "Italienisch", "Spanisch", "Portugiesisch"]),
  "participation.age_suitability": choice(["Kinder", "Jugendliche", "Erwachsene", "Alle Altersgruppen"], "Dies ist eine Altersempfehlung. Zutrittsgrenzen werden dadurch nicht festgelegt."),
  "participation.prerequisite": choice(["Keine Vorkenntnisse", "Vorkenntnisse erforderlich", "Begleitung erforderlich"]),
  "participation.permission": choice(["Zutritt erlaubt", "Zutritt nicht erlaubt"], "Wähle die bestätigte Zutrittsregel. Besondere Zeiten oder Ausnahmen kannst du darunter ergänzen."),
  "participation.entry_mode": choice(["Ticket erforderlich", "Ohne Ticket zugänglich"], "Die Auswahl sagt nichts über den Preis aus. Preise pflegst du separat."),
  "participation.booking": choice(["Nicht erforderlich", "Empfohlen", "Erforderlich", "Keine Reservation möglich"]),
  "participation.consumption_obligation": choice(["Keine Mindestkonsumation", "Bestellpflicht", "Mindestkonsumation"]),
  "food.cuisine": choice(labels(cuisineKeys)),
  "food.drink": choice(labels(["BEER","CRAFT_BEER","WINE","NATURAL_WINE","COCKTAILS","NON_ALCOHOLIC_DRINKS","COFFEE","TEA","SPIRITS"])),
  "food.option": choice(["Glutenfreie Option", "Laktosefreie Option", "Zutateninformation verfügbar", "Anpassung auf Anfrage"], "Wähle nur tatsächlich bestätigte Optionen für dieses Angebot."),
  "condition.children": choice(["Kindermenü", "Kinderangebote", "Kinderbetreuung"]),
  "offer.service": choice(["Bedienung am Tisch", "Selbstbedienung"]),
  "condition.terrain": choice(["Ebener Weg", "Steigung", "Treppen", "Unebener Weg"]),
  "participation.accessibility": choice(["stufenfrei", "mit Kinderwagen zugänglich", "Zugang mit Stufen"]),
  "location.setting": choice(["drinnen", "draussen", "Innenstadt", "Park", "Wald", "Ländlich", "Am Wasser"]),
  "location.view": choice(["Wasserblick", "Stadtblick", "Parkblick", "Bergblick", "Waldblick"], "Wähle die tatsächlich sichtbare Aussicht. Die Nähe zu Wasser allein ist kein Wasserblick."),
  "atmosphere.privacy": choice(["Öffentlich", "Separater Bereich", "Privat buchbar"]),
  "atmosphere.conversation": choice(["Unterhaltung gut möglich", "Unterhaltung eingeschränkt"]),
  "offer.temperature": choice(["Beheizt", "Klimatisiert", "Unbeheizt"]),
  "offer.feature": choice(["WLAN", "Steckdosen", "Spielbereich", "Garderobe", "Schliessfächer", "Billardtisch", "Dartscheibe"]),
  "offer.usage": choice(["Sitzplätze", "Stehplätze", "Liegeplätze", "Arbeitsplätze"]),
  "travel.mode": choice(["ÖV", "Auto", "Zu Fuss", "Velo"]),
  "experience.theme": named("Zum Beispiel Dinosaurier", "Benenne ein einzelnes Thema, eine Tierart oder eine Sammlung. Erfasse weitere Themen getrennt."),
  "location.waterbody": named("Zum Beispiel Rhein", "Trage nur den Namen des Gewässers ein. Eine Aussicht oder Entfernung wird damit nicht bestätigt."),
};
const activitiesByCategory: Readonly<Partial<Record<ExperienceCategory, readonly string[]>>> = {
  RESTAURANT: ["essen gehen", "etwas trinken", "Kaffee", "Apéro", "private Feier"],
  BAR: ["etwas trinken", "Apéro", "essen gehen", "Musikveranstaltung", "private Feier"],
  ZOO: ["Zoo besuchen", "Tiere beobachten", "Führung", "essen gehen", "Kaffee"],
  SPORT: ["Bouldern", "Klettern", "Freies Training", "Kurs", "Kinderkurs", "Kaffee"],
  MUSEUM: ["Ausstellung besuchen", "Museum besuchen", "Führung", "Workshop", "Kaffee"],
};
export function experienceAnswerGuidance(key: string, category: ExperienceCategory, offerKind?: string, areaKind?: string, existingAnswers: Readonly<Record<string,unknown>> = {}): ExperienceAnswerGuidance | null {
  if (key === "participation.audience") {
    const stored=existingAnswers["classification.place_types"];
    const types=stored && typeof stored === "object" && "knowledgeState" in stored && stored.knowledgeState === "KNOWN_VALUE" && "value" in stored && Array.isArray(stored.value) ? stored.value : [];
    const stay=category === "STAY" || hasOfferModule(offerKind ?? "", "stay") || types.some(kind => SPOT_TYPE_CATALOG.some(type=>type.kind===kind && type.group === "STAY"));
    return {...choice(["Öffentlich zugänglich", ...(stay ? ["Nur für Hotelgäste"] : []), "Nur für Mitglieder", "Nur mit separater Buchung"], "Wähle, wer dieses konkrete Angebot nutzen darf."), multiple:false};
  }
  if (key === "food.dish") return named("Zum Beispiel Pad Thai", "Ein konkreter Gerichtname pro Eintrag, zum Beispiel Pad Thai. Weitere Gerichte einzeln ergänzen. Gespeichert wird der Name; längere Beschreibungen werden hier nicht automatisch in Eigenschaften wie vegan, günstig oder hochwertig übersetzt.");
  if (key === "participation.prerequisite") return { ...choice(["Keine Vorkenntnisse", "Vorkenntnisse erforderlich", "Begleitung erforderlich"]), kind: "CHOICES", multiple: true, exclusiveGroups: [["Keine Vorkenntnisse", "Vorkenntnisse erforderlich"]] };
  if (key === "sport.equipment" && offerKind === "BOULDERING") return choice(["Kletterschuhe", "Sportkleidung", "Eigene Ausrüstung erforderlich"], "Für das Bouldern benötigte Ausrüstung auswählen. Leihschuhe und ihren Preis pflegst du separat.");
  if (key === "condition.children") return choice(["LUNCH","DINNER","BREAKFAST","GASTRONOMY","FULL_MEAL","CAFE","APERITIF","DRINKS","PRIVATE_CELEBRATION"].includes(offerKind ?? "") || areaKind === "CAFE" ? ["Kindermenü", "Kinderportionen"] : ["Kinderangebote", "Kinderbetreuung"], "Nur bestätigte Angebote für Kinder auswählen. Die Auswahl bestätigt keine Zutritts- oder Altersregel.");
  if (key === "offer.feature") return choice(category === "SPORT" ? ["Schliessfächer", "Garderobe", "Umkleide", "Trainingsgeräte", "WLAN", "Steckdosen"] : category === "ZOO" ? ["Schliessfächer", "Garderobe", "WLAN", "Spielbereich"] : category === "MUSEUM" ? ["Schliessfächer", "Garderobe", "Audioguide", "WLAN", "Steckdosen"] : ["WLAN", "Steckdosen", "Garderobe", "Spielbereich", "Billardtisch", "Dartscheibe"]);
  if (key === "experience.theme") return named(category === "ZOO" || offerKind === "ANIMAL_OBSERVATION" ? "Zum Beispiel Pinguine" : "Zum Beispiel Naturgeschichte", category === "ZOO" || offerKind === "ANIMAL_OBSERVATION" ? "Eine Tierart oder ein Thema dieses Angebots. Weitere Tierarten getrennt ergänzen." : "Ein Thema oder eine Sammlung dieser Ausstellung. Weitere Themen getrennt ergänzen.");
  if(key==="experience.activity"){
    const item=OFFER_CATALOG.find(o=>o.kind===offerKind);
    const activities=hasOfferModule(offerKind??"","sport")||hasOfferModule(offerKind??"","movement") ? OFFER_CATALOG.filter(o=>o.modules.some(m=>m==="sport"||m==="movement")).flatMap(o=>o.activities) : item?.activities ?? activitiesByCategory[category] ?? [];
    return choice([...new Set([...(item?.activities??[]), ...activities])],"Wähle alle Tätigkeiten, die in diesem konkreten Angebot tatsächlich möglich sind. Tätigkeiten mit anderen Altersgrenzen, Preisen oder Bedingungen gehören in ein separates Angebot.");
  }
  const existing = EXPERIENCE_VALUE_CHOICES[key];
  const spec = existing ? choice(existing) : guidance[key] ?? null;
  const single = ["participation.booking", "participation.permission", "participation.entry_mode", "participation.consumption_obligation", "food.meal_extent", "atmosphere.noise", "atmosphere.conversation", "atmosphere.privacy", "sport.level", "participation.audience", "stay.meal_inclusion"];
  return spec?.kind === "CHOICES" ? { ...spec, multiple: !single.includes(key), help: single.includes(key) ? spec.help : "Mehrfachauswahl möglich. Wähle alle zutreffenden Antworten." } : spec;
}

export function experiencePriceIncludes(category: ExperienceCategory, offerKind: string): readonly string[] {
  if (["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "FULL_MEAL", "CAFE", "APERITIF", "DRINKS", "PRIVATE_CELEBRATION"].includes(offerKind)) return offerKind === "DRINKS" ? ["Getränke"] : offerKind === "APERITIF" ? ["Apéro", "Snacks", "Getränke"] : ["Essen", "Getränke", "Kaffee", "Snacks"];
  if (hasOfferModule(offerKind,"stay")) return ["Übernachtung", "Übernachtung mit Frühstück", "Tageszimmer", "Stellplatz"];
  if (category === "SPORT" || hasOfferModule(offerKind,"sport")) return ["Eintritt", "Kurs", "Leihmaterial"];
  return ["Eintritt", "Führung", "Workshop", "Veranstaltung"];
}
