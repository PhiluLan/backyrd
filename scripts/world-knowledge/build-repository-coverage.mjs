import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ATTRIBUTE_DEFINITIONS, FOUNDATION_AREAS, LEGACY_MAPPING_MATRIX } from "../../packages/world-knowledge-core/dist/index.js";

const root = resolve(new URL("../..", import.meta.url).pathname);
const migrationDirectory = resolve(root, "supabase/migrations");
const migrationFiles = readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort();
const sql = migrationFiles.map((name) => readFileSync(resolve(migrationDirectory, name), "utf8")).join("\n");
const counts = (pattern) => [...sql.matchAll(pattern)].length;
const byStatus = Object.fromEntries([...new Set(LEGACY_MAPPING_MATRIX.map((row) => row.status))].sort().map((status) => [status, LEGACY_MAPPING_MATRIX.filter((row) => row.status === status).length]));
const byRecommendation = Object.fromEntries([...new Set(LEGACY_MAPPING_MATRIX.map((row) => row.recommendation))].sort().map((status) => [status, LEGACY_MAPPING_MATRIX.filter((row) => row.recommendation === status).length]));
const body = {
  contractVersion: "backyrd.world-knowledge.repository-coverage@1.0",
  profiledAt: "2026-09-10T16:00:00.000Z",
  canonicalBase: "983cd7b3a3c11dd3e549c256850749b07b52eadf",
  basis: "CANONICAL_REPOSITORY_AND_MIGRATIONS_ONLY",
  productionQueried: false,
  productionMetricsStatus: "NOT_EMPIRICALLY_CONFIRMED_NO_AUTHORIZED_CONNECTION",
  registry: { foundationAreas: FOUNDATION_AREAS.length, attributeDefinitions: ATTRIBUTE_DEFINITIONS.length },
  legacyMapping: { rows: LEGACY_MAPPING_MATRIX.length, byStatus, byRecommendation },
  repository: {
    migrationFiles: migrationFiles.length,
    migrationTip: migrationFiles.at(-1) ?? null,
    createTableStatements: counts(/\bcreate\s+table\b/gi),
    createViewStatements: counts(/\bcreate(?:\s+or\s+replace)?\s+view\b/gi),
    securityDefinerMentions: counts(/\bsecurity\s+definer\b/gi),
    enableRlsStatements: counts(/\benable\s+row\s+level\s+security\b/gi),
    publicExecuteGrants: counts(/\bgrant\s+execute\b[^;]*\bto\s+public\b/gi),
    anonExecuteGrants: counts(/\bgrant\s+execute\b[^;]*\bto\s+anon\b/gi),
    authenticatedExecuteGrants: counts(/\bgrant\s+execute\b[^;]*\bto\s+(?:anon\s*,\s*)?authenticated\b/gi),
  },
  empiricalUnknowns: ["production spot counts", "field null distribution", "live grants and RLS", "live source coverage", "live duplicate candidates", "live migration tip"],
};
const canonicalize = (value) => Array.isArray(value) ? `[${value.map(canonicalize).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}` : JSON.stringify(value);
const reportHash = createHash("sha256").update(canonicalize(body)).digest("hex");
process.stdout.write(`${JSON.stringify({ ...body, reportHash }, null, 2)}\n`);
