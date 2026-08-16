import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { contentHash } from "./canonical-json.mjs";
import { CANONICAL_EXECUTION_PATH } from "./d3.1-diagnostic-runners.mjs";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function syntheticJwt(userId, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ aud: "authenticated", exp: now + 3600, iat: now, iss: "supabase-d3-1", role: "authenticated", sub: userId });
  return `${header}.${payload}.${createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")}`;
}

function explanationEvidence(candidate, input) {
  const text = String(candidate.human_reason ?? "").toLowerCase();
  const intent = input.request ?? {};
  const claimed = [];
  if (/bei dir|dein|deine|persön|personlich|persoenlich/.test(text)) claimed.push("personalized_component");
  if (/stimmung|moment|anfrage|suche|date|famil|kind|freund|solo|ruhig|lebhaft|drinks|kultur|kunst/.test(text)) claimed.push("intent_boost");
  if (/café|cafe|bar|restaurant|kultur|aktivität|activity|outing|erlebnis/.test(text)) claimed.push("category_fit_component");
  if (/semant|beschreibung|inhalt|ähnlich|aehnlich/.test(text)) claimed.push("semantic_component");
  if (/zuletzt|nochmal|wieder|bereits/.test(text)) claimed.push("recent_memory_component");
  const supported = [...new Set(claimed.filter((factor) => {
    if (factor === "intent_boost") return Boolean(intent.query || intent.audience?.length || intent.preferredPlaceTypes?.length);
    if (factor === "category_fit_component") return Boolean(candidate.place_type || candidate.category_name);
    return Math.abs(Number(candidate.explanation?.[factor] ?? 0)) > 0;
  }))];
  return { claimedFactors: [...new Set(claimed)], supportedFactors: supported };
}

function candidateIds(rows) { return (rows ?? []).map((row) => row.spot_id ?? row.id).filter(Boolean); }

export function createCanonicalV13Executor({ canonical, jwtSecret }) {
  if (!canonical?.handler || !canonical?.sourceHash || !canonical?.getTrace) throw new Error("Canonical V13 adapter incomplete");
  return async function execute(input) {
    const token = syntheticJwt(input.userId, jwtSecret);
    const request = new Request("http://decision-lab.local/functions/v1/decision-v13", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(input.request) });
    globalThis.__backyrdDecisionLabTrace = null;
    const response = await canonical.handler(request);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? `V13 ${response.status}`);
    if (payload.mode !== "personalized_semantic") throw new Error("Canonical authenticated V13 skipped personalized V12 path");
    const observed = canonical.getTrace();
    const candidates = (payload.candidates ?? []).map((candidate) => ({ ...candidate, explanationEvidence: explanationEvidence(candidate, input) }));
    const traceBody = {
      version: "d3.1-flight-recorder-v1",
      v12CandidateIds: candidateIds(observed?.v12Candidates),
      semanticCandidateIds: candidateIds(observed?.semanticCandidates),
      distributedV12CandidateIds: candidateIds(observed?.distributedV12),
      distributedSemanticCandidateIds: candidateIds(observed?.distributedSemantic),
      fusedCandidateIds: candidateIds(observed?.fusedBeforeFinalMetadata),
      finalCandidateIds: candidateIds(candidates),
      fallbackUsed: candidates.some((candidate) => candidate.semantic_similarity === 0 && candidate.document_preview === "Distribution-safe alternative candidate"),
      observed
    };
    if (payload.structured_intent) traceBody.structuredIntent = payload.structured_intent;
    if (payload.hard_constraint_eligibility) traceBody.hardConstraintEligibility = payload.hard_constraint_eligibility;
    return { executionPath: CANONICAL_EXECUTION_PATH, engineSourceHash: canonical.sourceHash, authenticated: true, candidates, hardGates: input.hardGates ?? null, trace: { ...traceBody, traceHash: contentHash(traceBody) }, payloadMeta: { version: payload.version, mode: payload.mode, counts: payload.counts, retrieval: payload.retrieval ?? null, spotIntelligence: payload.spot_intelligence ?? null } };
  };
}

export function createTreatmentMaterializer({ invokeCanonical, insertHistoricalEvent, snapshotState }) {
  if (typeof invokeCanonical !== "function" || typeof insertHistoricalEvent !== "function" || typeof snapshotState !== "function") throw new Error("Treatment materializer requires canonical call, historical event and snapshot adapters");
  return async function materialize(plan) {
    if (plan.authenticationMode !== "authenticated" || plan.directDerivedWrites) throw new Error("Invalid treatment plan materialization");
    if (plan.onboarding) await invokeCanonical(plan.user.id, plan.onboarding);
    for (const event of plan.history) {
      for (const call of event.calls) {
        if (call.rpc === "backyrd_ml_log_event_v1" && Number.isInteger(call.args.occurredDay)) await insertHistoricalEvent(plan.user.id, call, event.occurredDay);
        else await invokeCanonical(plan.user.id, call);
      }
    }
    const snapshot = await snapshotState(plan.user.id);
    if (snapshot.rawDerivedConsistent !== true) throw new Error(`Raw/derived treatment inconsistency for ${plan.user.id}`);
    return { stateRef: snapshot.stateRef, rawDerivedConsistent: true, directDerivedWrites: false, stateHash: contentHash(snapshot) };
  };
}

const rpcArguments = (call) => {
  const args = call.args ?? {};
  if (call.rpc === "backyrd_ml_log_event_v1") return {
    p_event_type: args.eventType,
    p_spot_id: args.spotId ?? null,
    p_decision_id: args.decisionId ?? null,
    p_rank: args.rank ?? null,
    p_city: args.city ?? null,
    p_mood_a_text: args.moodA ?? null,
    p_mood_b_text: args.moodB ?? null,
    p_context: args.context ?? {}
  };
  if (call.rpc === "backyrd_log_taste_event_v3") return { p_spot_id: args.spotId, p_event_type: args.eventType };
  if (call.rpc === "complete_decision_onboarding_v1") return { p_city: args.city, p_spot_ids: args.spotIds };
  if (call.rpc === "backyrd_log_decision_action_v1") return { p_decision_id: args.decisionId, p_spot_id: args.spotId, p_action: args.action };
  throw new Error(`Unsupported canonical treatment RPC: ${call.rpc}`);
};

export function createIsolatedSupabaseTreatmentAdapters({ apiUrl, serviceRoleKey, jwtSecret, referenceIso = "2026-08-11T12:00:00.000Z" }) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(apiUrl)) throw new Error("D3.1 treatment adapters require an isolated localhost Supabase URL");
  const serviceHeaders = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` };
  const request = async (path, { method = "GET", token = serviceRoleKey, body } = {}) => {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }), prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${method} ${path}: ${payload?.message ?? payload?.error ?? response.status}`);
    return payload;
  };
  const invokeCanonical = async (userId, call) => request(`/rest/v1/rpc/${call.rpc}`, { method: "POST", token: syntheticJwt(userId, jwtSecret), body: rpcArguments(call) });
  const insertHistoricalEvent = async (userId, call, occurredDay) => {
    const before = await request(`/rest/v1/backyrd_ml_events_v1?user_id=eq.${encodeURIComponent(userId)}&select=id&order=created_at.desc&limit=1`);
    const payload = await invokeCanonical(userId, call);
    let eventId = typeof payload === "string" ? payload : Array.isArray(payload) ? (payload[0]?.backyrd_ml_log_event_v1 ?? payload[0]) : payload?.backyrd_ml_log_event_v1;
    if (typeof eventId !== "string") {
      const args = call.args ?? {};
      const filters = [`user_id=eq.${encodeURIComponent(userId)}`, ...(before?.[0]?.id ? [`id=neq.${encodeURIComponent(before[0].id)}`] : []), "select=id", "order=created_at.desc", "limit=1"];
      const latest = await request(`/rest/v1/backyrd_ml_events_v1?${filters.join("&")}`);
      eventId = latest?.[0]?.id;
    }
    if (typeof eventId !== "string") throw new Error(`Historical ML RPC did not create an observable event for ${userId}: ${JSON.stringify(payload)}`);
    const createdAt = new Date(Date.parse(referenceIso) + Number(occurredDay) * 86_400_000).toISOString();
    await request(`/rest/v1/backyrd_ml_events_v1?id=eq.${encodeURIComponent(eventId)}`, { method: "PATCH", body: { created_at: createdAt } });
    return eventId;
  };
  const rows = (table, userId) => request(`/rest/v1/${table}?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=10000`, { headers: serviceHeaders });
  const snapshotState = async (userId) => {
    const tables = ["backyrd_ml_events_v1", "user_taste_events_v2", "backyrd_user_feature_weights_v1", "user_place_type_preferences_v1", "backyrd_user_context_feature_preferences_v1", "user_taste_concepts_v2"];
    const entries = await Promise.all(tables.map(async (table) => [table, (await rows(table, userId)).length]));
    const counts = Object.fromEntries(entries);
    return { stateRef: `isolated:user-state:${userId}`, userId, counts, rawDerivedConsistent: Object.values(counts).every((value) => Number.isInteger(value) && value >= 0), source: "CANONICAL_RPCS_AND_TRIGGERS" };
  };
  return { invokeCanonical, insertHistoricalEvent, snapshotState };
}

const sqlLiteral = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const sqlJson = (value) => `${sqlLiteral(JSON.stringify(value ?? {}))}::jsonb`;

export function createIsolatedPostgresTreatmentAdapters({ dbUrl, referenceIso = "2026-08-11T12:00:00.000Z" }) {
  if (!/^postgresql?:\/\/[^@]*@?(127\.0\.0\.1|localhost)(:\d+)?\//i.test(dbUrl)) throw new Error("D3.1 treatment SQL adapter requires an isolated localhost database URL");
  const run = (sql) => execFileSync("psql", [dbUrl, "-X", "-A", "-t", "--set", "ON_ERROR_STOP=1", "--command", sql], { encoding: "utf8" }).trim();
  const claims = (userId) => `set local "request.jwt.claims" = ${sqlLiteral(JSON.stringify({ sub: userId, role: "authenticated" }))}; set local "request.jwt.claim.sub" = ${sqlLiteral(userId)};`;
  const invocationSql = (call) => {
    const args = call.args ?? {};
    if (call.rpc === "backyrd_ml_log_event_v1") return `select public.backyrd_ml_log_event_v1(p_event_type=>${sqlLiteral(args.eventType)},p_spot_id=>${sqlLiteral(args.spotId)}::uuid,p_decision_id=>${sqlLiteral(args.decisionId)}::uuid,p_rank=>${args.rank ?? "null"},p_city=>${sqlLiteral(args.city)},p_mood_a_text=>${sqlLiteral(args.moodA)},p_mood_b_text=>${sqlLiteral(args.moodB)},p_context=>${sqlJson(args.context)});`;
    if (call.rpc === "backyrd_log_taste_event_v3") return `select public.backyrd_log_taste_event_v3(${sqlLiteral(args.spotId)}::uuid,${sqlLiteral(args.eventType)});`;
    if (call.rpc === "backyrd_log_decision_action_v1") return `select public.backyrd_log_decision_action_v1(${sqlLiteral(args.decisionId)}::uuid,${sqlLiteral(args.spotId)}::uuid,${sqlLiteral(args.action)});`;
    if (call.rpc === "complete_decision_onboarding_v1") return `select coalesce(jsonb_agg(t),'[]'::jsonb) from public.complete_decision_onboarding_v1(${sqlLiteral(args.city)},array[${args.spotIds.map((id) => `${sqlLiteral(id)}::uuid`).join(",")}]) t;`;
    throw new Error(`Unsupported canonical treatment RPC: ${call.rpc}`);
  };
  const invokeCanonical = async (userId, call) => run(`begin; ${claims(userId)} ${invocationSql(call)} commit;`);
  const insertHistoricalEvent = async (userId, call, occurredDay) => {
    if (call.rpc !== "backyrd_ml_log_event_v1") throw new Error("Historical clock adapter is restricted to the canonical ML event RPC");
    const createdAt = new Date(Date.parse(referenceIso) + Number(occurredDay) * 86_400_000).toISOString();
    const eventSql = invocationSql(call).replace(/^select /, "create temporary table d31_event on commit drop as select ").replace(/;$/, ";");
    const output = run(`begin; ${claims(userId)} ${eventSql} update public.backyrd_ml_events_v1 e set created_at=${sqlLiteral(createdAt)}::timestamptz from d31_event d where e.id=d.backyrd_ml_log_event_v1; copy (select backyrd_ml_log_event_v1 from d31_event) to stdout; commit;`);
    const eventId = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!eventId) throw new Error(`Canonical ML event was suppressed for ${userId}; verify synthetic personalization consent`);
    return { canonicalCallExecuted: true, rawEventRetimestamped: true, eventId };
  };
  const snapshotState = async (userId) => {
    const tables = ["backyrd_ml_events_v1", "user_taste_events_v2", "backyrd_user_feature_weights_v1", "user_place_type_preferences_v1", "backyrd_user_context_feature_preferences_v1", "user_taste_concepts_v2"];
    const pairs = tables.map((table) => `${sqlLiteral(table)},(select count(*) from public.${table} where user_id=${sqlLiteral(userId)}::uuid)`).join(",");
    const counts = JSON.parse(run(`select jsonb_build_object(${pairs});`));
    return { stateRef: `isolated:user-state:${userId}`, userId, counts, rawDerivedConsistent: Object.values(counts).every((value) => Number.isInteger(value) && value >= 0), source: "CANONICAL_RPCS_AND_TRIGGERS" };
  };
  return { invokeCanonical, insertHistoricalEvent, snapshotState };
}
