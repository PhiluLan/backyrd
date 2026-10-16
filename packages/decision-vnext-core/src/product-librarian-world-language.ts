import { SPOT_TYPE_CATALOG, spotTypeSupports, experienceActivitySupports, PLACE_TYPE_AUTHORING_OPTIONS, librarianTerm, emptyExperienceConditions, WORLD_OFFER_CONCEPTS, WORLD_VALUE_LABELS, librarianConcept, sameLibrarianText, type AtmosphereContext, type ExperienceConditions } from "@backyrd/world-knowledge-core";
import { contentHash, deepFreeze } from "./canonical.js";
import type { LibrarianFact } from "./product-luna-librarian.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
import { librarianConditions, type MatchTruth, type VisitWindow } from "./product-librarian-time.js";
export const LIBRARIAN_WORLD_LANGUAGE_VERSION = "backyrd.decision-vnext.world-language@4" as const;
export type LegacyLanguageAssessment = {
    readonly state: MatchTruth;
    readonly reason: string;
    readonly hashes: readonly string[];
};
/** Exact labels and tokens from the same taxonomy used by Admin and Owner.
 * This reads structured Luna values, never source prose or venue names. */
const placeTypesByTerm = new Map(PLACE_TYPE_AUTHORING_OPTIONS.filter(option => option.state === "CANONICAL").flatMap(option =>
    [option.label, option.value, option.value.replaceAll("_", " "), ...(SPOT_TYPE_CATALOG.find(t=>t.kind===option.value)?.aliases??[])].map(label => [librarianTerm(label), option.value] as const)));
// One-way category inclusion. A subtype proves its parent, never the reverse.
const placeTypeChildren: Readonly<Record<string,readonly string[]>> = deepFreeze(Object.fromEntries(SPOT_TYPE_CATALOG.map(t=>[t.kind,SPOT_TYPE_CATALOG.filter(actual=>spotTypeSupports(actual.kind,t.kind)).map(actual=>actual.kind)])));
export const LIBRARIAN_PLACE_TYPE_LANGUAGE = deepFreeze({
    labels: PLACE_TYPE_AUTHORING_OPTIONS.filter(option => option.state === "CANONICAL").map(option => ({ value: option.value, label: option.label })),
    children: placeTypeChildren,
});
export function requestedLibrarianPlaceType(fact: LibrarianFact): string | null {
    if (fact.value.kind !== "TEXT" || !["offer.kind", "experience.activity"].includes(fact.key)) return null;
    const direct = placeTypesByTerm.get(librarianTerm(fact.value.text));
    if (direct) return direct;
    const concept = librarianConcept(fact.value.text);
    return concept && ["restaurant", "bar", "zoo", "museum"].includes(concept) ? concept.toUpperCase() : null;
}
/** Finding a verified venue type is the authorized DISCOVERY use case, even
 * when the user requires that type. It never proves admission, prices or law.
 * Hard exclusions retain their separate authorization.
 * Classification is venue evidence, not proof of a drink, meal, facility or
 * service schedule. Missing positive labels cannot establish absence. */
export function assessLibrarianPlaceType(fact: LibrarianFact, world: ProductWorldView): LegacyLanguageAssessment | null {
    const desired = requestedLibrarianPlaceType(fact);
    if (!desired) return null;
    const row = world.facts.find(row => row.key === "classification.place_types");
    const supported = row && row.freshness === "CURRENT" && row.trust === "VERIFIED" && row.resolution === "KNOWN_VALUE"
        && Array.isArray(row.value) && row.value.some(token => typeof token === "string" && (placeTypeChildren[desired] ?? [desired]).includes(token));
    if (!supported || !row) return { state: "UNKNOWN", reason: "REQUESTED_SPOT_TYPE_NOT_PROVEN", hashes: [] };
    const hashes = [row.entryHash, contentHash({ version: LIBRARIAN_WORLD_LANGUAGE_VERSION, desired, types: row.value })];
    const authorized = row.authorizedUseCases?.includes(fact.modality === "EXCLUDED" ? "HARD_CONSTRAINTS" : "DISCOVERY") === true;
    if (!authorized) return { state: "UNKNOWN", reason: "SPOT_TYPE_USE_NOT_AUTHORIZED", hashes };
    return { state: fact.modality === "EXCLUDED" ? "FAILED" : "MET", reason: fact.modality === "EXCLUDED" ? "EXCLUDED_SPOT_TYPE_PRESENT" : "VERIFIED_SPOT_TYPE", hashes };
}
const amenityConcepts: Readonly<Record<string, string>> = { TOILET: "toilet", HIGH_CHAIR: "high_chair", CHANGING_TABLE: "changing_table", PARKING: "parking", PLAY_AREA: "playground", COVERED_OUTDOOR: "covered", TERRACE: "terrace", STROLLER_SPACE: "stroller" };
const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
/** Translation of typed, validated World values only. No source prose, venue
 * names, inferred areas, fabricated offerings or changed authorization. */
export function assessLegacyLibrarianFact(fact: LibrarianFact, world: ProductWorldView, visit: VisitWindow): LegacyLanguageAssessment {
    const placeType = assessLibrarianPlaceType(fact, world);
    if (placeType) return placeType;
    const unknown = (reason = "LEGACY_FAMILY_OR_VALUE_UNPROVEN", hashes: readonly string[] = []): LegacyLanguageAssessment => ({ state: "UNKNOWN", reason, hashes });
    if (fact.value.kind !== "TEXT")
        return unknown();
    const value = fact.value.text, concept = librarianConcept(value);
    const evidence: {
        hashes: readonly string[];
        hard: boolean;
        discovery: boolean;
        conditions: MatchTruth;
    }[] = [];
    const add = (row: ProductWorldView["facts"][number], data: unknown, condition: MatchTruth = "MET") => {
        if (row.freshness !== "CURRENT" || row.trust !== "VERIFIED" || row.resolution !== "KNOWN_VALUE" && row.resolution !== "KNOWN_TRUE")
            return;
        evidence.push({ hashes: [row.entryHash, contentHash({ version: LIBRARIAN_WORLD_LANGUAGE_VERSION, data })], hard: row.authorizedUseCases?.includes("HARD_CONSTRAINTS") === true, discovery: row.authorizedUseCases?.includes("DISCOVERY") === true, conditions: condition });
    };
    for (const row of world.facts) {
        if (row.key === "classification.place_types" && fact.key === "experience.activity" && concept
            && Array.isArray(row.value) && row.value.includes("ZOO") && experienceActivitySupports("zoo", concept))
            add(row, { key: row.key, token: "ZOO", activityRelation: { offered: "zoo", requested: concept }, scope: "SPOT_TYPE_DISCOVERY" });
        if (row.key === "amenity.features" && Array.isArray(row.value) && concept && ["offer.feature", "offer.facility"].includes(fact.key))
            for (const token of row.value)
                if (typeof token === "string" && amenityConcepts[token] === concept)
                    add(row, { key: row.key, token, scope: "SPOT" });
        if (row.key === "accessibility.step_free_entrance" && row.value === true && concept === "step_free" && ["offer.feature", "participation.accessibility"].includes(fact.key))
            add(row, { key: row.key, value: true, scope: "SPOT_ENTRANCE" });
        if (row.key === "offering.groups" && Array.isArray(row.value))
            for (const token of row.value) {
                if (typeof token !== "string")
                    continue;
                if (["experience.activity", "offer.kind"].includes(fact.key) && concept && (WORLD_OFFER_CONCEPTS[token] ?? []).includes(concept))
                    add(row, { key: row.key, token, concept, scope: "SPOT" });
                if (fact.key === "food.drink" && ["BEER", "CRAFT_BEER", "WINE", "NATURAL_WINE", "COCKTAILS", "NON_ALCOHOLIC_DRINKS", "COFFEE", "TEA", "SPIRITS"].includes(token) && sameLibrarianText(WORLD_VALUE_LABELS[token] ?? token, value))
                    add(row, { key: row.key, token, scope: "SPOT" });
            }
        if (row.key === "offering.onsite" && Array.isArray(row.value))
            for (const raw of row.value) {
                const entry = raw as {
                    kind: string;
                    relationship: string;
                    area: string | null;
                };
                const concepts: Readonly<Record<string, readonly string[]>> = { FULL_MEALS: ["meal"], SNACKS: ["snacks"], DRINKS: ["drinks"], CAFE: ["coffee"], BAR: ["bar"], RESTAURANT: ["restaurant"] };
                // Embedded facilities never become the whole visit or an independent offer.
                if (concept && (concepts[entry.kind] ?? []).includes(concept) && (fact.key === "offer.facility" || entry.relationship === "PART_OF_SPOT" && entry.area === null && ["offer.kind", "experience.activity"].includes(fact.key)))
                    add(row, { key: row.key, entry, scope: fact.key === "offer.facility" ? "FACILITY" : "SPOT" });
            }
        if (["food.cuisine", "food.dish", "food.diet"].includes(fact.key) && Array.isArray(row.value))
            for (const token of row.value) {
                if (typeof token !== "string")
                    continue;
                const direct = row.key === "offering.cuisines" && fact.key === "food.cuisine" || row.key === "offering.food_specialities" && fact.key === "food.dish";
                const dietary = fact.key === "food.diet" && ["offering.cuisines", "offering.food_specialities"].includes(row.key) && ["VEGAN", "VEGETARIAN", "VEGAN_DISHES", "VEGETARIAN_DISHES"].includes(token);
                if ((direct || dietary) && sameLibrarianText(WORLD_VALUE_LABELS[token] ?? token, value))
                    add(row, { key: row.key, token, scope: "SPOT" });
            }
        if (row.key === "context.atmosphere" && fact.key === "atmosphere.character" && Array.isArray(row.value))
            for (const raw of row.value) {
                const entry = raw as AtmosphereContext;
                if (!sameLibrarianText(WORLD_VALUE_LABELS[entry.atmosphere] ?? entry.atmosphere, value))
                    continue;
                const c = entry.conditions;
                // Rich legacy conditions remain unresolved instead of being discarded.
                const unsupported = !!(c.area || c.occasion || c.groupSize || c.ageContext || c.accompaniment || c.eventMode) || row.validFrom === undefined || row.validUntil === undefined;
                const condition: ExperienceConditions = { ...emptyExperienceConditions(), weekdays: c.days.map(d => days.indexOf(d) + 1), dayparts: c.dayparts, validFrom: row.validFrom?.slice(0, 10) ?? null, validUntil: row.validUntil?.slice(0, 10) ?? null };
                add(row, { key: row.key, entry, scope: c.area ? "NAMED_AREA" : "SPOT" }, unsupported ? "UNKNOWN" : librarianConditions(condition, visit));
            }

    }
    const active = evidence.filter(e => e.conditions !== "FAILED");
    const hashes = [...new Set(active.flatMap(e => e.hashes))].sort();
    if (!active.length)
        return unknown();
    if (fact.modality === "EXCLUDED")
        return unknown("LEGACY_PRESENCE_HAS_NO_MATCHED_VISIT_SCOPE", hashes);
    const preferred = fact.modality === "PREFERRED";
    if (active.some(e => e.conditions === "MET" && (preferred ? e.discovery : e.hard)))
        return { state: "MET", reason: "LEGACY_TYPED_PRESENCE_CONFIRMED", hashes };
    if (active.some(e => e.conditions === "MET" && e.discovery))
        return unknown("LEGACY_TYPED_DISCOVERY_SUPPORT", hashes);
    return unknown(active.some(e => e.conditions !== "MET") ? "LEGACY_CONDITIONS_OR_AREA_UNRESOLVED" : "LEGACY_SOURCE_USE_NOT_AUTHORIZED", hashes);
}
