export type Citation = { url: string; evidence: string; layoutReviewRequired?: boolean };
export type ResearchResult = { attributeKey: string; status: string; reason?: string; value?: unknown; citations?: Citation[]; partialProfile?: boolean };
export type NuknukDraft = {
  version: string; spotId: string; name: string; canonicalWrite: false; importable: false;
  results: ResearchResult[]; requests?: number; modelCalls?: number;
  sourceFailures?: Array<{ url: string; reason: string }>; limitations?: string[];
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const bounded = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const publicLink = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };

// Only review content crosses the server boundary. Raw model traces and source bodies stay local.
export function parseNuknukDraft(value: unknown): NuknukDraft | null {
  if (!record(value) || !bounded(value.version, 40) || !/^nuknuk-research-v[\d.]+$/.test(value.version)
    || !bounded(value.spotId, 36) || !/^[0-9a-f-]{36}$/i.test(value.spotId)
    || !bounded(value.name, 240) || !value.name.trim() || value.canonicalWrite !== false || value.importable !== false
    || !Array.isArray(value.results) || value.results.length > 12) return null;
  const results: ResearchResult[] = [];
  for (const item of value.results) {
    if (!record(item) || !bounded(item.attributeKey, 100) || !bounded(item.status, 40)
      || item.reason !== undefined && !bounded(item.reason, 1000)
      || item.citations !== undefined && (!Array.isArray(item.citations) || item.citations.length > 100)) return null;
    const citations: Citation[] = [];
    for (const citation of (item.citations ?? []) as unknown[]) {
      if (!record(citation) || !bounded(citation.url, 2048) || !publicLink(citation.url)
        || !bounded(citation.evidence, 2000)) return null;
      citations.push({ url: citation.url, evidence: citation.evidence, layoutReviewRequired: citation.layoutReviewRequired === true });
    }
    const result: ResearchResult = { attributeKey: item.attributeKey, status: item.status, citations };
    if (typeof item.reason === "string") result.reason = item.reason;
    if (item.partialProfile === true) result.partialProfile = true;
    if (item.value !== undefined) {
      if (JSON.stringify(item.value).length > 30_000) return null;
      result.value = item.value;
    }
    results.push(result);
  }
  if (value.sourceFailures !== undefined && (!Array.isArray(value.sourceFailures) || value.sourceFailures.length > 100
    || value.sourceFailures.some(item => !record(item) || !bounded(item.url, 2048) || !publicLink(item.url) || !bounded(item.reason, 1000)))) return null;
  if (value.limitations !== undefined && (!Array.isArray(value.limitations) || value.limitations.length > 50
    || value.limitations.some(item => !bounded(item, 200)))) return null;
  const draft: NuknukDraft = {
    version: value.version, spotId: value.spotId, name: value.name,
    canonicalWrite: false, importable: false, results,
  };
  if (Number.isSafeInteger(value.requests) && Number(value.requests) >= 0) draft.requests = Number(value.requests);
  if (Number.isSafeInteger(value.modelCalls) && Number(value.modelCalls) >= 0) draft.modelCalls = Number(value.modelCalls);
  if (Array.isArray(value.sourceFailures)) draft.sourceFailures = value.sourceFailures.map(item => ({ url: item.url, reason: item.reason }));
  if (Array.isArray(value.limitations)) draft.limitations = [...value.limitations];
  return JSON.stringify(draft).length <= 100_000 ? draft : null;
}
