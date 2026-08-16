import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import ts from "typescript";
import { fastEmbedding } from "./embeddings.mjs";
import { assertEmbeddingMode } from "./safety.mjs";

const defaultSourceUrl = new URL("../../supabase/functions/decision-v13/index.ts", import.meta.url);

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
      "    globalThis.__backyrdDecisionLabTrace.structuredIntent = structuredClone(structuredIntent);\n    globalThis.__backyrdDecisionLabTrace.hardConstraintEligibility = structuredClone(fusedResult.hardEligibility);\n\n    const fused = fusedResult.candidates;",
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
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://api.openai.com/v1/embeddings") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (embeddingMode === "FULL_FIDELITY") return originalFetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), Authorization: `Bearer ${env.DECISION_LAB_OPENAI_API_KEY}` } });
      return new Response(JSON.stringify({ data: [{ embedding: fastEmbedding(body.input, body.dimensions ?? 1536) }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  const loadedModule = await import(moduleUrl);
  const handler = globalThis.__backyrdDecisionLabHandler;
  if (typeof handler !== "function") throw new Error("Canonical decision-v13 handler was not captured");
  return { handler, module: loadedModule, exports: globalThis.__backyrdDecisionLabExports ?? {}, sourceHash: createHash("sha256").update(source).digest("hex"), getTrace: () => structuredClone(globalThis.__backyrdDecisionLabTrace ?? null), restore: () => { globalThis.fetch = originalFetch; delete globalThis.Deno; delete globalThis.__backyrdDecisionLabHandler; delete globalThis.__backyrdDecisionLabTrace; delete globalThis.__backyrdDecisionLabExports; } };
}
