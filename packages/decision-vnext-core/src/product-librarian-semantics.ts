import { EXPERIENCE_QUESTIONS } from "@backyrd/world-knowledge-core";
import { contentHash, deepFreeze } from "./canonical.js";
import { schema } from "./schema.js";
import { LUNA_LIBRARIAN_FACT_KEYS } from "./product-luna-librarian-assets.js";
import { librarianTerm, LIBRARIAN_FAMILY_STRATEGIES } from "./product-librarian-language.js";
import type { LibrarianFact } from "./product-luna-librarian.js";
import type { ExperienceProperty } from "@backyrd/world-knowledge-core";
export const LIBRARIAN_MEANING_REGISTRY_VERSION = "backyrd.decision-vnext.meaning-links@1" as const;
const text = schema.string({ min: 1, max: 1000, pattern: /\S/u });
const linkSchema = schema.object({ family: schema.string({ min: 1, max: 100 }), requestValue: text, propertyKey: schema.string({ min: 1, max: 100 }), propertyLabel: schema.union([text, schema.literal(null)] as const), propertyValue: schema.union([text, schema.number({ min: 0, max: 100000 }), schema.boolean()] as const), relation: schema.enum(["SAME_MEANING", "CONTRADICTS"] as const) });
const registrySchema = schema.object({ contractVersion: schema.literal(LIBRARIAN_MEANING_REGISTRY_VERSION), releaseId: schema.string({ min: 1, max: 100, pattern: /^[A-Za-z0-9._:-]+$/ }), links: schema.array(linkSchema, { max: 10000 }), registryHash: schema.string({ pattern: /^[a-f0-9]{64}$/ }) });
export type LibrarianMeaningRegistry = ReturnType<typeof registrySchema.parse>;
const tuple = (family: string, value: string, key: string, label: string | null, property: unknown) => contentHash({ family, value: librarianTerm(value), key, label: label === null ? null : librarianTerm(label), property: typeof property === "string" ? librarianTerm(property) : property });
/** Acceptance is a server configuration allowlist of reviewed content hashes,
 * never a role/"reviewed" flag supplied by a request or an owner. This avoids
 * teaching the engine new prose rules for every extra wording. */
export function parseAcceptedLibrarianMeaningRegistry(input: unknown, acceptedHashes: readonly string[]): Readonly<LibrarianMeaningRegistry> {
    const registry = registrySchema.parse(input);
    if (!acceptedHashes.includes(registry.registryHash))
        throw new Error("librarian_meaning_registry_not_accepted");
    const { registryHash, ...body } = registry;
    if (contentHash(body) !== registryHash)
        throw new Error("librarian_meaning_registry_hash_mismatch");
    const tuples = new Set<string>();
    for (const link of registry.links) {
        if (!(LUNA_LIBRARIAN_FACT_KEYS.TEXT as readonly string[]).includes(link.family))
            throw new Error("librarian_meaning_registry_nontext_family");
        if (["CONTEXT", "TEMPORAL", "LOCATION", "PRICE"].includes(LIBRARIAN_FAMILY_STRATEGIES[link.family as keyof typeof LIBRARIAN_FAMILY_STRATEGIES]))
            throw new Error("librarian_meaning_registry_context_or_numeric_boundary");
        if (link.propertyKey !== "custom.detail" && !EXPERIENCE_QUESTIONS.some(q => q.key === link.propertyKey))
            throw new Error("librarian_meaning_registry_property_unknown");
        if (link.propertyKey === "custom.detail" && link.propertyLabel === null)
            throw new Error("librarian_meaning_registry_label_required");
        const key = tuple(link.family, link.requestValue, link.propertyKey, link.propertyLabel, link.propertyValue);
        if (tuples.has(key))
            throw new Error("librarian_meaning_registry_duplicate");
        tuples.add(key);
    }
    return deepFreeze(registry);
}
export class LibrarianSemanticIndex {
    readonly registry: Readonly<LibrarianMeaningRegistry>;
    private readonly links: ReadonlyMap<string, {
        readonly state: "MET" | "FAILED";
        readonly evidenceHash: string;
    }>;
    constructor(registry: Readonly<LibrarianMeaningRegistry>) { this.registry = registry; this.links = new Map(registry.links.map(link => [tuple(link.family, link.requestValue, link.propertyKey, link.propertyLabel, link.propertyValue), { state: link.relation === "SAME_MEANING" ? "MET" as const : "FAILED" as const, evidenceHash: contentHash({ registryHash: registry.registryHash, link }) }])); }
    resolve(fact: LibrarianFact, property: ExperienceProperty) { return fact.value.kind === "TEXT" && property.state === "KNOWN" ? this.links.get(tuple(fact.key, fact.value.text, property.key, property.label, property.value)) ?? null : null; }
    sourceKeys(fact: LibrarianFact): readonly string[] { if (fact.value.kind !== "TEXT")
        return []; const term = librarianTerm(fact.value.text); return this.registry.links.filter(link => link.family === fact.key && librarianTerm(link.requestValue) === term).map(link => link.propertyKey); }
}
