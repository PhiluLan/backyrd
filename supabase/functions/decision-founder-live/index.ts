import { createInactiveFounderLiveEdgeAdapter } from "./runtime-boundary.mjs";

const environment = {
  BACKYRD_FOUNDER_LIVE_CORS_ORIGINS: Deno.env.get("BACKYRD_FOUNDER_LIVE_CORS_ORIGINS") ?? undefined,
};

// Runtime Authority is intentionally not loaded by this release. The function
// is deployable source, but remains fail-closed even if callers forge enable,
// release, allowlist or kill-switch headers/environment values.
Deno.serve(createInactiveFounderLiveEdgeAdapter(environment));
