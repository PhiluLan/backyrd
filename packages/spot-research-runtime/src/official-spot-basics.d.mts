import type { fetchPublicSource } from "./nuknuk-sources.mjs";

export function readOfficialSpotBasics(
  spot: { website: string; name: string; locality: string | null; address?: string },
  fetchPage?: typeof fetchPublicSource,
): Promise<Array<{
  attributeKey: "contact.public_email" | "contact.phone" | "hours.regular";
  knowledgeState: "KNOWN_VALUE";
  value: string | { day: string; intervals: { start: string; end: string }[] }[];
  source: { url: string; evidence: string; observedAt: string; trust: "OFFICIAL_PRIMARY" };
}>>;
