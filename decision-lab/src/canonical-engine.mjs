import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import ts from "typescript";
import { fastEmbedding } from "./embeddings.mjs";
import { assertEmbeddingMode } from "./safety.mjs";

const defaultSourceUrl = new URL("../../supabase/functions/decision-v13/index.ts", import.meta.url);

export function labEmbeddingHeaders(input, credential) {
  const headers = new Headers(input);
  headers.set("authorization", `Bearer ${credential}`);
  return headers;
}

export async function loadCanonicalDecisionHandler({ env, embeddingMode, sourceUrl = defaultSourceUrl }) {
  if (!(sourceUrl instanceof URL) || sourceUrl.protocol !== "file:") throw new Error("Decision Engine source must be a local file URL");
  assertEmbeddingMode(embeddingMode, env);
  const source = await readFile(sourceUrl, "utf8");
  const anchor = "Deno.serve(async (request: Request) => {";
  if (!source.includes(anchor)) throw new Error("Canonical decision-v13 handler anchor missing");
  const exportedFunctions = [...source.matchAll(/^export\s+function\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
  const observed = source
    .replace(/^export\s+type\s+/gm, "type ")
    .replace(/^export\s+function\s+/gm, "function ")
    .replace(anchor, "globalThis.__backyrdDecisionLabHandler = async (request: Request) => {")
    .replace(
      "    const allSpotIds = Array.from(",
      "    globalThis.__backyrdDecisionLabTrace = { semanticCandidates: structuredClone(semanticCandidates), v12Candidates: structuredClone(v12Candidates), placeTypeProfile: { global: Array.from(placeTypeProfile.global.values()), context: Array.from(placeTypeProfile.context.values()) }, contextualTaste: structuredClone(contextualTaste), recentMemory: structuredClone(recentMemory) };\n\n    const allSpotIds = Array.from(",
    )
    .replace(
      "    const distributedSpotIds = Array.from(new Set([",
      "    globalThis.__backyrdDecisionLabTrace.distribution = Array.from(distribution.values()).map((row) => structuredClone(row));\n    globalThis.__backyrdDecisionLabTrace.distributedSemantic = structuredClone(distributedSemantic);\n    globalThis.__backyrdDecisionLabTrace.distributedV12 = structuredClone(distributedV12);\n\n    const distributedSpotIds = Array.from(new Set([",
    )
    .replace(
      "    const fused = fusedResult.candidates;",
      "    globalThis.__backyrdDecisionLabTrace.structuredIntent = structuredClone(structuredIntent);\n    globalThis.__backyrdDecisionLabTrace.hardConstraintEligibility = structuredClone(fusedResult.hardEligibility);\n    if (typeof retrievalUnion !== 'undefined') globalThis.__backyrdDecisionLabTrace.retrievalUnion = structuredClone(retrievalUnion);\n    if (typeof structuredCandidates !== 'undefined') globalThis.__backyrdDecisionLabTrace.structuredCandidates = structuredClone(structuredCandidates);\n    if (typeof lexicalCandidates !== 'undefined') globalThis.__backyrdDecisionLabTrace.lexicalCandidates = structuredClone(lexicalCandidates);\n    if (typeof catalogResult !== 'undefined') globalThis.__backyrdDecisionLabTrace.spotIntelligenceCatalog = structuredClone(catalogResult);\n    if (typeof catalogEligibility !== 'undefined') globalThis.__backyrdDecisionLabTrace.eligibleSpotIntelligenceCatalog = structuredClone(catalogEligibility.eligible);\n\n    const fused = fusedResult.candidates;",
    )
    .replace(
      "    for (const candidate of fused) {",
      "    globalThis.__backyrdDecisionLabTrace.fusedBeforeFinalMetadata = structuredClone(fused);\n\n    for (const candidate of fused) {",
    );
  const opened = `${observed}\n${exportedFunctions.map((name) => `globalThis.__backyrdDecisionLabExports ??= {}; globalThis.__backyrdDecisionLabExports.${name} = ${name};`).join("\n")}`;
  const closeIndex = opened.lastIndexOf("\n});");
  if (closeIndex < 0) throw new Error("Canonical decision-v13 handler close anchor missing");
  const instrumented = `${opened.slice(0, closeIndex)}\n};${opened.slice(closeIndex + 4)}`;
  const transpiled = ts.transpileModule(instrumented, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true }, fileName: sourceUrl.pathname, reportDiagnostics: true });
  const errors = (transpiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
  globalThis.Deno = { env: { get: (key) => ({ SUPABASE_URL: env.DECISION_LAB_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.DECISION_LAB_SERVICE_ROLE_KEY, OPENAI_API_KEY: embeddingMode === "FULL_FIDELITY" ? env.DECISION_LAB_OPENAI_API_KEY : "fast-simulation-not-a-key" })[key] } };
  const originalFetch = globalThis.fetch;
  globalThis.__backyrdDecisionLabExternalUsage = { embeddingCalls: 0, promptTokens: 0, cacheHits: 0, queryArtifacts: [] };
  const embeddingCachePath = embeddingMode === "FULL_FIDELITY" ? env.DECISION_LAB_EMBEDDING_CACHE_PATH : null;
  const persistedCache = embeddingCachePath ? await readFile(embeddingCachePath, "utf8").then(JSON.parse).catch((error) => {
    if (error?.code === "ENOENT") return {};
    throw error;
  }) : {};
  const embeddingCache = new Map(Object.entries(persistedCache));
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://api.openai.com/v1/embeddings") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (embeddingMode === "FULL_FIDELITY") {
        const sourceHash = createHash("sha256").update(String(body.input ?? "")).digest("hex");
        const cacheKey = createHash("sha256").update(JSON.stringify({ model: body.model, dimensions: body.dimensions, sourceHash })).digest("hex");
        const cached = embeddingCache.get(cacheKey);
        if (cached) {
          globalThis.__backyrdDecisionLabExternalUsage.cacheHits += 1;
          const cachedPayload = JSON.parse(cached.body);
          globalThis.__backyrdDecisionLabExternalUsage.queryArtifacts.push({ cacheKey, model: body.model, dimensions: body.dimensions, sourceHash, resultHash: createHash("sha256").update(JSON.stringify(cachedPayload?.data?.map((row) => row.embedding) ?? [])).digest("hex"), promptTokens: 0, cached: true });
          return new Response(cached.body, { status: cached.status, headers: cached.headers });
        }
        const requestHeaders = labEmbeddingHeaders(init?.headers, env.DECISION_LAB_OPENAI_API_KEY);
        const response = await originalFetch(input, { ...init, headers: requestHeaders });
        const bodyText = await response.clone().text();
        if (!response.ok) return new Response(bodyText, { status: response.status, headers: response.headers });
        const payload = JSON.parse(bodyText);
        const resultHash = createHash("sha256").update(JSON.stringify(payload?.data?.map((row) => row.embedding) ?? [])).digest("hex");
        globalThis.__backyrdDecisionLabExternalUsage.embeddingCalls += 1;
        globalThis.__backyrdDecisionLabExternalUsage.promptTokens += Number(payload?.usage?.prompt_tokens ?? 0);
        globalThis.__backyrdDecisionLabExternalUsage.queryArtifacts.push({ cacheKey, model: body.model, dimensions: body.dimensions, sourceHash, resultHash, promptTokens: Number(payload?.usage?.prompt_tokens ?? 0) });
        embeddingCache.set(cacheKey, { body: bodyText, status: response.status, headers: Object.fromEntries(response.headers.entries()) });
        if (embeddingCachePath) {
          await mkdir(dirname(embeddingCachePath), { recursive: true });
          await writeFile(embeddingCachePath, `${JSON.stringify(Object.fromEntries(embeddingCache))}\n`, { mode: 0o600 });
        }
        return new Response(bodyText, { status: response.status, headers: response.headers });
      }
      return new Response(JSON.stringify({ data: [{ embedding: fastEmbedding(body.input, body.dimensions ?? 1536) }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  const loadedModule = await import(moduleUrl);
  const handler = globalThis.__backyrdDecisionLabHandler;
  if (typeof handler !== "function") throw new Error("Canonical decision-v13 handler was not captured");
  return { handler, module: loadedModule, exports: globalThis.__backyrdDecisionLabExports ?? {}, sourceHash: createHash("sha256").update(source).digest("hex"), getTrace: () => structuredClone(globalThis.__backyrdDecisionLabTrace ?? null), getExternalUsage: () => structuredClone(globalThis.__backyrdDecisionLabExternalUsage), restore: () => { globalThis.fetch = originalFetch; delete globalThis.Deno; delete globalThis.__backyrdDecisionLabHandler; delete globalThis.__backyrdDecisionLabTrace; delete globalThis.__backyrdDecisionLabExports; delete globalThis.__backyrdDecisionLabExternalUsage; } };
}
