import type { fetchPublicSource } from "./nuknuk-sources.mjs";

export type SourcePreviewSpot = {
  spotId: string;
  name: string;
  locality: string | null;
  address?: string;
  website?: string | null;
  existingValues: Record<string, unknown>;
};
type ProviderState = "NOT_NEEDED" | "NEEDED_NOT_CONFIGURED" | "USED" | "FAILED";
export type SourcePreviewResult = {
  spotId: string;
  name: string;
  status: "COMPLETE_PROFILE" | "INSUFFICIENT_IDENTITY" | "SOURCE_MISSING" | "SOURCE_UNAVAILABLE" | "CHECKED";
  proposals: Array<{ attributeKey: string; value: unknown; evidence: string; url: string; observedAt: string; method: "DIRECT" | "AI"; review: boolean; fixedAdmission?: number }>;
  usage: {
    brave: { state: ProviderState; calls: number };
    ai: { state: ProviderState; calls: number; tokens?: { input: number; output: number } };
    estimatedUsd: number | null;
  };
  elapsedMs: number;
  sourcesRead: number;
  stillMissing: string[];
};

export function previewSpotSources(spot: SourcePreviewSpot, options?: {
  verifyVenue?: boolean;
  fetchPage?: typeof fetchPublicSource;
  search?: (query: string) => Promise<string[]>;
  selectPrice?: (quotes: string[]) => Promise<{ index: number | null; estimatedUsd: number | null; tokens?: { input: number; output: number } }>;
}): Promise<SourcePreviewResult>;
