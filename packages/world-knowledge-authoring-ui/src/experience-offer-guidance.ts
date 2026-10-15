import { OFFER_CATALOG, emptyExperienceConditions, type ExperienceProperty } from "@backyrd/world-knowledge-core";

// Authoring choices project the existing storage contract. Legacy kinds remain readable.
export const offerLabel = (kind: string, fallback: string): string => kind === "FULL_MEAL" ? "Essen (ohne Trennung nach Mahlzeit)" : fallback;
export const selectableOffers = OFFER_CATALOG.filter(offer => offer.kind !== "GASTRONOMY");
export const clubOfferChoice = { kind: "EVENT", label: "Clubabend / Tanzen", choiceId: "CLUB_NIGHT" } as const;
export const clubActivity = (): ExperienceProperty => ({key:"experience.activity",label:null,state:"KNOWN",value:"Tanzen",conditions:emptyExperienceConditions()});
export const offerHelp = (kind: string): string => kind === "OTHER"
 ? "Für eine Leistung, die im Katalog fehlt. Vergib einen konkreten Namen und ergänze die angebotenen Tätigkeiten. Der Name allein wird nicht automatisch in Eigenschaften übersetzt."
 : kind === "MUSIC_EVENT" ? "Ein Musikereignis, zum Beispiel ein Konzert. Für Clubbetrieb mit Tanzfläche wähle stattdessen Clubabend / Tanzen."
 : kind === "FULL_MEAL" || kind === "GASTRONOMY" ? "Allgemeines Essensangebot, wenn du es nicht nach Frühstück, Mittagessen oder Abendessen trennst. Nicht zusätzlich für dieselben Mahlzeiten anlegen."
 : "Ergänze hier nur Angaben zu dieser Leistung. Gemeinsame Räume und deren Ausstattung werden einmal unter Räume & Bereiche gepflegt.";
