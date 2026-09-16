/**
 * Canonical local Founder-evaluation input shared by World authoring and Decision
 * regression fixtures. It is not a Product taxonomy or Production authority.
 */
export const SLICE4B_FOUNDER_CONTEXT_OBSERVED_AT = "2026-09-15T17:00:00.000Z";

const emptyConditions = { dayparts: [], days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: null };

export const SLICE4B_FOUNDER_CONTEXT_ENTRIES = Object.freeze([
  { id: "1101ee26-5046-4cdc-921a-5a3bd4cb5306", name: "Volta Bräu", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "EAT_DRINK"],
    ["context.typical_dayparts", "KNOWN_VALUE", [{ daypart: "EVENING", conditions: { days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }]],
    ["context.visit_situations", "UNKNOWN", null], ["context.atmosphere", "UNKNOWN", null],
  ] },
  { id: "57cb213c-9472-40b6-80be-a810fd77b7c9", name: "ELYS Boulderloft", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "SPORT_MOVEMENT"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "KIDS_PLAY_AREA", relationship: "PART_OF_SPOT", area: "Bewegungslandschaft" }, { kind: "CAFE", relationship: "EMBEDDED_FACILITY", area: "Familien-Bistro" }]],
    ["context.visit_situations", "KNOWN_VALUE", [{ situation: "FAMILY", conditions: { ...emptyConditions, ageContext: "MIXED_AGES", accompaniment: "ADULT" } }]],
    ["context.atmosphere", "UNKNOWN", null], ["context.typical_dayparts", "UNKNOWN", null],
  ] },
  { id: "f8ae8625-aa9c-4647-9af5-c981fc40854a", name: "Tierpark Lange Erlen", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "NATURE_ANIMAL_EXPERIENCE"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "KIOSK", relationship: "EMBEDDED_FACILITY", area: null }, { kind: "KIDS_PLAY_AREA", relationship: "PART_OF_SPOT", area: "Spielplatz" }]],
    ["context.visit_situations", "KNOWN_VALUE", [{ situation: "FAMILY", conditions: { ...emptyConditions, ageContext: "MIXED_AGES", accompaniment: "ADULT" } }]],
    ["context.typical_dayparts", "KNOWN_VALUE", [{ daypart: "MORNING", conditions: { days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }, { daypart: "AFTERNOON", conditions: { days: [], area: null, occasion: null, groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }]],
    ["context.atmosphere", "UNKNOWN", null],
  ] },
  { id: "ff90b2f4-0c51-4423-adb5-e9a0ad22213e", name: "Consum Weinbar", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "EAT_DRINK"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "HOTEL", relationship: "EMBEDDED_FACILITY", area: null }]],
    ["context.visit_situations", "UNKNOWN", null], ["context.atmosphere", "UNKNOWN", null], ["context.typical_dayparts", "UNKNOWN", null],
  ] },
  { id: "644fbd15-91f8-4ab7-8a4b-dbe06622d148", name: "Café Frühling", values: [
    ["purpose.primary_visit", "KNOWN_VALUE", "EAT_DRINK"],
    ["offering.onsite", "KNOWN_VALUE", [{ kind: "SHOP", relationship: "PART_OF_SPOT", area: null }]],
    ["context.typical_dayparts", "KNOWN_VALUE", [{ daypart: "MORNING", conditions: { days: [], area: null, occasion: "Frühstück", groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }, { daypart: "MIDDAY", conditions: { days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"], area: null, occasion: "Mittagessen", groupSize: null, ageContext: null, accompaniment: null, eventMode: "NORMAL_OPERATION" } }]],
    ["context.visit_situations", "UNKNOWN", null], ["context.atmosphere", "UNKNOWN", null],
  ] },
]);
