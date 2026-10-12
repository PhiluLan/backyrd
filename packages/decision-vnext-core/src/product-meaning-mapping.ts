import { contentHash, deepFreeze } from "./canonical.js";
import { PRODUCT_V1_INTENT_MAPPINGS, type ProductV1Intent } from "./product-v1-authority.js";
import { PRODUCT_QUERY_CATALOG_HASH, encodeWorldPreference, encodeWorldQueryConstraint, projectRequirementFacets } from "./product-query-semantics.js";
import { canonicalRequestedCity, bindProductUnderstanding, parseModelRequirements, type ProductRequirement, type ProductInterpretation, type ProductVisitAlternative } from "./product-request-understanding.js";
import { PRODUCT_REQUEST_MEANING_VERSION, PRODUCT_REQUEST_MEANING_POLICY, parseProductRequestMeaning, type ProductRequestMeaning } from "./product-request-meaning.js";
import { DecisionProductRequestSchema, type DecisionProductRequest } from "./product-v1-contracts.js";

export const PRODUCT_MEANING_MAPPING_VERSION = "backyrd.decision-vnext.meaning-mapping@1.0" as const;
export const PRODUCT_MEANING_MAPPING_POLICY = "meaning-mapping-policy-v5" as const;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("product_meaning_mapping_shape_invalid");
  return value as Record<string, unknown>;
};
const exact = (row: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(row).sort().join() === [...keys].sort().join();
const intentSet = new Set<string>(PRODUCT_V1_INTENT_MAPPINGS.map(row => row.intentId));
export type ProductMeaningMappingRow = {
  readonly sourceId: string; readonly state: "MAPPED" | "UNSUPPORTED" | "CONTEXT_ONLY";
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
const inclusionWords: Readonly<Record<string, RegExp>> = {
  TIP: /trinkgeld|tip|pourboire/u, MATERIALS: /material|fournitures/u, TRANSPORT: /\b(?:transport|anreise|fahrt|tram|bus|zugfahrt|zugticket)\b/u,
  ADMISSION: /eintritt|admission|entree/u, FOOD: /essen|food|meal|repas|plat|hauptgericht/u, DRINKS: /getrank|drink|boisson/u,
};
const active = (status: string) => ["REQUESTED", "OPTIONAL", "EXCLUDED"].includes(status);
export function productMeaningMappingNodes(meaning: ProductRequestMeaning) {
  return [...meaning.activities, ...meaning.constraints].filter(row => active(row.status));
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
  proposal: unknown, sources: Readonly<Record<string, string>>): ProductMeaningSearchPlan {
  DecisionProductRequestSchema.parse(request); validateProductMeaningMappingSource(request, meaning, sources);
  const root = object(proposal);
  if (!exact(root, ["mappings"]) || !Array.isArray(root.mappings)) throw new Error("product_meaning_mapping_shape_invalid");
  const nodes = productMeaningMappingNodes(meaning); const rows = new Map<string, ProductMeaningMappingRow>();
  for (const input of root.mappings) {
    const row = object(input);
    if (!exact(row, ["sourceId", "state", "intent", "targets"]) || typeof row.sourceId !== "string" || rows.has(row.sourceId)
      || !["MAPPED", "UNSUPPORTED"].includes(String(row.state)) || !Array.isArray(row.targets) || row.targets.length > 4
      || row.intent !== null && (typeof row.intent !== "string" || !intentSet.has(row.intent))) throw new Error("product_meaning_mapping_shape_invalid");
    const source = nodes.find(node => node.id === row.sourceId);
    if (!source) throw new Error("product_meaning_mapping_source_invalid");
    if (("aspect" in source || source.status === "EXCLUDED") && row.intent !== null || row.state === "UNSUPPORTED" && (row.intent !== null || row.targets.length))
      throw new Error("product_meaning_mapping_state_invalid");
    const requirements = row.targets.flatMap(input => {
      const target = object(input);
      if (!exact(target, ["dimension", "value", "evidence"]) || typeof target.evidence !== "string"
        || !source.evidence.includes(target.evidence) || !Object.hasOwn(sources, target.evidence)
        || target.dimension === "AGE" || target.dimension === "COMPANY") throw new Error("product_meaning_mapping_target_invalid");
      const parsed = parseModelRequirements([{ dimension: target.dimension, value: target.value, evidence: sources[target.evidence],
        importance: source.status === "OPTIONAL" ? "PREFERRED" : source.status === "EXCLUDED" || "numericValue" in source && source.numericValue !== null ? "HARD" : "ESSENTIAL",
        operator: source.status === "EXCLUDED" ? "EXCLUDE" : "REQUIRE", origin: "EXPLICIT", interpretationState: "UNDERSTOOD",
        alternatives: [], group: null, condition: null }], request.naturalLanguage, 2000);
      for (const item of parsed) {
        if (item.value?.kind === "BUDGET" && (!("aspect" in source) || source.aspect !== "BUDGET" || source.numericValue === null))
          throw new Error("product_meaning_mapping_budget_changed");
        if ("aspect" in source && source.aspect === "BUDGET" && source.numericValue !== null) {
          if (item.value?.kind !== "BUDGET" || !["LT", "LTE"].includes(source.comparison ?? "")
            || Math.abs(source.numericValue * 100 - Math.round(source.numericValue * 100)) > 0.000001
            || item.value.amountMinor !== Math.round(source.numericValue * 100) || item.value.comparison !== source.comparison
            || item.value.currency !== currency(source.unit) || item.value.basis !== basis(source.basis))
            throw new Error("product_meaning_mapping_budget_changed");
          const description = normalize(`${source.description} ${source.basis ?? ""}`);
          const includes = item.value.includes ?? [];
          // Only positively included components qualify. Merely mentioning
          // drinks in "ohne Getränke" must never turn them into included costs.
          const inclusionText = description
            .replace(/\b(?:nicht|not|pas)\s+(?:inkl(?:usive)?|included|including|compris)\b[^,.;]*/gu, "")
            .replace(/\bund\s+[^,.;]*\b(?:extra|separat)\b[^,.;]*/gu, "")
            .split(",").filter(clause => !/\b(?:extra|separat|excluded)\b/u.test(clause)).join(",");
          const positive = [...inclusionText.matchAll(/\b(?:inkl(?:usive)?\.?|einschliesslich|including|included|incl\.?|avec|compris)\b\s*([^.;]*)/gu)]
            .map(match => match[1]!.split(/\b(?:ohne|sans|excluding|excluded|extra|separat|aber|but|jedoch)\b/u)[0]).join(" ");
          const expected = Object.entries(inclusionWords).filter(([, words]) => words.test(positive)).map(([component]) => component);
          if (includes.some(component => !expected.includes(component)) || expected.some(component => !includes.includes(component as (typeof includes)[number])))
            throw new Error("product_meaning_mapping_budget_includes_changed");
        }
      }
      return parsed;
    });
    if (row.state === "MAPPED" && row.intent === null && !requirements.length) throw new Error("product_meaning_mapping_empty_target");
    const placeTypes = requirements.flatMap(requirement => requirement.value?.kind === "FACET" && requirement.value.key === "classification.place_types" && requirement.operator === "REQUIRE" ? [requirement.value.value] : []);
    const intent = row.intent === null && !("aspect" in source) && source.status !== "EXCLUDED" && placeTypes.length
      ? PRODUCT_V1_INTENT_MAPPINGS.find(mapping => placeTypes.every(type => (mapping.acceptedPlaceTypes as readonly string[]).includes(type)))?.intentId ?? null
      : row.intent as ProductV1Intent | null;
    if (intent && placeTypes.some(type => !(PRODUCT_V1_INTENT_MAPPINGS.find(mapping => mapping.intentId === intent)!.acceptedPlaceTypes as readonly string[]).includes(type)))
      throw new Error("product_meaning_mapping_intent_conflict");
    rows.set(source.id, { sourceId: source.id, state: row.state as "MAPPED" | "UNSUPPORTED", intent, requirements });
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
    return mapping.state === "MAPPED" && mapping.intent !== null ? [{ id: source.id, intent: mapping.intent, preferred: source.status === "OPTIONAL",
      requirements: mapping.requirements.map(row => ({ ...row, importance: row.importance === "PREFERRED" ? "ESSENTIAL" as const : row.importance })), unresolved: false }] : [];
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
  const requirements: ProductRequirement[] = []; let unresolved = meaning.uncertainties.length > 0;
  const alternativeUnmapped = singleVisitChoice && branches.length !== choices.length;
  for (const source of [...meaning.activities, ...meaning.constraints]) {
    if (!active(source.status)) continue;
    const mapping = plan.mappings.find(row => row.sourceId === source.id)!;
    const global = "activityIds" in source && (source.activityIds.length === 0 || visitIds.length > 0
      && source.activityIds.length === visitIds.length && visitIds.every(id => source.activityIds.includes(id)));
    const commonContext = "aspect" in source && ["LOCATION", "TIME", "BUDGET"].includes(source.aspect) && source.participantIds.length === 0
      && (source.activityIds.length === 0 || choices.length > 0 && choices.every(visit => source.activityIds.includes(visit.id))
        && source.activityIds.every(id => choices.some(visit => visit.id === id)));
    const personCapability = "participantIds" in source && source.participantIds.length === 1
      && meaning.participants.some(person => person.id === source.participantIds[0] && person.participation === "CONFIRMED")
      && mapping.requirements.length > 0 && mapping.requirements.every(row => row.value?.kind === "NEED" && row.value.scope === "ONE_PERSON");
    const solePersonBudget = "aspect" in source && source.aspect === "BUDGET" && source.participantIds.length === 1
      && meaning.participants.filter(row => row.participation === "CONFIRMED").length === 1
      && meaning.participants.some(row => row.id === source.participantIds[0] && row.entityType === "PERSON" && row.participation === "CONFIRMED")
      && mapping.requirements.length > 0 && mapping.requirements.every(row => row.value?.kind === "BUDGET" && row.value.basis === "PER_PERSON");
    const scoped = "activityIds" in source && (!global && !commonContext || source.participantIds.length > 0 && !personCapability && !solePersonBudget);
    const relation = "afterActivityId" in source && (source.afterActivityId !== null || source.replacesActivityId !== null || source.status === "OPTIONAL");
    if (singleVisitChoice && "afterActivityId" in source && choices.some(choice => choice.id === source.id)) continue;
    if (singleVisitChoice && "activityIds" in source && source.activityIds.length > 0 && !global && !commonContext) {
      const owners = branches.filter(branch => source.activityIds.includes(branch.id));
      if (mapping.state !== "MAPPED" || source.condition !== null || source.alternativeGroup !== null || source.participantIds.length > 0) {
        for (const owner of owners) branchUnresolved.add(owner.id);
      } else {
        for (const owner of owners) owner.requirements.push(...mapping.requirements);
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
    if (mapping.state !== "MAPPED" || source.condition !== null || source.alternativeGroup !== null || scoped || relation || !primary && !singleVisitChoice && !commonContext) {
      unresolved = true; continue;
    }
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
  if (meaning.participants.some(row => row.participation !== "BACKGROUND" && (row.participation === "POSSIBLE" || row.entityType === "ANIMAL" || row.entityType === "GROUP")) || confirmed.length > 1) unresolved = true;
  // A participant list may describe companions without an explicit self node.
  // Its length is not a total party size and cannot prove a solo visit.
  const family = confirmed.some(row => /(?<!\p{L})(?:tochter|sohn|kinder?|daughter|son|child(?:ren)?|kids?|fille|fils|enfants?)(?!\p{L})/u.test(normalize(row.role)));
  if (confirmed.length) requirements.push({ dimension: "COMPANY", importance: "ESSENTIAL", operator: "REQUIRE", origin: "EXPLICIT", interpretationState: "UNDERSTOOD",
    value: { kind: "COMPANY", size: null, adultPresent: ages.some(age => age >= 18) ? true : null, companionType: family ? "FAMILY" : null }, alternatives: [], group: null });
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
  return { request: interpreted, understanding: bindProductUnderstanding(interpreted, bounded, "MEANING_PLAN", agePartial ? true : undefined, branches.length ? branches.map(branch => ({ ...branch, unresolved: branchUnresolved.has(branch.id) })) : undefined) };
}
