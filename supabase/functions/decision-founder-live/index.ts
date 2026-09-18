import { createFounderLiveRuntimeBootstrapAdapter } from "./runtime-bootstrap.mjs";

const environment = {
  BACKYRD_FOUNDER_LIVE_CORS_ORIGINS: Deno.env.get("BACKYRD_FOUNDER_LIVE_CORS_ORIGINS") ?? undefined,
};

// The canonical Production trust root is deliberately not provisioned by this
// source release. Runtime Authority cannot be supplied by request or env flags.
Deno.serve(createFounderLiveRuntimeBootstrapAdapter(environment));
