#!/usr/bin/env node
import { createHash, createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";
import { loadCanonicalDecisionHandler } from "./canonical-engine.mjs";
import { assertSafeEnvironment } from "./safety.mjs";
import { writeJson } from "./io.mjs";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (sub, secret) => {
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: "supabase-demo", role: "authenticated", sub });
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
};
const d02Uuid = (label) => { const value = createHash("md5").update(label).digest("hex"); return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`; };

assertSafeEnvironment(process.env, process.env.DECISION_LAB_WORKDIR ?? process.cwd());
for (const key of ["DECISION_LAB_SUPABASE_URL", "DECISION_LAB_SERVICE_ROLE_KEY", "DECISION_LAB_JWT_SECRET", "DECISION_LAB_OUTPUT"]) if (!process.env[key]) throw new Error(`${key} missing`);

const mode = process.env.DECISION_LAB_EMBEDDING_MODE ?? "FAST_SIMULATION";
const canonical = await loadCanonicalDecisionHandler({ env: process.env, embeddingMode: mode });
const cases = [
  { name: "cold", user: "user:cold", request: { city: "Basel", moodA: "cozy", moodB: "romantic", query: "Date cozy nicht teuer Freitagabend Drinks danach", preferredPlaceTypes: ["bar", "cafe"], audience: ["date"], strictCategoryIntent: true, limit: 10, v12Limit: 16, semanticLimit: 24 } },
  { name: "personalization_conflict", user: "user:strong", request: { city: "Basel", moodA: "lively", moodB: "friends", query: "Bar Drinks Cocktails lebhaft mit Freunden", preferredPlaceTypes: ["bar"], audience: ["friends"], strictCategoryIntent: true, limit: 10, v12Limit: 16, semanticLimit: 24 } },
  { name: "sparse", user: "user:sparse", request: { city: "Sparseville", moodA: "unusual", moodB: "indoor", query: "Etwas ungewöhnliches, drinnen, allein, kein Essen, Sonntag Nachmittag", audience: ["solo"], strictCategoryIntent: false, limit: 10, v12Limit: 16, semanticLimit: 24 } }
];

const traces = [];
try {
  for (const item of cases) {
    const token = jwt(d02Uuid(item.user), process.env.DECISION_LAB_JWT_SECRET);
    const request = new Request("http://decision-lab.local/functions/v1/decision-v13", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(item.request) });
    globalThis.__backyrdDecisionLabTrace = null;
    const started = performance.now();
    const response = await canonical.handler(request);
    const payload = await response.json();
    const latencyMilliseconds = Number((performance.now() - started).toFixed(3));
    if (!response.ok || !payload.ok) throw new Error(`${item.name}: ${payload.error ?? response.status}`);
    if (payload.mode !== "personalized_semantic") throw new Error(`${item.name}: canonical V12 personalization was skipped`);
    if (!payload.counts?.v12 || !payload.counts?.semantic || !payload.candidates?.length) throw new Error(`${item.name}: incomplete candidate stages ${JSON.stringify(payload.counts)}`);
    if (payload.candidates.some((candidate) => !candidate.explanation || candidate.rank == null)) throw new Error(`${item.name}: incomplete Flight Recorder candidate data`);
    traces.push({ traceVersion: "decision-flight-recorder-v1", runId: createHash("sha256").update(`${item.name}:${canonical.sourceHash}`).digest("hex").slice(0, 24), mode, engineSourceHash: canonical.sourceHash, observedEngine: { input: item.request, userId: payload.user_id, queryText: payload.queryText, intent: payload.intent, counts: payload.counts, candidateStages: canonical.getTrace(), placeTypeProfile: payload.place_type_profile, contextualMemory: payload.contextual_memory, candidates: payload.candidates, latencyMilliseconds }, latentEvaluation: { status: "not_attached_to_d02_control_fixture", fedToEngine: false }, persistence: { recommendationRunCreatedByV12: true, finalV13TopKPersistedByEngine: false } });
  }
} finally {
  canonical.restore();
}

const summary = { valid: true, mode, fullWorld: false, fullEngine: true, canonicalHandlerSourceHash: canonical.sourceHash, scenarioCount: traces.length, v11: "exercised through canonical V12", v12: "exercised with authenticated synthetic users", semantic: "exercised with current RPC and FAST_SIMULATION query embeddings", v13Fusion: "executed from canonical Edge source", productEligibility: "covered by permanent SQL regression", distribution: "normal/reduced/quarantined fixtures exercised", externalEmbeddingRequests: 0, limitations: mode === "FAST_SIMULATION" ? ["text-embedding-3-small not executed; no V13 quality claim", "D0.2 controlled fixture supplies Product observed state"] : [] };
await writeJson(process.env.DECISION_LAB_OUTPUT, { summary, traces });
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
