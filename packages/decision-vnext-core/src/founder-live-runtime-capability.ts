import { contentHash, deepFreeze } from "./canonical.js";
import {
  inspectFounderLiveKillSwitch,
  inspectFounderLiveRuntimeAuthority,
  type FounderLiveRuntimeExpectedIdentity,
} from "./founder-live-runtime-bootstrap.js";

export const FOUNDER_LIVE_RUNTIME_CAPABILITY_VERSION = "backyrd.decision-vnext.founder-live-runtime-capability@1.0" as const;

/** Server-only material. UUIDs never cross this boundary; only two precomputed digests do. */
export interface FounderLiveRuntimeProvisioning {
  readonly acceptedTrustRootHash: string;
  readonly loadTrustRoot: () => unknown;
  readonly loadAuthorityRecord: () => unknown;
  readonly loadKillSwitchRecord: () => unknown;
  readonly loadMemberDigests: () => readonly string[];
}

export interface FounderLiveRuntimeCapability {
  readonly contractVersion: typeof FOUNDER_LIVE_RUNTIME_CAPABILITY_VERSION;
  readonly status: "VERIFIED_EXECUTABLE";
  readonly authorityHash: string;
  readonly authorityGeneration: number;
  readonly killSwitchGeneration: number;
  readonly memberDigestSetHash: string;
  readonly projectRef: string;
  readonly canonicalMainSha: string;
  readonly canonicalTreeSha: string;
  readonly releaseHash: string;
  readonly artifactHash: string;
  readonly sourceSetHash: string;
  readonly productionPlanHash: string;
  readonly policyHash: string;
}

export type FounderLiveRuntimeBoundary =
  | "REQUEST_START" | "AUTH" | "ALLOWLIST" | "RATE_LIMIT" | "BODY_PARSE"
  | "LOCATION_AUTHORITY" | "RETRIEVAL" | "USER_READ" | "WORLD_READ"
  | "EVALUATION" | "IDEMPOTENCY" | "EXPERT_RESPONSE" | "FINAL_OUTPUT";

const digestPattern = /^[a-f0-9]{64}$/;

function memberDigestSetHash(provisioning: FounderLiveRuntimeProvisioning): string {
  const digests = [...provisioning.loadMemberDigests()].sort();
  if (digests.length !== 2 || new Set(digests).size !== 2 || digests.some((value) => !digestPattern.test(value))) {
    throw new Error("founder_live_runtime_member_digest_set_invalid");
  }
  return contentHash({ namespace: "backyrd.founder-live.member-digest-set@1.0", memberDigests: digests });
}

/**
 * Internal server bootstrap. This module is deliberately absent from the package index.
 * The accepted trust-root hash is a server/control-plane input, never request data.
 */
export function createFounderLiveRuntimeCapabilityController(input: {
  readonly provisioning: FounderLiveRuntimeProvisioning;
  readonly expected: Omit<FounderLiveRuntimeExpectedIdentity, "memberDigestSetHash">;
  readonly now: () => string;
}) {
  // Controller-local provenance prevents capability transfer between isolates,
  // workers, restarts, or independently provisioned runtime instances.
  const mintedCapabilities = new WeakSet<object>();
  const inspectFresh = () => {
    const digestSetHash = memberDigestSetHash(input.provisioning);
    const authority = inspectFounderLiveRuntimeAuthority({
      record: input.provisioning.loadAuthorityRecord(),
      trustRoot: input.provisioning.loadTrustRoot(),
      acceptedTrustRootHash: input.provisioning.acceptedTrustRootHash,
      expected: { ...input.expected, memberDigestSetHash: digestSetHash },
      now: input.now(),
    });
    const killSwitch = inspectFounderLiveKillSwitch({
      record: input.provisioning.loadKillSwitchRecord(),
      trustRoot: input.provisioning.loadTrustRoot(),
      acceptedTrustRootHash: input.provisioning.acceptedTrustRootHash,
      authority,
      now: input.now(),
    });
    if (killSwitch.state !== "DISENGAGED_FOR_EXACT_RELEASE") throw new Error("founder_live_runtime_kill_switch_engaged");
    return { authority, digestSetHash };
  };

  const mint = (): FounderLiveRuntimeCapability => {
    const { authority, digestSetHash } = inspectFresh();
    const capability = deepFreeze({
      contractVersion: FOUNDER_LIVE_RUNTIME_CAPABILITY_VERSION,
      status: "VERIFIED_EXECUTABLE" as const,
      authorityHash: authority.authorityHash,
      authorityGeneration: authority.authorityGeneration,
      killSwitchGeneration: authority.killSwitchGeneration,
      memberDigestSetHash: digestSetHash,
      projectRef: input.expected.projectRef,
      canonicalMainSha: input.expected.canonicalMainSha,
      canonicalTreeSha: input.expected.canonicalTreeSha,
      releaseHash: input.expected.releaseHash,
      artifactHash: input.expected.artifactHash,
      sourceSetHash: input.expected.sourceSetHash,
      productionPlanHash: input.expected.productionPlanHash,
      policyHash: input.expected.policyHash,
    });
    mintedCapabilities.add(capability);
    return capability;
  };

  const verifyBoundary = (capability: FounderLiveRuntimeCapability): void => {
    if (!capability || typeof capability !== "object" || !mintedCapabilities.has(capability)) throw new Error("founder_live_runtime_capability_untrusted");
    const { authority, digestSetHash } = inspectFresh();
    if (capability.contractVersion !== FOUNDER_LIVE_RUNTIME_CAPABILITY_VERSION
      || capability.status !== "VERIFIED_EXECUTABLE"
      || capability.authorityHash !== authority.authorityHash
      || capability.authorityGeneration !== authority.authorityGeneration
      || capability.killSwitchGeneration !== authority.killSwitchGeneration
      || capability.memberDigestSetHash !== digestSetHash
      || capability.projectRef !== input.expected.projectRef
      || capability.canonicalMainSha !== input.expected.canonicalMainSha
      || capability.canonicalTreeSha !== input.expected.canonicalTreeSha
      || capability.releaseHash !== input.expected.releaseHash
      || capability.artifactHash !== input.expected.artifactHash
      || capability.sourceSetHash !== input.expected.sourceSetHash
      || capability.productionPlanHash !== input.expected.productionPlanHash
      || capability.policyHash !== input.expected.policyHash) throw new Error("founder_live_runtime_capability_stale");
  };

  const runBoundary = async <T>(capability: FounderLiveRuntimeCapability, _boundary: FounderLiveRuntimeBoundary, operation: () => Promise<T> | T): Promise<T> => {
    verifyBoundary(capability);
    const result = await operation();
    verifyBoundary(capability);
    return result;
  };

  return Object.freeze({ mint, verifyBoundary, runBoundary });
}

export type FounderLiveRuntimeCapabilityController = ReturnType<typeof createFounderLiveRuntimeCapabilityController>;
