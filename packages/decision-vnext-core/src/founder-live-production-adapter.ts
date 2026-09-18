import { createProductionRelevantUserProjectionPort } from "@backyrd/user-intelligence-vnext-core";
import { createFounderWorldKnowledgeReader, type FounderWorldCohortManifest } from "@backyrd/world-knowledge-core";
import { contentHash, deepFreeze } from "./canonical.js";
import { createCanonicalFounderLiveEvaluator, type FounderLivePorts } from "./founder-live-api.js";
import type { FounderLiveDurableIdempotencyPort } from "./founder-live-durable-idempotency.js";
import { createFounderLiveDurableRateLimitPort } from "./founder-live-durable-rate-limit.js";
import { createFounderLiveCanonicalUuidAllowlistPort, createFounderLiveServerRuntimeControl, createFounderLiveSupabaseAuthPort } from "./founder-live-server-authority.js";

export interface FounderLiveServerEnvironment { readonly [key: string]: string | undefined }
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const requireSecret = (environment: FounderLiveServerEnvironment, key: string): string => {
  const value = environment[key]; if (!value) throw new Error(`founder_live_server_config_missing:${key}`); return value;
};
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");

function parsePrivateWorldManifest(raw: string): FounderWorldCohortManifest {
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (!exactKeys(value, ["contractVersion", "scope", "cohortId", "frozenAt", "registryVersion", "registryHash", "policyVersion", "policyHash", "spots", "exclusions", "cohortHash"])) throw new Error("founder_live_world_manifest_shape_invalid");
  if (!Array.isArray(value.spots) || value.spots.length < 1 || value.spots.length > 40) throw new Error("founder_live_world_manifest_spots_invalid");
  const spots = value.spots as Array<Record<string, unknown>>;
  if (spots.some((spot) => !exactKeys(spot, ["spotId", "manifestHash", "snapshotHash", "contextHandoffHash"])) || new Set(spots.map((spot) => spot.spotId)).size !== spots.length) throw new Error("founder_live_world_manifest_identity_invalid");
  const withoutHash = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "cohortHash"));
  if (value.cohortHash !== contentHash(withoutHash)) throw new Error("founder_live_world_manifest_hash_invalid");
  return deepFreeze(value as unknown as FounderWorldCohortManifest);
}

/**
 * Server-side assembly boundary. It cannot become operational without the
 * separately authorised canonical User, durable idempotency and durable rate
 * limit ports. It has no write method. Secrets are read only by the server
 * process and never enter a Decision envelope or response.
 */
export function createFounderLiveProductionPorts(input: {
  readonly environment: FounderLiveServerEnvironment;
  readonly userProjectionConfiguration: Parameters<typeof createProductionRelevantUserProjectionPort>[0];
  readonly idempotencyPort: FounderLiveDurableIdempotencyPort;
  readonly rateLimitConfiguration: Parameters<typeof createFounderLiveDurableRateLimitPort>[0];
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
}): FounderLivePorts {
  const environment = input.environment; const fetchImpl = input.fetchImpl ?? fetch; const now = input.now ?? (() => new Date());
  const control = createFounderLiveServerRuntimeControl(environment);
  const supabaseUrl = requireSecret(environment, "SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireSecret(environment, "SUPABASE_SERVICE_ROLE_KEY");
  const manifest = parsePrivateWorldManifest(requireSecret(environment, "BACKYRD_FOUNDER_LIVE_WORLD_MANIFEST"));
  const cities = JSON.parse(requireSecret(environment, "BACKYRD_FOUNDER_LIVE_AUTHORIZED_CITIES")) as unknown;
  if (!Array.isArray(cities) || cities.length < 1 || cities.some((city) => typeof city !== "string" || city.length < 2)) throw new Error("founder_live_authorized_cities_invalid");
  const citySet = new Set(cities.map((city) => city.toLocaleLowerCase("de-CH")));
  const loadSnapshot = async (spotId: string): Promise<unknown> => {
    const expected = manifest.spots.find((spot) => spot.spotId === spotId); if (!expected) throw new Error("founder_live_spot_not_in_manifest");
    const query = `${supabaseUrl}/rest/v1/world_knowledge_public_projection_v1?select=spot_id,manifest_hash,snapshot&spot_id=eq.${encodeURIComponent(spotId)}&publication_state=eq.PUBLISHED`;
    const response = await fetchImpl(query, { method: "GET", redirect: "error", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, accept: "application/json" } });
    if (!response.ok) throw new Error("founder_live_world_read_failed");
    const rows = await response.json() as Array<{ spot_id?: string; manifest_hash?: string; snapshot?: unknown }>;
    if (rows.length !== 1 || rows[0]?.spot_id !== spotId || rows[0]?.manifest_hash !== expected.manifestHash || !rows[0]?.snapshot || (rows[0].snapshot as { snapshotHash?: string }).snapshotHash !== expected.snapshotHash) throw new Error("founder_live_world_binding_invalid");
    return rows[0].snapshot;
  };
  const world = createFounderWorldKnowledgeReader(({ spotId }) => loadSnapshot(spotId));
  const userProjectionPort = createProductionRelevantUserProjectionPort(input.userProjectionConfiguration);
  const rateLimitPort = createFounderLiveDurableRateLimitPort(input.rateLimitConfiguration);
  if (input.idempotencyPort.contractVersion !== "backyrd.decision-vnext.founder-live-durable-idempotency-port@1.0" || rateLimitPort.contractVersion !== "backyrd.decision-vnext.founder-live-rate-limit-port@1.0") throw new Error("founder_live_operational_ports_unsupported");
  return deepFreeze({
    auth: createFounderLiveSupabaseAuthPort({ supabaseUrl, publishableKey: requireSecret(environment, "SUPABASE_ANON_KEY"), fetchImpl, now }),
    allowlist: createFounderLiveCanonicalUuidAllowlistPort({ loadPrivateStoreSecret: () => requireSecret(environment, "BACKYRD_FOUNDER_LIVE_PRIVATE_UUID_STORE"), bindingSecret: requireSecret(environment, "BACKYRD_FOUNDER_LIVE_AUTHORITY_BINDING_SECRET"), now }),
    authority: { contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0", async bind({ actor, requestedCity }) { if (!requestedCity || !citySet.has(requestedCity.toLocaleLowerCase("de-CH"))) throw new Error("founder_live_location_not_authorized"); return { serverTime: now().toISOString(), authorizedCity: requestedCity, locationBindingHash: contentHash({ requestedCity, authorizedCity: requestedCity, subjectBindingHash: actor.subjectBindingHash }) }; } },
    world, retrieval: { contractVersion: "backyrd.decision-vnext.founder-live-retrieval-port@1.0", async retrieve({ authorizedCity }) { if (!citySet.has(authorizedCity.toLocaleLowerCase("de-CH"))) throw new Error("founder_live_location_not_authorized"); return manifest; } }, user: userProjectionPort, evaluator: createCanonicalFounderLiveEvaluator(), userSnapshot: null, control,
    idempotency: input.idempotencyPort,
    rateLimit: rateLimitPort,
  });
}
