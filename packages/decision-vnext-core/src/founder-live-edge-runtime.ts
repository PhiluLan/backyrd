import { createFounderLiveHttpHandler } from "./founder-live-api.js";
import { createFounderLiveProductionPorts } from "./founder-live-production-adapter.js";
import type { FounderLiveRuntimeCapability, FounderLiveRuntimeCapabilityController } from "./founder-live-runtime-capability.js";

export const FOUNDER_LIVE_AUTHORIZED_EDGE_RUNTIME_VERSION = "backyrd.decision-vnext.founder-live-authorized-edge-runtime@1.0" as const;

/**
 * Internal source assembly for the real Edge host. It is deliberately absent
 * from the package index. The caller must already hold the controller-local
 * capability; no serialized value or request payload can construct it.
 */
export function createFounderLiveAuthorizedEdgeRuntime(input: {
  readonly runtimeCapability: FounderLiveRuntimeCapability;
  readonly runtimeCapabilityController: FounderLiveRuntimeCapabilityController;
  readonly productionPorts: Omit<Parameters<typeof createFounderLiveProductionPorts>[0], "runtimeCapability" | "runtimeCapabilityController">;
}) {
  input.runtimeCapabilityController.verifyBoundary(input.runtimeCapability);
  const ports = createFounderLiveProductionPorts({
    ...input.productionPorts,
    runtimeCapability: input.runtimeCapability,
    runtimeCapabilityController: input.runtimeCapabilityController,
  });
  const handler = createFounderLiveHttpHandler(ports);
  return Object.freeze({
    contractVersion: FOUNDER_LIVE_AUTHORIZED_EDGE_RUNTIME_VERSION,
    async handle(request: Request): Promise<Response> {
      input.runtimeCapabilityController.verifyBoundary(input.runtimeCapability);
      const url = new URL(request.url);
      url.pathname = "/v1/decision/evaluate";
      url.search = "";
      const internalRequest = new Request(url, request);
      const response = await handler(internalRequest);
      input.runtimeCapabilityController.verifyBoundary(input.runtimeCapability);
      return response;
    },
  });
}
