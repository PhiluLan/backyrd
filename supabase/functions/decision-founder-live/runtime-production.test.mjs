import assert from "node:assert/strict";
import test from "node:test";
import { FOUNDER_LIVE_PINNED_TRUST_ROOT_HASH, createFounderLiveProductionRuntimeLoader } from "./runtime-production.mjs";

test("checked-in Production loader has no accepted trust root and cannot be enabled by caller data", async () => {
  assert.equal(FOUNDER_LIVE_PINNED_TRUST_ROOT_HASH, null);
  const loader = createFounderLiveProductionRuntimeLoader({
    acceptedTrustRootHash: "f".repeat(64),
    productionAuthorized: true,
    executionAuthorized: true,
    killSwitch: "DISENGAGED",
  });
  assert.equal(await loader(), null);
});
