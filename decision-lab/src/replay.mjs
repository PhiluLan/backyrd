import { contentHash } from "./canonical-json.mjs";
import { assertTrace } from "./contracts.mjs";

export function sealTrace(trace) { assertTrace(trace); const body = structuredClone(trace); delete body.traceHash; return { ...body, traceHash: contentHash(body) }; }
export function verifyTrace(trace) { const body = structuredClone(trace); const expected = body.traceHash; delete body.traceHash; if (!expected || contentHash(body) !== expected) throw new Error("Trace hash mismatch"); return assertTrace(trace); }
export function replayTrace(trace, evaluator) { verifyTrace(trace); return evaluator(structuredClone(trace)); }
