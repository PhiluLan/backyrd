import type { PublicPage } from "./nuknuk-sources.mjs";
export const SAFE_RESEARCH_POLICY: string;
export const SAFE_RESEARCH_KEYS: readonly string[];
export interface SafeResearchClaim {
  attributeKey: string;
  knowledgeState: string;
  value: unknown;
  source: { url: string; observedAt: string; trust: string };
}
export interface SafeResearchProof {
  eligible: boolean;
  reason: string;
  policy: string;
  url?: string;
  observedAt?: string;
  sourceHash?: string;
  evidence?: string;
}
export function proveSafeResearchProperty(input: {
  page: PublicPage;
  officialWebsite: string;
  name: string;
  locality: string | null;
  address?: string | null;
  claim: SafeResearchClaim;
  now?: number;
}): SafeResearchProof;
