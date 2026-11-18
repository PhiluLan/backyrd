import type { fetchPublicSource } from "./nuknuk-sources.mjs";

export function readOfficialSpotEmail(
  spot: { website: string; name: string; locality: string | null },
  fetchPage?: typeof fetchPublicSource,
): Promise<{
  attributeKey: "contact.public_email";
  knowledgeState: "KNOWN_VALUE";
  value: string;
  source: { url: string; evidence: string; observedAt: string; trust: "OFFICIAL_PRIMARY" };
} | null>;
