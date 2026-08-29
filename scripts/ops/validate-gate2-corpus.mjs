#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateGate2Snapshot } from "./gate2-corpus-assertions.mjs";

const city = process.env.GATE2_CITY?.trim() || "Basel";
const baseUrl = (process.env.GATE2_SUPABASE_URL || process.env.D0_2_SUPABASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.GATE2_SUPABASE_SERVICE_KEY || process.env.D0_2_SUPABASE_SERVICE_KEY;
const baselineFlag = process.argv.indexOf("--baseline");
const baselinePath = baselineFlag >= 0 ? process.argv[baselineFlag + 1] : null;
const writeFlag = process.argv.indexOf("--write");
const writePath = writeFlag >= 0 ? process.argv[writeFlag + 1] : null;

if (!baseUrl || !apiKey) {
  throw new Error("GATE2_SUPABASE_URL and GATE2_SUPABASE_SERVICE_KEY are required");
}
if (baselineFlag >= 0 && !baselinePath) throw new Error("--baseline requires a path");
if (writeFlag >= 0 && !writePath) throw new Error("--write requires a path");

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

async function selectAll(table, columns, query = "") {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await request(
      `${table}?select=${encodeURIComponent(columns)}${query}&limit=${pageSize}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("de-CH")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const grouped = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
};
const pct = (value, total) => total ? Number(((value / total) * 100).toFixed(1)) : 0;
const currentStatus = (status) => status === "ACTIVE" || status === "UNKNOWN";

const [
  spots,
  categories,
  hours,
  photos,
  content,
  n4Evidence,
  facts,
  sources,
  factCatalog,
  authoringProfiles,
  documents,
  embeddings,
  embeddingJobs,
  n4Dimensions,
] = await Promise.all([
  selectAll("spots", "id,name,address,lat,lng,status,website,phone,header_photo_path,category_id,city,country,google_place_id,google_photo_enabled,data_origin,updated_at"),
  selectAll("categories", "id,name"),
  selectAll("spot_hours", "spot_id,day_of_week,open_time,close_time,idx"),
  selectAll("spot_photos", "spot_id,url"),
  selectAll("spot_effective_content_v1", "spot_id,description_source,effective_description,effective_keywords"),
  selectAll("backyrd_spot_intelligence_evidence_v1", "spot_id,dimension_key,source_family,source_reference,signal_confidence,status,data_origin,evidence_contract_version"),
  selectAll("backyrd_spot_accepted_facts_v1", "spot_id,field_key,value,source_id,status,confidence_policy_result,observed_at,last_checked_at,valid_until,contract_version,semantic_contract_version,evidence_scope,interpretation_basis"),
  selectAll("backyrd_spot_sources_v1", "id,spot_id,source_type,source_reference,title,provider_identity,observed_at,last_checked_at,legal_use_status,created_by_type,contract_version"),
  selectAll("backyrd_spot_fact_catalog_v1", "field_key,value_kind,allowed_values"),
  selectAll("backyrd_spot_authoring_profiles_v2", "spot_id,primary_archetype,secondary_archetypes"),
  selectAll("backyrd_spot_ml_documents_v1", "spot_id,source_hash,document_version,updated_at"),
  selectAll("backyrd_spot_embeddings_v1", "spot_id,source_hash,document_version,model_name,model_dimensions,updated_at"),
  selectAll("backyrd_embedding_jobs_v1", "spot_id,status,attempts,max_attempts,last_error,updated_at"),
  selectAll("backyrd_spot_intelligence_dimensions_v1", "dimension_key,value_kind,semantic_family,schema_version"),
]);

const categoryById = new Map(categories.map((row) => [row.id, row.name]));
const contentBySpot = new Map(content.map((row) => [row.spot_id, row]));
const sourceById = new Map(sources.map((row) => [row.id, row]));
const catalogByField = new Map(factCatalog.map((row) => [row.field_key, row]));
const authoringBySpot = new Map(authoringProfiles.map((row) => [row.spot_id, row]));
const hoursBySpot = grouped(hours, "spot_id");
const photosBySpot = grouped(photos, "spot_id");
const factsBySpot = grouped(facts.filter((row) => currentStatus(row.status)), "spot_id");
const n4BySpot = grouped(n4Evidence.filter((row) => row.status === "ACTIVE" && !["TEST", "FIXTURE"].includes(row.data_origin)), "spot_id");
const documentBySpot = new Map(documents.map((row) => [row.spot_id, row]));
const embeddingBySpot = new Map(embeddings.map((row) => [row.spot_id, row]));

const product = spots.filter((spot) => !["TEST", "FIXTURE"].includes(spot.data_origin));
const approvedProduct = product.filter((spot) => spot.status === "approved");
const launch = approvedProduct.filter((spot) => normalize(spot.city) === normalize(city));
const launchIds = new Set(launch.map((spot) => spot.id));

const distribution = launch.length ? await request("rpc/distribution_trust_filter_entities_v1", {
  method: "POST",
  body: JSON.stringify({ p_entity_type: "spot", p_entity_ids: [...launchIds], p_surface: "decision" }),
}) : [];
const eligibleIds = new Set(distribution.filter((row) => row.eligible).map((row) => row.entity_id));

function validFactValue(fact) {
  const contract = catalogByField.get(fact.field_key);
  if (!contract || fact.value === null || fact.value === undefined) return false;
  const kind = contract.value_kind;
  const value = fact.value;
  const allowed = Array.isArray(contract.allowed_values) ? contract.allowed_values : [];
  if (kind === "TEXT") return typeof value === "string" && value.length <= 4000;
  if (kind === "BOOLEAN") return typeof value === "boolean";
  if (kind === "ENUM") return allowed.some((item) => JSON.stringify(item) === JSON.stringify(value));
  if (kind === "MULTI_SELECT") return Array.isArray(value) && value.length <= 40
    && (allowed.length === 0 || value.every((item) => allowed.some((allowedItem) => JSON.stringify(allowedItem) === JSON.stringify(item))));
  if (kind === "RANGE" || kind === "STRUCTURED_OBJECT") return value && typeof value === "object" && !Array.isArray(value) && JSON.stringify(value).length <= 8000;
  return false;
}

function canonicalFacts(spotId) {
  return (factsBySpot.get(spotId) ?? []).filter((fact) =>
    fact.evidence_scope === "SPOT"
    && fact.semantic_contract_version === "backyrd-canonical-semantics-v1"
    && fact.source_id
    && sourceById.has(fact.source_id)
    && validFactValue(fact));
}

function factMap(spotId) {
  return new Map(canonicalFacts(spotId).filter((fact) => fact.status === "ACTIVE").map((fact) => [fact.field_key, fact]));
}

function derivedArchetype(spot) {
  const explicit = authoringBySpot.get(spot.id)?.primary_archetype;
  if (explicit) return explicit;
  const activity = factMap(spot.id).get("activity.types")?.value;
  if (Array.isArray(activity) && activity.some((item) => ["BOULDERING", "CLIMBING"].includes(item))) return "BOULDER_CLIMBING";
  if (Array.isArray(activity) && activity.includes("ANIMALS")) return "ZOO";
  return ({
    bar: "BAR", weinbar: "WINE_BAR", restaurant: "RESTAURANT", cafe: "CAFE", museum: "MUSEUM",
    kino: "CULTURAL_VENUE", nachtleben: "NIGHTLIFE", aktivitat: "INDOOR_ACTIVITY",
    aussichtspunkt: "VIEWPOINT_LANDMARK", spaziergang: "PARK_GARDEN",
    "unterkunft hotel": "HOTEL", event: "EVENT_VENUE", "wellness spa": "INDOOR_ACTIVITY",
    "besonderes erlebnis": "MULTI_PURPOSE",
  })[normalize(categoryById.get(spot.category_id))] ?? "UNKNOWN";
}

const reasonFields = new Set([
  "social.suitability", "suitability.environment", "suitability.rain", "time.dayparts",
  "activity.types", "offering.availability", "purpose.occasions", "character.noise",
  "suitability.conversation", "duration.approximate",
]);

const rows = launch.map((spot) => {
  const spotHours = hoursBySpot.get(spot.id) ?? [];
  const spotFacts = canonicalFacts(spot.id);
  const n4Dimensions = new Set((n4BySpot.get(spot.id) ?? []).filter((row) => row.source_reference).map((row) => row.dimension_key)).size;
  const descriptionLength = contentBySpot.get(spot.id)?.effective_description?.trim().length ?? 0;
  const identityReady = Boolean(spot.id && spot.name?.trim() && spot.address?.trim()
    && Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lng))
    && Number(spot.lat) >= 47.4 && Number(spot.lat) <= 47.7
    && Number(spot.lng) >= 7.4 && Number(spot.lng) <= 7.8
    && categoryById.has(spot.category_id));
  const discoveryReady = identityReady && eligibleIds.has(spot.id);
  const decisionReady = discoveryReady && derivedArchetype(spot) !== "UNKNOWN" && n4Dimensions >= 3;
  const detailReady = discoveryReady && descriptionLength >= 80;
  const reasonReady = decisionReady && spotFacts.some((fact) => reasonFields.has(fact.field_key));
  const document = documentBySpot.get(spot.id);
  const embedding = embeddingBySpot.get(spot.id);
  return {
    id: spot.id,
    name: spot.name,
    city: spot.city,
    postal_code: spot.address?.match(/\b40\d{2}\b/)?.[0] ?? null,
    category: categoryById.get(spot.category_id) ?? null,
    archetype: derivedArchetype(spot),
    readiness: {
      discovery: discoveryReady,
      decision: decisionReady,
      detail: detailReady,
      reason: reasonReady,
    },
    coverage: {
      description_length: descriptionLength,
      hour_days: new Set(spotHours.map((row) => row.day_of_week)).size,
      canonical_image: Boolean(spot.header_photo_path?.trim()),
      mobile_google_image: Boolean(spot.google_place_id?.trim() && spot.google_photo_enabled),
      gallery_images: (photosBySpot.get(spot.id) ?? []).filter((row) => row.url?.trim()).length,
      n4_dimensions: n4Dimensions,
      canonical_facts: spotFacts.length,
      canonical_reason_facts: spotFacts.filter((fact) => reasonFields.has(fact.field_key)).length,
      ml_document: Boolean(document),
      embedding: Boolean(embedding),
      stale_embedding: Boolean(document && embedding && (document.source_hash !== embedding.source_hash || document.document_version !== embedding.document_version)),
    },
  };
});

const factsFor = (spotId) => factMap(spotId);
const valueAt = (spotId, field, key) => {
  const value = factsFor(spotId).get(field)?.value;
  return key === undefined ? value : value?.[key];
};
const hasToken = (spotId, field, token) => {
  const value = valueAt(spotId, field);
  return Array.isArray(value) && value.includes(token);
};

const intentDefinitions = [
  ["coffee_morning", (id) => valueAt(id, "offering.availability", "COFFEE") === "AVAILABLE" && hasToken(id, "time.dayparts", "MORNING")],
  ["food_friends", (id) => valueAt(id, "offering.availability", "FOOD") === "AVAILABLE" && valueAt(id, "social.suitability", "friends") === "SUITABLE"],
  ["date_evening", (id) => valueAt(id, "social.suitability", "date") === "SUITABLE" && hasToken(id, "time.dayparts", "EVENING")],
  ["afterwork_drinks", (id) => valueAt(id, "purpose.occasions", "AFTERWORK") === "SUITABLE" && valueAt(id, "offering.availability", "DRINKS") === "AVAILABLE"],
  ["culture_rain", (id) => ["MUSEUM", "CULTURE", "HISTORY"].some((token) => hasToken(id, "activity.types", token)) && valueAt(id, "suitability.rain") === "SUITABLE"],
  ["family_rain", (id) => valueAt(id, "social.suitability", "family") === "SUITABLE" && valueAt(id, "suitability.rain") === "SUITABLE"],
  ["indoor_activity_friends", (id, row) => ["INDOOR_ACTIVITY", "BOULDER_CLIMBING", "MUSEUM", "CULTURAL_VENUE", "ZOO"].includes(row.archetype)
    && ["INDOOR", "MIXED"].includes(valueAt(id, "suitability.environment")) && valueAt(id, "social.suitability", "friends") === "SUITABLE"],
  ["craft_beer_friends", (id) => valueAt(id, "offering.availability", "CRAFT_BEER") === "AVAILABLE" && valueAt(id, "social.suitability", "friends") === "SUITABLE"],
  ["cocktails_date_evening", (id) => valueAt(id, "offering.availability", "COCKTAILS") === "AVAILABLE" && valueAt(id, "social.suitability", "date") === "SUITABLE" && hasToken(id, "time.dayparts", "EVENING")],
  ["quick_bite_lunch", (id) => valueAt(id, "purpose.occasions", "QUICK_BITE") === "SUITABLE" && valueAt(id, "offering.availability", "LUNCH") === "AVAILABLE"],
  ["quiet_solo", (id) => valueAt(id, "character.noise") === "QUIET" && valueAt(id, "social.suitability", "solo") === "SUITABLE"],
];

const intentMatrix = intentDefinitions.map(([intent, predicate]) => {
  const matches = rows.filter((row) => predicate(row.id, row));
  const confidence = matches.filter((row) => canonicalFacts(row.id)
    .filter((fact) => reasonFields.has(fact.field_key))
    .every((fact) => Number(fact.confidence_policy_result) >= 0.9));
  return {
    intent,
    eligible_spots: matches.length,
    factually_informed: matches.length,
    strong_confidence: confidence.length,
    category_diversity: new Set(matches.map((row) => row.category)).size,
    archetype_diversity: new Set(matches.map((row) => row.archetype)).size,
    ready: matches.length >= 2 && confidence.length >= 2,
    spot_ids: matches.map((row) => row.id).sort(),
  };
});

const duplicateGroups = (keyFn) => [...grouped(launch.map((spot) => ({ ...spot, duplicate_key: keyFn(spot) })).filter((spot) => spot.duplicate_key), "duplicate_key").values()]
  .filter((group) => group.length > 1)
  .map((group) => group.map((spot) => ({ id: spot.id, name: spot.name })).sort((a, b) => a.id.localeCompare(b.id)));
const googleDuplicates = duplicateGroups((spot) => spot.google_place_id?.trim() || null);
const identityDuplicates = duplicateGroups((spot) => `${normalize(spot.name)}|${normalize(spot.address)}`);
const coordinateDuplicates = duplicateGroups((spot) => Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lng)) ? `${Number(spot.lat).toFixed(6)}|${Number(spot.lng).toFixed(6)}` : null);
const canonicalFactsInLaunch = facts.filter((fact) => launchIds.has(fact.spot_id) && currentStatus(fact.status)
  && fact.evidence_scope === "SPOT" && fact.semantic_contract_version === "backyrd-canonical-semantics-v1");
const invalidCanonicalFacts = canonicalFactsInLaunch.filter((fact) => !fact.source_id || !sourceById.has(fact.source_id) || !validFactValue(fact));
const currentOffering = canonicalFactsInLaunch.filter((fact) => fact.status === "ACTIVE" && fact.field_key === "offering.availability");
const hierarchyConflicts = currentOffering.filter((fact) => {
  const value = fact.value ?? {};
  return (value.FOOD === "NOT_AVAILABLE" && ["LUNCH", "DINNER", "BREAKFAST", "BRUNCH", "FULL_MEALS", "SMALL_PLATES", "SNACKS"].some((key) => value[key] === "AVAILABLE"))
    || (value.DRINKS === "NOT_AVAILABLE" && ["BEER", "WINE", "COCKTAILS", "NON_ALCOHOLIC", "CRAFT_BEER", "OWN_BREWED_BEER"].some((key) => value[key] === "AVAILABLE"));
});

const categoryCoverageByName = Object.fromEntries([...grouped(rows, "category")].sort(([a], [b]) => a.localeCompare(b)).map(([category, categoryRows]) => [category, {
  spots: categoryRows.length,
  discovery_ready: categoryRows.filter((row) => row.readiness.discovery).length,
  decision_ready: categoryRows.filter((row) => row.readiness.decision).length,
  detail_ready: categoryRows.filter((row) => row.readiness.detail).length,
  reason_ready: categoryRows.filter((row) => row.readiness.reason).length,
}]));

const spotIds = rows.map((row) => row.id).sort();
const sampleSeed = `${city}:BASEL_LAUNCH_CORPUS_V1:2026-08-29`;
const deterministicSample = [...rows]
  .sort((a, b) => sha256(`${sampleSeed}:${a.id}`).localeCompare(sha256(`${sampleSeed}:${b.id}`)))
  .slice(0, 12)
  .map((row) => row.id);
const weakestSample = [...rows]
  .sort((a, b) =>
    Number(a.readiness.reason) - Number(b.readiness.reason)
    || Number(a.readiness.detail) - Number(b.readiness.detail)
    || a.coverage.canonical_facts - b.coverage.canonical_facts
    || a.coverage.n4_dimensions - b.coverage.n4_dimensions
    || a.id.localeCompare(b.id))
  .slice(0, 12)
  .map((row) => row.id);
const referenceNames = new Set([
  "Volta Bräu", "KaBar", "Eatery77", "Naturhistorisches Museum Basel",
  "Zoo Basel", "ELYS Boulderloft", "Galizi", "Bäckerei Kult Volta",
]);
const manifestIdentity = sha256(JSON.stringify(rows.map((row) => ({ id: row.id, readiness: row.readiness, coverage: row.coverage }))
  .sort((a, b) => a.id.localeCompare(b.id))));
const snapshot = {
  contract_version: "BASEL_LAUNCH_CORPUS_V1",
  measured_at: new Date().toISOString(),
  methodology: {
    launch_geography: `Exact canonical city equality: ${city}`,
    discovery_ready: "Approved non-fixture Product Spot in the launch city with valid identity, category, Basel coordinate bounds and Distribution eligibility.",
    decision_ready: "Discovery Ready, known existing archetype, and at least three active source-bound N4 dimensions. This measures knowledge sufficiency; it is not ranking.",
    detail_ready: "Discovery Ready plus at least 80 characters of effective canonical description. Social content and authoritative photography are not required.",
    reason_ready: "Decision Ready plus at least one valid current source-bound canonical fact in an authorized factual-reason family.",
    core_intent_ready: "At least two source-bound, factually matched candidates and at least two with confidence >= 0.90.",
    invariants: [
      "Corpus Readiness asks whether enough trustworthy knowledge exists; Ranking chooses which eligible Spot fits best.",
      "Launch Readiness is neither Gold nor Admin Quality and never affects final_score.",
      "UNKNOWN is not converted to known.",
    ],
  },
  universe: {
    all_spots: spots.length,
    product_spots: product.length,
    approved_product_spots: approvedProduct.length,
    launch_product_spots: rows.length,
    discovery_ready: rows.filter((row) => row.readiness.discovery).length,
    decision_ready: rows.filter((row) => row.readiness.decision).length,
    detail_ready: rows.filter((row) => row.readiness.detail).length,
    reason_ready: rows.filter((row) => row.readiness.reason).length,
  },
  coverage: {
    valid_identity: rows.filter((row) => row.readiness.discovery).length,
    google_place_linked: launch.filter((spot) => spot.google_place_id?.trim()).length,
    opening_hours_any: rows.filter((row) => row.coverage.hour_days > 0).length,
    opening_hours_full_week: rows.filter((row) => row.coverage.hour_days === 7).length,
    canonical_web_image: rows.filter((row) => row.coverage.canonical_image).length,
    intentional_web_fallback: rows.filter((row) => !row.coverage.canonical_image).length,
    intentional_web_fallback_percent: pct(rows.filter((row) => !row.coverage.canonical_image).length, rows.length),
    mobile_google_image: rows.filter((row) => row.coverage.mobile_google_image).length,
    effective_description: rows.filter((row) => row.coverage.description_length >= 80).length,
    n4_three_dimensions: rows.filter((row) => row.coverage.n4_dimensions >= 3).length,
    canonical_fact_any: rows.filter((row) => row.coverage.canonical_facts > 0).length,
    ml_document: rows.filter((row) => row.coverage.ml_document).length,
    embedding: rows.filter((row) => row.coverage.embedding).length,
    stale_embedding: rows.filter((row) => row.coverage.stale_embedding).length,
  },
  category_coverage: categoryCoverageByName,
  geography: Object.fromEntries([...grouped(rows, "postal_code")].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([postal, postalRows]) => [postal ?? "UNKNOWN", postalRows.length])),
  core_intents: intentMatrix,
  sampling: {
    deterministic_seed: sampleSeed,
    deterministic_method: "Ascending SHA-256(seed + ':' + canonical UUID), first 12",
    deterministic_spot_ids: deterministicSample,
    adversarial_method: "Lowest Reason Ready, then Detail Ready, canonical facts, N4 dimensions, UUID",
    adversarial_spot_ids: weakestSample,
    reference_spot_ids: rows.filter((row) => referenceNames.has(row.name)).map((row) => row.id).sort(),
  },
  integrity: {
    product_visible_test_fixture: spots.filter((spot) => spot.status === "approved" && ["TEST", "FIXTURE"].includes(spot.data_origin)).length,
    broken_identity: rows.filter((row) => !row.readiness.discovery).length,
    invalid_critical_coordinates: launch.filter((spot) => !Number.isFinite(Number(spot.lat)) || !Number.isFinite(Number(spot.lng)) || Number(spot.lat) < 47.4 || Number(spot.lat) > 47.7 || Number(spot.lng) < 7.4 || Number(spot.lng) > 7.8).length,
    broken_category_references: launch.filter((spot) => !categoryById.has(spot.category_id)).length,
    google_place_duplicate_groups: googleDuplicates,
    normalized_identity_duplicate_groups: identityDuplicates,
    exact_coordinate_duplicate_groups: coordinateDuplicates,
    invalid_canonical_facts: invalidCanonicalFacts.map((fact) => ({ spot_id: fact.spot_id, field_key: fact.field_key, source_id: fact.source_id })).sort((a, b) => `${a.spot_id}:${a.field_key}`.localeCompare(`${b.spot_id}:${b.field_key}`)),
    offering_hierarchy_conflicts: hierarchyConflicts.map((fact) => ({ spot_id: fact.spot_id, field_key: fact.field_key })),
    n4_dimensions_registry: new Set(n4Dimensions.map((row) => row.dimension_key)).size,
    pending_or_processing_embedding_jobs: embeddingJobs.filter((job) => launchIds.has(job.spot_id) && ["pending", "processing"].includes(job.status)).length,
  },
  manifest: {
    identity_sha256: manifestIdentity,
    product_spot_ids_sha256: sha256(spotIds.join("\n")),
    product_spot_ids: spotIds,
    spots: rows.sort((a, b) => a.id.localeCompare(b.id)),
  },
};

let baseline = null;
if (baselinePath) {
  baseline = JSON.parse(await readFile(resolve(baselinePath), "utf8"));
}
snapshot.validation = validateGate2Snapshot(snapshot, baseline);

const output = `${JSON.stringify(snapshot, null, 2)}\n`;
if (writePath) await writeFile(resolve(writePath), output, "utf8");
process.stdout.write(output);
if (snapshot.validation.failures.length) process.exitCode = 1;
