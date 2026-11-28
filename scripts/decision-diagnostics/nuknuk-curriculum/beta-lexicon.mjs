/** Grounded Backyrd vocabulary exercises. All TRAIN; not independent everyday situations. */
import { SPOT_TYPE_CATALOG } from "../../../packages/world-knowledge-core/dist/index.js";
import { R, C, bundle } from "./beta-cases.mjs";
const ref = { now: "2026-11-24T10:00:00Z", timezone: "Europe/Zurich" };
export const lexiconFamilies = SPOT_TYPE_CATALOG.map((item) => ({
  id: "lexicon-venue-" + item.kind.toLowerCase(),
  theme: "lexicon",
  label: "Begriffszuordnung: Ortstypen",
  split: "TRAIN",
  custom: true,
  protectionGroup: "lexicon-venue-types",
  reference: ref,
  render: () => ({
    de: `Ich suche: ${item.label}.`,
    "de-CH": `Ich sueche: ${item.label}.`,
  }),
  target: () => bundle([R("offer.kind", item.kind)]),
  rubric:
    "Expliziten Ortstyp erhalten, keine Oberkategorie, Speise, Getränke, Öffnungszeit oder Preis erfinden.",
  tags: ["vocabulary", "venue-type"],
}));
const add = (id, label, query, ch, facts, rubric) =>
  lexiconFamilies.push({
    id: "lexicon-" + id,
    theme: "lexicon",
    label,
    split: "TRAIN",
    custom: true,
    protectionGroup: label,
    reference: ref,
    render: () => ({ de: query, "de-CH": ch }),
    target: () => bundle(facts),
    rubric,
    tags: ["vocabulary", "role-separation"],
  });
for (const [id, label] of [
  ["COFFEE", "Kaffee"],
  ["tea", "Tee"],
  ["BEER", "Bier"],
  ["WINE", "Wein"],
  ["water", "Wasser"],
  ["juice", "Fruchtsaft"],
])
  add(
    "drink-" + id,
    "Begriffszuordnung: Getränk",
    `Ich möchte ${label} trinken.`,
    `Ich möcht ${label} trinke.`,
    [R("food.drink", id.toLowerCase())],
    "Getränkesorte im kompakten Suchvertrag, kein erfundener Ortstyp.",
  );
for (const label of [
  "italienisch",
  "indisch",
  "japanisch",
  "mexikanisch",
  "thailändisch",
  "libanesisch",
  "griechisch",
  "türkisch",
  "äthiopisch",
  "koreanisch",
  "vietnamesisch",
  "Schweizer Küche",
])
  add(
    "cuisine-" +
      label
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
    "Begriffszuordnung: Küche",
    `Ich suche ein Restaurant, Küche: ${label}.`,
    `Ich sueche es Restaurant, Chuchi: ${label}.`,
    [R("offer.kind", "RESTAURANT"), R("food.cuisine", label)],
    "Ausdrücklich verlangte Küche erhalten; keine konkrete Speise oder Nationalität des Nutzers ableiten.",
  );
for (const [id, de, ch] of [
  ["billiards", "Billard spielen", "Billard spiele"],
  ["mini_golf", "Minigolf spielen", "Minigolf spiele"],
  ["table_tennis", "Tischtennis spielen", "Tischtennis spiele"],
  ["trampoline", "Trampolinspringen", "Trampolinspringe"],
  ["escape_room", "einen Escape Room spielen", "en Escape Room spiele"],
  ["live_jazz", "Live-Jazz hören", "Live-Jazz lose"],
  [
    "guided_tour",
    "eine geführte Besichtigung machen",
    "e gfüehrti Besichtigung mache",
  ],
  ["animal_observation", "Tiere beobachten", "Tier beobachte"],
  ["self_barbecue", "selber grillieren", "selber grilliere"],
  ["ceramics_course", "einen Töpferkurs besuchen", "en Töpferkurs bsueche"],
  ["ice_skating", "Schlittschuh laufen", "Schlittschueh laufe"],
  ["board_games", "Brettspiele spielen", "Brettspiel spiele"],
])
  add(
    "activity-" + id,
    "Begriffszuordnung: Aktivität",
    `Ich möchte ${de}.`,
    `Ich möcht ${ch}.`,
    [R(id === "live_jazz" ? "atmosphere.music" : "experience.activity", id)],
    "Gewünschte Aktivität nicht durch beliebige Gastronomie oder eine grobe Ortskategorie ersetzen.",
  );
for (const [id, de, ch] of [
  ["breakfast", "frühstücken", "zmörgele"],
  ["brunch", "brunchen", "brunche"],
  ["lunch", "zum Mittagessen gehen", "go zmittag ässe"],
  ["dinner", "zum Abendessen gehen", "go znacht ässe"],
  ["snacks", "einen Snack essen", "en Snack ässe"],
])
  add(
    "meal-" + id,
    "Begriffszuordnung: Mahlzeit",
    `Ich möchte ${de}.`,
    `Ich möcht ${ch}.`,
    [R("food.meal", id)],
    "Explizit genannte Mahlzeit erhalten; keine genaue Uhrzeit, Besuchsdatum oder zusätzliche Speise erfinden.",
  );
for (const dish of [
  "Pizza",
  "Pasta",
  "Sushi",
  "Raclette",
  "Fondue",
  "Salat",
  "Suppe",
  "Kuchen",
  "Glace",
  "Burger",
])
  add(
    "dish-" + dish.toLowerCase(),
    "Begriffszuordnung: Speise",
    `Ich möchte ${dish} essen.`,
    `Ich möcht ${dish} ässe.`,
    [R("food.dish", dish)],
    "Konkrete Speise erhalten; kein bestimmtes Restaurant, keine Preisgrenze oder zusätzliche Mahlzeit annehmen.",
  );
