/**
 * The only Production runtime loader used by the real Edge entrypoint.
 *
 * This source release deliberately pins no accepted trust root. Consequently
 * it returns null before loading Decision code, Auth, request bodies or any
 * data port. A later, separately reviewed source release must replace this
 * null with an exact externally accepted root and supply the sealed server
 * provisioning factory; request data and ordinary environment flags can never
 * do so.
 */
export const FOUNDER_LIVE_PINNED_TRUST_ROOT_HASH = null;

export function createFounderLiveProductionRuntimeLoader() {
  return async function loadAuthorizedRuntime() {
    if (FOUNDER_LIVE_PINNED_TRUST_ROOT_HASH === null) return null;
    const provisioning = loadFounderLiveSealedRuntimeProvisioning();
    if (!provisioning || provisioning.acceptedTrustRootHash !== FOUNDER_LIVE_PINNED_TRUST_ROOT_HASH) {
      throw new Error("founder_live_runtime_provisioning_not_released");
    }
    const { createFounderLiveAuthorizedEdgeRuntime } = await import("@backyrd/decision-vnext-core/internal/founder-live-edge-runtime");
    return createFounderLiveAuthorizedEdgeRuntime(provisioning.runtimeInput);
  };
}

// The internal assembly binds capability -> Session ->
// UUID allowlist -> Gate-7 rate limit -> durable idempotency -> canonical World
// and User ports -> Context/evaluation -> read-only renderer. It is not loaded
// while the pinned trust root is absent.
import { loadFounderLiveSealedRuntimeProvisioning } from "./runtime-provisioning.mjs";
