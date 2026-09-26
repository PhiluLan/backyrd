import { AUTHORING_CATALOG_HASH, AUTHORING_CATALOG_VERSION, AUTHORING_FIELDS, validateAuthoringSubmission } from "./authoring.js";
import { hashBody } from "./canonical.js";

export const WORLD_RESEARCH_BATCH_VERSION = "backyrd.world-research-batch@1.0" as const;
export const WORLD_RESEARCH_TRUST_LEVELS = ["OFFICIAL_PRIMARY", "AUTHORITATIVE_PRIMARY", "CORROBORATED_SECONDARY"] as const;
export type WorldResearchTrustLevel = typeof WORLD_RESEARCH_TRUST_LEVELS[number];

export type WorldResearchExistingValue = {
  claimId: string;
  knowledgeState: string;
  value: unknown;
};

export type WorldResearchBatchSpot = {
  spotId: string;
  name: string;
  locality: string | null;
  manifestHash: string;
  existingValues: Record<string, WorldResearchExistingValue>;
};

export type WorldResearchFieldCatalogEntry = {
  attributeKey: string;
  valueType: string;
  label: string;
  help: string;
  allowedValues: Array<{ value: string; label: string }>;
};

export type WorldResearchClaim = {
  attributeKey: string;
  knowledgeState: "KNOWN_TRUE" | "KNOWN_FALSE" | "KNOWN_VALUE";
  value: unknown;
  source: {
    url: string;
    evidence: string;
    observedAt: string;
    trust: WorldResearchTrustLevel;
  };
};

export type WorldResearchUnresolved = { attributeKey: string; reason: string };
export type WorldResearchSpotResult = { spotId: string; claims: WorldResearchClaim[]; unresolved: WorldResearchUnresolved[] };

export type WorldResearchBatchDocument = {
  contractVersion: typeof WORLD_RESEARCH_BATCH_VERSION;
  purpose: "ADMIN_ASSISTED_RESEARCH";
  batch: {
    batchId: string;
    createdAt: string;
    authoringCatalogVersion: typeof AUTHORING_CATALOG_VERSION;
    authoringCatalogHash: string;
    spots: WorldResearchBatchSpot[];
  };
  fieldCatalog: WorldResearchFieldCatalogEntry[];
  research: { instructions: string[]; spots: WorldResearchSpotResult[] };
  exportHash: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeText = (value: unknown, max: number): string | null => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
const hasSensitiveMaterial = (value: string) => /(?:bearer\s+[a-z0-9._-]+|api[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|password\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(value);

function exportCore(document: Pick<WorldResearchBatchDocument, "contractVersion" | "purpose" | "batch" | "fieldCatalog">) {
  return { contractVersion: document.contractVersion, purpose: document.purpose, batch: document.batch, fieldCatalog: document.fieldCatalog };
}

export function createWorldResearchBatch(input: { batchId: string; createdAt: string; spots: WorldResearchBatchSpot[] }): WorldResearchBatchDocument {
  if (!UUID.test(input.batchId) || !ISO_INSTANT.test(input.createdAt) || input.spots.length < 1 || input.spots.length > 10) throw new Error("world_research_export_input_invalid");
  if (new Set(input.spots.map((spot) => spot.spotId)).size !== input.spots.length) throw new Error("world_research_export_duplicate_spot");
  for (const spot of input.spots) {
    if (!UUID.test(spot.spotId) || !safeText(spot.name, 240) || !SHA256.test(spot.manifestHash)) throw new Error("world_research_export_spot_invalid");
  }
  const fieldCatalog = AUTHORING_FIELDS.filter((field) => field.roles.includes("ADMIN")).map((field) => ({
    attributeKey: field.attributeKey,
    valueType: field.valueType,
    label: field.label,
    help: field.help,
    allowedValues: field.allowedValues.filter((entry) => entry.state !== "NOT_CONFIGURED").map(({ value, label }) => ({ value, label })),
  }));
  const body = {
    contractVersion: WORLD_RESEARCH_BATCH_VERSION,
    purpose: "ADMIN_ASSISTED_RESEARCH" as const,
    batch: { batchId: input.batchId, createdAt: input.createdAt, authoringCatalogVersion: AUTHORING_CATALOG_VERSION, authoringCatalogHash: AUTHORING_CATALOG_HASH, spots: input.spots },
    fieldCatalog,
  };
  return {
    ...body,
    research: {
      instructions: [
        "Verändere batch, fieldCatalog und exportHash nicht.",
        "Trage ausschließlich öffentlich belegte Angaben in research.spots ein.",
        "Nutze nur Feldnamen und Werte aus fieldCatalog.",
        "Nicht belastbar belegte Felder gehören in unresolved und niemals als false oder UNKNOWN in claims.",
        "Gib dieses vollständige JSON-Dokument ohne Markdown zurück.",
      ],
      spots: input.spots.map((spot) => ({ spotId: spot.spotId, claims: [], unresolved: [] })),
    },
    exportHash: hashBody(body, []),
  };
}

export type ParsedWorldResearchBatch = WorldResearchBatchDocument & { validatedClaims: Map<string, WorldResearchClaim[]> };

export function parseWorldResearchBatch(input: unknown): ParsedWorldResearchBatch {
  const root = object(input);
  if (root.contractVersion !== WORLD_RESEARCH_BATCH_VERSION || root.purpose !== "ADMIN_ASSISTED_RESEARCH") throw new Error("world_research_contract_invalid");
  const batch = object(root.batch);
  const batchId = safeText(batch.batchId, 64);
  const createdAt = safeText(batch.createdAt, 40);
  const spots = Array.isArray(batch.spots) ? batch.spots : [];
  const fieldCatalog = Array.isArray(root.fieldCatalog) ? root.fieldCatalog : [];
  if (!batchId || !UUID.test(batchId) || !createdAt || !ISO_INSTANT.test(createdAt)
    || batch.authoringCatalogVersion !== AUTHORING_CATALOG_VERSION || batch.authoringCatalogHash !== AUTHORING_CATALOG_HASH
    || spots.length < 1 || spots.length > 10 || fieldCatalog.length !== AUTHORING_FIELDS.filter((field) => field.roles.includes("ADMIN")).length) throw new Error("world_research_export_binding_invalid");
  const typedSpots = spots as WorldResearchBatchSpot[];
  if (new Set(typedSpots.map((spot) => spot.spotId)).size !== typedSpots.length
    || typedSpots.some((spot) => !UUID.test(spot.spotId) || !safeText(spot.name, 240) || !SHA256.test(spot.manifestHash) || !spot.existingValues || typeof spot.existingValues !== "object")) throw new Error("world_research_spot_binding_invalid");
  const canonicalCatalog = createWorldResearchBatch({ batchId, createdAt, spots: typedSpots }).fieldCatalog;
  if (hashBody({ fieldCatalog }, []) !== hashBody({ fieldCatalog: canonicalCatalog }, [])) throw new Error("world_research_catalog_drift");
  const bound = { contractVersion: root.contractVersion, purpose: root.purpose, batch: root.batch, fieldCatalog: root.fieldCatalog } as Pick<WorldResearchBatchDocument, "contractVersion" | "purpose" | "batch" | "fieldCatalog">;
  if (root.exportHash !== hashBody(exportCore(bound), [])) throw new Error("world_research_export_hash_invalid");
  const research = object(root.research);
  const researchedSpots = Array.isArray(research.spots) ? research.spots : [];
  if (researchedSpots.length !== typedSpots.length) throw new Error("world_research_result_spot_count_invalid");
  const selected = new Set(typedSpots.map((spot) => spot.spotId));
  const validatedClaims = new Map<string, WorldResearchClaim[]>();
  const seenResearchSpots = new Set<string>();
  for (const rawSpot of researchedSpots) {
    const result = object(rawSpot);
    const spotId = safeText(result.spotId, 64);
    if (!spotId || !selected.has(spotId) || seenResearchSpots.has(spotId)) throw new Error("world_research_result_spot_invalid");
    seenResearchSpots.add(spotId);
    const claims = Array.isArray(result.claims) ? result.claims : [];
    const unresolved = Array.isArray(result.unresolved) ? result.unresolved : [];
    const seenFields = new Set<string>();
    const parsedClaims: WorldResearchClaim[] = [];
    for (const rawClaim of claims) {
      const claim = object(rawClaim);
      const attributeKey = safeText(claim.attributeKey, 120);
      const source = object(claim.source);
      const urlText = safeText(source.url, 800);
      const evidence = safeText(source.evidence, 1200);
      const observedAt = safeText(source.observedAt, 40);
      const trust = source.trust;
      let url: URL;
      try { url = new URL(urlText ?? ""); } catch { throw new Error("world_research_source_url_invalid"); }
      if (!attributeKey || seenFields.has(attributeKey) || url.protocol !== "https:" || url.username || url.password
        || [...url.searchParams.keys()].some((key) => /token|secret|key|auth|session|email/i.test(key))
        || !evidence || hasSensitiveMaterial(evidence) || !observedAt || !ISO_INSTANT.test(observedAt)
        || !WORLD_RESEARCH_TRUST_LEVELS.includes(trust as WorldResearchTrustLevel)) throw new Error(`world_research_claim_invalid:${attributeKey ?? "unknown"}`);
      const validated = validateAuthoringSubmission(attributeKey, claim.knowledgeState, claim.value);
      if (!validated.ok || claim.knowledgeState === "UNKNOWN") throw new Error(`world_research_value_invalid:${attributeKey}`);
      seenFields.add(attributeKey);
      parsedClaims.push({ attributeKey, knowledgeState: claim.knowledgeState as WorldResearchClaim["knowledgeState"], value: validated.value, source: { url: url.toString(), evidence, observedAt, trust: trust as WorldResearchTrustLevel } });
    }
    for (const rawGap of unresolved) {
      const gap = object(rawGap);
      const attributeKey = safeText(gap.attributeKey, 120);
      const reason = safeText(gap.reason, 500);
      if (!attributeKey || seenFields.has(attributeKey) || !AUTHORING_FIELDS.some((field) => field.attributeKey === attributeKey) || !reason || hasSensitiveMaterial(reason)) throw new Error(`world_research_unresolved_invalid:${attributeKey ?? "unknown"}`);
      seenFields.add(attributeKey);
    }
    validatedClaims.set(spotId, parsedClaims);
  }
  return { ...(root as WorldResearchBatchDocument), validatedClaims };
}
