const INTERNAL_INSTRUCTION = /(?:respect the user's concrete current intent|old taste patterns|if category or audience is clear|prefer matching categories strongly|find places that match the selected direction|category and current intent are more important|use previous taste only as a soft tie-breaker|find places that match the current intent first|personal taste is only a soft signal)/i;

const clean = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export function containsInternalDecisionText(value) {
  return typeof value === "string" && INTERNAL_INSTRUCTION.test(value);
}

export function sanitizeLiveProductQuery(body = {}) {
  const rawFreeText = clean(body.rawFreeText);
  if (rawFreeText) return rawFreeText;
  return String(body.query ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !containsInternalDecisionText(line))
    .join("\n");
}

export function sanitizeLiveProductRequestBody(body = {}) {
  return { ...body, query: sanitizeLiveProductQuery(body) };
}

export function sanitizeLiveProductCandidate(candidate, authorizedReason) {
  const safeReason = containsInternalDecisionText(authorizedReason) ? null : clean(authorizedReason) || null;
  return {
    ...candidate,
    human_reason: safeReason,
    technical_why_this: null,
    document_preview: null,
    explanation: undefined,
    matched_tokens: (Array.isArray(candidate?.matched_tokens) ? candidate.matched_tokens : []).filter((value) => !containsInternalDecisionText(value)),
    matched_terms: (Array.isArray(candidate?.matched_terms) ? candidate.matched_terms : []).filter((value) => !containsInternalDecisionText(value)),
  };
}

export function selectLiveCandidateUniverse(candidates, limit = 10) {
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const id = String(candidate?.spot_id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);
}
