import { PRODUCT_INTENT_ONTOLOGY } from "./product-intent-lexicon.js";
import { contentHash, deepFreeze } from "./canonical.js";
import { PRODUCT_V1_INTENT_MAPPINGS, type ProductV1Intent } from "./product-v1-authority.js";
import { PRODUCT_QUERY_CATALOG_HASH, PRODUCT_QUERY_CATALOG, encodeWorldPreference, encodeWorldQueryConstraint, projectRequirementFacets } from "./product-query-semantics.js";
import { canonicalRequestedCity, bindProductUnderstanding, parseModelRequirements, type ProductRequirement, type ProductInterpretation, type ProductVisitAlternative, REQUEST_NEED_CODES } from "./product-request-understanding.js";
import { PRODUCT_REQUEST_MEANING_VERSION, PRODUCT_REQUEST_MEANING_POLICY, parseProductRequestMeaning, type ProductRequestMeaning } from "./product-request-meaning.js";
import { DecisionProductRequestSchema, type DecisionProductRequest } from "./product-v1-contracts.js";

export const PRODUCT_MEANING_MAPPING_VERSION = "backyrd.decision-vnext.meaning-mapping@1.1" as const;
export const PRODUCT_MEANING_MAPPING_POLICY = "meaning-mapping-policy-v12" as const;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("product_meaning_mapping_shape_invalid");
  return value as Record<string, unknown>;
};
const exact = (row: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(row).sort().join() === [...keys].sort().join();
const intentSet = new Set<string>(PRODUCT_V1_INTENT_MAPPINGS.map(row => row.intentId));
export type ProductMeaningMappingRow = {
  readonly sourceId: string; readonly state: "MAPPED" | "PARTIAL" | "UNSUPPORTED" | "CONTEXT_ONLY";
  readonly intent: ProductV1Intent | null; readonly requirements: readonly ProductRequirement[];
};
/** Personal, request-bound, ephemeral plan. Never serialize to public context,
 * cache, analytics or learning. The original graph retains all scopes/relations. */
export type ProductMeaningSearchPlan = {
  readonly contractVersion: typeof PRODUCT_MEANING_MAPPING_VERSION;
  readonly policyVersion: typeof PRODUCT_MEANING_MAPPING_POLICY;
  readonly requestHash: string; readonly catalogHash: string;
  readonly meaning: ProductRequestMeaning; readonly mappings: readonly ProductMeaningMappingRow[];
  readonly planHash: string;
};
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
const currency = (unit: string | null): "CHF" | "EUR" | "USD" | "GBP" | "UNSPECIFIED" => {
  const value = normalize(unit ?? "");
  return (["chf", "franken", "francs", "fr.", "fr"].includes(value) ? "CHF" : ["eur", "euro", "euros", "€"].includes(value) ? "EUR"
    : ["usd", "us dollar", "us-dollar"].includes(value) ? "USD" : ["gbp", "pound sterling"].includes(value) ? "GBP" : "UNSPECIFIED");
};
const basis = (value: string | null): "PER_PERSON" | "TOTAL" | "UNSPECIFIED" => {
  const text = normalize(value ?? "");
  return /(?:pro|per|par) (?:person|personne|kopf)|je person/u.test(text) ? "PER_PERSON"
    : /gesamt|total|insgesamt|zusammen|together|pour (?:nous|les|tous)|fur (?:alle|beide|uns)/u.test(text) ? "TOTAL" : "UNSPECIFIED";
};
const active = (status: string) => ["REQUESTED", "OPTIONAL", "EXCLUDED"].includes(status);
export function productMeaningMappingNodes(meaning: ProductRequestMeaning) {
  const literal = (s: string) => normalize(s).replace(/[_-]+/gu, " ");
  const drinks = new Set(["drink", "drinks", "drinking", "beverages"]);
  const social = new Set(["socializing", "conversation", "talking", "relaxing"]);
  return [...meaning.activities, ...meaning.constraints].filter(row => {
    if (!active(row.status) || "aspect" in row && row.aspect === "PERSONAL_CONSUMPTION") return false;
    if (!("aspect" in row) || row.aspect !== "OFFERING" || !["REQUESTED", "OPTIONAL"].includes(row.status)
      || !drinks.has(literal(row.description)) || row.condition || row.alternativeGroup || row.participantIds.length) return true;
    const visits = meaning.activities.filter(visit => row.activityIds.length ? row.activityIds.includes(visit.id) : visit.status === "REQUESTED");
    return !visits.length || !visits.every(visit => visit.status === "REQUESTED" && (visit.concepts ?? []).some(concept => drinks.has(literal(concept)))
      && (visit.concepts ?? []).every(concept => drinks.has(literal(concept)) || social.has(literal(concept))));
  });
}
export function validateProductMeaningMappingSource(request: DecisionProductRequest, meaning: ProductRequestMeaning, sources?: Readonly<Record<string, string>>): void {
  const { meaningHash, ...body } = meaning;
  if (meaning.contractVersion !== PRODUCT_REQUEST_MEANING_VERSION || meaning.policyVersion !== PRODUCT_REQUEST_MEANING_POLICY
    || meaning.requestHash !== contentHash({ requestText: request.naturalLanguage }) || contentHash(body) !== meaningHash)
    throw new Error("product_meaning_mapping_source_invalid");
  if (sources) {
    const { contractVersion: _contract, policyVersion: _policy, requestHash: _requestHash, meaningHash: _meaningHash, ...output } = meaning;
    if (parseProductRequestMeaning(output, request.naturalLanguage, sources).meaningHash !== meaning.meaningHash)
      throw new Error("product_meaning_mapping_source_invalid");
  }
}
export function bindProductMeaningSearchPlan(request: DecisionProductRequest, meaning: ProductRequestMeaning,
  proposal: unknown, sources: Readonly<Record<string, string>>, targetEvidence: "PROPOSAL" | "SOURCE_NODE" = "PROPOSAL"): ProductMeaningSearchPlan {
  DecisionProductRequestSchema.parse(request); validateProductMeaningMappingSource(request, meaning, sources);
  const root = object(proposal);
  if (!exact(root, ["mappings"]) || !Array.isArray(root.mappings)) throw new Error("product_meaning_mapping_shape_invalid");
  const nodes = productMeaningMappingNodes(meaning); const rows = new Map<string, ProductMeaningMappingRow>();
  for (const input of root.mappings) {
    const row = object(input);
    if (!exact(row, ["sourceId", "state", "intent", "targets"]) || typeof row.sourceId !== "string" || rows.has(row.sourceId)
      || !["MAPPED", "PARTIAL", "UNSUPPORTED"].includes(String(row.state)) || !Array.isArray(row.targets) || row.targets.length > 4
      || row.intent !== null && (typeof row.intent !== "string" || !intentSet.has(row.intent))) throw new Error("product_meaning_mapping_shape_invalid");
    const source = nodes.find(node => node.id === row.sourceId);
    if (!source) throw new Error("product_meaning_mapping_source_invalid");
    if (("aspect" in source || source.status === "EXCLUDED") && row.intent !== null || row.state === "UNSUPPORTED" && (row.intent !== null || row.targets.length))
      throw new Error("product_meaning_mapping_state_invalid");
    const requirements = row.targets.flatMap(input => {
      const target = object(input);
      const deriveEvidence = targetEvidence === "SOURCE_NODE";
      if (!exact(target, deriveEvidence ? ["dimension", "value"] : ["dimension", "value", "evidence"])
        || !deriveEvidence && (typeof target.evidence !== "string" || !source.evidence.includes(target.evidence) || !Object.hasOwn(sources, target.evidence))
        || target.dimension === "AGE" || target.dimension === "COMPANY") throw new Error("product_meaning_mapping_target_invalid");
      // P1 already owns the literal source quotes. P2 has no authority to choose
      // a different quote. Find a valid original node quote deterministically;
      // all existing grounding/type checks still apply.
      const parsed = (() => {
        let lastError: unknown = new Error("product_meaning_mapping_target_invalid");
        for (const id of deriveEvidence ? source.evidence : [target.evidence as string]) {
          try {
            return parseModelRequirements([{ dimension: target.dimension, value: target.value, evidence: sources[id],
              importance: source.status === "OPTIONAL" ? "PREFERRED" : source.status === "EXCLUDED" || "numericValue" in source && source.numericValue !== null ? "HARD" : "ESSENTIAL",
              operator: source.status === "EXCLUDED" ? "EXCLUDE" : "REQUIRE", origin: "EXPLICIT", interpretationState: "UNDERSTOOD",
              alternatives: [], group: null, condition: null }], request.naturalLanguage, 2000);
          } catch (error) { lastError = error; }
        }
        throw lastError;
      })();
      for (const item of parsed) {
        // ALCOHOL_FREE is a positive property. Neither refusing a purchase nor
        // excluding alcohol itself may be rewritten as excluding alcohol-free.
        if (item.value?.kind === "NEED" && item.value.code === "ALCOHOL_FREE"
          && !/alkoholfrei|alcohol[ -]?free|non[ -]?alcoholic|sans alcool|senza alcol|nuchtern|sober|teetotal/u.test(normalize(source.description)))
          throw new Error("product_meaning_mapping_need_polarity_invalid");
        if (item.value?.kind === "BUDGET" && (!("aspect" in source) || source.aspect !== "BUDGET" || source.numericValue === null))
          throw new Error("product_meaning_mapping_budget_changed");
        if ("aspect" in source && source.aspect === "BUDGET" && source.numericValue !== null && item.value?.kind === "BUDGET") {
          if (!["LT", "LTE"].includes(source.comparison ?? "")
            || Math.abs(source.numericValue * 100 - Math.round(source.numericValue * 100)) > 0.000001
            || item.value.amountMinor !== Math.round(source.numericValue * 100) || item.value.comparison !== source.comparison
            || item.value.currency !== currency(source.unit) || item.value.basis !== basis(source.basis))
            throw new Error("product_meaning_mapping_budget_changed");
          const includes = item.value.includes ?? [];
          // Scope is understood once, before World taxonomy is introduced.
          // Mapping must preserve that semantic result, not reparse its words.
          const expected = source.costComponents;
          if (includes.some(component => !expected.includes(component)) || expected.some(component => !includes.includes(component as (typeof includes)[number])))
            throw new Error("product_meaning_mapping_budget_includes_changed");
        }
      }
      if ("aspect" in source && source.aspect === "BUDGET" && parsed.some(item => item.value?.kind !== "BUDGET"
        && !(item.value?.kind === "FACET" && item.value.key.startsWith("offering."))))
        throw new Error("product_meaning_mapping_budget_changed");
      return parsed;
    });
    if (["MAPPED", "PARTIAL"].includes(String(row.state)) && "aspect" in source && source.aspect === "BUDGET" && source.numericValue !== null
      && requirements.filter(item => item.value?.kind === "BUDGET").length !== 1)
      throw new Error("product_meaning_mapping_budget_changed");
    if (["MAPPED", "PARTIAL"].includes(String(row.state)) && row.intent === null && !requirements.length) throw new Error("product_meaning_mapping_empty_target");
    const placeTypes = requirements.flatMap(requirement => requirement.value?.kind === "FACET" && requirement.value.key === "classification.place_types" && requirement.operator === "REQUIRE" ? [requirement.value.value] : []);
    const intent = row.intent === null && !("aspect" in source) && source.status !== "EXCLUDED" && placeTypes.length
      ? PRODUCT_V1_INTENT_MAPPINGS.find(mapping => placeTypes.every(type => (mapping.acceptedPlaceTypes as readonly string[]).includes(type)))?.intentId ?? null
      : row.intent as ProductV1Intent | null;
    if (intent && placeTypes.some(type => !(PRODUCT_V1_INTENT_MAPPINGS.find(mapping => mapping.intentId === intent)!.acceptedPlaceTypes as readonly string[]).includes(type)))
      throw new Error("product_meaning_mapping_intent_conflict");
    rows.set(source.id, { sourceId: source.id, state: row.state as "MAPPED" | "PARTIAL" | "UNSUPPORTED", intent, requirements });
  }
  if (rows.size !== nodes.length || nodes.some(node => !rows.has(node.id))) throw new Error("product_meaning_mapping_coverage_invalid");
  const all = [...meaning.activities, ...meaning.participants, ...meaning.constraints];
  const mappings = all.map(node => {
    const mapped = rows.get(node.id); if (mapped) return mapped;
    if ("ageTiming" in node && node.entityType === "PERSON" && node.participation === "CONFIRMED" && node.ageTiming === "CURRENT" && node.age !== null) {
      for (const id of node.evidence) {
        try {
          const proof = parseModelRequirements([{ dimension: "AGE", importance: "ESSENTIAL", operator: "REQUIRE", origin: "EXPLICIT",
            interpretationState: "UNDERSTOOD", value: { kind: "AGE", ages: [node.age] }, alternatives: [], group: null, condition: null, evidence: sources[id] }], request.naturalLanguage, 2000);
          return { sourceId: node.id, state: "MAPPED" as const, intent: null, requirements: proof };
        } catch { /* Preserve an ungroundable current age, but do not use it for access. */ }
      }
      return { sourceId: node.id, state: "UNSUPPORTED" as const, intent: null, requirements: [] };
    }
    return { sourceId: node.id, state: "CONTEXT_ONLY" as const, intent: null, requirements: [] };
  });
  const body = { contractVersion: PRODUCT_MEANING_MAPPING_VERSION, policyVersion: PRODUCT_MEANING_MAPPING_POLICY,
    requestHash: contentHash(request), catalogHash: PRODUCT_QUERY_CATALOG_HASH, meaning, mappings };
  return deepFreeze({ ...body, planHash: contentHash(body) });
}

/** Conservative adapter for the current single-visit kernel. Scoped/conditional
 * relationships are preserved in the plan and never flattened to global filters.
 * Unrepresentable wishes become observable limitations, not invented matches. */
export function projectProductMeaningSearchPlan(request: DecisionProductRequest, plan: ProductMeaningSearchPlan): ProductInterpretation {
  const { planHash, ...body } = plan;
  if (plan.requestHash !== contentHash(request) || plan.catalogHash !== PRODUCT_QUERY_CATALOG_HASH || contentHash(body) !== planHash)
    throw new Error("product_meaning_mapping_binding_invalid");
  validateProductMeaningMappingSource(request, plan.meaning);
  const meaning = plan.meaning; const visits = meaning.activities.filter(row => row.status === "REQUESTED");
  const primary = visits.length === 1 && visits[0]!.alternativeGroup === null && visits[0]!.condition === null
    && visits[0]!.afterActivityId === null && visits[0]!.replacesActivityId === null ? visits[0]! : null;
  const choices = meaning.activities.filter(row => ["REQUESTED", "OPTIONAL"].includes(row.status));
  const choiceMappings = choices.map(source => plan.mappings.find(row => row.sourceId === source.id)!);
  const singleVisitChoice = !primary && choices.length >= 2 && choices.length <= 4 && choices.some(row => row.status === "REQUESTED")
    && choices.every(row => row.alternativeGroup !== null && row.alternativeGroup === choices[0]!.alternativeGroup
      && row.condition === null && row.afterActivityId === null && row.replacesActivityId === null);
  const branches: (Omit<ProductVisitAlternative, "requirements"> & { requirements: ProductRequirement[] })[] = singleVisitChoice ? choices.flatMap((source, index) => {
    const mapping = choiceMappings[index]!;
    return ["MAPPED", "PARTIAL"].includes(mapping.state) && mapping.intent !== null ? [{ id: source.id, intent: mapping.intent, preferred: source.status === "OPTIONAL",
      requirements: mapping.requirements.map(row => ({ ...row, importance: row.importance === "PREFERRED" ? "ESSENTIAL" as const : row.importance })), unresolved: mapping.state === "PARTIAL" }] : [];
  }) : [];
  const timeGroups = [...new Set(meaning.constraints.filter(row => active(row.status) && row.aspect === "TIME" && row.alternativeGroup).map(row => row.alternativeGroup!))];
  const timeNodes = timeGroups.length === 1 ? meaning.constraints.filter(row => row.alternativeGroup === timeGroups[0]) : [];
  const timeIntent = primary ? plan.mappings.find(row => row.sourceId === primary.id)?.intent ?? null : null;
  const timeChoice = primary !== null && timeIntent !== null && timeNodes.length >= 2 && timeNodes.length <= 4
    && timeNodes.some(row => row.status === "REQUESTED") && timeNodes.every(row => ["REQUESTED", "OPTIONAL"].includes(row.status) && row.aspect === "TIME"
      && row.condition === null && row.participantIds.length === 0 && (row.activityIds.length === 0 || row.activityIds.length === 1 && row.activityIds[0] === primary.id)
      && plan.mappings.find(mapped => mapped.sourceId === row.id)?.state === "MAPPED"
      && plan.mappings.find(mapped => mapped.sourceId === row.id)?.requirements.length === 1
      && plan.mappings.find(mapped => mapped.sourceId === row.id)?.requirements[0]?.value?.kind === "TIME");
  if (timeChoice) for (const source of timeNodes) branches.push({ id: source.id, intent: timeIntent!, preferred: source.status === "OPTIONAL", timeAlternative: true,
    requirements: plan.mappings.find(row => row.sourceId === source.id)!.requirements.map(row => ({ ...row, importance: "HARD" as const, group: null })), unresolved: false });
  const branchUnresolved = new Set<string>();
  const visitIds = primary ? [primary.id] : singleVisitChoice ? choices.map(row => row.id) : visits.map(row => row.id);
  // Shared destination/time belong to the required visit and its genuine
  // alternatives/replacements. An independent optional add-on must not erase
  // those coordinates merely because it has no matching scope reference.
  const contextVisitIds = new Set(visits.map(row => row.id));
  const requiredGroups = new Set(visits.flatMap(row => row.alternativeGroup ? [row.alternativeGroup] : []));
  for (const choice of choices) if (choice.alternativeGroup && requiredGroups.has(choice.alternativeGroup)) contextVisitIds.add(choice.id);
  for (let pass = 0; pass < choices.length; pass++) for (const choice of choices)
    if (choice.replacesActivityId && contextVisitIds.has(choice.replacesActivityId)) contextVisitIds.add(choice.id);
  const contextChoices = visits.length ? choices.filter(row => contextVisitIds.has(row.id)) : choices;
  const requirements: ProductRequirement[] = []; let unresolved = meaning.uncertainties.length > 0;
  const alternativeUnmapped = singleVisitChoice && branches.length !== choices.length;
  for (const source of [...meaning.activities, ...meaning.constraints]) {
    // Personal purchasing choices stay in the private graph. They are neither
    // Spot exclusions nor proof that a venue allows a visit without purchase.
    if (!active(source.status) || "aspect" in source && source.aspect === "PERSONAL_CONSUMPTION") continue;
    const mapping = plan.mappings.find(row => row.sourceId === source.id)!;
    if (mapping.state === "CONTEXT_ONLY") continue;
    const global = "activityIds" in source && (source.activityIds.length === 0 || visitIds.length > 0
      && source.activityIds.length === visitIds.length && visitIds.every(id => source.activityIds.includes(id)));
    const scopedContextChoices = "aspect" in source && source.aspect !== "BUDGET" ? contextChoices : choices;
    const commonContext = "aspect" in source && ["LOCATION", "TIME", "BUDGET"].includes(source.aspect) && source.participantIds.length === 0
      && (source.activityIds.length === 0 || scopedContextChoices.length > 0 && scopedContextChoices.every(visit => source.activityIds.includes(visit.id))
        && source.activityIds.every(id => meaning.activities.some(visit => visit.id === id && ["REQUESTED", "OPTIONAL", "EXCLUDED", "NOT_REQUIRED"].includes(visit.status))));
    const personCapability = "participantIds" in source && source.participantIds.length === 1
      && meaning.participants.some(person => person.id === source.participantIds[0] && person.participation === "CONFIRMED")
      && mapping.requirements.length > 0 && mapping.requirements.every(row => row.value?.kind === "NEED" && row.value.scope === "ONE_PERSON");
    const sharedPersonBudget = "aspect" in source && source.aspect === "BUDGET" && source.participantIds.length > 0
      && !meaning.participants.some(row => row.participation === "POSSIBLE" && row.entityType !== "ANIMAL")
      && meaning.participants.filter(row => row.participation === "CONFIRMED").every(row => row.entityType === "PERSON" && source.participantIds.includes(row.id))
      && source.participantIds.every(id => meaning.participants.some(row => row.id === id && row.entityType === "PERSON" && row.participation === "CONFIRMED"))
      && mapping.requirements.some(row => row.value?.kind === "BUDGET" && row.value.basis === "PER_PERSON")
      && mapping.requirements.every(row => row.value?.kind === "BUDGET" && row.value.basis === "PER_PERSON"
        || row.value?.kind === "FACET" && row.value.key.startsWith("offering."));
    const scoped = "activityIds" in source && (!global && !commonContext || source.participantIds.length > 0 && !personCapability && !sharedPersonBudget);
    const relation = "afterActivityId" in source && (source.afterActivityId !== null || source.replacesActivityId !== null || source.status === "OPTIONAL");
    if (singleVisitChoice && "afterActivityId" in source && choices.some(choice => choice.id === source.id)) continue;
    if (singleVisitChoice && "activityIds" in source && source.activityIds.length > 0 && !global && !commonContext) {
      const owners = branches.filter(branch => source.activityIds.includes(branch.id));
      if (!["MAPPED", "PARTIAL"].includes(mapping.state) || source.condition !== null || source.alternativeGroup !== null || source.participantIds.length > 0) {
        for (const owner of owners) branchUnresolved.add(owner.id);
      } else {
        for (const owner of owners) {
          owner.requirements.push(...mapping.requirements);
          if (mapping.state === "PARTIAL") branchUnresolved.add(owner.id);
        }
      }
      continue;
    }
    if (timeChoice && "aspect" in source && timeNodes.some(row => row.id === source.id)) continue;
    // Optional timing remains private preference data, never a mandatory visit
    // window or an unmapped core need. This version does not score it.
    if (primary && "aspect" in source && source.aspect === "TIME" && source.status === "OPTIONAL"
      && source.alternativeGroup !== null && source.condition === null && !scoped && mapping.state === "MAPPED"
      && meaning.constraints.filter(row => row.alternativeGroup === source.alternativeGroup).every(row => row.aspect === "TIME" && row.status === "OPTIONAL")) {
      requirements.push(...mapping.requirements); continue;
    }
    if (!["MAPPED", "PARTIAL"].includes(mapping.state) || source.condition !== null || source.alternativeGroup !== null || scoped || relation || !primary && !singleVisitChoice && !commonContext) {
      unresolved = true; continue;
    }
    if (mapping.state === "PARTIAL") unresolved = true;
    requirements.push(...mapping.requirements);
  }
  // The model may keep a common destination on every activity rather than
  // emit a separate constraint. Promote only an identical proven destination.
  const branchLocations = branches.map(branch => branch.requirements.filter(row => row.dimension === "LOCATION" && row.operator === "REQUIRE"
    && !row.group && !row.condition && row.value?.kind === "LOCATION" && row.value.city && !row.value.reference
    && (!row.value.role || row.value.role === "DESTINATION")));
  const locationCities = branchLocations.map(rows => [...new Set(rows.flatMap(row => row.value?.kind === "LOCATION" && row.value.city ? [canonicalRequestedCity(row.value.city)] : []))]);
  if (branches.length && locationCities.every(cities => cities.length === 1 && cities[0] === locationCities[0]![0])
    && !requirements.some(row => row.dimension === "LOCATION")) {
    requirements.push(branchLocations[0]![0]!);
    for (const branch of branches) branch.requirements = branch.requirements.filter(row => !branchLocations[branches.indexOf(branch)]!.includes(row));
  }
  const ages = plan.mappings.flatMap(row => row.requirements.flatMap(requirement => requirement.value?.kind === "AGE" ? [requirement.value.minimumAge] : []));
  if (meaning.participants.some(person => plan.mappings.find(row => row.sourceId === person.id)?.state === "UNSUPPORTED")) unresolved = true;
  if (ages.length) requirements.push({ dimension: "AGE", importance: "ESSENTIAL", operator: "REQUIRE", origin: "EXPLICIT", interpretationState: "UNDERSTOOD", value: { kind: "AGE", minimumAge: Math.min(...ages) }, alternatives: [], group: null });
  // Do not sum overlapping or unnamed groups, infer adulthood, or turn possible
  // participants/future birthday ages into present access facts.
  const confirmed = meaning.participants.filter(row => row.participation === "CONFIRMED" && row.entityType !== "ANIMAL");
  if (meaning.participants.some(row => row.participation !== "BACKGROUND" && (row.participation === "POSSIBLE" || row.entityType === "ANIMAL"))) unresolved = true;
  // A participant list may describe companions without an explicit self node.
  // Its length is not a total party size and cannot prove a solo visit.
  // Counts belong to the named group. Without a total-party scope they cannot
  // establish whether the requesting person is included.
  const partySize = null;
  const family = confirmed.some(row => /(?<!\p{L})(?:family|familie|famille|tochter|sohn|kinder?|daughter|son|child(?:ren)?|kids?|fille|fils|enfants?)(?!\p{L})/u.test(normalize(row.role)));
  if (confirmed.length) requirements.push({ dimension: "COMPANY", importance: "ESSENTIAL", operator: "REQUIRE", origin: "EXPLICIT", interpretationState: "UNDERSTOOD",
    value: { kind: "COMPANY", size: partySize, adultPresent: ages.some(age => age >= 18) ? true : null, companionType: family ? "FAMILY" : null }, alternatives: [], group: null });
  const distinct = [...new Map(requirements.map(row => [contentHash(row), row])).values()];
  const hard = distinct.filter(row => row.importance === "HARD");
  if (hard.length > 12) throw new Error("product_meaning_mapping_capacity_unavailable");
  if (distinct.length > 12) unresolved = true;
  const bounded = [...hard];
  const nonHard = distinct.filter(row => row.importance !== "HARD");
  const used = new Set<string>();
  for (const row of nonHard) {
    const key = row.group ?? contentHash(row); if (used.has(key)) continue; used.add(key);
    const pack = row.group ? nonHard.filter(other => other.group === row.group) : [row];
    if (bounded.length + pack.length <= 12) bounded.push(...pack); else unresolved = true;
  }
  const soft = new Set(request.explicit.softPreferences ?? []);
  const vetoes = new Set(bounded.filter(row => row.operator === "EXCLUDE" && row.value?.kind === "FACET")
    .map(row => row.value?.kind === "FACET" ? `${row.value.key}:${row.value.value}` : ""));
  for (const row of bounded) if (row.operator === "REQUIRE" && row.group === null && row.value?.kind === "FACET" && !vetoes.has(`${row.value.key}:${row.value.value}`)) {
    const hint = encodeWorldPreference(row.value.key, row.value.value);
    if (soft.has(hint) || soft.size < 30) soft.add(hint); else unresolved = true;
  }
  const hardFilters = new Set(request.explicit.hardConstraints ?? []);
  for (const facet of projectRequirementFacets(bounded)) {
    if (facet.role === "REQUIRED" || facet.role === "EXCLUDED") {
      const filter = encodeWorldQueryConstraint(facet.role, facet.group ?? "X", facet.key, facet.value);
      if (hardFilters.has(filter) || hardFilters.size < 30) hardFilters.add(filter);
      else throw new Error("product_meaning_mapping_capacity_unavailable");
    }
  }
  const mappedIntent = primary ? plan.mappings.find(row => row.sourceId === primary.id)?.intent ?? null : null;
  const agePeople = meaning.participants.filter(row => ["CONFIRMED", "POSSIBLE"].includes(row.participation) && row.entityType !== "ANIMAL");
  const agePartial = ages.length > 0 && (agePeople.some(person => !plan.mappings.find(row => row.sourceId === person.id)?.requirements.some(row => row.value?.kind === "AGE"))
    || agePeople.length === 1 && !/^(?:anfragende person|requesting person|user)$/u.test(normalize(agePeople[0]!.role)));
  const interpreted = DecisionProductRequestSchema.parse({ ...request, explicit: { ...request.explicit,
    primaryIntent: Object.hasOwn(request.explicit, "primaryIntent") ? request.explicit.primaryIntent : mappedIntent,
    secondaryIntent: Object.hasOwn(request.explicit, "secondaryIntent") ? request.explicit.secondaryIntent : null,
    softPreferences: [...soft].sort(), hardConstraints: [...hardFilters].sort(),
    unresolvedTerms: [...new Set([...(request.explicit.unresolvedTerms ?? []), ...(unresolved ? ["OTHER_CORE_NEED_UNMAPPED" as const] : []), ...(alternativeUnmapped ? ["VISIT_ALTERNATIVE_UNMAPPED" as const] : [])])],
  } });
  return { request: interpreted, understanding: bindProductUnderstanding(interpreted, bounded, "MEANING_PLAN", agePartial ? true : undefined, branches.length ? branches.map(branch => ({ ...branch, unresolved: branch.unresolved || branchUnresolved.has(branch.id) })) : undefined) };
}

/** Compile already-understood atomic concepts. Exact aliases only: this never
 * interprets original request prose or substitutes a nearby catalogue term. */
export function compileProductMeaningSearchPlan(request: DecisionProductRequest, meaning: ProductRequestMeaning): ProductMeaningSearchPlan {
  const sources = { E1: request.naturalLanguage };
  validateProductMeaningMappingSource(request, meaning, sources);
  const key = (text: string) => normalize(text).replace(/[_-]+/gu, " ").replace(/\s+/gu, " ");
  const synonyms: Readonly<Record<string, string>> = {
    "vegan": "vegan dishes", "vegetarian": "vegetarian dishes", "vegan food": "vegan dishes", "vegetarian food": "vegetarian dishes", "kuchen": "cake", "gâteau": "cake",
    "gemütlich": "cozy", "cosy": "cozy", "ruhig": "quiet", "bibliothek": "library",
    "pottery": "POTTERY", "guided tour": "GUIDED_TOUR", "boat ride": "BOAT_RIDE", "dancing": "DANCING",
    "seat": "SEATING", "seating": "SEATING", "step free entrance": "STEP_FREE_ENTRANCE", "step free route": "STEP_FREE_ROUTE",
    "dog access": "DOG_ACCESS", "changing table": "CHANGING_TABLE", "halal": "HALAL", "dairy free": "DAIRY_FREE",
    "lactose free": "LACTOSE_FREE", "alcohol free": "ALCOHOL_FREE", "soft drink": "non alcoholic drinks", "soft drinks": "non alcoholic drinks", "bowling": "bowling alley", "calm": "quiet", "comfortable": "cozy", "power outlet": "power outlets", "toilets": "toilet", "changing rooms": "changing room", "child friendly": "family friendly", "family friendly": "family friendly",
  };
  type Target = { readonly dimension: string; readonly value: Readonly<Record<string, unknown>> };
  const dimension = (attribute: string) => attribute.startsWith("classification.") ? "EXPERIENCE" : attribute.startsWith("offering.") ? "OFFERING" : attribute.startsWith("amenity.") ? "AMENITY" : "ATMOSPHERE";
  const atom = (concept: string, aspect?: string): Target | null => {
    const normalized = key(concept).replace(/^(?:visit(?:ing)?(?: a)? |go to a |eat(?:ing)? |drink(?:ing)? )| visit$/gu, "");
    if (["indoor", "outdoor", "covered outdoor"].includes(normalized)) return { dimension: "SETTING", value: { kind: "SETTING", environment: normalized.toUpperCase().replace(/ /gu, "_") } };
    const resolved = key(synonyms[normalized] ?? normalized);
    const prefixes = aspect === "BUDGET" ? ["operation.price_level"] : aspect === "OFFERING" ? ["offering."]
      : ["classification.place_types", "offering.", "context.atmosphere", "context.visit_situations", "amenity."];
    const hits = PRODUCT_QUERY_CATALOG.flatMap(field => prefixes.some(prefix => field.key.startsWith(prefix))
      ? field.values.filter(value => key(value) === resolved).map(value => ({ dimension: dimension(field.key), value: { kind: "FACET", key: field.key, value } })) : []);
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) return null;
    const need = REQUEST_NEED_CODES.find(code => key(code) === resolved);
    if (need) return { dimension: ["DOG_ACCESS", "STEP_FREE_ENTRANCE", "STEP_FREE_ROUTE", "CHANGING_TABLE", "SEATING"].includes(need) ? "ACCESS"
      : ["GUIDED_TOUR", "BOAT_RIDE", "RIVERSIDE_WALK", "POTTERY", "DANCING"].includes(need) ? "EXPERIENCE" : "OFFERING",
      value: { kind: "NEED", code: need, scope: "UNSPECIFIED", accessArea: null } };
    return null;
  };
  const intentFor = (concept: string): ProductV1Intent | null => {
    const normalized = key(concept);
    const generic: Readonly<Record<string, ProductV1Intent>> = { eat: "EAT", meal: "EAT", drink: "DRINKS", drinks: "DRINKS", drinking: "DRINKS", "have a drink": "DRINKS" };
    if (generic[normalized]) return generic[normalized]!;
    const intents = [...new Set(PRODUCT_INTENT_ONTOLOGY.filter(row => row.aliases.some(alias => key(alias) === normalized)).map(row => row.intent))];
    return intents.length === 1 ? intents[0]! : null;
  };
  const contextual = new Set(["reading", "read", "conversation", "talking", "relaxing", "relax", "socializing"]);
  const rows = productMeaningMappingNodes(meaning).map(source => {
    const targets: Target[] = []; let intent: ProductV1Intent | null = null; let unsupported = false;
    if (!("aspect" in source)) {
      const concepts = source.concepts ?? [source.description];
      const intents: ProductV1Intent[] = [];
      for (const concept of concepts) {
        const target = atom(concept); const inferred = intentFor(concept);
        if (target) targets.push(target);
        if (inferred) intents.push(inferred);
        if (!target && !contextual.has(key(concept)) && (!inferred || !["eat", "food", "meal", "essen", "drink", "drinks", "drinking", "have a drink", "etwas trinken", "nightlife", "ausgehen"].includes(key(concept)))) unsupported = true;
      }
      const types = targets.flatMap(target => target.value.kind === "FACET" && target.value.key === "classification.place_types" ? [String(target.value.value)] : []);
      intent = types.length ? PRODUCT_V1_INTENT_MAPPINGS.find(row => types.every(type => (row.acceptedPlaceTypes as readonly string[]).includes(type)))?.intentId ?? null
        : [...new Set(intents)].length === 1 ? intents[0]! : null;
      if (intent === null && targets.some(target => target.value.kind === "FACET" && String(target.value.key).startsWith("offering."))) intent = targets.some(target => target.value.key === "offering.groups" && ["COFFEE", "TEA"].includes(String(target.value.value))) ? "COFFEE" : targets.some(target => target.value.key === "offering.groups" && ["BEER", "WINE", "COCKTAILS", "NON_ALCOHOLIC_DRINKS", "SPIRITS", "CRAFT_BEER", "NATURAL_WINE"].includes(String(target.value.value))) ? "DRINKS" : "EAT";
      if (source.status === "EXCLUDED") intent = null;
    } else if (source.aspect === "LOCATION" && source.semanticLocation) {
      const wanted = source.semanticLocation.city;
      const equivalents = [wanted, "Basel", "Bâle", "Genève", "Geneva", "Genf", "Zürich", "Zurich"].filter((city): city is string => city !== null && canonicalRequestedCity(city) === canonicalRequestedCity(wanted ?? ""));
      const city = equivalents.find(city => new RegExp(`(?<![\\p{L}\\p{N}])${normalize(city).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(normalize(request.naturalLanguage))) ?? wanted;
      targets.push({ dimension: "LOCATION", value: { kind: "LOCATION", ...source.semanticLocation, city } });
    } else if (source.aspect === "TIME" && source.semanticTime) {
      const time = source.semanticTime;
      if (time.event) {
        const known: Readonly<Record<string, string>> = { "check in": "CHECK_IN", "work end": "WORK_END", "film start": "FILM_START", "meal end": "MEAL_END" };
        const event = known[key(time.event.name)];
        if (event) targets.push({ dimension: "TIME", value: { kind: "TIME", ...time, event: { event, relation: time.event.relation, ...(time.event.clockTime ? { clockTime: time.event.clockTime } : {}) } } });
        else {
          unsupported = true;
          const { event: _event, ...calendar } = time;
          if (calendar.openNow || calendar.localDate !== null || calendar.relativeDays !== null || calendar.weekday !== null || calendar.dayPhase !== null || calendar.clockTime !== null || calendar.monthDay)
            targets.push({ dimension: "TIME", value: { kind: "TIME", ...calendar } });
        }
      } else targets.push({ dimension: "TIME", value: { kind: "TIME", ...time } });
    } else if (source.aspect === "BUDGET" && source.numericValue !== null && ["LT", "LTE"].includes(source.comparison ?? "") && Math.abs(source.numericValue * 100 - Math.round(source.numericValue * 100)) < .000001) {
      targets.push({ dimension: "BUDGET", value: { kind: "BUDGET", amountMinor: Math.round(source.numericValue * 100), currency: currency(source.unit), comparison: source.comparison, basis: basis(source.basis), includes: source.costComponents } });
      const pricedConcept = key(source.description).replace(/^(?:for |maximum |max )| (?:budget|cost|price|ceiling|limit)$/gu, "");
      const priced = atom(pricedConcept, "OFFERING");
      if (priced) targets.push(priced);
      else if (!["budget", "meal", "food", "admission", "entry", "drinks", "drink", "materials", "transport", "total budget", "total"].includes(pricedConcept)) unsupported = true;
    } else if (source.aspect === "DURATION" && source.numericValue !== null && source.comparison === "EQ" && Number.isInteger(source.numericValue) && ["minutes", "minute", "minuten", "min"].includes(key(source.unit ?? ""))) {
      targets.push({ dimension: "DURATION", value: { kind: "DURATION", minutes: source.numericValue, length: null } });
    } else {
      const target = atom(source.description, source.aspect);
      if (target?.value.kind === "NEED" && source.participantIds.length === 1) targets.push({ ...target, value: { ...target.value, scope: "ONE_PERSON" } });
      else if (target) targets.push(target); else unsupported = true;
    }
    const unique = [...new Map(targets.map(target => [contentHash(target), target])).values()];
    if (unique.length > 4) return { sourceId: source.id, state: "UNSUPPORTED", intent: null, targets: [] };
    const hasMapping = intent !== null || unique.length > 0;
    return { sourceId: source.id, state: !hasMapping ? "UNSUPPORTED" : unsupported ? "PARTIAL" : "MAPPED", intent, targets: unique };
  });
  // The same existing grounding, scope, polarity, exact-budget and binding
  // guards apply. If one term cannot pass them, preserve that node as unsupported
  // instead of spending another model call or producing an invented filter.
  const accepted: typeof rows = [];
  for (const row of rows) {
    const trial = rows.map(other => other.sourceId === row.sourceId ? row : { sourceId: other.sourceId, state: "UNSUPPORTED", intent: null, targets: [] });
    try { bindProductMeaningSearchPlan(request, meaning, { mappings: trial }, sources, "SOURCE_NODE"); accepted.push(row); }
    catch { accepted.push({ sourceId: row.sourceId, state: "UNSUPPORTED", intent: null, targets: [] }); }
  }
  return bindProductMeaningSearchPlan(request, meaning, { mappings: accepted }, sources, "SOURCE_NODE");
}
