#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import ts from "typescript";

const sourcePath = new URL("../../supabase/functions/decision-v13/index.ts", import.meta.url);
const source = await fs.readFile(sourcePath, "utf8");
const serveAnchor = "Deno.serve(async (request: Request) => {";
const returnAnchor = "  return diversifyCandidates(fused, input.limit, input.intent);";

const serveIndex = source.indexOf(serveAnchor);
if (serveIndex < 0) throw new Error(`Decision V13 serve anchor not found in ${sourcePath.pathname}`);

const moduleSource = source.slice(0, serveIndex);
if (!moduleSource.includes(returnAnchor)) {
  throw new Error(`Decision V13 fusion return anchor not found in ${sourcePath.pathname}`);
}

const instrumentedSource = moduleSource
  .replace(
    returnAnchor,
    [
      "  globalThis.__backyrdD02PreDiversity = fused.map((candidate) => structuredClone(candidate));",
      "  return diversifyCandidates(fused, input.limit, input.intent);",
    ].join("\n"),
  )
  .concat("\nexport { buildQueryText, detectIntent, fuseCandidates };\n");

const transpiled = ts.transpileModule(instrumentedSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  },
  fileName: sourcePath.pathname,
  reportDiagnostics: true,
});

const diagnostics = transpiled.diagnostics ?? [];
const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length > 0) {
  throw new Error(
    errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      .join("\n"),
  );
}

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const decision = await import(moduleUrl);

let inputText = "";
for await (const chunk of process.stdin) inputText += chunk;
const payload = JSON.parse(inputText || "{}");

if (!Array.isArray(payload.traces)) {
  throw new Error("Expected a JSON object with a traces array on stdin");
}

function profileMap(rows) {
  return new Map((rows ?? []).map((row) => [row.place_type, row]));
}

const output = payload.traces.map((trace) => {
  const request = trace.request ?? {};
  const intent = decision.detectIntent({
    query: request.query ?? null,
    moodA: request.moodA ?? null,
    moodB: request.moodB ?? null,
    preferredPlaceTypes: request.preferredPlaceTypes ?? [],
    excludedPlaceTypes: request.excludedPlaceTypes ?? [],
    audience: request.audience ?? [],
    occasions: request.occasions ?? [],
    strictCategoryIntent: request.strictCategoryIntent === true,
  });

  const queryText = decision.buildQueryText({
    city: request.city ?? null,
    moodA: request.moodA ?? null,
    moodB: request.moodB ?? null,
    query: request.query ?? null,
    primaryPlaceTypes: intent.primaryPlaceTypes,
    secondaryPlaceTypes: intent.secondaryPlaceTypes,
    excludedPlaceTypes: intent.excludedPlaceTypes,
    audience: intent.audience,
    occasions: intent.occasions,
  });

  const fusionInput = {
    v12: trace.v12 ?? [],
    semantic: trace.semantic ?? [],
    limit: request.limit ?? 16,
    intent,
    placeTypeProfile: {
      global: profileMap(trace.placeTypeProfile?.global),
      context: profileMap(trace.placeTypeProfile?.context),
    },
    contextualTaste: trace.contextualTaste ?? [],
    recentMemory: trace.recentMemory ?? [],
    distributionPriority: new Map(Object.entries(trace.distributionPriority ?? {})),
  };

  const timingSamples = [];
  let candidates = [];
  let preDiversity = [];
  for (let iteration = 0; iteration < 30; iteration += 1) {
    globalThis.__backyrdD02PreDiversity = [];
    const startedAt = performance.now();
    candidates = decision.fuseCandidates(fusionInput);
    timingSamples.push(performance.now() - startedAt);
    if (iteration === 0) preDiversity = globalThis.__backyrdD02PreDiversity ?? [];
  }
  const sortedTimings = [...timingSamples].sort((a, b) => a - b);
  const percentile = (fraction) => sortedTimings[Math.ceil(sortedTimings.length * fraction) - 1];

  return {
    name: trace.name,
    request,
    evidence: trace.evidence ?? {},
    intent,
    queryText,
    performance: {
      samples: timingSamples.length,
      medianMilliseconds: percentile(0.5),
      p95Milliseconds: percentile(0.95),
      maxMilliseconds: sortedTimings.at(-1),
    },
    preDiversity,
    candidates,
  };
});

process.stdout.write(`${JSON.stringify({
  environment: payload.environment ?? null,
  performance: payload.performance ?? null,
  traces: output,
}, null, 2)}\n`);
