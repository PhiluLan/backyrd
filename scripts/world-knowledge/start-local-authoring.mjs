import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const expectedUrl = process.env.WORLD_KNOWLEDGE_EXPECTED_LOCAL_URL ?? "http://127.0.0.1:57261";
const localProjectId = process.env.WORLD_KNOWLEDGE_LOCAL_PROJECT_ID ?? "backyrd-current-85423";
const normalize = (value) => new URL(value).origin;

function localSupabaseEnvironment() {
  const statusRoot = mkdtempSync(join(tmpdir(), "backyrd-world-authoring-status-"));
  const statusSupabase = join(statusRoot, "supabase");
  mkdirSync(statusSupabase);
  const apiPort = new URL(expectedUrl).port;
  const dbPort = String(Number(apiPort) + 1);
  const canonicalConfig = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8")
    .replace(/^project_id = .*$/m, `project_id = "${localProjectId}"`)
    .replace(/(\[api\][\s\S]*?^port = )\d+/m, `$1${apiPort}`)
    .replace(/(\[db\][\s\S]*?^port = )\d+/m, `$1${dbPort}`);
  writeFileSync(join(statusSupabase, "config.toml"), canonicalConfig, { mode: 0o600 });
  let output;
  try {
    output = execFileSync("npx", ["supabase", "status", "--workdir", statusRoot, "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("Lokales Supabase läuft nicht. Starte es zuerst mit: npx supabase start");
  } finally {
    rmSync(statusRoot, { recursive: true, force: true });
  }
  const values = Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    return match ? [[match[1], match[2]]] : [];
  }));
  if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) throw new Error("Die lokale Supabase-Konfiguration ist unvollständig.");
  if (normalize(values.API_URL) !== normalize(expectedUrl)) throw new Error(`Falscher lokaler Supabase-Endpunkt: erwartet ${normalize(expectedUrl)}. Es wurde nichts gestartet.`);
  return values;
}

const values = localSupabaseEnvironment();
const response = await fetch(`${normalize(values.API_URL)}/auth/v1/health`, { headers: { apikey: values.ANON_KEY }, signal: AbortSignal.timeout(4_000) }).catch(() => null);
if (!response?.ok) throw new Error("Die lokale Supabase-Instanz antwortet nicht zuverlässig. Es wurde nichts gestartet.");

console.log(`Lokale World-Knowledge-Bindung geprüft: ${normalize(values.API_URL)} (keine Production-Verbindung).`);
if (process.argv.includes("--apply-authoring-closure")) {
  const container = `supabase_db_${localProjectId}`;
  const closureMigrations = [
    ["20260912084654", "world_knowledge_slice_4a_authoring_product_readiness"],
    ["20260912103000", "world_knowledge_slice_4a_authoring_reliability"],
    ["20260912121000", "world_knowledge_slice_4a_taxonomy_candidate_expansion"],
  ];
  for (const [version, name] of closureMigrations) {
    const applied = execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-Atc", `select exists(select 1 from supabase_migrations.schema_migrations where version='${version}')`], { encoding: "utf8" }).trim() === "t";
    if (applied) { console.log(`Lokale Forward-Migration ${version} ist bereits angewendet.`); continue; }
    const sql = `${readFileSync(new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url), "utf8")}\ninsert into supabase_migrations.schema_migrations(version,statements,name) values ('${version}',array[]::text[],'${name}');\n`;
    console.log(`Wende lokale Forward-Migration ${version} auf ${localProjectId} an. Kein Reset, kein Seed.`);
    execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction"], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
  }
}
if (process.argv.includes("--check-only")) process.exit(0);

const sharedEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: normalize(values.API_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
  WORLD_KNOWLEDGE_LOCAL_SUPABASE_URL: normalize(values.API_URL),
  WK_LOCAL_SUPABASE_URL: normalize(values.API_URL),
};

if (process.argv.includes("--build-admin")) {
  execFileSync("npm", ["--prefix", "admin-dashboard", "run", "build"], { env: sharedEnvironment, stdio: "inherit" });
  process.exit(0);
}

const children = [
  spawn("npm", ["--prefix", "admin-dashboard", "run", "dev", "--", "-p", "3218"], { env: sharedEnvironment, stdio: "inherit" }),
  spawn("npm", ["--prefix", "web", "run", "dev", "--", "-p", "3219"], { env: sharedEnvironment, stdio: "inherit" }),
];

const stop = () => { for (const child of children) child.kill("SIGTERM"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => { if (code && code !== 0) { stop(); process.exitCode = code; } });
