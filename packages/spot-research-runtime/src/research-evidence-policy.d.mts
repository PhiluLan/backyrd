import type { PublicPage } from "./nuknuk-sources.mjs";
import type {
  WorldResearchClaim,
  WorldResearchSource,
} from "../../world-knowledge-core/dist/index.js";
export const RESEARCH_EVIDENCE_POLICY: string;
export type ResearchAssessment = {
  attributeKey: string;
  uncertainty: "NONE" | "MINOR" | "MAJOR";
  reason: string;
  bindings: Record<string, number>;
};
export type EvidencePage = {
  url: string;
  requestUrl: string;
  text: string;
  observedAt: string;
  hash: string;
  format: string;
  coordinates?: { latitude: number; longitude: number };
};
export type EvidenceSet = {
  pages: Map<string, EvidencePage>;
  failures: Array<{ url: string; reason: string }>;
};
export function parseResearchAssessments(
  input: unknown,
  claims: readonly WorldResearchClaim[],
): ResearchAssessment[] | null;
export function evidenceText(s: unknown): string;
export function matchesResearchMeaning(value: string, text: string): boolean;
export function collectResearchEvidence(input: {
  page: PublicPage;
  website: string;
  name: string;
  locality: string;
  address: string;
  claims: readonly WorldResearchClaim[];
  fetchPage: typeof import("./nuknuk-sources.mjs").fetchPublicSource;
  readPdf?: (body: Uint8Array) => Promise<string>;
}): Promise<EvidenceSet>;
export function proveResearchEvidence(input: {
  claim: WorldResearchClaim;
  assessment?: ResearchAssessment;
  evidence: EvidenceSet;
  current?: { visibility?: string; knowledgeState?: string; value?: unknown };
  website: string;
  page: PublicPage;
  claims: readonly WorldResearchClaim[];
  now?: number;
}): {
  eligible: boolean;
  reason: string;
  uncertainty: string;
  explanation: string;
  sourceHash?: string;
  url?: string;
  observedAt?: string;
  source?: WorldResearchSource;
  supportingSources?: WorldResearchSource[];
};
