import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
// OTA bundles require only values compiled into the JavaScript runtime. Google
// Maps and Google OAuth IDs are read from the installed native Expo config,
// so their presence is enforced by the native production-build config guard.
const requiredRuntime = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
];

const failures = [];
const expectedIosBundleIdentifier = "com.philipplanger.backyrd";

for (const name of requiredRuntime) {
  if (!process.env[name]?.trim()) failures.push(`${name} is missing`);
}

if (process.env.APP_VARIANT !== "prod") {
  failures.push("APP_VARIANT must be prod");
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
if (eas.build?.production?.channel !== "production") failures.push("EAS production channel mismatch");
if (packageJson.version !== "1.1.0") failures.push("Mobile release version mismatch");

try {
  const expoConfig = JSON.parse(
    execFileSync("npx", ["expo", "config", "--type", "public", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
  if (expoConfig.ios?.bundleIdentifier !== expectedIosBundleIdentifier) {
    failures.push(
      `iOS Production bundle identifier must be ${expectedIosBundleIdentifier}, received ${expoConfig.ios?.bundleIdentifier ?? "missing"}`
    );
  }
  for (const name of ["supabaseUrl", "supabaseAnonKey"]) {
    if (typeof expoConfig.extra?.[name] !== "string" || !expoConfig.extra[name].trim()) {
      failures.push(`Expo OTA manifest runtime config missing: ${name}`);
    }
  }
} catch (error) {
  failures.push(`Expo Production config could not be evaluated: ${error instanceof Error ? error.message : String(error)}`);
}

const sourceRoots = ["app", "components", "hooks", "lib", "providers", "stores", "theme"];
const sourceFiles = [];
for (const relativeRoot of sourceRoots) walk(path.join(root, relativeRoot));

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.includes("backup") && !entry.name.includes("before-")) sourceFiles.push(fullPath);
  }
}

const forbidden = [
  ["fake Match floor", /Math\.max\(\s*82/],
  ["client OpenAI key", /EXPO_PUBLIC_OPENAI_KEY/],
  ["client OpenAI SDK", /from\s+["']openai["']/],
  ["legacy Taste table", /user_taste_events_v2/],
  ["legacy Taste RPC", /backyrd_log_taste_event_v3/],
  ["runtime OTA reload", /Updates\.reloadAsync/],
  ["legacy Decision session", /create_decision_session_v1/],
  ["legacy Decision retrieval", /backyrd_get_decision_spots_v9/],
  ["legacy Decision context", /get_decision_context_v1/],
  ["retired Decision debug route", /decision-debug/],
  ["direct achievement write", /from\(["']user_achievements["']\)\s*\.insert/],
  ["placeholder OAuth client", /<YOUR_[A-Z_]+>/],
];

for (const file of sourceFiles) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(content)) failures.push(`${label}: ${relative}`);
  }
}

const decision = fs.readFileSync(path.join(root, "app/(tabs)/decision.tsx"), "utf8");
const decisionClient = fs.readFileSync(path.join(root, "lib/decision/productDecision.ts"), "utf8");
const decisionBinding = fs.readFileSync(path.join(root, "lib/decision/productDecisionRelease.generated.ts"), "utf8");
const decisionControl = fs.readFileSync(path.join(root, "packages/product-decision-contract/src/index.mjs"), "utf8");
const activeDecisionPath = `${decision}\n${decisionClient}\n${decisionBinding}\n${decisionControl}`;

for (const [label, source, pattern] of [
  ["single Mobile Decision boundary", decision, /invokeDecisionProduct/],
  ["server-ranked Product candidates", decision, /result\.candidates/],
  ["single-route client execution", decisionClient, /executeDecisionProductSingleRoute/],
  ["fresh bearer session", decisionClient, /freshAccessToken/],
  ["Bearer-only server invocation", decisionClient, /Authorization:\s*`Bearer \$\{accessToken\}`/],
  ["decision-v13 Product transport", decisionBinding, /"transportFunction":\s*"decision-v13"/],
  ["vNext Product request", decisionBinding, /backyrd\.decision-vnext\.product-request@1\.0/],
  ["vNext Product response", decisionBinding, /backyrd\.decision-vnext\.product-response@1\.0/],
  ["strict authority-free Product request", decisionControl, /exactKeys\(value, \["contractVersion", "requestId", "idempotencyKey", "naturalLanguage", "explicit", "alternativeRequested", "previouslyPresentedCandidateIds", "rejectedCandidateIds"\]/],
]) {
  if (!pattern.test(source)) failures.push(`Decision contract missing: ${label}`);
}

for (const [label, pattern] of [
  ["legacy Decision body", /\blegacyBody\b/],
  ["legacy Decision invocation", /\binvokeExisting\b/],
  ["legacy Decision fallback", /\bfallbackFunction\b|\bEXISTING_ENGINE\b/],
  ["legacy Decision response", /\bnorth_star\b|\bsemantic_v13\b|\bpersonalized_v12\b/],
]) {
  if (pattern.test(activeDecisionPath)) failures.push(`${label} is forbidden in the active Mobile Product path`);
}

if (failures.length) {
  console.error("Production release validation failed:\n" + failures.map((value) => `- ${value}`).join("\n"));
  process.exit(1);
}

console.log(`Production release validation passed (${sourceFiles.length} source files scanned).`);
