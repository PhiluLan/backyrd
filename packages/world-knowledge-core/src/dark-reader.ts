import { parseWorldKnowledgeSnapshot, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot } from "./port.js";
import { REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { ACCEPTED_SOURCE_POLICY } from "./slice3b.js";
import { WORLD_KNOWLEDGE_PORT_VERSION } from "./contracts.js";

export const WORLD_DARK_READER_CONTRACT_VERSION = "backyrd.world-knowledge.dark-reader@1.0" as const;
export const WORLD_DARK_READER_KILL_SWITCH_DEFAULT = "ENGAGED" as const;
export const WORLD_PRODUCT_READ_DEFAULT = false as const;

export type WorldDarkReaderEnvironment = "LOCAL_TEST" | "PROD_LIKE_TEST";
export type WorldDarkReaderState = Readonly<{
  contractVersion: typeof WORLD_DARK_READER_CONTRACT_VERSION;
  enabled: boolean;
  worldProductRead: boolean;
  killSwitch: "ENGAGED" | "DISENGAGED";
  environment: WorldDarkReaderEnvironment | null;
  reason: "ENABLED_NON_PRODUCTION_READ_ONLY" | "PRODUCT_READ_DISABLED" | "KILL_SWITCH_ENGAGED" | "CONFIGURATION_INVALID";
  registryVersion: typeof REGISTRY_VERSION;
  registryHash: typeof REGISTRY_HASH;
  sourcePolicyVersion: typeof ACCEPTED_SOURCE_POLICY.policyVersion;
  sourcePolicyHash: typeof ACCEPTED_SOURCE_POLICY.policyHash;
  readOnly: true;
  decisionSemantics: "NONE";
  userSemantics: "NONE";
}>;

export type WorldDarkReaderLoader = (input: Readonly<{
  spotId: string;
  registryVersion: typeof REGISTRY_VERSION;
  registryHash: typeof REGISTRY_HASH;
  sourcePolicyVersion: typeof ACCEPTED_SOURCE_POLICY.policyVersion;
  sourcePolicyHash: typeof ACCEPTED_SOURCE_POLICY.policyHash;
  accessMode: "READ_ONLY";
  environment: WorldDarkReaderEnvironment;
}>) => Promise<unknown>;

export interface WorldDarkReader {
  readonly state: WorldDarkReaderState;
  readonly reader: WorldKnowledgeReaderPort;
}

const enabledValues = new Set(["true", "1"]);
const disabledValues = new Set(["false", "0", ""]);

function parseToggle(value: string | undefined): boolean | null {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  if (enabledValues.has(normalized)) return true;
  if (disabledValues.has(normalized)) return false;
  return null;
}

function parseEnvironment(value: string | undefined): WorldDarkReaderEnvironment | null {
  return value === "LOCAL_TEST" || value === "PROD_LIKE_TEST" ? value : null;
}

export function resolveWorldDarkReaderState(configuration: Readonly<Record<string, string | undefined>> = {}): WorldDarkReaderState {
  const productRead = parseToggle(configuration.WORLD_PRODUCT_READ);
  const killSwitchRaw = configuration.WORLD_PRODUCT_READ_KILL_SWITCH;
  const killSwitch = killSwitchRaw === "DISENGAGED" ? "DISENGAGED" : "ENGAGED";
  const environment = parseEnvironment(configuration.WORLD_PRODUCT_READ_ENVIRONMENT);
  const invalid = productRead === null || (killSwitchRaw !== undefined && !["ENGAGED", "DISENGAGED"].includes(killSwitchRaw));
  const enabled = productRead === true && killSwitch === "DISENGAGED" && environment !== null && !invalid;
  const reason = invalid || (productRead === true && environment === null)
    ? "CONFIGURATION_INVALID"
    : productRead !== true
      ? "PRODUCT_READ_DISABLED"
      : killSwitch === "ENGAGED"
        ? "KILL_SWITCH_ENGAGED"
        : "ENABLED_NON_PRODUCTION_READ_ONLY";
  return Object.freeze({
    contractVersion: WORLD_DARK_READER_CONTRACT_VERSION,
    enabled,
    worldProductRead: productRead === true,
    killSwitch,
    environment,
    reason,
    registryVersion: REGISTRY_VERSION,
    registryHash: REGISTRY_HASH,
    sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
    sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash,
    readOnly: true,
    decisionSemantics: "NONE",
    userSemantics: "NONE",
  });
}

export function createWorldDarkReader(input: Readonly<{
  configuration?: Readonly<Record<string, string | undefined>>;
  loadSnapshot: WorldDarkReaderLoader;
}>): WorldDarkReader {
  const state = resolveWorldDarkReaderState(input.configuration);
  const reader: WorldKnowledgeReaderPort = Object.freeze({
    contractVersion: "backyrd.world-knowledge.reader-port@1.0" as const,
    async readSnapshot(request: Parameters<WorldKnowledgeReaderPort["readSnapshot"]>[0]): Promise<WorldKnowledgeSnapshot> {
      if (!state.enabled || state.environment === null) throw new Error(`world_dark_reader_off:${state.reason}`);
      if (request.contractVersion !== WORLD_KNOWLEDGE_PORT_VERSION || request.registryVersion !== REGISTRY_VERSION || request.registryHash !== REGISTRY_HASH) {
        throw new Error("world_dark_reader_contract_identity_mismatch");
      }
      const snapshot = parseWorldKnowledgeSnapshot(await input.loadSnapshot({
        spotId: request.spotId,
        registryVersion: REGISTRY_VERSION,
        registryHash: REGISTRY_HASH,
        sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion,
        sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash,
        accessMode: "READ_ONLY",
        environment: state.environment,
      }), [ACCEPTED_SOURCE_POLICY]);
      if (snapshot.spot.spotId !== request.spotId) throw new Error("world_dark_reader_spot_identity_mismatch");
      return snapshot;
    },
  });
  return Object.freeze({ state, reader });
}
