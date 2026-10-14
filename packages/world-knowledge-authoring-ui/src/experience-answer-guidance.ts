import { EXPERIENCE_VALUE_CHOICES, WORLD_VALUE_LABELS, type ExperienceCategory } from "@backyrd/world-knowledge-core";

export type ExperienceAnswerGuidance =
  | { readonly kind: "CHOICES"; readonly choices: readonly string[]; readonly help: string }
  | { readonly kind: "NAME"; readonly placeholder: string; readonly help: string };
const choice = (choices: readonly string[], help = "Wähle eine zutreffende Antwort. Weitere Angaben kannst du getrennt hinzufügen."): ExperienceAnswerGuidance => ({ kind: "CHOICES", choices, help });
const named = (placeholder: string, help: string): ExperienceAnswerGuidance => ({ kind: "NAME", placeholder, help });
const labels = (keys: readonly string[]) => keys.map(key => WORLD_VALUE_LABELS[key]).filter((value): value is string => typeof value === "string");
const cuisineKeys = ["ITALIAN","INDIAN","SWISS","FRENCH","JAPANESE","MEDITERRANEAN","ASIAN","GERMAN","AUSTRIAN","SPANISH","PORTUGUESE","GREEK","TURKISH","LEVANTINE","MIDDLE_EASTERN","CHINESE","THAI","VIETNAMESE","KOREAN","INDONESIAN","MALAYSIAN","MEXICAN","LATIN_AMERICAN","AMERICAN","AFRICAN","ETHIOPIAN","MOROCCAN","INTERNATIONAL","FUSION"];
const guidance: Readonly<Record<string, ExperienceAnswerGuidance>> = {
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
  "location.setting": choice(["Innenstadt", "Park", "Wald", "Ländlich", "Am Wasser"]),
  "location.view": choice(["Wasserblick", "Stadtblick", "Parkblick", "Bergblick", "Waldblick"], "Wähle die tatsächlich sichtbare Aussicht. Die Nähe zu Wasser allein ist kein Wasserblick."),
  "atmosphere.privacy": choice(["Öffentlich", "Separater Bereich", "Privat buchbar"]),
  "atmosphere.conversation": choice(["Unterhaltung gut möglich", "Unterhaltung eingeschränkt"]),
  "offer.temperature": choice(["Beheizt", "Klimatisiert", "Unbeheizt"]),
  "offer.feature": choice(["WLAN", "Steckdosen", "Spielbereich", "Garderobe", "Schliessfächer", "Billardtisch", "Dartscheibe"]),
  "offer.usage": choice(["Sitzplätze", "Stehplätze", "Liegeplätze", "Arbeitsplätze"]),
  "travel.mode": choice(["ÖV", "Auto", "Zu Fuss", "Velo"]),
  "experience.theme": named("Zum Beispiel Dinosaurier", "Benenne ein einzelnes Thema, eine Tierart oder eine Sammlung. Erfasse weitere Themen getrennt."),
  "food.dish": named("Zum Beispiel Apéroplättli", "Benenne ein einzelnes Gericht oder eine Spezialität. Getränke und Qualitätsbeschreibungen gehören nicht in dieses Feld."),
  "location.waterbody": named("Zum Beispiel Rhein", "Trage nur den Namen des Gewässers ein. Eine Aussicht oder Entfernung wird damit nicht bestätigt."),
};
const activitiesByCategory: Readonly<Record<ExperienceCategory, readonly string[]>> = {
  RESTAURANT: ["essen gehen", "etwas trinken", "Kaffee", "Apéro", "private Feier"],
  BAR: ["etwas trinken", "Apéro", "essen gehen", "Musikveranstaltung", "private Feier"],
  ZOO: ["Zoo besuchen", "Tiere beobachten", "Führung", "essen gehen", "Kaffee"],
  SPORT: ["Bouldern", "Klettern", "Freies Training", "Kurs", "Kinderkurs", "Kaffee"],
  MUSEUM: ["Ausstellung besuchen", "Museum besuchen", "Führung", "Workshop", "Kaffee"],
};
const activitiesByOffer: Readonly<Record<string, readonly string[]>> = {
  BOULDERING:["Bouldern"], CLIMBING:["Klettern"], TRAINING:["Freies Training"], COURSE:["Kurs"], CHILDREN_COURSE:["Kinderkurs"], MOVEMENT_PLAY:["Bewegungsspiel"],
  LUNCH:["essen gehen"], DINNER:["essen gehen"], BREAKFAST:["essen gehen"], FULL_MEAL:["essen gehen"], GASTRONOMY:["essen gehen","etwas trinken","Kaffee"],
  APERITIF:["Apéro","etwas trinken"], DRINKS:["etwas trinken"], CAFE:["Kaffee","etwas trinken"],
  GUIDED_TOUR:["Führung"], WORKSHOP:["Workshop"], ANIMAL_OBSERVATION:["Tiere beobachten"],
  PERMANENT_EXHIBITION:["Ausstellung besuchen"], SPECIAL_EXHIBITION:["Ausstellung besuchen"], SELF_GUIDED_VISIT:["Museum besuchen"],
  PRIVATE_CELEBRATION:["private Feier"], MUSIC_EVENT:["Musikveranstaltung"],
};
export function experienceAnswerGuidance(key: string, category: ExperienceCategory, offerKind?: string, areaKind?: string): ExperienceAnswerGuidance | null {
  if (key === "sport.equipment" && offerKind === "BOULDERING") return choice(["Kletterschuhe", "Sportkleidung", "Eigene Ausrüstung erforderlich"], "Für das Bouldern benötigte Ausrüstung auswählen. Leihschuhe und ihren Preis pflegst du separat.");
  if (key === "condition.children") return choice(["LUNCH","DINNER","BREAKFAST","GASTRONOMY","FULL_MEAL","CAFE","APERITIF","DRINKS","PRIVATE_CELEBRATION"].includes(offerKind ?? "") || areaKind === "CAFE" ? ["Kindermenü", "Kinderportionen"] : ["Kinderangebote", "Kinderbetreuung"], "Nur bestätigte Angebote für Kinder auswählen. Die Auswahl bestätigt keine Zutritts- oder Altersregel.");
  if (key === "offer.feature") return choice(category === "SPORT" ? ["Schliessfächer", "Garderobe", "Umkleide", "Trainingsgeräte", "WLAN", "Steckdosen"] : category === "ZOO" ? ["Schliessfächer", "Garderobe", "WLAN", "Spielbereich"] : category === "MUSEUM" ? ["Schliessfächer", "Garderobe", "Audioguide", "WLAN", "Steckdosen"] : ["WLAN", "Steckdosen", "Garderobe", "Spielbereich", "Billardtisch", "Dartscheibe"]);
  if (key === "experience.theme") return named(category === "ZOO" ? "Zum Beispiel Pinguine" : "Zum Beispiel Design", category === "ZOO" ? "Eine Tierart oder ein Thema dieses Angebots. Weitere Tierarten getrennt ergänzen." : "Ein Thema oder eine Sammlung dieser Ausstellung. Weitere Themen getrennt ergänzen.");
  if (key === "experience.activity") return choice(offerKind === "VISIT" && category === "ZOO" ? ["Zoo besuchen"] : (offerKind && activitiesByOffer[offerKind]) || activitiesByCategory[category], "Wähle eine Tätigkeit für dieses Angebot. Speisen und Getränke erfasst du in ihren eigenen Angaben.");
  const existing = EXPERIENCE_VALUE_CHOICES[key];
  return existing ? choice(existing) : guidance[key] ?? null;
}
export const EXPERIENCE_PRICE_INCLUDES = ["Essen", "Getränke", "Kaffee", "Eintritt", "Snacks", "Apéro"] as const;

export function experiencePriceIncludes(category: ExperienceCategory, offerKind: string): readonly string[] {
  if (["LUNCH", "DINNER", "BREAKFAST", "GASTRONOMY", "FULL_MEAL", "CAFE", "APERITIF", "DRINKS", "PRIVATE_CELEBRATION"].includes(offerKind)) return offerKind === "DRINKS" ? ["Getränke"] : offerKind === "APERITIF" ? ["Apéro", "Snacks", "Getränke"] : ["Essen", "Getränke", "Kaffee", "Snacks"];
  if (category === "SPORT") return ["Eintritt", "Kurs", "Leihmaterial"];
  return ["Eintritt", "Führung", "Workshop", "Veranstaltung"];
}
