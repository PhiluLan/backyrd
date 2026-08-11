import { existsSync, readFileSync } from "node:fs";
import { URL } from "node:url";

export const KNOWN_PRODUCTION_REF = "hjgcrrzfjchzqoegcywn";

export function assertSafeEnvironment(env = process.env, cwd = process.cwd()) {
  const errors = [];
  const urlText = env.DECISION_LAB_DB_URL ?? "";
  const supabaseUrl = env.DECISION_LAB_SUPABASE_URL ?? "";
  const combined = `${urlText} ${supabaseUrl} ${env.SUPABASE_URL ?? ""} ${env.SUPABASE_PROJECT_REF ?? ""}`.toLowerCase();
  if (combined.includes(KNOWN_PRODUCTION_REF)) errors.push("known Production project reference");
  if (/supabase\.(co|com)/.test(combined)) errors.push("hosted Supabase hostname");
  if (urlText) {
    try { const parsed = new URL(urlText.replace(/^postgres(ql)?:/, "http:")); if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(parsed.hostname)) errors.push("non-local database hostname"); } catch { errors.push("invalid DECISION_LAB_DB_URL"); }
  }
  const linkedFiles = ["supabase/.temp/project-ref", ".supabase/project-ref"].map((path) => `${cwd}/${path}`).filter(existsSync);
  for (const path of linkedFiles) if (readFileSync(path, "utf8").trim()) errors.push(`linked Supabase metadata: ${path}`);
  if (env.DECISION_LAB_ALLOW_LOCAL !== "1") errors.push("DECISION_LAB_ALLOW_LOCAL=1 acknowledgement missing");
  if (!urlText) errors.push("DECISION_LAB_DB_URL missing");
  if (errors.length) throw new Error(`Decision Lab safety refusal: ${errors.join("; ")}`);
  return { safe: true, databaseHost: new URL(urlText.replace(/^postgres(ql)?:/, "http:")).hostname };
}

export function assertEmbeddingMode(mode, env = process.env) {
  if (mode === "FULL_FIDELITY" && !env.DECISION_LAB_OPENAI_API_KEY) throw new Error("FULL_FIDELITY requires DECISION_LAB_OPENAI_API_KEY; no fallback is allowed");
  if (!["FULL_FIDELITY", "FAST_SIMULATION"].includes(mode)) throw new Error(`Unknown embedding mode: ${mode}`);
}
