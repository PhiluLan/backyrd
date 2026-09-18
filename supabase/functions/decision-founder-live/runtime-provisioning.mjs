/**
 * Server-only provisioning seam. This repository release intentionally ships
 * no accepted root, authority records, member digests, credentials or port
 * providers. It cannot be populated by a request, header or generic boolean
 * environment flag. A later separately authorised source release must bind an
 * exact pinned root and return a process-local runtimeInput whose capability
 * was minted by the internal controller.
 */
export function loadFounderLiveSealedRuntimeProvisioning() {
  return null;
}
